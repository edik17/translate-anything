/**
 * @fileoverview Parser per file di testo semplice (.txt), documenti HTML (.html, .htm) e file JSON (.json).
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
 * Analizza un file di testo semplice (.txt) o reindirizza a parseHtml se il file è HTML.
 * Divide il contenuto in paragrafi separati da righe vuote (doppio a capo).
 * Ogni paragrafo non vuoto diventa un chunk con id progressivo 'p-0', 'p-1', ecc.
 *
 * @param {File|Blob} file - File di testo da analizzare
 * @returns {Promise<import('../file-parser.js').ParsedFile>} File analizzato con chunks e metadati
 */
export async function parseTxt(file) {
  try {
    if (!file) {
      throw new Error('Nessun file fornito.');
    }

    // Se il file è un documento HTML, delega a parseHtml
    const fileName = file.name || '';
    const rawText = await file.text();
    const trimmedStart = rawText.trimStart().slice(0, 100).toLowerCase();
    const isHtml = /\.(html|htm|xhtml)$/i.test(fileName) ||
      (file.type && (file.type === 'text/html' || file.type === 'application/xhtml+xml')) ||
      trimmedStart.startsWith('<!doctype html') || trimmedStart.startsWith('<html');

    if (isHtml) {
      return await parseHtml(file);
    }
    // Normalizza i fine riga (\r\n -> \n, \r -> \n)
    const normalizedText = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Divide per doppio a capo (anche con eventuali spazi su righe vuote)
    const rawParagraphs = normalizedText.split(/\n\s*\n+/);
    const chunks = [];
    let chunkIndex = 0;

    for (let i = 0; i < rawParagraphs.length; i++) {
      const paragraph = rawParagraphs[i].trim();
      if (paragraph.length > 0) {
        chunks.push({
          id: `p-${chunkIndex++}`,
          text: paragraph,
          metadata: {
            paragraphIndex: i
          }
        });
      }
    }

    const wordCount = chunks.reduce((sum, chunk) => sum + countWords(chunk.text), 0);

    return {
      type: 'txt',
      name: fileName || 'documento.txt',
      size: file.size || rawText.length,
      chunks,
      metadata: {
        wordCount,
        chunkCount: chunks.length,
        paragraphCount: chunks.length
      },
      originalData: {
        raw: rawText,
        paragraphs: rawParagraphs
      }
    };
  } catch (error) {
    console.warn('Errore durante l\'analisi del file TXT:', error);
    throw new Error(`Impossibile analizzare il file di testo: ${error.message}`);
  }
}

/**
 * Analizza un file HTML estraendo i blocchi testuali significativi tramite DOMParser.
 * Evita duplicazioni non analizzando elementi figli di contenitori già estratti.
 *
 * @param {File|Blob} file - File HTML da analizzare
 * @returns {Promise<import('../file-parser.js').ParsedFile>} File analizzato con chunks e metadati
 */
