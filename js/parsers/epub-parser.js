/**
 * @fileoverview Parser per libri elettronici in formato EPUB (.epub) tramite JSZip caricato dinamicamente.
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
 * Promise memorizzata per evitare caricamenti multipli dello script JSZip.
 * @type {Promise<any>|null}
 */
let jszipPromise = null;

/**
 * Carica dinamicamente la libreria JSZip da CDN (jsdelivr) se non è già presente nell'ambiente globale.
 * @returns {Promise<any>} Istanza del costruttore JSZip
 */
export async function loadJSZip() {
  if (typeof window !== 'undefined' && window.JSZip) {
    return window.JSZip;
  }
  if (typeof globalThis !== 'undefined' && globalThis.JSZip) {
    return globalThis.JSZip;
  }

  if (jszipPromise) {
    return jszipPromise;
  }

  jszipPromise = new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      return reject(new Error('Ambiente non valido: oggetto document non disponibile.'));
    }

    // Controlla se uno script JSZip è già stato inserito
    const existingScript = document.querySelector('script[src*="jszip"]');
    if (existingScript && window.JSZip) {
      return resolve(window.JSZip);
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
    script.async = true;

    script.onload = () => {
      if (typeof window !== 'undefined' && window.JSZip) {
        resolve(window.JSZip);
      } else {
        jszipPromise = null;
        reject(new Error('JSZip caricato ma window.JSZip non risulta definito.'));
      }
    };

    script.onerror = () => {
      jszipPromise = null;
      reject(new Error('Impossibile caricare la libreria JSZip da CDN. Verificare la connessione ad internet.'));
    };

    document.head.appendChild(script);
  });

  return jszipPromise;
}

/**
 * Cerca un file nell'archivio JSZip tenendo conto della sensibilità alle maiuscole/minuscole.
 * @param {any} zip - Istanza JSZip caricata
 * @param {string} targetPath - Percorso del file cercato
 * @returns {any|null} File trovato o null
 */
function findZipFile(zip, targetPath) {
  if (!targetPath) return null;
  if (zip.file(targetPath)) {
    return zip.file(targetPath);
  }
  const lower = targetPath.toLowerCase();
  for (const name of Object.keys(zip.files)) {
    if (name.toLowerCase() === lower) {
      return zip.file(name);
    }
  }
  return null;
}

/**
 * Risolve un percorso relativo rispetto alla directory base all'interno dello ZIP.
 * @param {string} baseDir - Directory base (es. 'OEBPS/')
 * @param {string} relativePath - Percorso relativo (es. 'ch1.xhtml' o '../text/ch1.xhtml')
 * @returns {string} Percorso normalizzato all'interno dello ZIP
 */
function resolveZipPath(baseDir, relativePath) {
  if (!relativePath) return '';
  const cleanPath = decodeURIComponent(relativePath.split('#')[0].trim());
  if (cleanPath.startsWith('/')) {
    return cleanPath.slice(1);
  }
  const combined = (baseDir || '') + cleanPath;
  const parts = combined.split('/');
  const resolved = [];
  for (const part of parts) {
    if (part === '.' || part === '') continue;
    if (part === '..') {
      resolved.pop();
    } else {
      resolved.push(part);
    }
  }
  return resolved.join('/');
}

/**
 * Analizza un file EPUB (.epub):
 * 1. Carica JSZip se non già caricato.
 * 2. Apre l'archivio ZIP ed estrae META-INF/container.xml per identificare content.opf.
 * 3. Legge content.opf per determinare l'ordine di lettura (spine) e i file nel manifest.
 * 4. Per ogni file XHTML nello spine, estrae tutti i tag <p>, <h1>, <h2>, <h3> creando i chunk.
 * 5. Memorizza in originalData tutto il necessario per ricostruire l'EPUB in fase di salvataggio.
 *
 * @param {File|Blob} file - File EPUB da analizzare
 * @returns {Promise<import('../file-parser.js').ParsedFile>} File analizzato con chunks e metadati
 */
