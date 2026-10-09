/**
 * @fileoverview Modulo principale per il dispatching della generazione e ricostruzione dei file.
 * TranslateAnything — Traduttore di file nel browser.
 */

import { buildTxt, buildJson, buildHtml } from './txt-builder.js';
import { buildSrt, buildVtt } from './srt-builder.js';
import { buildEpub } from './epub-builder.js';

/**
 * Ricostruisce il file tradotto reindirizzando la richiesta al builder specializzato in base al formato identificato.
 *
 * @param {Object} parsedFile - Oggetto ParsedFile contenente i metadati e la struttura originale
 * @param {Array<Object|string>} translatedChunks - Array dei chunk tradotti
 * @param {string} [targetLang='it'] - Codice ISO della lingua di destinazione (es. 'it', 'en', 'de')
 * @returns {Promise<{blob: Blob, filename: string, mimeType: string}>} Oggetto con file generato sotto forma di Blob, nome e mimeType
 */
export async function buildFile(parsedFile, translatedChunks, targetLang = 'it') {
  if (!parsedFile) {
    throw new Error('Nessun file analizzato fornito per la generazione.');
  }

  // Identifica il tipo di file da parsedFile.type o dall'estensione del nome
  let type = (parsedFile.type || '').toLowerCase().trim();

  if (!type) {
    const filename = parsedFile.name || parsedFile.filename || parsedFile.originalFile?.name || '';
    if (filename.includes('.')) {
      type = filename.split('.').pop().toLowerCase().trim();
    }
  }

  try {
    switch (type) {
      case 'txt':
      case 'text':
      case 'text/plain':
        return buildTxt(parsedFile, translatedChunks);

      case 'json':
      case 'application/json':
        return buildJson(parsedFile, translatedChunks);

      case 'html':
      case 'htm':
      case 'xhtml':
      case 'text/html':
      case 'application/xhtml+xml':
        return buildHtml(parsedFile, translatedChunks, targetLang);

      case 'srt':
      case 'subrip':
      case 'application/x-subrip':
        return buildSrt(parsedFile, translatedChunks);

      case 'vtt':
      case 'webvtt':
      case 'text/vtt':
        return buildVtt(parsedFile, translatedChunks);

      case 'epub':
      case 'application/epub+zip':
        return await buildEpub(parsedFile, translatedChunks, targetLang);

      default:
        throw new Error(
          `Formato "${type || 'sconosciuto'}" non supportato per la generazione. ` +
          'Formati supportati: EPUB, TXT, SRT, VTT, HTML, JSON.'
        );
    }
  } catch (error) {
    console.warn(`Errore durante il build del file di tipo "${type}":`, error);
    throw error;
  }
}

export { buildTxt, buildJson, buildHtml, buildSrt, buildVtt, buildEpub };
