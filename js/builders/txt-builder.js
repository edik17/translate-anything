/**
 * @fileoverview Modulo builder per documenti di testo semplice (.txt), file JSON (.json) e pagine HTML (.html).
 * TranslateAnything — Traduttore di file nel browser.
 */

/**
 * Genera il nome del file tradotto inserendo il suffisso '_translated' prima dell'estensione.
 *
 * @param {string} originalName - Nome originale del file (es. 'documento.txt')
 * @param {string} [defaultExt='txt'] - Estensione predefinita se assente nel nome originale
 * @returns {string} Nome del file con suffisso '_translated' (es. 'documento_translated.txt')
 */
export function getTranslatedFilename(originalName, defaultExt = 'txt') {
  if (!originalName || typeof originalName !== 'string') {
    return defaultExt ? `documento_translated.${defaultExt}` : 'documento_translated';
  }

  const lastDot = originalName.lastIndexOf('.');
  if (lastDot > 0) {
    const base = originalName.slice(0, lastDot);
    const ext = originalName.slice(lastDot);
    return `${base}_translated${ext}`;
  }

  return defaultExt ? `${originalName}_translated.${defaultExt}` : `${originalName}_translated`;
}

/**
 * Estrae il testo tradotto da un elemento chunk, con fallback sui campi alternativi.
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
 * Ricostruisce un file di testo semplice (.txt) unendo i blocchi tradotti con doppio a capo.
 *
 * @param {Object} parsedFile - Oggetto ParsedFile originale
 * @param {Array<Object|string>} translatedChunks - Array dei chunk tradotti
 * @returns {{blob: Blob, filename: string, mimeType: string}} Oggetto con Blob, nome file e tipo MIME
 */
export function buildTxt(parsedFile, translatedChunks) {
  try {
    const chunks = Array.isArray(translatedChunks) ? translatedChunks : [];
    const textList = chunks.map(extractChunkText);

    // Unisce i blocchi con doppio ritorno a capo (\n\n)
    const content = textList.join('\n\n');

    const originalName = parsedFile?.name || parsedFile?.filename || parsedFile?.originalFile?.name || 'documento.txt';
    const filename = getTranslatedFilename(originalName, 'txt');
    const mimeType = 'text/plain';
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });

    return { blob, filename, mimeType };
  } catch (error) {
    console.warn('Errore durante la generazione del file TXT:', error);
    throw new Error(`Impossibile creare il file TXT: ${error.message}`);
  }
}

/**
 * Assegna un valore a un oggetto o array nidificato seguendo un array di chiavi/indici.
 *
 * @param {any} target - Struttura dati bersaglio
 * @param {Array<string|number>} keys - Array gerarchico di chiavi/indici
 * @param {any} value - Valore da assegnare
 */
function setDeepValue(target, keys, value) {
  if (!target || !Array.isArray(keys) || keys.length === 0) return;

  let current = target;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    const nextKey = keys[i + 1];

    if (current[key] === undefined || current[key] === null) {
      current[key] = typeof nextKey === 'number' ? [] : {};
    }
    current = current[key];
  }

  const lastKey = keys[keys.length - 1];
  current[lastKey] = value;
}

/**
 * Converte una stringa di percorso JSON (es. 'users[0].name') in un array di chiavi/indici.
 *
 * @param {string} path - Percorso JSON in notazione mista a punti e parentesi quadre
 * @returns {Array<string|number>} Array di chiavi e indici
 */
function parsePathToKeys(path) {
  if (!path || typeof path !== 'string' || path === 'root') return [];

  const normalized = path.replace(/\[(\d+)\]/g, '.$1');
  const parts = normalized.split('.').filter(Boolean);

  return parts.map((part) => {
    const num = Number(part);
    return Number.isInteger(num) && String(num) === part ? num : part;
  });
}

/**
 * Ricostruisce la struttura originale di un file JSON sostituendo i valori stringa con i testi tradotti.
 *
 * @param {Object} parsedFile - Oggetto ParsedFile originale contenente originalData o jsonData
 * @param {Array<Object|string>} translatedChunks - Array dei chunk tradotti
 * @returns {{blob: Blob, filename: string, mimeType: string}} Oggetto con Blob, nome file e tipo MIME
 */
