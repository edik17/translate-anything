/**
 * @fileoverview Modulo principale per il rilevamento del formato dei file e il dispatching ai parser dedicati.
 * TranslateAnything — Traduttore di file nel browser.
 */

import { parseTxt, parseHtml, parseJson } from './parsers/txt-parser.js';
import { parseSrt, parseVtt } from './parsers/srt-parser.js';
import { parseEpub } from './parsers/epub-parser.js';

/**
 * @typedef {Object} Chunk
 * @property {string} id - Identificatore univoco del chunk (es. 'p-0', 'OEBPS/ch1.xhtml#3', 'data.name')
 * @property {string} text - Testo semplice da tradurre
 * @property {string} [html] - HTML originale del frammento (ove applicabile)
 * @property {Object} [metadata] - Informazioni di contesto specifiche del formato
 */

/**
 * @typedef {Object} ParsedFile
 * @property {'txt'|'epub'|'srt'|'vtt'|'html'|'json'} type - Tipo di formato identificato
 * @property {string} name - Nome del file originale
 * @property {number} size - Dimensione in byte
 * @property {Chunk[]} chunks - Lista dei blocchi di testo da tradurre
 * @property {Object} metadata - Statistiche e metadati (wordCount, chapterCount, chunkCount, ...)
 * @property {any} originalData - Struttura e dati originali necessari al builder per ricostruire il file
 */

/**
 * Rileva il formato di un file in base a estensione e tipo MIME, ed esegue il parser corrispondente.
 *
 * @param {File|Blob} file - File da analizzare
 * @returns {Promise<ParsedFile>} Oggetto ParsedFile contenente i chunk estratti e i metadati
 */
export async function parseFile(file) {
  if (!file) {
    throw new Error('Nessun file selezionato per l\'analisi.');
  }

  const name = file.name || '';
  const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
  const mime = (file.type || '').toLowerCase();

  let parsed;

  try {
    if (ext === 'epub' || mime === 'application/epub+zip') {
      parsed = await parseEpub(file);
    } else if (ext === 'srt' || mime.includes('subrip')) {
      parsed = await parseSrt(file);
    } else if (ext === 'vtt' || mime === 'text/vtt') {
      parsed = await parseVtt(file);
    } else if (['html', 'htm', 'xhtml'].includes(ext) || mime === 'text/html' || mime === 'application/xhtml+xml') {
      parsed = await parseHtml(file);
    } else if (ext === 'json' || mime === 'application/json') {
      parsed = await parseJson(file);
    } else if (ext === 'txt' || mime.startsWith('text/') || ext === '') {
      parsed = await parseTxt(file);
    } else {
      throw new Error(`Il formato ".${ext || 'sconosciuto'}" non è al momento supportato. Formati supportati: EPUB, TXT, SRT, VTT, HTML, JSON.`);
    }

    // Assicura campi standardizzati
    parsed.name = parsed.name || name || 'documento';
    parsed.size = typeof parsed.size === 'number' ? parsed.size : (file.size || 0);
    parsed.chunks = Array.isArray(parsed.chunks) ? parsed.chunks : [];
    parsed.metadata = parsed.metadata || {};

    if (parsed.metadata.wordCount === undefined) {
      parsed.metadata.wordCount = parsed.chunks.reduce((acc, c) => {
        const text = (c && c.text) ? c.text.trim() : '';
        return acc + (text ? text.split(/\s+/).filter(Boolean).length : 0);
      }, 0);
    }

    parsed.metadata.chunkCount = parsed.chunks.length;

    return parsed;
  } catch (error) {
    console.warn(`Errore durante l'analisi del file "${name}":`, error);
    throw error;
  }
}

/**
 * Restituisce l'icona emoji associata al tipo di file specificato.
 *
 * @param {string} type - Codice del tipo di file ('txt', 'epub', 'srt', 'vtt', 'html', 'json', ecc.)
 * @returns {string} Emoji corrispondente
 */
export function getFileIcon(type) {
  const normalized = (type || '').toLowerCase();
  switch (normalized) {
    case 'epub':
      return '📚';
    case 'srt':
    case 'vtt':
      return '🎬';
    case 'html':
    case 'htm':
    case 'xhtml':
      return '🌐';
    case 'json':
      return '📋';
    case 'txt':
      return '📄';
    case 'docx':
      return '📝';
    case 'pdf':
      return '📑';
    default:
      return '📄';
  }
}

/**
 * Converte una dimensione in byte in una stringa leggibile dall'utente con unità di misura appropriate.
 *
 * @param {number} bytes - Dimensione espressa in byte
 * @returns {string} Stringa leggibile (es. '1.5 MB', '340 KB', '0 B')
 */
export function formatFileSize(bytes) {
  if (typeof bytes !== 'number' || isNaN(bytes) || bytes <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);

  if (i === 0) {
    return `${bytes} B`;
  }

  const value = bytes / Math.pow(1024, i);
  const formatted = value >= 100 ? value.toFixed(0) : value >= 10 ? value.toFixed(1) : value.toFixed(2);
  return `${parseFloat(formatted)} ${units[i]}`;
}
