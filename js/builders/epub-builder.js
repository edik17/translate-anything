/**
 * @fileoverview Modulo builder per libri elettronici in formato EPUB (.epub).
 * TranslateAnything — Traduttore di file nel browser.
 */

import { loadJSZip } from '../parsers/epub-parser.js';
import { getTranslatedFilename } from './txt-builder.js';

/**
 * Caricatore resiliente di JSZip con controllo dell'ambiente globale e CDN di riserva.
 *
 * @returns {Promise<any>} Costruttore JSZip
 */
async function ensureJSZip() {
  if (typeof window !== 'undefined' && window.JSZip) {
    return window.JSZip;
  }
  if (typeof globalThis !== 'undefined' && globalThis.JSZip) {
    return globalThis.JSZip;
  }

  // Tenta con il caricatore del parser EPUB
  try {
    const zipLib = await loadJSZip();
    if (zipLib) return zipLib;
  } catch (err) {
    console.warn('Caricamento JSZip tramite parser non riuscito, tentativo CDN alternativo:', err);
  }

  // Fallback con iniezione script CDN
  if (typeof document !== 'undefined') {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
      script.async = true;
      script.onload = () => {
        if (typeof window !== 'undefined' && window.JSZip) {
          resolve(window.JSZip);
        } else {
          reject(new Error('JSZip caricato ma non disponibile nell\'oggetto window.'));
        }
      };
      script.onerror = () => reject(new Error('Impossibile caricare JSZip da CDN.'));
      document.head.appendChild(script);
    });
  }

  throw new Error('Ambiente non valido: document non disponibile per il caricamento di JSZip.');
}

/**
 * Tabelle di corrispondenza per la traduzione dei titoli tipici dei capitoli nei file di navigazione (toc.ncx).
 *
 * @param {string} targetLang - Codice lingua di destinazione (default: 'it')
 * @returns {Array<[RegExp, string]>} Array di coppie [pattern, sostituzione]
 */
