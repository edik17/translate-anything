/**
 * @fileoverview Modulo cache di traduzione basato su localStorage per TranslateAnything.
 * Memorizza le traduzioni calcolando chiavi hash djb2 e gestisce l'eliminazione LRU/FIFO
 * per rimanere entro il limite specificato di elementi.
 */

import { hashString } from './utils.js';

/**
 * Gestore della cache di traduzione con persistenza in localStorage e fallback in memoria.
 */
export class TranslationCache {
  /**
   * Inizializza la cache di traduzione.
   * @param {number} [maxEntries=5000] - Numero massimo di elementi memorizzabili nella cache.
   */
  constructor(maxEntries = 5000) {
    this.maxEntries = Number(maxEntries) > 0 ? Number(maxEntries) : 5000;
    this.prefix = 'ta_';
    this.hits = 0;
    this.misses = 0;

    /**
     * Mappa in memoria delle chiavi memorizzate e del relativo timestamp (ms) per l'evizione.
     * @type {Map<string, number>}
     */
    this.entryTimestamps = new Map();

    /**
     * Fallback in memoria nel caso in cui localStorage non sia disponibile o la quota sia esaurita.
     * @type {Map<string, string>}
     */
    this.memoryFallback = new Map();

    this._initFromStorage();
  }

  /**
   * Inizializza l'indice della cache leggendo le chiavi esistenti in localStorage.
   * @private
   */
  _initFromStorage() {
    try {
      if (typeof localStorage === 'undefined') {
        return;
      }

      const length = localStorage.length;
      for (let i = 0; i < length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.prefix)) {
          try {
            const raw = localStorage.getItem(key);
            if (raw) {
              const data = JSON.parse(raw);
              this.entryTimestamps.set(key, Number(data.timestamp) || 0);
            } else {
              this.entryTimestamps.set(key, 0);
            }
          } catch {
            this.entryTimestamps.set(key, 0);
          }
        }
      }