export function buildJson(parsedFile, translatedChunks) {
  try {
    const chunks = Array.isArray(translatedChunks) ? translatedChunks : [];

    // Recupera la struttura dati originale
    let baseData = null;
    if (parsedFile?.originalData !== undefined && parsedFile.originalData !== null) {
      try {
        baseData = typeof structuredClone === 'function'
          ? structuredClone(parsedFile.originalData)
          : JSON.parse(JSON.stringify(parsedFile.originalData));
      } catch {
        baseData = JSON.parse(JSON.stringify(parsedFile.originalData));
      }
    } else if (parsedFile?.data !== undefined) {
      baseData = JSON.parse(JSON.stringify(parsedFile.data));
    } else if (typeof parsedFile?.content === 'string') {
      try {
        baseData = JSON.parse(parsedFile.content);
      } catch {
        baseData = null;
      }
    }

    let reconstructed;

    if (baseData !== null) {
      reconstructed = baseData;

      // 1. Prova aggiornamento tramite chiavi/percorsi nei metadati dei chunk
      let updatedViaKeys = false;
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const parsedChunk = parsedFile?.chunks?.[i];
        const keys = chunk?.metadata?.keys || parsedChunk?.metadata?.keys ||
          (chunk?.metadata?.path ? parsePathToKeys(chunk.metadata.path) : null) ||
          (chunk?.id ? parsePathToKeys(chunk.id) : null);

        if (Array.isArray(keys) && keys.length > 0) {
          setDeepValue(reconstructed, keys, extractChunkText(chunk));
          updatedViaKeys = true;
        }
      }

      // 2. Se non sono presenti percorsi nei metadati, aggiorna le stringhe in ordine DFS
      if (!updatedViaKeys && chunks.length > 0) {
        let chunkIndex = 0;

        function replaceStringsInObject(node) {
          if (node === null || typeof node !== 'object') return node;

          if (Array.isArray(node)) {
            for (let i = 0; i < node.length; i++) {
              if (typeof node[i] === 'string') {
                if (chunkIndex < chunks.length) {
                  node[i] = extractChunkText(chunks[chunkIndex++]);
                }
              } else if (typeof node[i] === 'object' && node[i] !== null) {
                replaceStringsInObject(node[i]);
              }
            }
          } else {
            for (const key of Object.keys(node)) {
              if (typeof node[key] === 'string') {
                if (chunkIndex < chunks.length) {
                  node[key] = extractChunkText(chunks[chunkIndex++]);
                }
              } else if (typeof node[key] === 'object' && node[key] !== null) {
                replaceStringsInObject(node[key]);
              }
            }
          }
          return node;
        }

        replaceStringsInObject(reconstructed);
      }
    } else {
      // Fallback: Ricostruzione da zero dai chunk tradotti
      reconstructed = {};
      let isObject = false;

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const parsedChunk = parsedFile?.chunks?.[i];
        const keys = chunk?.metadata?.keys || parsedChunk?.metadata?.keys ||
          (chunk?.id ? parsePathToKeys(chunk.id) : null);

        if (Array.isArray(keys) && keys.length > 0) {
          isObject = true;
          setDeepValue(reconstructed, keys, extractChunkText(chunk));
        }
      }

      if (!isObject) {
        reconstructed = chunks.map(extractChunkText);
      }
    }

    const jsonString = JSON.stringify(reconstructed, null, 2);
    const originalName = parsedFile?.name || parsedFile?.filename || parsedFile?.originalFile?.name || 'dati.json';
    const filename = getTranslatedFilename(originalName, 'json');
    const mimeType = 'application/json';
    const blob = new Blob([jsonString], { type: `${mimeType};charset=utf-8` });

    return { blob, filename, mimeType };
  } catch (error) {
    console.warn('Errore durante la generazione del file JSON:', error);
    throw new Error(`Impossibile creare il file JSON: ${error.message}`);
  }
}

/**
 * Ricostruisce un documento HTML aggiornando il testo degli elementi con le rispettive traduzioni.
 *
 * @param {Object} parsedFile - Oggetto ParsedFile originale contenente originalData o rawHtml
 * @param {Array<Object|string>} translatedChunks - Array dei chunk tradotti
 * @param {string} [targetLang='it'] - Codice della lingua di destinazione per l'attributo lang
 * @returns {{blob: Blob, filename: string, mimeType: string}} Oggetto con Blob, nome file e tipo MIME
 */
