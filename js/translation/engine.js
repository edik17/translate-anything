/**
 * TranslateAnything — Main Translation Engine
 * Orchestratore principale delle traduzioni con cascata di fallback tra motori (MyMemory, Google, Gemini).
 */

import { chunkText, chunkHtmlParagraphs } from './chunker.js';
import { translateMyMemory } from './mymemory.js';
import { translateGoogle } from './google-proxy.js';

/**
 * Attende per un determinato numero di millisecondi.
 *
 * @param {number} ms - Millisecondi di attesa.
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calcola il numero di parole all'interno di un testo.
 *
 * @param {string} text - Testo da analizzare.
 * @returns {number} Numero di parole.
 */
function countWords(text) {
  if (!text || typeof text !== 'string') return 0;
  const matches = text.trim().match(/\S+/g);
  return matches ? matches.length : 0;
}

/**
 * Traduce una stringa di testo invocando l'API Google Gemini (modello gemini-2.0-flash-lite).
 *
 * @param {string} text - Testo originale da tradurre.
 * @param {string} sourceLang - Codice lingua di origine (es. 'en', 'auto').
 * @param {string} targetLang - Codice lingua di destinazione (es. 'it').
 * @param {string} apiKey - Chiave API per Google AI Studio.
 * @returns {Promise<{text: string, engine: 'Gemini'}|null>} Testo tradotto o null in caso di errore.
 */