      // Se la cache esistente supera già il limite massimo, rimuove le voci più vecchie
      if (this.entryTimestamps.size > this.maxEntries) {
        this._evictOldest(0.20);
      }
    } catch (err) {
      console.warn('Avviso: impossibile inizializzare la cache da localStorage:', err);
    }
  }

  /**
   * Genera la chiave di cache nel formato `ta_${hash(text)}_${sl}_${tl}`.
   * @private
   * @param {string} text - Testo originale.
   * @param {string} [sourceLang='auto'] - Lingua di origine.
   * @param {string} [targetLang=''] - Lingua di destinazione.
   * @returns {string} Chiave formattata.
   */
  _buildKey(text, sourceLang, targetLang) {
    const sl = (sourceLang || 'auto').toString().trim().toLowerCase();
    const tl = (targetLang || '').toString().trim().toLowerCase();
    const hash = hashString(text);
    return `${this.prefix}${hash}_${sl}_${tl}`;
  }

  /**
   * Recupera una traduzione dalla cache.
   * @param {string} text - Testo originale.
   * @param {string} sourceLang - Codice lingua sorgente (es. 'en').
   * @param {string} targetLang - Codice lingua destinazione (es. 'it').
   * @returns {string|null} Testo tradotto se presente in cache, altrimenti null.
   */
  get(text, sourceLang, targetLang) {
    try {
      if (text === null || text === undefined) {
        this.misses++;
        return null;
      }

      const key = this._buildKey(text, sourceLang, targetLang);
      let raw = null;

      try {
        if (typeof localStorage !== 'undefined') {
          raw = localStorage.getItem(key);
        }
      } catch (storageErr) {
        console.warn('Avviso: errore durante la lettura da localStorage:', storageErr);
      }

      if (!raw && this.memoryFallback.has(key)) {
        raw = this.memoryFallback.get(key);
      }

      if (!raw) {
        this.misses++;
        return null;
      }

      const data = JSON.parse(raw);

      // Gestione di valori salvati come stringhe semplici o come oggetti con metadati
      if (typeof data === 'string') {
        this.hits++;
        this.entryTimestamps.set(key, Date.now());
        return data;
      }

      if (data && typeof data === 'object') {
        // Verifica corrispondenza del testo per mitigare eventuali collisioni hash djb2
        if (data.text !== undefined && data.text !== text) {
          this.misses++;
          return null;
        }

        this.hits++;
        this.entryTimestamps.set(key, Date.now());
        return data.translation !== undefined ? data.translation : null;
      }

      this.misses++;
      return null;
    } catch (err) {
      console.warn('Errore durante il recupero dalla cache:', err);
      this.misses++;
      return null;
    }
  }

  /**
   * Memorizza una traduzione nella cache. Se la cache supera maxEntries, rimuove il 20% più vecchio.
   * @param {string} text - Testo originale.
   * @param {string} sourceLang - Codice lingua sorgente.
   * @param {string} targetLang - Codice lingua destinazione.
   * @param {string} translation - Traduzione risultante.
   */
  set(text, sourceLang, targetLang, translation) {
    try {
      if (text === null || text === undefined || translation === null || translation === undefined) {
        return;
      }

      const key = this._buildKey(text, sourceLang, targetLang);
      const now = Date.now();
      const payload = JSON.stringify({
        text,
        translation,
        timestamp: now
      });

      // Se la chiave è nuova e abbiamo raggiunto la capacità massima, sgombera il 20% più vecchio
      if (!this.entryTimestamps.has(key) && this.entryTimestamps.size >= this.maxEntries) {
        this._evictOldest(0.20);
      }

      let saved = false;

      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(key, payload);
          saved = true;
        }
      } catch (quotaErr) {
        console.warn('Avviso: quota localStorage superata, esecuzione pulizia immediata:', quotaErr);
        this._evictOldest(0.20);
        try {
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem(key, payload);
            saved = true;
          }
        } catch (retryErr) {
          console.warn('Avviso: impossibile salvare in localStorage dopo lo sgombero, uso memoria:', retryErr);
        }
      }

      if (!saved) {
        this.memoryFallback.set(key, payload);
      }

      this.entryTimestamps.set(key, now);
    } catch (err) {
      console.warn('Errore durante il salvataggio nella cache:', err);
    }
  }

  /**
   * Rimuove la percentuale specificata di elementi più vecchi dalla cache.
   * @private
   * @param {number} [fraction=0.20] - Frazione di elementi da rimuovere (es. 0.20 per il 20%).
   */
  _evictOldest(fraction = 0.20) {
    try {
      const total = this.entryTimestamps.size;
      if (total === 0) {
        return;
      }

      const countToRemove = Math.max(1, Math.ceil(total * fraction));
      // Ordina gli elementi per timestamp crescente (il più vecchio per primo)
      const sorted = Array.from(this.entryTimestamps.entries())
        .sort((a, b) => a[1] - b[1]);

      for (let i = 0; i < countToRemove && i < sorted.length; i++) {
        const [k] = sorted[i];
        try {
          if (typeof localStorage !== 'undefined') {
            localStorage.removeItem(k);
          }
        } catch (err) {
          console.warn('Avviso: errore rimozione chiave localStorage durante evizione:', err);
        }
        this.memoryFallback.delete(k);
        this.entryTimestamps.delete(k);
      }
    } catch (err) {
      console.warn('Errore durante l\'evizione degli elementi vecchi dalla cache:', err);
    }
  }

  /**
   * Restituisce le statistiche attuali della cache.
   * @returns {{entries: number, hits: number, misses: number}} Statistiche della cache.
   */
  getStats() {
    return {
      entries: this.entryTimestamps.size,
      hits: this.hits,
      misses: this.misses
    };
  }

  /**
   * Svuota completamente tutte le voci della cache gestite da questa istanza.
   */
  clear() {
    try {
      for (const key of this.entryTimestamps.keys()) {
        try {
          if (typeof localStorage !== 'undefined') {
            localStorage.removeItem(key);
          }
        } catch {
          // ignora errori su singole chiavi
        }
      }

      // Scansione di sicurezza di localStorage per rimuovere eventuali chiavi residue ta_
      if (typeof localStorage !== 'undefined') {
        const toDelete = [];
        const length = localStorage.length;
        for (let i = 0; i < length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(this.prefix)) {
            toDelete.push(k);
          }
        }
        for (const k of toDelete) {
          try {
            localStorage.removeItem(k);
          } catch {
            // ignora
          }
        }
      }
    } catch (err) {
      console.warn('Errore durante lo svuotamento della cache:', err);
    } finally {
      this.entryTimestamps.clear();
      this.memoryFallback.clear();
      this.hits = 0;
      this.misses = 0;
    }
  }
}
