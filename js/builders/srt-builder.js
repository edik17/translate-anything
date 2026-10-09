/**
 * @fileoverview Modulo builder per sottotitoli in formato SubRip (.srt) e WebVTT (.vtt).
 * TranslateAnything — Traduttore di file nel browser.
 */

import { getTranslatedFilename } from './txt-builder.js';

/**
 * Estrae il testo tradotto da un blocco o stringa.
 *
 * @param {any} chunk - Blocco tradotto o stringa
 * @returns {string} Testo estratto
 */
function extractChunkText(chunk) {
  if (typeof chunk === 'string') {
    return chunk;
  }
  if (!chunk) {
    return '';
  }
  if (typeof chunk.translatedText === 'string') {
    return chunk.translatedText;
  }
  if (typeof chunk.text === 'string') {
    return chunk.text;
  }
  if (typeof chunk.originalText === 'string') {
    return chunk.originalText;
  }
  return String(chunk);
}

/**
 * Normalizza il timestamp per il formato SRT (separatore millisecondi virgola ',').
 *
 * @param {string} timestamp - Timestamp originale (es. '00:01:20.000 --> 00:01:23.000')
 * @returns {string} Timestamp formattato per SRT
 */
function formatSrtTimestamp(timestamp) {
  if (!timestamp || typeof timestamp !== 'string') {
    return '00:00:00,000 --> 00:00:00,000';
  }
  return timestamp.replace(/(\d{2}:\d{2}:\d{2})\.(\d{3})/g, '$1,$2');
}

/**
 * Normalizza il timestamp per il formato WebVTT (separatore millisecondi punto '.').
 *
 * @param {string} timestamp - Timestamp originale (es. '00:01:20,000 --> 00:01:23,000')
 * @returns {string} Timestamp formattato per WebVTT
 */
function formatVttTimestamp(timestamp) {
  if (!timestamp || typeof timestamp !== 'string') {
    return '00:00:00.000 --> 00:00:00.000';
  }
  return timestamp.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
}

/**
 * Ricostruisce un file SRT con numerazione e timestamp originali e testo tradotto.
 * Formato per ogni sottotitolo: NUMBER\nTIMESTAMP\nTRANSLATED_TEXT\n\n
 *
 * @param {Object} parsedFile - Oggetto ParsedFile originale contenente chunks e originalData
 * @param {Array<Object|string>} translatedChunks - Array dei chunk tradotti
 * @returns {{blob: Blob, filename: string, mimeType: string}} Oggetto con Blob, nome file e tipo MIME
 */
export function buildSrt(parsedFile, translatedChunks) {
  try {
    const chunks = Array.isArray(translatedChunks) ? translatedChunks : [];
    const entries = parsedFile?.originalData?.entries || [];
    const parsedChunks = parsedFile?.chunks || [];

    const totalCount = Math.max(chunks.length, entries.length, parsedChunks.length);
    const srtBlocks = [];

    for (let i = 0; i < totalCount; i++) {
      const chunk = chunks[i];
      const entry = entries[i];
      const parsedChunk = parsedChunks[i];

      // Determina il numero progressivo del sottotitolo
      const number = chunk?.metadata?.index || entry?.index || parsedChunk?.metadata?.index || (i + 1);

      // Determina il timestamp
      const rawTimestamp = chunk?.metadata?.timestamp || entry?.timestamp || parsedChunk?.metadata?.timestamp || '';
      const timestamp = formatSrtTimestamp(rawTimestamp);

      // Determina il testo tradotto con fallback
      const text = (extractChunkText(chunk) || entry?.text || parsedChunk?.text || '').trim();

      // Formato: NUMBER\nTIMESTAMP\nTRANSLATED_TEXT\n\n
      srtBlocks.push(`${number}\n${timestamp}\n${text}\n\n`);
    }

    const content = srtBlocks.join('');
    const originalName = parsedFile?.name || parsedFile?.filename || parsedFile?.originalFile?.name || 'sottotitoli.srt';
    const filename = getTranslatedFilename(originalName, 'srt');
    const mimeType = 'application/x-subrip';
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });

    return { blob, filename, mimeType };
  } catch (error) {
    console.warn('Errore durante la generazione del file SRT:', error);
    throw new Error(`Impossibile creare il file SRT: ${error.message}`);
  }
}

/**
 * Ricostruisce un file WebVTT con intestazione 'WEBVTT', numerazione/timestamp e testo tradotto.
 *
 * @param {Object} parsedFile - Oggetto ParsedFile originale contenente chunks e originalData
 * @param {Array<Object|string>} translatedChunks - Array dei chunk tradotti
 * @returns {{blob: Blob, filename: string, mimeType: string}} Oggetto con Blob, nome file e tipo MIME
 */
export function buildVtt(parsedFile, translatedChunks) {
  try {
    const chunks = Array.isArray(translatedChunks) ? translatedChunks : [];
    const entries = parsedFile?.originalData?.entries || [];
    const parsedChunks = parsedFile?.chunks || [];

    // Intestazione WebVTT originale o standard
    const header = parsedFile?.originalData?.header || 'WEBVTT';
    const totalCount = Math.max(chunks.length, entries.length, parsedChunks.length);
    const vttBlocks = [];

    for (let i = 0; i < totalCount; i++) {
      const chunk = chunks[i];
      const entry = entries[i];
      const parsedChunk = parsedChunks[i];

      // Identificatore del cue o indice progressivo
      const cueId = chunk?.metadata?.id || entry?.cueId || null;
      const index = chunk?.metadata?.index || entry?.index || parsedChunk?.metadata?.index || (i + 1);
      const cueLabel = cueId ? String(cueId) : String(index);

      // Timestamp normalizzato con punti
      const rawTimestamp = chunk?.metadata?.timestamp || entry?.timestamp || parsedChunk?.metadata?.timestamp || '';
      const timestamp = formatVttTimestamp(rawTimestamp);

      // Testo del sottotitolo
      const text = (extractChunkText(chunk) || entry?.text || parsedChunk?.text || '').trim();

      // Formato: CUE_ID\nTIMESTAMP\nTRANSLATED_TEXT\n\n
      vttBlocks.push(`${cueLabel}\n${timestamp}\n${text}\n\n`);
    }

    const content = `${header}\n\n${vttBlocks.join('')}`;
    const originalName = parsedFile?.name || parsedFile?.filename || parsedFile?.originalFile?.name || 'sottotitoli.vtt';
    const filename = getTranslatedFilename(originalName, 'vtt');
    const mimeType = 'text/vtt';
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });

    return { blob, filename, mimeType };
  } catch (error) {
    console.warn('Errore durante la generazione del file WebVTT:', error);
    throw new Error(`Impossibile creare il file WebVTT: ${error.message}`);
  }
}