export function buildHtml(parsedFile, translatedChunks, targetLang = 'it') {
  try {
    const chunks = Array.isArray(translatedChunks) ? translatedChunks : [];

    // Recupera l'HTML originale
    let rawHtml = '';
    if (parsedFile?.originalData?.raw) {
      rawHtml = parsedFile.originalData.raw;
    } else if (typeof parsedFile?.content === 'string') {
      rawHtml = parsedFile.content;
    } else if (typeof parsedFile?.html === 'string') {
      rawHtml = parsedFile.html;
    }

    let doc;
    if (rawHtml) {
      const parser = new DOMParser();
      doc = parser.parseFromString(rawHtml, 'text/html');
    } else {
      doc = document.implementation.createHTMLDocument('Documento Tradotto');
    }

    // Aggiorna l'attributo lang del tag <html>
    if (targetLang && doc.documentElement) {
      doc.documentElement.setAttribute('lang', targetLang);
    }

    // Seleziona gli elementi nello stesso ordine in cui txt-parser li ha estratti
    const body = doc.body;
    const matchedElements = [];

    // 1. Tag <title> se presente
    const titleChunk = chunks.find((c, idx) => {
      const parsed = parsedFile?.chunks?.[idx];
      return c?.metadata?.tagName === 'title' || parsed?.metadata?.tagName === 'title' || c?.id === 'html-0' && parsed?.metadata?.selector === 'title';
    });

    if (titleChunk) {
      const newTitle = extractChunkText(titleChunk);
      if (newTitle) {
        doc.title = newTitle;
      }
    }

    // 2. Elementi testuali nel body
    if (body) {
      const textSelector = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, dt, dd, th, td, caption, figcaption, label, button, pre';
      const textElements = body.querySelectorAll(textSelector);
      const extractedNodes = new Set();

      for (const el of textElements) {
        if (el.closest('script, style, noscript, svg')) continue;
        const text = el.textContent.trim();
        if (text.length > 0) {
          extractedNodes.add(el);
          matchedElements.push(el);
        }
      }

      // Foglie testuali autonome (div, span, a, article, section)
      const allLeaves = body.querySelectorAll('div, span, a, article, section');
      for (const el of allLeaves) {
        if (el.closest('script, style, noscript, svg')) continue;

        let isInsideExtracted = false;
        for (const extracted of extractedNodes) {
          if (typeof extracted.contains === 'function' && extracted.contains(el)) {
            isInsideExtracted = true;
            break;
          }
        }
        if (isInsideExtracted) continue;

        const hasChildTextNodes = typeof el.querySelector === 'function' ? el.querySelector(textSelector) : null;
        if (!hasChildTextNodes) {
          const directText = el.textContent ? el.textContent.trim() : '';
          if (directText.length > 0) {
            extractedNodes.add(el);
            matchedElements.push(el);
          }
        }
      }
    }

    // Filtra i chunk che appartengono al body (escludendo il title se gestito separatamente)
    let bodyChunks = chunks;
    if (titleChunk) {
      bodyChunks = chunks.filter((c) => c !== titleChunk);
    }

    // Assegna il testo o HTML tradotto agli elementi corrispondenti
    for (let i = 0; i < matchedElements.length && i < bodyChunks.length; i++) {
      const el = matchedElements[i];
      const chunk = bodyChunks[i];
      const translatedHtml = chunk?.translatedHtml;
      const translatedText = extractChunkText(chunk);

      if (translatedHtml && typeof translatedHtml === 'string') {
        el.innerHTML = translatedHtml;
      } else if (translatedText) {
        // Se contiene tag HTML preservati, imposta innerHTML, altrimenti textContent
        if (/<[a-z][\s\S]*>/i.test(translatedText)) {
          el.innerHTML = translatedText;
        } else {
          el.textContent = translatedText;
        }
      }
    }

    // Serializza il documento HTML preservando il DOCTYPE se presente in origine
    let outputHtml = doc.documentElement.outerHTML;
    if (!rawHtml || /<!DOCTYPE[^>]*>/i.test(rawHtml)) {
      outputHtml = `<!DOCTYPE html>\n${outputHtml}`;
    }

    const originalName = parsedFile?.name || parsedFile?.filename || parsedFile?.originalFile?.name || 'documento.html';
    const filename = getTranslatedFilename(originalName, 'html');
    const mimeType = 'text/html';
    const blob = new Blob([outputHtml], { type: `${mimeType};charset=utf-8` });

    return { blob, filename, mimeType };
  } catch (error) {
    console.warn('Errore durante la generazione del file HTML:', error);
    throw new Error(`Impossibile creare il file HTML: ${error.message}`);
  }
}