export async function parseEpub(file) {
  try {
    if (!file) {
      throw new Error('Nessun file fornito.');
    }

    // 1. Carica JSZip
    const JSZip = await loadJSZip();

    // 2. Apri l'archivio ZIP
    let zip;
    try {
      zip = await JSZip.loadAsync(file);
    } catch (zipErr) {
      throw new Error(`Impossibile aprire l'archivio EPUB (ZIP non valido): ${zipErr.message}`);
    }

    // 3. Trova META-INF/container.xml per individuare il file OPF
    let opfPath = null;
    const containerFile = findZipFile(zip, 'META-INF/container.xml');

    if (containerFile) {
      const containerXml = await containerFile.async('text');
      const containerDoc = new DOMParser().parseFromString(containerXml, 'application/xml');
      const rootfile = containerDoc.querySelector('rootfile') || containerDoc.getElementsByTagName('rootfile')[0];
      if (rootfile) {
        opfPath = rootfile.getAttribute('full-path');
      }
    }

    // Fallback: cerca qualsiasi file .opf nell'archivio
    if (!opfPath || !findZipFile(zip, opfPath)) {
      opfPath = Object.keys(zip.files).find((p) => p.toLowerCase().endsWith('.opf'));
    }

    if (!opfPath) {
      throw new Error('File content.opf non trovato all\'interno dell\'archivio EPUB.');
    }

    const opfFile = findZipFile(zip, opfPath);
    if (!opfFile) {
      throw new Error(`File descrittore OPF non reperibile: ${opfPath}`);
    }

    // 4. Analizza content.opf
    const opfContent = await opfFile.async('text');
    const opfDoc = new DOMParser().parseFromString(opfContent, 'application/xml');
    const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';

    // Estrai il titolo dell'EPUB dai metadati se disponibile
    const titleEl = opfDoc.querySelector('metadata > *|title, title, dc\\:title') ||
      opfDoc.getElementsByTagName('dc:title')[0] ||
      opfDoc.getElementsByTagName('title')[0];
    const epubTitle = titleEl ? titleEl.textContent.trim() : (file.name || 'eBook');

    // Mappa gli elementi del manifest (id -> { id, href, fullPath, mediaType })
    const manifestItems = new Map();
    const manifestNodes = opfDoc.querySelectorAll('manifest > item, item').length > 0
      ? opfDoc.querySelectorAll('manifest > item, item')
      : opfDoc.getElementsByTagName('item');

    for (const item of manifestNodes) {
      const id = item.getAttribute('id');
      const href = item.getAttribute('href');
      const mediaType = item.getAttribute('media-type');
      if (id && href) {
        manifestItems.set(id, {
          id,
          href,
          mediaType,
          fullPath: resolveZipPath(opfDir, href)
        });
      }
    }

    // Estrai la sequenza dello spine (ordine dei capitoli)
    const spineNodes = opfDoc.querySelectorAll('spine > itemref, itemref').length > 0
      ? opfDoc.querySelectorAll('spine > itemref, itemref')
      : opfDoc.getElementsByTagName('itemref');
    const spineFiles = [];
    let chapterIndex = 0;

    for (const itemref of spineNodes) {
      const idref = itemref.getAttribute('idref');
      const manifestItem = manifestItems.get(idref);
      if (manifestItem) {
        spineFiles.push({
          idref,
          chapterIndex: chapterIndex++,
          fullPath: manifestItem.fullPath,
          href: manifestItem.href,
          mediaType: manifestItem.mediaType
        });
      } else {
        console.warn(`Elemento spine con idref "${idref}" non presente nel manifest.`);
      }
    }

    // Fallback se lo spine è vuoto: raccoglie tutti i file HTML/XHTML presenti nello zip
    if (spineFiles.length === 0) {
      const htmlFiles = Object.keys(zip.files)
        .filter((p) => /\.(xhtml|html|htm)$/i.test(p))
        .sort();

      for (let i = 0; i < htmlFiles.length; i++) {
        spineFiles.push({
          idref: `fallback-${i}`,
          chapterIndex: i,
          fullPath: htmlFiles[i],
          href: htmlFiles[i],
          mediaType: 'application/xhtml+xml'
        });
      }
    }

    // 5. Per ciascun file XHTML nello spine, estrai i tag <p>, <h1>, <h2>, <h3>
    const chunks = [];

    for (const spineItem of spineFiles) {
      const filename = spineItem.fullPath;
      const xhtmlFile = findZipFile(zip, filename);

      if (!xhtmlFile) {
        console.warn(`File del capitolo non trovato nell'archivio: ${filename}`);
        continue;
      }

      const xhtmlText = await xhtmlFile.async('text');
      let doc;
      try {
        doc = new DOMParser().parseFromString(xhtmlText, 'application/xhtml+xml');
        // Se c'è un errore di parsing XML, fallback su text/html
        if (doc.querySelector('parsererror')) {
          doc = new DOMParser().parseFromString(xhtmlText, 'text/html');
        }
      } catch (parseEx) {
        console.warn(`Errore parsing XML per ${filename}, utilizzo fallback text/html:`, parseEx);
        doc = new DOMParser().parseFromString(xhtmlText, 'text/html');
      }

      // Seleziona tutti i tag <p>, <h1>, <h2>, <h3>
      const elements = doc.querySelectorAll('p, h1, h2, h3');

      for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        const text = el.textContent.trim();
        if (text.length === 0) continue;

        const tagName = el.tagName.toLowerCase();
        chunks.push({
          id: `${filename}#${i}`,
          text,
          html: el.outerHTML,
          metadata: {
            file: filename,
            tagName,
            chapterIndex: spineItem.chapterIndex,
            elementIndex: i
          }
        });
      }
    }

    const wordCount = chunks.reduce((sum, chunk) => sum + countWords(chunk.text), 0);

    return {
      type: 'epub',
      name: file.name || 'ebook.epub',
      size: file.size || 0,
      chunks,
      metadata: {
        wordCount,
        chapterCount: spineFiles.length,
        chunkCount: chunks.length,
        title: epubTitle
      },
      originalData: {
        zip,
        files: Object.keys(zip.files),
        opfPath,
        opfContent,
        spineFiles
      }
    };
  } catch (error) {
    console.warn('Errore durante l\'analisi del file EPUB:', error);
    throw new Error(`Impossibile analizzare il file EPUB: ${error.message}`);
  }
}
