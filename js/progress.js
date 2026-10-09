/**
 * @fileoverview Modulo per il tracciamento del progresso di traduzione e il calcolo delle statistiche.
 * Calcola percentuale, velocità in parole al minuto (media mobile sugli ultimi 10 blocchi),
 * tempo stimato rimanente (ETA) e tempo trascorso.
 */

/**
 * Traccia l'avanzamento della traduzione a blocchi (chunks) e calcola le metriche prestazionali.
 */
export class ProgressTracker {
  /**
   * Inizializza il tracciatore di progresso.
   * @param {number} [totalChunks=0] - Numero totale di blocchi da tradurre.
   * @param {number} [totalWords=0] - Numero totale stimato di parole da tradurre.
   */
  constructor(totalChunks = 0, totalWords = 0) {
    this.total = Math.max(0, Number(totalChunks) || 0);
    this.totalWords = Math.max(0, Number(totalWords) || 0);
    this.completed = 0;
    this.wordsTranslated = 0;
    this.startTime = Date.now();
    this.lastChunkTime = performance.now();

    /**
     * Cronologia degli ultimi blocchi per il calcolo della media mobile (massimo 10).
     * @type {Array<{words: number, durationMs: number}>}
     */
    this.chunkHistory = [];
  }

  /**
   * Registra il completamento di un blocco di traduzione.
   * Incrementa il conteggio dei blocchi completati e aggiunge le parole tradotte.
   * @param {number} [chunkWordCount=0] - Numero di parole contenute nel blocco completato.
   */
  update(chunkWordCount = 0) {
    try {
      const words = Math.max(0, Number(chunkWordCount) || 0);
      this.completed += 1;
      this.wordsTranslated += words;

      const now = performance.now();
      // Durata impiegata per tradurre il blocco (minimo 1ms per evitare divisioni anomale)
      const durationMs = Math.max(1, now - this.lastChunkTime);
      this.lastChunkTime = now;

      this.chunkHistory.push({ words, durationMs });

      // Mantiene solo gli ultimi 10 blocchi per la media mobile
      if (this.chunkHistory.length > 10) {
        this.chunkHistory.shift();
      }
    } catch (err) {
      console.warn('Errore durante l\'aggiornamento del progresso:', err);
    }
  }

  /**
   * Calcola e restituisce le statistiche correnti di avanzamento.
   * @returns {{
   *   percent: number,
   *   completed: number,
   *   total: number,
   *   wordsTranslated: number,
   *   wordsPerMin: number,
   *   etaSeconds: number,
   *   elapsed: number
   * }} Oggetto contenente tutte le metriche di progresso.
   */
  getStats() {
    try {
      // Calcolo percentuale di completamento (0-100)
      let percent = 0;
      if (this.total > 0) {
        percent = Math.min(100, Math.max(0, Math.round((this.completed / this.total) * 100)));
      } else if (this.totalWords > 0) {
        percent = Math.min(100, Math.max(0, Math.round((this.wordsTranslated / this.totalWords) * 100)));
      }

      // Calcolo parole al minuto (media mobile sugli ultimi 10 blocchi)
      let wordsPerMin = 0;
      if (this.chunkHistory.length > 0) {
        const totalRecentWords = this.chunkHistory.reduce((sum, item) => sum + item.words, 0);
        const totalRecentMs = this.chunkHistory.reduce((sum, item) => sum + item.durationMs, 0);

        if (totalRecentMs > 0) {
          const minutes = totalRecentMs / 60000;
          wordsPerMin = Math.round(totalRecentWords / minutes);
        }
      }

      // Calcolo tempo stimato rimanente: etaSeconds = remainingWords / wordsPerMin * 60
      const remainingWords = Math.max(0, this.totalWords - this.wordsTranslated);
      let etaSeconds = 0;

      if (this.total > 0 && this.completed >= this.total) {
        etaSeconds = 0;
      } else if (wordsPerMin > 0 && remainingWords > 0) {
        etaSeconds = Math.max(1, Math.round((remainingWords / wordsPerMin) * 60));
      }

      // Tempo trascorso in secondi
      const elapsed = Math.max(0, Math.floor((Date.now() - this.startTime) / 1000));

      return {
        percent,
        completed: this.completed,
        total: this.total,
        wordsTranslated: this.wordsTranslated,
        wordsPerMin,
        etaSeconds,
        elapsed
      };
    } catch (err) {
      console.warn('Errore durante il calcolo delle statistiche di progresso:', err);
      return {
        percent: 0,
        completed: this.completed,
        total: this.total,
        wordsTranslated: this.wordsTranslated,
        wordsPerMin: 0,
        etaSeconds: 0,
        elapsed: 0
      };
    }
  }

  /**
   * Reimposta tutti i contatori e la cronologia temporale.
   * @param {number} [totalChunks] - Nuovo totale facoltativo di blocchi.
   * @param {number} [totalWords] - Nuovo totale facoltativo di parole.
   */
  reset(totalChunks = this.total, totalWords = this.totalWords) {
    try {
      this.total = Math.max(0, Number(totalChunks) || 0);
      this.totalWords = Math.max(0, Number(totalWords) || 0);
      this.completed = 0;
      this.wordsTranslated = 0;
      this.startTime = Date.now();
      this.lastChunkTime = performance.now();
      this.chunkHistory = [];
    } catch (err) {
      console.warn('Errore durante il reset del progresso:', err);
    }
  }
}