function getChapterMappings(targetLang = 'it') {
  const lang = (targetLang || 'it').toLowerCase();

  if (lang === 'it') {
    return [
      // Tedesco -> Italiano
      [/\bKapitel\b/g, 'Capitolo'],
      [/\bkapitel\b/g, 'capitolo'],
      [/\bProlog\b/g, 'Prologo'],
      [/\bprolog\b/g, 'prologo'],
      [/\bEpilog\b/g, 'Epilogo'],
      [/\bepilog\b/g, 'epilogo'],
      [/\bEinleitung\b/g, 'Introduzione'],
      [/\bVorwort\b/g, 'Prefazione'],
      [/\bNachwort\b/g, 'Postfazione'],
      [/\bInhaltsverzeichnis\b/g, 'Indice'],
      [/\bAnhang\b/g, 'Appendice'],
      [/\bTeil\b/g, 'Parte'],
      [/\bBuch\b/g, 'Libro'],
      [/\bSzene\b/g, 'Scena'],
      [/\bAkt\b/g, 'Atto'],
      // Inglese -> Italiano
      [/\bChapter\b/g, 'Capitolo'],
      [/\bchapter\b/g, 'capitolo'],
      [/\bPrologue\b/g, 'Prologo'],
      [/\bprologue\b/g, 'prologo'],
      [/\bEpilogue\b/g, 'Epilogo'],
      [/\bepilogue\b/g, 'epilogo'],
      [/\bIntroduction\b/g, 'Introduzione'],
      [/\bPreface\b/g, 'Prefazione'],
      [/\bForeword\b/g, 'Prefazione'],
      [/\bAfterword\b/g, 'Postfazione'],
      [/\bTable of Contents\b/g, 'Indice'],
      [/\bContents\b/g, 'Indice'],
      [/\bAppendix\b/g, 'Appendice'],
      [/\bPart\b/g, 'Parte'],
      [/\bBook\b/g, 'Libro'],
      [/\bScene\b/g, 'Scena'],
      [/\bAct\b/g, 'Atto'],
      // Francese -> Italiano
      [/\bChapitre\b/g, 'Capitolo'],
      [/\bchapitre\b/g, 'capitolo'],
      [/\bÉpilogue\b/g, 'Epilogo'],
      [/\bPréface\b/g, 'Prefazione'],
      [/\bTable des matières\b/g, 'Indice'],
      // Spagnolo -> Italiano
      [/\bCapítulo\b/g, 'Capitolo'],
      [/\bcapítulo\b/g, 'capitolo'],
      [/\bPrólogo\b/g, 'Prologo'],
      [/\bEpílogo\b/g, 'Epilogo'],
      [/\bIntroducción\b/g, 'Introduzione'],
      [/\bPrefacio\b/g, 'Prefazione'],
      [/\bÍndice\b/g, 'Indice']
    ];
  }

  if (lang === 'en') {
    return [
      [/\b(?:Kapitel|Capitolo|Chapitre|Capítulo)\b/gi, 'Chapter'],
      [/\b(?:Prolog|Prologo|Prólogo)\b/gi, 'Prologue'],
      [/\b(?:Epilog|Epilogo|Épilogue|Epílogo)\b/gi, 'Epilogue'],
      [/\b(?:Einleitung|Introduzione|Introducción)\b/gi, 'Introduction'],
      [/\b(?:Vorwort|Prefazione|Préface|Prefacio)\b/gi, 'Preface'],
      [/\b(?:Inhaltsverzeichnis|Indice|Table des matières|Índice)\b/gi, 'Contents']
    ];
  }

  if (lang === 'de') {
    return [
      [/\b(?:Chapter|Capitolo|Chapitre|Capítulo)\b/gi, 'Kapitel'],
      [/\b(?:Prologue|Prologo|Prólogo)\b/gi, 'Prolog'],
      [/\b(?:Epilogue|Epilogo|Épilogue|Epílogo)\b/gi, 'Epilog'],
      [/\b(?:Introduction|Introduzione|Introducción)\b/gi, 'Einleitung'],
      [/\b(?:Preface|Prefazione|Préface|Prefacio)\b/gi, 'Vorwort'],
      [/\b(?:Contents|Indice|Table des matières|Índice)\b/gi, 'Inhaltsverzeichnis']
    ];
  }

  if (lang === 'fr') {
    return [
      [/\b(?:Chapter|Kapitel|Capitolo|Capítulo)\b/gi, 'Chapitre'],
      [/\b(?:Prologue|Prolog|Prologo|Prólogo)\b/gi, 'Prologue'],
      [/\b(?:Epilogue|Epilog|Epilogo|Epílogo)\b/gi, 'Épilogue'],
      [/\b(?:Introduction|Einleitung|Introduzione|Introducción)\b/gi, 'Introduction'],
      [/\b(?:Preface|Vorwort|Prefazione|Prefacio)\b/gi, 'Préface'],
      [/\b(?:Contents|Inhaltsverzeichnis|Indice|Índice)\b/gi, 'Table des matières']
    ];
  }

  if (lang === 'es') {
    return [
      [/\b(?:Chapter|Kapitel|Capitolo|Chapitre)\b/gi, 'Capítulo'],
      [/\b(?:Prologue|Prolog|Prologo)\b/gi, 'Prólogo'],
      [/\b(?:Epilogue|Epilog|Epilogo|Épilogue)\b/gi, 'Epílogo'],
      [/\b(?:Introduction|Einleitung|Introduzione)\b/gi, 'Introducción'],
      [/\b(?:Preface|Vorwort|Prefazione|Préface)\b/gi, 'Prefacio'],
      [/\b(?:Contents|Inhaltsverzeichnis|Indice|Table des matières)\b/gi, 'Índice']
    ];
  }

  return [];
}

/**
 * Traduce un titolo capitolo applicando le mappature testuali per la lingua di destinazione.
 *
 * @param {string} title - Titolo originale (es. 'Kapitel 1')
 * @param {string} targetLang - Codice lingua di destinazione
 * @returns {string} Titolo con i termini identificati tradotti
 */
