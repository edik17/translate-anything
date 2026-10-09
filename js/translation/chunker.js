/**
 * TranslateAnything — Chunker Module
 * Modulo per la suddivisione del testo e dei paragrafi HTML in blocchi ottimali per le API di traduzione.
 */

/**
 * Suddivide una porzione di testo troppo lunga rispetto a maxChars,
 * tentando prima sui delimitatori di proposizione (, ; : — – -),
 * poi sulle parole e infine con hard slice se una singola parola supera il limite.
 *
 * @param {string} segment - Segmento di testo da suddividere.
 * @param {number} maxChars - Limite massimo di caratteri per blocco.
 * @returns {string[]} Lista di sotto-segmenti che rispettano il limite.
 */
function breakOversizedSegment(segment, maxChars) {
  // Prova a suddividere su punteggiatura intermedia di proposizione
  const clauseRegex = /[^,;:—–-]+(?:[,;:—–-]+\s*|$)/g;
  const clauseMatches = segment.match(clauseRegex);

  if (clauseMatches && clauseMatches.length > 1) {
    const pieces = [];
    for (const clause of clauseMatches) {
      if (clause.length > maxChars) {
        pieces.push(...breakByWords(clause, maxChars));
      } else {
        pieces.push(clause);
      }
    }
    return pieces;
  }

  return breakByWords(segment, maxChars);
}

/**
 * Suddivide il testo sui confini di parola (\s+), gestendo parole singole
 * che eccedono il limite mediante troncamento a blocchi fissi.
 *
 * @param {string} text - Testo da suddividere per parole.
 * @param {number} maxChars - Limite massimo di caratteri.
 * @returns {string[]} Lista di sotto-blocchi.
 */
function breakByWords(text, maxChars) {
  const words = text.match(/\S+\s*/g) || [text];
  const pieces = [];

  for (const word of words) {
    if (word.length > maxChars) {
      for (let i = 0; i < word.length; i += maxChars) {
        pieces.push(word.slice(i, i + maxChars));
      }
    } else {
      pieces.push(word);
    }
  }

  return pieces;
}

/**
 * Suddivide una stringa di testo in chunk ottimali per le API di traduzione,
 * rispettando i confini delle frasi (. ! ? … \n) e garantendo che nessun blocco
 * superi `maxChars`.
 *
 * @param {string} text - Il testo originale da suddividere.
 * @param {number} [maxChars=2000] - Numero massimo di caratteri per ciascun blocco.
 * @returns {string[]} Array di stringhe rappresentanti i singoli chunk.
 */
export function chunkText(text, maxChars = 2000) {
  if (!text || typeof text !== 'string') {
    return [];
  }

  const limit = Math.max(1, maxChars);
  if (text.length <= limit) {
    const trimmed = text.trim();
    return trimmed.length > 0 ? [trimmed] : [];
  }

  // Regex per catturare frasi complete preservando la punteggiatura finale e gli spazi/a capo successivi
  const sentenceRegex = /[^.!?…\n]+(?:[.!?…]+["'”’»)]*(?:\s+|\n+|$)|(?:\n+|$))/g;
  const rawSegments = text.match(sentenceRegex) || [text];

  const chunks = [];
  let currentChunk = '';

  for (const segment of rawSegments) {
    if (!segment) continue;

    if (segment.length > limit) {
      // Se il chunk accumulato ha contenuto, salvalo prima di processare il segmento gigante
      if (currentChunk.trim().length > 0) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }

      const subPieces = breakOversizedSegment(segment, limit);
      for (const piece of subPieces) {
        if (currentChunk.length + piece.length > limit) {
          if (currentChunk.trim().length > 0) {
            chunks.push(currentChunk.trim());
            currentChunk = '';
          }
        }
        currentChunk += piece;
      }
    } else {
      if (currentChunk.length + segment.length > limit) {
        if (currentChunk.trim().length > 0) {
          chunks.push(currentChunk.trim());
          currentChunk = '';
        }
      }
      currentChunk += segment;
    }
  }

  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Raggruppa un array di paragrafi HTML in batch (gruppi) che non superano `maxChars`,
 * consentendo la traduzione raggruppata per ottimizzare le chiamate di rete.
 *
 * @param {Array<{id: string|number, html: string, text: string, [key: string]: any}>} paragraphs - Array di oggetti paragrafo.
 * @param {number} [maxChars=2000] - Dimensione massima in caratteri stimata per ciascun batch.
 * @returns {Array<Array<{id: string|number, html: string, text: string, [key: string]: any}>>} Array di batch di paragrafi.
 */
export function chunkHtmlParagraphs(paragraphs, maxChars = 2000) {
  if (!Array.isArray(paragraphs) || paragraphs.length === 0) {
    return [];
  }

  const limit = Math.max(1, maxChars);
  const batches = [];
  let currentBatch = [];
  let currentChars = 0;

  for (const para of paragraphs) {
    if (!para) continue;

    const len = typeof para.text === 'string'
      ? para.text.length
      : (typeof para.html === 'string' ? para.html.length : 0);

    // Se l'aggiunta di questo paragrafo supera il limite e il batch corrente non è vuoto,
    // chiudi il batch corrente e iniziane uno nuovo.
    if (currentChars + len > limit && currentBatch.length > 0) {
      batches.push(currentBatch);
      currentBatch = [];
      currentChars = 0;
    }

    currentBatch.push(para);
    currentChars += len;
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
}
