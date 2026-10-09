/**
 * TranslateAnything — MyMemory Translation Client
 * Client per l'API pubblica di MyMemory (Translated.net).
 */

import { chunkText } from './chunker.js';

/**
 * Decodifica entità HTML restituite frequentemente da MyMemory (es. &#39;, &quot;, &amp;).
 *
 * @param {string} str - Stringa contenente eventuali entità HTML.
 * @returns {string} Stringa decodificata.
 */
function decodeHtmlEntities(str) {
  if (!str || typeof str !== 'string' || !str.includes('&')) {
    return str;
  }

  if (typeof document !== 'undefined') {
    try {
      const txt = document.createElement('textarea');
      txt.innerHTML = str;
      return txt.value;
    } catch {
      // In caso di errore nell'ambiente DOM, prosegui con il fallback regex
    }
  }

  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/');
}

/**
 * Attende per un determinato numero di millisecondi.
 *
 * @param {number} ms - Millisecondi da attendere.
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Invia una singola richiesta all'API MyMemory per testi fino a 500 caratteri.
 *
 * @param {string} text - Testo breve da tradurre (<= 500 caratteri).
 * @param {string} sourceLang - Codice lingua sorgente (o 'autodetect').
 * @param {string} targetLang - Codice lingua destinazione.
 * @returns {Promise<string|null>} Testo tradotto oppure null in caso di fallimento.
 */
async function translateSingle(text, sourceLang, targetLang) {
  if (!text || !text.trim()) {
    return text || '';
  }

  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(sourceLang)}|${encodeURIComponent(targetLang)}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      console.warn(`[MyMemory] Errore risposta HTTP: ${res.status} ${res.statusText}`);
      return null;
    }

    const data = await res.json();

    // Verifica lo stato restituito dal payload MyMemory
    if (data.responseStatus !== 200 && data.responseStatus !== '200') {
      console.warn(`[MyMemory] Errore API ${data.responseStatus}:`, data.responseDetails || 'Nessun dettaglio');
      return null;
    }

    if (data.quotaFinished) {
      console.warn('[MyMemory] Quota giornaliera esaurita.');
      return null;
    }

    const rawTranslated = data.responseData?.translatedText;
    if (!rawTranslated || typeof rawTranslated !== 'string') {
      console.warn('[MyMemory] Testo tradotto assente nella risposta.');
      return null;
    }

    // Se l'API restituisce un avviso di quota o blocco
    if (rawTranslated.toUpperCase().startsWith('MYMEMORY WARNING:')) {
      console.warn('[MyMemory] Avviso quota:', rawTranslated);
      return null;
    }

    return decodeHtmlEntities(rawTranslated);
  } catch (err) {
    console.warn('[MyMemory] Errore durante la richiesta di traduzione:', err.message || err);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Traduce un testo utilizzando l'API di MyMemory.
 * Suddivide internamente il testo in blocchi da massimo 500 caratteri se necessario.
 *
 * @param {string} text - Il testo da tradurre.
 * @param {string} [sourceLang='auto'] - Lingua sorgente (es. 'en', 'auto').
 * @param {string} [targetLang='it'] - Lingua di destinazione (es. 'it').
 * @returns {Promise<{text: string, engine: 'MyMemory'}|null>} Oggetto con il testo tradotto e il nome dell'engine, oppure null in caso di errore.
 */
export async function translateMyMemory(text, sourceLang = 'auto', targetLang = 'it') {
  if (!text || typeof text !== 'string') {
    return { text: text || '', engine: 'MyMemory' };
  }

  if (text.trim().length === 0) {
    return { text, engine: 'MyMemory' };
  }

  // Normalizza i codici lingua: MyMemory accetta 'autodetect' per il rilevamento automatico
  const sl = (!sourceLang || sourceLang.toLowerCase() === 'auto')
    ? 'autodetect'
    : sourceLang.toLowerCase();
  const tl = (targetLang || 'it').toLowerCase();

  // Limite massimo di caratteri per richiesta MyMemory: 500 (usiamo 450 per margine di sicurezza)
  const MAX_MYMEMORY_CHARS = 450;

  try {
    if (text.length <= MAX_MYMEMORY_CHARS) {
      const translated = await translateSingle(text, sl, tl);
      if (translated === null) {
        return null;
      }
      return { text: translated, engine: 'MyMemory' };
    }

    // Se il testo eccede i 500 caratteri, lo suddividiamo sui confini delle frasi
    const subChunks = chunkText(text, MAX_MYMEMORY_CHARS);
    if (subChunks.length === 0) {
      return { text, engine: 'MyMemory' };
    }

    const translatedPieces = [];
    for (let i = 0; i < subChunks.length; i++) {
      if (i > 0) {
        // Breve pausa per evitare limitazioni di frequenza tra sub-chunk
        await sleep(150);
      }

      const subTranslated = await translateSingle(subChunks[i], sl, tl);
      if (subTranslated === null) {
        // Se un sotto-blocco fallisce, consideriamo la chiamata complessiva fallita per innescare il fallback
        return null;
      }

      translatedPieces.push(subTranslated);
    }

    return {
      text: translatedPieces.join(' '),
      engine: 'MyMemory',
    };
  } catch (err) {
    console.warn('[MyMemory] Errore imprevisto:', err);
    return null;
  }
}