function translateChapterTitle(title, targetLang = 'it') {
  if (!title || typeof title !== 'string') return '';
  let result = title;
  const mappings = getChapterMappings(targetLang);
  for (const [pattern, replacement] of mappings) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * Esegue l'escape delle e-commerciali '&' isolate per preservare la validità XML in XHTML.
 *
 * @param {string} str - Stringa con possibile contenuto HTML
 * @returns {string} Stringa con ampersand non appartenenti a entità convertite in '&amp;'
 */
function sanitizeXmlAmpersands(str) {
  if (!str || typeof str !== 'string') return '';
  return str.replace(/&(?!(?:[a-zA-Z]+|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;');
}

/**
 * Serializza un documento DOM XHTML preservando la dichiarazione XML iniziale e il DOCTYPE.
 *
 * @param {Document} doc - Documento DOM da serializzare
 * @param {string} originalHtml - Contenuto originale per rilevare intestazioni
 * @returns {string} Stringa XML serializzata
 */
function serializeXhtml(doc, originalHtml) {
  const serializer = new XMLSerializer();
  let xml = serializer.serializeToString(doc);

  // Ripristina la dichiarazione XML se presente in originale
  const xmlDeclMatch = (originalHtml || '').match(/^\s*<\?xml[^>]*\?>/i);
  if (xmlDeclMatch && !/^\s*<\?xml[^>]*\?>/i.test(xml)) {
    xml = `${xmlDeclMatch[0].trim()}\n${xml}`;
  }

  // Ripristina il DOCTYPE se presente in originale
  const doctypeMatch = (originalHtml || '').match(/<!DOCTYPE[^>]*>/i);
  if (doctypeMatch && !/<!DOCTYPE[^>]*>/i.test(xml)) {
    if (/^\s*<\?xml[^>]*\?>/i.test(xml)) {
      xml = xml.replace(/(<\?xml[^>]*\?>\s*)/i, `$1${doctypeMatch[0]}\n`);
    } else {
      xml = `${doctypeMatch[0]}\n${xml}`;
    }
  }

  return xml;
}

/**
 * Trova un file all'interno dell'archivio JSZip con tolleranza per case-sensitivity e prefissi.
 *
 * @param {any} zip - Istanza JSZip
 * @param {string} path - Percorso del file cercato
 * @returns {any|null} Oggetto file ZIP trovato o null
 */
function getZipEntry(zip, path) {
  if (!zip || !path) return null;
  if (zip.file(path)) return zip.file(path);

  const lower = path.toLowerCase();
  for (const name of Object.keys(zip.files)) {
    if (name.toLowerCase() === lower) {
      return zip.file(name);
    }
  }
  return null;
}

/**
 * Ricostruisce un file EPUB valido e conforme alle specifiche Open Container Format (OCF):
 * 1. Carica JSZip (stessa libreria del parser, dinamicamente da CDN se necessario).
 * 2. Crea un nuovo archivio ZIP.
 * 3. Inserisce il file mimetype per PRIMO (senza compressione, STORE): 'application/epub+zip'.
 * 4. Copia tutti i file non-XHTML da originalData (CSS, immagini, font, META-INF, ecc.).
 * 5. Per ogni file XHTML nello spine: trova i tag tradotti (corrispondenza per chunk id) e sostituisce innerHTML con il testo tradotto, aggiornando xml:lang.
 * 6. Aggiorna content.opf: modifica <dc:language> impostando targetLang.
 * 7. Aggiorna toc.ncx se presente: mappa i nomi dei capitoli (es. Kapitel -> Capitolo) o li lascia inalterati.
 * 8. Genera il blob ZIP finale.
 *
 * @param {Object} parsedFile - Oggetto ParsedFile originale contenente originalData
 * @param {Array<Object>} translatedChunks - Array di chunk con { id, translatedText, translatedHtml }
 * @param {string} [targetLang='it'] - Codice della lingua di destinazione (es. 'it', 'en')
 * @returns {Promise<{blob: Blob, filename: string, mimeType: string}>} Oggetto con Blob, nome file e tipo MIME
 */
export async function buildEpub(parsedFile, translatedChunks, targetLang = 'it') {
  try {
    const chunks = Array.isArray(translatedChunks) ? translatedChunks : [];

    // 1. Carica JSZip
    const JSZip = await ensureJSZip();

    // 2. Crea nuovo archivio ZIP
    const newZip = new JSZip();

    // 3. Aggiunge il file mimetype per PRIMO (non compresso, STORE)
    newZip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

    // Recupera l'istanza JSZip originale da originalData
    let origZip = parsedFile?.originalData?.zip || parsedFile?.originalZip;
    if (!origZip && parsedFile?.originalData && typeof parsedFile.originalData.file === 'function') {
      origZip = parsedFile.originalData;
    }
    if (!origZip && parsedFile?.originalFile) {
      origZip = await JSZip.loadAsync(parsedFile.originalFile);
    }

    if (!origZip) {
      throw new Error('Dati originali dell\'archivio EPUB (originalData.zip) non disponibili.');
    }

    // Identifica il percorso di content.opf
    let opfPath = parsedFile?.originalData?.opfPath || null;
    if (!opfPath || !getZipEntry(origZip, opfPath)) {
      opfPath = Object.keys(origZip.files).find((p) => p.toLowerCase().endsWith('.opf')) || null;
    }

    // Identifica il percorso di toc.ncx se presente
    const ncxPath = Object.keys(origZip.files).find((p) => p.toLowerCase().endsWith('.ncx')) || null;

    // Raccoglie tutti i percorsi dei file XHTML dello spine
    const spineFiles = parsedFile?.originalData?.spineFiles || [];
    const spineFilePaths = new Set();

    for (const item of spineFiles) {
      if (item && item.fullPath) {
        spineFilePaths.add(item.fullPath);
      } else if (typeof item === 'string') {
        spineFilePaths.add(item);
      }
    }

    // Aggiunge anche i percorsi file dedotti dagli ID dei chunk (es. 'OEBPS/ch1.xhtml#3')
    for (const chunk of chunks) {
      if (chunk && chunk.id && chunk.id.includes('#')) {
        const filePath = chunk.id.substring(0, chunk.id.lastIndexOf('#'));
        if (filePath) {
          spineFilePaths.add(filePath);
        }
      }
    }

    // Se ancora vuoto, cerca tutti i file .xhtml/.html nello zip
    if (spineFilePaths.size === 0) {
      for (const p of Object.keys(origZip.files)) {
        if (/\.(xhtml|html|htm)$/i.test(p)) {
          spineFilePaths.add(p);
        }
      }
    }

    // 4. Copia tutti i file non-XHTML da originalData (CSS, immagini, font, META-INF, ecc.)
    for (const [filePath, fileEntry] of Object.entries(origZip.files)) {
      // Ignora directory
      if (fileEntry.dir || filePath.endsWith('/')) {
        continue;
      }
      // Ignora mimetype (già inserito come primo file uncompressed)
      if (filePath.toLowerCase() === 'mimetype') {
        continue;
      }
      // Ignora file dello spine (gestiti al punto 5)
      if (spineFilePaths.has(filePath)) {
        continue;
      }
      // Ignora content.opf (gestito al punto 6)
      if (opfPath && filePath.toLowerCase() === opfPath.toLowerCase()) {
        continue;
      }
      // Ignora toc.ncx (gestito al punto 7)
      if (ncxPath && filePath.toLowerCase() === ncxPath.toLowerCase()) {
        continue;
      }

      // Copia binaria fedele
      const fileData = await fileEntry.async('uint8array');
      newZip.file(filePath, fileData);
    }

    // 5. Per ogni file XHTML nello spine: sostituisce innerHTML con testo tradotto e aggiorna xml:lang
    for (const spinePath of spineFilePaths) {
      const xhtmlEntry = getZipEntry(origZip, spinePath);
      if (!xhtmlEntry) {
        console.warn(`File del capitolo non trovato nell'archivio originale: ${spinePath}`);
        continue;
      }

      const originalHtml = await xhtmlEntry.async('text');
      const domParser = new DOMParser();
      let doc;

      try {
        doc = domParser.parseFromString(originalHtml, 'application/xhtml+xml');
        if (doc.querySelector('parsererror')) {
          doc = domParser.parseFromString(originalHtml, 'text/html');
        }
      } catch {
        doc = domParser.parseFromString(originalHtml, 'text/html');
      }

      // Filtra i chunk che appartengono a questo file XHTML
      const fileChunks = chunks.filter((c) => {
        if (!c || !c.id) return false;
        if (c.id.startsWith(`${spinePath}#`)) return true;
        // Tolleranza per percorsi relativi con o senza prefisso
        const chunkFile = c.id.substring(0, c.id.lastIndexOf('#'));
        return chunkFile && (spinePath.endsWith(chunkFile) || chunkFile.endsWith(spinePath));
      });

      // Seleziona gli elementi translabili nello stesso ordine in cui epub-parser li ha indicizzati (<p>, <h1>, <h2>, <h3>)
      const elementsPH = doc.querySelectorAll('p, h1, h2, h3');
      const elementsAll = doc.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote, dt, dd, th, td, caption, figcaption');

      for (const chunk of fileChunks) {
        const idParts = chunk.id.split('#');
        const tagIndex = parseInt(idParts[idParts.length - 1], 10);

        let targetElement = null;

        // Verifica per attributo identificativo diretto
        if (chunk.id) {
          targetElement = doc.querySelector(`[data-translate-id="${chunk.id}"], [data-chunk-id="${chunk.id}"]`);
        }

        // Corrispondenza con elementsPH (default di epub-parser)
        if (!targetElement && !isNaN(tagIndex) && elementsPH[tagIndex]) {
          targetElement = elementsPH[tagIndex];
        }

        // Fallback su elementsAll
        if (!targetElement && !isNaN(tagIndex) && elementsAll[tagIndex]) {
          targetElement = elementsAll[tagIndex];
        }

        if (targetElement) {
          const content = chunk.translatedHtml || chunk.translatedText || chunk.text || '';
          if (content) {
            try {
              targetElement.innerHTML = sanitizeXmlAmpersands(content);
            } catch {
              targetElement.textContent = content;
            }
          }
        }
      }

      // Aggiorna l'attributo xml:lang e lang a targetLang
      if (targetLang && doc.documentElement) {
        doc.documentElement.setAttribute('xml:lang', targetLang);
        doc.documentElement.setAttribute('lang', targetLang);
      }

      const elementsWithLang = doc.querySelectorAll('[xml\\:lang], [lang]');
      for (const el of elementsWithLang) {
        if (el.hasAttribute('xml:lang')) el.setAttribute('xml:lang', targetLang);
        if (el.hasAttribute('lang')) el.setAttribute('lang', targetLang);
      }

      const serializedXhtml = serializeXhtml(doc, originalHtml);
      newZip.file(spinePath, serializedXhtml);
    }

    // 6. Aggiorna content.opf: modifica <dc:language> con targetLang
    if (opfPath) {
      const opfEntry = getZipEntry(origZip, opfPath);
      if (opfEntry) {
        let opfContent = await opfEntry.async('text');

        if (/<dc:language[^>]*>[\s\S]*?<\/dc:language>/i.test(opfContent)) {
          opfContent = opfContent.replace(
            /<dc:language([^>]*)>[\s\S]*?<\/dc:language>/gi,
            `<dc:language$1>${targetLang}</dc:language>`
          );
        } else if (/<metadata[^>]*>/i.test(opfContent)) {
          opfContent = opfContent.replace(/(<metadata[^>]*>)/i, `$1\n    <dc:language>${targetLang}</dc:language>`);
        }

        newZip.file(opfPath, opfContent);
      }
    }

    // 7. Aggiorna toc.ncx se presente: traduce i nomi dei capitoli tramite mappatura
    if (ncxPath) {
      const ncxEntry = getZipEntry(origZip, ncxPath);
      if (ncxEntry) {
        let ncxContent = await ncxEntry.async('text');

        // Sostituisce il testo all'interno di ciascun tag <text>...</text>
        ncxContent = ncxContent.replace(/<text>([\s\S]*?)<\/text>/gi, (match, textContent) => {
          const translated = translateChapterTitle(textContent, targetLang);
          return `<text>${translated}</text>`;
        });

        newZip.file(ncxPath, ncxContent);
      }
    }

    // 8. Genera il blob ZIP finale
    const blob = await newZip.generateAsync({
      type: 'blob',
      mimeType: 'application/epub+zip',
      compression: 'DEFLATE',
      compressionOptions: {
        level: 6
      }
    });

    const originalName = parsedFile?.name || parsedFile?.filename || parsedFile?.originalFile?.name || 'libro.epub';
    const filename = getTranslatedFilename(originalName, 'epub');
    const mimeType = 'application/epub+zip';

    return { blob, filename, mimeType };
  } catch (error) {
    console.warn('Errore durante la generazione del file EPUB:', error);
    throw new Error(`Impossibile creare il file EPUB: ${error.message}`);
  }
}