export async function translateGemini(text, sourceLang, targetLang, apiKey) {
  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
    console.warn('[Gemini] Chiave API non configurata.');
    return null;
  }

  if (!text || typeof text !== 'string') {
    return { text: text || '', engine: 'Gemini' };
  }

  if (text.trim().length === 0) {
    return { text, engine: 'Gemini' };
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${encodeURIComponent(apiKey.trim())}`;

  const fromDesc = (!sourceLang || sourceLang.toLowerCase() === 'auto')
    ? 'the original language'
    : sourceLang;
  const prompt = `Translate the following from ${fromDesc} to ${targetLang || 'Italian'}. Return only the translation, no explanations:\n\n${text}`;

  const payload = {
    contents: [
      {
        parts: [
          {
            text: prompt,
          },
        ],
      },
    ],
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.warn(`[Gemini] Errore HTTP: ${res.status} ${res.statusText}`);
      return null;
    }

    const data = await res.json();
    const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (typeof candidateText === 'string') {
      return {
        text: candidateText.trim(),
        engine: 'Gemini',
      };
    }

    console.warn('[Gemini] Nessun testo restituito nella risposta del modello:', data);
    return null;
  } catch (err) {
    console.warn('[Gemini] Chiamata API non riuscita:', err.message || err);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Classe orchestratore della traduzione con fallback a cascata e supporto retry.
 */
export class TranslationEngine {
  /**
   * Crea un'istanza dell'orchestratore TranslationEngine.
   *
   * @param {Object} [options={}] - Opzioni di configurazione.
   * @param {string} [options.sourceLang='auto'] - Lingua originale dei documenti.
   * @param {string} [options.targetLang='it'] - Lingua di destinazione della traduzione.
   * @param {'auto'|'mymemory'|'gemini'} [options.engineMode='auto'] - Modalità motore ('auto', 'mymemory' o 'gemini').
   * @param {string|null} [options.geminiKey=null] - Chiave API Google AI Studio per Gemini.
   * @param {string|null} [options.proxyUrl=null] - URL opzionale di proxy per Google Translate.
   * @param {Object|null} [options.cache=null] - Oggetto cache per memorizzare le traduzioni ripetute.
   * @param {Function|null} [options.onProgress=null] - Callback invocata al completamento di ogni chunk: fn({completed, total, wordsTranslated, chunkWords, currentEngine, errors, chapterInfo}).
   * @param {Function|null} [options.onPreview=null] - Callback per aggiornare l'anteprima live: fn({original, translated}).
   */
  constructor(options = {}) {
    this.sourceLang = options.sourceLang || 'auto';
    this.targetLang = options.targetLang || 'it';
    this.engineMode = options.engineMode || 'auto';
    this.geminiKey = options.geminiKey || null;
    this.proxyUrl = options.proxyUrl || null;
    this.cache = options.cache || null;
    this.onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
    this.onPreview = typeof options.onPreview === 'function' ? options.onPreview : null;
    this._isCancelled = false;
  }

  /**
   * Interrompe l'elaborazione dei chunk in corso.
   */
  cancel() {
    this._isCancelled = true;
  }

  /**
   * Traduce un elenco di chunk sequenzialmente, gestendo pause di rate-limiting,
   * tentativi di riesecuzione (retry) e propagazione dello stato di avanzamento.
   *
   * @param {Array<{id: string|number, text: string, html?: string, [key: string]: any}>} chunks - Array di chunk da tradurre.
   * @returns {Promise<Array<{id: string|number, translatedText: string, translatedHtml?: string, engine: string, [key: string]: any}>|null>}
   *          Array con i chunk tradotti, oppure null se il processo è stato interrotto dall'utente.
   */
  async translateChunks(chunks) {
    if (this._isCancelled) {
      return null;
    }

    if (!Array.isArray(chunks)) {
      return [];
    }
    if (chunks.length === 0) {
      return [];
    }

    const results = [];
    let completedCount = 0;
    let totalWordsTranslated = 0;
    let errorCount = 0;

    for (let i = 0; i < chunks.length; i++) {
      if (this._isCancelled) {
        return null;
      }

      // Rispetta i limiti di frequenza applicando un ritardo di 200ms tra le richieste
      if (i > 0) {
        await sleep(200);
        if (this._isCancelled) {
          return null;
        }
      }

      const chunk = chunks[i];
      const originalText = chunk?.text ?? '';
      const wordsInChunk = countWords(originalText);

      // Se il testo è vuoto o composto solo da spazi bianchi, evitiamo chiamate inutili alle API
      if (!originalText || !originalText.trim()) {
        completedCount++;
        const itemResult = {
          ...chunk,
          id: chunk.id,
          translatedText: originalText,
          engine: 'None',
        };
        if (chunk.html !== undefined) {
          itemResult.translatedHtml = chunk.html;
        }
        results.push(itemResult);

        if (this.onProgress) {
          try {
            this.onProgress({
              completed: completedCount,
              total: chunks.length,
              wordsTranslated: totalWordsTranslated,
              chunkWords: 0,
              currentEngine: 'None',
              errors: errorCount,
              chapterInfo: chunk.chapterInfo || chunk.chapter || null,
            });
          } catch (e) {
            console.warn('[TranslationEngine] onProgress warning:', e);
          }
        }
        continue;
      }

      // Verifica presenza in cache se disponibile
      let cachedTranslation = null;
      if (this.cache) {
        cachedTranslation = await this._getFromCache(originalText);
      }

      let translationResult = null;
      if (cachedTranslation != null) {
        translationResult = { text: cachedTranslation, engine: 'Cache' };
      } else {
        // Esegue la traduzione con meccanismo di retry a backoff esponenziale (max 3 tentativi)
        translationResult = await this._translateWithRetry(originalText);
      }

      let currentEngine = 'None';
      let translatedText = originalText;

      if (translationResult && translationResult.text) {
        translatedText = translationResult.text;
        currentEngine = translationResult.engine;

        // Se è una nuova traduzione non proveniente da cache, salvala
        if (this.cache && currentEngine !== 'Cache') {
          await this._saveToCache(originalText, translatedText);
        }
      } else {
        // In caso di fallimento definitivo dopo tutti i retry e tutti i motori
        errorCount++;
        currentEngine = 'Failed';
        translatedText = originalText; // Mantieni il testo originale come salvaguardia
        console.warn(`[TranslationEngine] Chunk ${chunk.id} non tradotto dopo i retry. Mantenuto testo originale.`);
      }

      completedCount++;
      totalWordsTranslated += wordsInChunk;

      const outputChunk = {
        ...chunk,
        id: chunk.id,
        translatedText,
        engine: currentEngine,
      };

      if (chunk.html !== undefined) {
        outputChunk.translatedHtml = this._reconstructHtml(chunk.html, chunk.text, translatedText);
      }

      results.push(outputChunk);

      // Notifica anteprima live
      if (this.onPreview) {
        try {
          this.onPreview({
            original: originalText,
            translated: translatedText,
          });
        } catch (e) {
          console.warn('[TranslationEngine] onPreview warning:', e);
        }
      }

      // Notifica avanzamento progresso
      if (this.onProgress) {
        try {
          this.onProgress({
            completed: completedCount,
            total: chunks.length,
            wordsTranslated: totalWordsTranslated,
            chunkWords: wordsInChunk,
            currentEngine,
            errors: errorCount,
            chapterInfo: chunk.chapterInfo || chunk.chapter || null,
          });
        } catch (e) {
          console.warn('[TranslationEngine] onProgress warning:', e);
        }
      }
    }

    return results;
  }

  /**
   * Esegue la traduzione applicando fino a 3 tentativi con backoff esponenziale.
   *
   * @private
   * @param {string} text - Testo da tradurre.
   * @returns {Promise<{text: string, engine: string}|null>}
   */
  async _translateWithRetry(text) {
    const maxRetries = 3;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (this._isCancelled) {
        return null;
      }

      if (attempt > 0) {
        // Backoff esponenziale: 500ms, 1000ms, 2000ms (max 4s)
        const delay = Math.min(500 * Math.pow(2, attempt - 1), 4000);
        console.warn(`[TranslationEngine] Tentativo di recupero ${attempt}/${maxRetries} tra ${delay}ms...`);
        await sleep(delay);
        if (this._isCancelled) {
          return null;
        }
      }

      try {
        const result = await this._cascadeEngines(text);
        if (result && result.text) {
          return result;
        }
      } catch (err) {
        console.warn(`[TranslationEngine] Errore nel tentativo ${attempt}:`, err);
      }
    }

    return null;
  }

  /**
   * Determina la priorità dei motori di traduzione in base alla modalità selezionata.
   *
   * @private
   * @returns {string[]} Lista ordinata dei nomi dei motori da provare.
   */
  _getEngineOrder() {
    if (this.engineMode === 'mymemory') {
      return ['mymemory'];
    }

    if (this.engineMode === 'gemini') {
      const list = [];
      if (this.geminiKey) {
        list.push('gemini');
      }
      list.push('mymemory', 'google');
      return list;
    }

    // Modalità 'auto': prova prima MyMemory, poi Google, infine Gemini (se la chiave è presente)
    const list = ['mymemory', 'google'];
    if (this.geminiKey) {
      list.push('gemini');
    }
    return list;
  }

  /**
   * Tenta la traduzione iterando a cascata sui motori disponibili finché uno ha successo.
   *
   * @private
   * @param {string} text - Testo da tradurre.
   * @returns {Promise<{text: string, engine: string}|null>}
   */
  async _cascadeEngines(text) {
    const engines = this._getEngineOrder();

    for (const engineName of engines) {
      if (this._isCancelled) {
        return null;
      }

      try {
        let outcome = null;

        if (engineName === 'mymemory') {
          outcome = await translateMyMemory(text, this.sourceLang, this.targetLang);
        } else if (engineName === 'google') {
          outcome = await translateGoogle(text, this.sourceLang, this.targetLang, this.proxyUrl);
        } else if (engineName === 'gemini' && this.geminiKey) {
          outcome = await translateGemini(text, this.sourceLang, this.targetLang, this.geminiKey);
        }

        if (outcome && outcome.text) {
          return outcome;
        }
      } catch (err) {
        console.warn(`[TranslationEngine] Motore ${engineName} non disponibile:`, err.message || err);
      }
    }

    return null;
  }

  /**
   * Ricostruisce la stringa HTML originale integrando il testo tradotto.
   *
   * @private
   * @param {string} originalHtml
   * @param {string} originalText
   * @param {string} translatedText
   * @returns {string}
   */
  _reconstructHtml(originalHtml, originalText, translatedText) {
    if (!originalHtml) return translatedText;
    if (originalHtml === originalText) return translatedText;

    if (originalText && originalHtml.includes(originalText)) {
      return originalHtml.replace(originalText, translatedText);
    }

    const trimmed = originalText ? originalText.trim() : '';
    if (trimmed && originalHtml.includes(trimmed)) {
      return originalHtml.replace(trimmed, translatedText);
    }

    return translatedText;
  }

  /**
   * Recupera una traduzione presente nella cache (supporta firme con argomenti multipli o chiave singola).
   *
   * @private
   * @param {string} text
   * @returns {Promise<string|null>}
   */
  async _getFromCache(text) {
    if (!this.cache) return null;
    try {
      if (typeof this.cache.get === 'function') {
        const value = await this.cache.get(text, this.sourceLang, this.targetLang)
                   ?? await this.cache.get(`${this.sourceLang}:${this.targetLang}:${text}`);
        if (value != null) {
          return typeof value === 'object' ? value.text : String(value);
        }
      }
    } catch (err) {
      console.warn('[TranslationEngine] Errore lettura cache:', err);
    }
    return null;
  }

  /**
   * Salva una traduzione completata nella cache.
   *
   * @private
   * @param {string} text
   * @param {string} translated
   * @returns {Promise<void>}
   */
  async _saveToCache(text, translated) {
    if (!this.cache) return;
    try {
      if (typeof this.cache.set === 'function') {
        try {
          await this.cache.set(text, this.sourceLang, this.targetLang, translated);
        } catch {
          await this.cache.set(`${this.sourceLang}:${this.targetLang}:${text}`, translated);
        }
      }
    } catch (err) {
      console.warn('[TranslationEngine] Errore scrittura cache:', err);
    }
  }
}