export async function parseHtml(file) {
  try {
    if (!file) {
      throw new Error('Nessun file fornito.');
    }

    const rawHtml = await file.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawHtml, 'text/html');

    const chunks = [];
    let chunkIndex = 0;

    // Estrai il tag <title> se presente e non vuoto
    if (doc.title && doc.title.trim().length > 0) {
      const titleText = doc.title.trim();
      chunks.push({
        id: `html-${chunkIndex++}`,
        text: titleText,
        html: `<title>${titleText}</title>`,
        metadata: {
          tagName: 'title',
          selector: 'title'
        }
      });
    }

    // Seleziona elementi di testo nel body
    const body = doc.body;
    if (body) {
      // Selettore per blocchi ed elementi testuali tipici
      const textSelector = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, dt, dd, th, td, caption, figcaption, label, button, pre';
      const textElements = body.querySelectorAll(textSelector);
      const extractedNodes = new Set();

      for (const el of textElements) {
        // Ignora elementi dentro script, style, svg, noscript
        if (el.closest('script, style, noscript, svg')) continue;

        // Se l'elemento contiene altri elementi compresi nel textSelector (es. blockquote con <p>),
        // lascia che siano i figli a essere estratti singolarmente
        if (el.querySelector(textSelector)) continue;

        // Se è già contenuto all'interno di un nodo già estratto, salta
        let isInsideExtracted = false;
        for (const extracted of extractedNodes) {
          if (extracted.contains(el)) {
            isInsideExtracted = true;
            break;
          }
        }
        if (isInsideExtracted) continue;

        const text = el.textContent.trim();
        if (text.length > 0) {
          extractedNodes.add(el);
          chunks.push({
            id: `html-${chunkIndex++}`,
            text,
            html: el.outerHTML,
            metadata: {
              tagName: el.tagName.toLowerCase(),
              index: chunkIndex - 1
            }
          });
        }
      }

      // Ricerca eventuali foglie testuali non coperte dal selettore sopra (es. div o span autonomi)
      const allLeaves = body.querySelectorAll('div, span, a, article, section');
      for (const el of allLeaves) {
        if (el.closest('script, style, noscript, svg')) continue;
        // Se è già dentro un elemento estratto, salta
        let isInsideExtracted = false;
        for (const extracted of extractedNodes) {
          if (extracted.contains(el)) {
            isInsideExtracted = true;
            break;
          }
        }
        if (isInsideExtracted) continue;

        // Se non contiene altri elementi con tag del textSelector
        const hasChildTextNodes = el.querySelector(textSelector);
        if (!hasChildTextNodes) {
          const directText = el.textContent.trim();
          if (directText.length > 0) {
            extractedNodes.add(el);
            chunks.push({
              id: `html-${chunkIndex++}`,
              text: directText,
              html: el.outerHTML,
              metadata: {
                tagName: el.tagName.toLowerCase(),
                index: chunkIndex - 1
              }
            });
          }
        }
      }
    }

    const wordCount = chunks.reduce((sum, chunk) => sum + countWords(chunk.text), 0);

    return {
      type: 'html',
      name: file.name || 'documento.html',
      size: file.size || rawHtml.length,
      chunks,
      metadata: {
        wordCount,
        chunkCount: chunks.length,
        elementCount: chunks.length
      },
      originalData: {
        raw: rawHtml,
        title: doc.title || ''
      }
    };
  } catch (error) {
    console.warn('Errore durante l\'analisi del file HTML:', error);
    throw new Error(`Impossibile analizzare il file HTML: ${error.message}`);
  }
}

/**
 * Analizza ricorsivamente un oggetto o array JSON estraendo tutte le stringhe di testo.
 * @param {any} value - Valore JSON corrente
 * @param {string} path - Percorso JSON a punti (es. 'data.name' o 'items[0]')
 * @param {(string|number)[]} keys - Array di chiavi gerarchiche
 * @param {Array<Object>} chunks - Array di destinazione per i chunks
 */
function extractJsonStrings(value, path, keys, chunks) {
  if (value === null || value === undefined) {
    return;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      chunks.push({
        id: path || 'root',
        text: value,
        metadata: {
          path: path || 'root',
          keys: [...keys]
        }
      });
    }
    return;
  }

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const nextPath = path ? `${path}[${i}]` : `[${i}]`;
      extractJsonStrings(value[i], nextPath, [...keys, i], chunks);
    }
    return;
  }

  if (typeof value === 'object') {
    for (const key of Object.keys(value)) {
      const nextPath = path ? `${path}.${key}` : key;
      extractJsonStrings(value[key], nextPath, [...keys, key], chunks);
    }
  }
}

/**
 * Analizza un file JSON leggendo la struttura ed estraendo ricorsivamente tutte le stringhe.
 * Ogni valore stringa diventa un chunk con id corrispondente al percorso JSON (es. 'data.name').
 *
 * @param {File|Blob} file - File JSON da analizzare
 * @returns {Promise<import('../file-parser.js').ParsedFile>} File analizzato con chunks e metadati
 */
export async function parseJson(file) {
  try {
    if (!file) {
      throw new Error('Nessun file fornito.');
    }

    const rawText = await file.text();
    let data;
    try {
      data = JSON.parse(rawText);
    } catch (parseErr) {
      throw new Error(`Formato JSON non valido: ${parseErr.message}`);
    }

    const chunks = [];
    extractJsonStrings(data, '', [], chunks);

    const wordCount = chunks.reduce((sum, chunk) => sum + countWords(chunk.text), 0);

    return {
      type: 'json',
      name: file.name || 'dati.json',
      size: file.size || rawText.length,
      chunks,
      metadata: {
        wordCount,
        chunkCount: chunks.length,
        stringCount: chunks.length
      },
      originalData: data
    };
  } catch (error) {
    console.warn('Errore durante l\'analisi del file JSON:', error);
    throw new Error(`Impossibile analizzare il file JSON: ${error.message}`);
  }
}
