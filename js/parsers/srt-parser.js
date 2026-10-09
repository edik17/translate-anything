/**
 * @fileoverview Parser per file di sottotitoli in formato SubRip (.srt) e WebVTT (.vtt).
 * TranslateAnything — Traduttore di file nel browser.
 */

/**
 * Conta il numero di parole presenti in una stringa di testo.
 * @param {string} text - Testo da analizzare
 * @returns {number} Numero di parole
 */
function countWords(text) {
  if (!text || typeof text !== 'string') return 0;
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

/**
 * Analizza un file di sottotitoli in formato SubRip (.srt).
 * Divide il file in blocchi composti da numero progressivo, timestamp e testo.
 * Crea un chunk per ogni sottotitolo preservando indice e timestamp nei metadati.
 *
 * @param {File|Blob} file - File SRT da analizzare
 * @returns {Promise<import('../file-parser.js').ParsedFile>} File analizzato con chunks e metadati
 */
export async function parseSrt(file) {
  try {
    if (!file) {
      throw new Error('Nessun file fornito.');
    }

    const rawText = await file.text();
    // Rimuove eventuale UTF-8 BOM e normalizza i ritorni a capo
    const cleanText = rawText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();

    if (!cleanText) {
      return {
        type: 'srt',
        name: file.name || 'sottotitoli.srt',
        size: file.size || 0,
        chunks: [],
        metadata: { wordCount: 0, chunkCount: 0, subtitleCount: 0 },
        originalData: { raw: rawText, entries: [] }
      };
    }

    // Separa i blocchi di sottotitoli (righe separate da una o più righe vuote)
    const blocks = cleanText.split(/\n\s*\n+/);
    const chunks = [];
    const entries = [];
    let fallbackIndex = 1;

    for (let b = 0; b < blocks.length; b++) {
      const block = blocks[b].trim();
      if (!block) continue;

      const lines = block.split('\n');
      let subIndex;
      let timestamp = '';
      let textLines = [];

      // Caso 1: La prima riga contiene la freccia timestamp (indice omesso nel blocco)
      if (lines[0].includes('-->')) {
        subIndex = fallbackIndex++;
        timestamp = lines[0].trim();
        textLines = lines.slice(1);
      }
      // Caso 2: Struttura standard SRT (riga 0 = indice numerico, riga 1 = timestamp)
      else if (lines.length >= 2 && lines[1].includes('-->')) {
        const parsedNum = parseInt(lines[0].trim(), 10);
        subIndex = isNaN(parsedNum) ? fallbackIndex++ : parsedNum;
        timestamp = lines[1].trim();
        textLines = lines.slice(2);
      }
      // Caso anomalo non riconosciuto
      else {
        console.warn(`Blocco SRT non riconosciuto al blocco #${b + 1}:`, block);
        continue;
      }

      const subtitleText = textLines.join('\n').trim();
      if (subtitleText.length > 0) {
        const chunkId = `srt-${subIndex}`;
        chunks.push({
          id: chunkId,
          text: subtitleText,
          metadata: {
            index: subIndex,
            timestamp
          }
        });

        entries.push({
          id: chunkId,
          index: subIndex,
          timestamp,
          text: subtitleText
        });
      }
    }

    const wordCount = chunks.reduce((sum, chunk) => sum + countWords(chunk.text), 0);

    return {
      type: 'srt',
      name: file.name || 'sottotitoli.srt',
      size: file.size || rawText.length,
      chunks,
      metadata: {
        wordCount,
        chunkCount: chunks.length,
        subtitleCount: chunks.length
      },
      originalData: {
        raw: rawText,
        entries
      }
    };
  } catch (error) {
    console.warn('Errore durante l\'analisi del file SRT:', error);
    throw new Error(`Impossibile analizzare il file SRT: ${error.message}`);
  }
}

/**
 * Analizza un file di sottotitoli in formato WebVTT (.vtt).
 * Riconosce intestazioni WEBVTT, blocchi NOTE/STYLE e i cue dei sottotitoli con timestamp e testo.
 *
 * @param {File|Blob} file - File VTT da analizzare
 * @returns {Promise<import('../file-parser.js').ParsedFile>} File analizzato con chunks e metadati
 */
export async function parseVtt(file) {
  try {
    if (!file) {
      throw new Error('Nessun file fornito.');
    }

    const rawText = await file.text();
    // Rimuove eventuale UTF-8 BOM e normalizza i ritorni a capo
    const cleanText = rawText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();

    if (!cleanText) {
      return {
        type: 'vtt',
        name: file.name || 'sottotitoli.vtt',
        size: file.size || 0,
        chunks: [],
        metadata: { wordCount: 0, chunkCount: 0, subtitleCount: 0 },
        originalData: { raw: rawText, header: 'WEBVTT', entries: [] }
      };
    }

    const blocks = cleanText.split(/\n\s*\n+/);
    let header = 'WEBVTT';
    let startIndex = 0;

    // Verifica se il primo blocco è l'intestazione WEBVTT
    if (blocks.length > 0 && blocks[0].trim().toUpperCase().startsWith('WEBVTT')) {
      header = blocks[0].trim();
      startIndex = 1;
    }

    const chunks = [];
    const entries = [];
    let cueCounter = 1;

    for (let b = startIndex; b < blocks.length; b++) {
      const block = blocks[b].trim();
      if (!block) continue;

      const lines = block.split('\n');
      const firstLineUpper = lines[0].trim().toUpperCase();

      // Salta commenti NOTE, blocchi STYLE o REGION
      if (firstLineUpper.startsWith('NOTE') || firstLineUpper.startsWith('STYLE') || firstLineUpper.startsWith('REGION')) {
        continue;
      }

      let cueId = null;
      let timestamp = '';
      let textLines = [];

      // Timestamp alla prima riga (senza identificatore di cue)
      if (lines[0].includes('-->')) {
        timestamp = lines[0].trim();
        textLines = lines.slice(1);
      }
      // Timestamp alla seconda riga (la prima riga è l'identificatore del cue)
      else if (lines.length >= 2 && lines[1].includes('-->')) {
        cueId = lines[0].trim();
        timestamp = lines[1].trim();
        textLines = lines.slice(2);
      } else {
        console.warn(`Blocco WebVTT non riconosciuto al blocco #${b + 1}:`, block);
        continue;
      }

      const subtitleText = textLines.join('\n').trim();
      if (subtitleText.length > 0) {
        const id = `vtt-${cueId || cueCounter}`;
        chunks.push({
          id,
          text: subtitleText,
          metadata: {
            id: cueId,
            index: cueCounter,
            timestamp
          }
        });

        entries.push({
          id,
          cueId,
          index: cueCounter,
          timestamp,
          text: subtitleText
        });

        cueCounter++;
      }
    }

    const wordCount = chunks.reduce((sum, chunk) => sum + countWords(chunk.text), 0);

    return {
      type: 'vtt',
      name: file.name || 'sottotitoli.vtt',
      size: file.size || rawText.length,
      chunks,
      metadata: {
        wordCount,
        chunkCount: chunks.length,
        subtitleCount: chunks.length
      },
      originalData: {
        raw: rawText,
        header,
        entries
      }
    };
  } catch (error) {
    console.warn('Errore durante l\'analisi del file WebVTT:', error);
    throw new Error(`Impossibile analizzare il file VTT: ${error.message}`);
  }
}
