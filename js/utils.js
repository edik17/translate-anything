/**
 * @fileoverview Modulo di utilità generali per TranslateAnything.
 * Include rilevamento lingua euristico, formattazione date/numeri, hashing djb2 ed escape HTML.
 */

/**
 * Pattern regex per alfabeti e scritture non latine.
 * @type {Array<{lang: string, regex: RegExp}>}
 */
const SCRIPT_PATTERNS = [
  // Arabo
  { lang: 'ar', regex: /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g },
  // Russo / Cirillico
  { lang: 'ru', regex: /[\u0400-\u04FF]/g },
  // Coreano (Hangul)
  { lang: 'ko', regex: /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/g },
  // Giapponese (Hiragana e Katakana)
  { lang: 'ja', regex: /[\u3040-\u309F\u30A0-\u30FF]/g },
  // Cinese (Ideogrammi CJK)
  { lang: 'zh', regex: /[\u4E00-\u9FFF\u3400-\u4DBF]/g }
];

/**
 * Insiemi di parole comuni (stopwords ad alta frequenza) per lingue con alfabeto latino.
 * @type {Record<string, Set<string>>}
 */
const LATIN_WORD_LISTS = {
  de: new Set([
    'der', 'die', 'das', 'und', 'in', 'den', 'von', 'zu', 'mit', 'sich', 'des', 'auf',
    'für', 'ist', 'im', 'dem', 'nicht', 'ein', 'eine', 'als', 'auch', 'es', 'an', 'werden',
    'aus', 'er', 'hat', 'dass', 'sie', 'nach', 'wird', 'bei', 'einer', 'um', 'am', 'sind',
    'noch', 'wie', 'einem', 'über', 'einen', 'so', 'war', 'haben', 'nur', 'oder', 'aber',
    'vor', 'zur', 'bis', 'mehr', 'durch', 'man', 'sein', 'wurde', 'sei', 'ich', 'wir',
    'ihr', 'wenn', 'hier', 'diese', 'dieser', 'dieses', 'doch', 'kann', 'unter', 'ja',
    'nein', 'bitte', 'danke', 'guten', 'morgen', 'tag', 'abend', 'hallo', 'deutsch', 'deutschland'
  ]),
  en: new Set([
    'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 'it', 'for', 'not',
    'on', 'with', 'he', 'as', 'you', 'do', 'at', 'this', 'but', 'his', 'by', 'from',
    'they', 'we', 'say', 'her', 'she', 'or', 'an', 'will', 'my', 'one', 'all', 'would',
    'there', 'their', 'what', 'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which',
    'go', 'me', 'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know',
    'take', 'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see',
    'other', 'than', 'then', 'now', 'look', 'only', 'come', 'its', 'over', 'think',
    'also', 'back', 'after', 'use', 'two', 'how', 'our', 'work', 'first', 'well',
    'way', 'even', 'new', 'want', 'because', 'any', 'these', 'give', 'day', 'most',
    'us', 'is', 'are', 'was', 'were', 'been', 'has', 'had', 'hello', 'world', 'yes'
  ]),
  fr: new Set([
    'le', 'la', 'les', 'de', 'du', 'des', 'un', 'une', 'et', 'est', 'sont', 'dans',
    'en', 'pour', 'qui', 'que', 'ce', 'cette', 'ces', 'avec', 'sur', 'pas', 'ne',
    'plus', 'par', 'au', 'aux', 'il', 'elle', 'ils', 'elles', 'nous', 'vous', 'mais',
    'ou', 'si', 'tout', 'faire', 'leur', 'comme', 'aussi', 'bien', 'sans', 'peut',
    'être', 'ont', 'mon', 'son', 'sa', 'ses', 'mes', 'ton', 'ta', 'tes', 'notre',
    'votre', 'leurs', 'ici', 'donc', 'quoi', 'bonjour', 'merci', 'oui', 'non', 'monde',
    'très', 'quand', 'fait', 'tous', 'deux', 'encore', 'même', 'français', 'france'
  ]),
  es: new Set([
    'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'y', 'en',
    'que', 'es', 'son', 'por', 'para', 'con', 'no', 'se', 'su', 'sus', 'como', 'al',
    'pero', 'más', 'este', 'esta', 'estos', 'estas', 'lo', 'le', 'les', 'todo',
    'todos', 'toda', 'todas', 'hacer', 'haber', 'cuando', 'muy', 'sin', 'sobre',
    'también', 'fue', 'era', 'ser', 'está', 'están', 'yo', 'tú', 'él', 'ella',
    'nosotros', 'ellos', 'ellas', 'hola', 'gracias', 'sí', 'bueno', 'mundo', 'amigo',
    'amigos', 'bien', 'donde', 'porque', 'tiempo', 'día', 'vida', 'cosa', 'año', 'español'
  ]),
  it: new Set([
    'il', 'la', 'lo', 'i', 'gli', 'le', 'un', 'uno', 'una', 'di', 'del',
    'della', 'dei', 'degli', 'delle', 'in', 'nel', 'nella', 'nei', 'negli', 'nelle',
    'e', 'ed', 'è', 'sono', 'con', 'per', 'su', 'tra', 'fra', 'non', 'che', 'si',
    'da', 'dal', 'dalla', 'dai', 'dagli', 'dalle', 'questo', 'questa', 'questi',
    'queste', 'quello', 'quella', 'anche', 'come', 'più', 'ma', 'se', 'ci', 'vi',
    'mio', 'tuo', 'suo', 'nostro', 'vostro', 'loro', 'cosa', 'dove', 'perché',
    'molto', 'tutto', 'tutti', 'tutta', 'tutte', 'fare', 'stato', 'essere',
    'ciao', 'grazie', 'mondo', 'bene', 'quando', 'ancora', 'prima', 'dopo', 'ora',
    'tempo', 'giorno', 'anni', 'casa', 'uomo', 'donna', 'vita', 'oggi', 'sempre', 'italiano'
  ]),
  pt: new Set([
    'o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas', 'de', 'do', 'da', 'dos',
    'das', 'em', 'no', 'na', 'nos', 'nas', 'e', 'é', 'são', 'para', 'pra', 'com',
    'não', 'que', 'se', 'por', 'pelo', 'pela', 'pelos', 'pelas', 'como', 'mais',
    'mas', 'este', 'esta', 'estes', 'estas', 'esse', 'essa', 'esses', 'essas',
    'isso', 'isto', 'aquilo', 'ao', 'aos', 'à', 'às', 'seu', 'sua', 'seus',
    'suas', 'ele', 'ela', 'eles', 'elas', 'você', 'vocês', 'também', 'muito',
    'quando', 'mesmo', 'já', 'tudo', 'todos', 'olá', 'obrigado', 'obrigada',
    'sim', 'mundo', 'amigo', 'onde', 'porque', 'tempo', 'dia', 'vida', 'coisa', 'português'
  ])
};

/**
 * Rileva la lingua di un testo tramite euristiche basate su script, caratteri e frequenza delle parole.
 * Supporta: 'de', 'en', 'fr', 'es', 'it', 'pt', 'ru', 'zh', 'ja', 'ko', 'ar'.
 * @param {string} text - Il testo di cui determinare la lingua.
 * @returns {string} Codice ISO della lingua rilevata (default: 'en').
 */
export function detectLanguage(text) {
  try {
    if (!text || typeof text !== 'string') {
      return 'en';
    }

    const trimmed = text.trim();
    if (!trimmed) {
      return 'en';
    }

    // 1. Controllo scritture non latine specifiche
    for (const item of SCRIPT_PATTERNS) {
      const matches = trimmed.match(item.regex);
      if (matches && matches.length > 0) {
        // Se troviamo Kana giapponesi, è sicuramente giapponese
        if (item.lang === 'ja') {
          return 'ja';
        }
        // Se troviamo caratteri CJK, verifichiamo se ci sono anche Kana giapponesi
        if (item.lang === 'zh') {
          if (/[\u3040-\u309F\u30A0-\u30FF]/.test(trimmed)) {
            return 'ja';
          }
          return 'zh';
        }
        return item.lang;
      }
    }

    // 2. Lingue con caratteri latini: punteggio basato su diacritici e parole comuni
    const scores = {
      de: 0,
      en: 0,
      fr: 0,
      es: 0,
      it: 0,
      pt: 0
    };

    // Punteggio per caratteri speciali e diacritici tipici
    for (const char of trimmed) {
      if ('äöüÄÖÜ'.includes(char)) scores.de += 4;
      if (char === 'ß') scores.de += 10;
      if ('ñÑ¿¡'.includes(char)) scores.es += 8;
      if ('ãõÃÕ'.includes(char)) scores.pt += 8;
      if ('œæŒÆ'.includes(char)) scores.fr += 8;
      if ('çÇ'.includes(char)) {
        scores.fr += 2;
        scores.pt += 2;
      }
      if ('ìòÌÒ'.includes(char)) scores.it += 4;
      if ('èÈ'.includes(char)) {
        scores.it += 2;
        scores.fr += 2;
      }
      if ('àÀ'.includes(char)) {
        scores.it += 1;
        scores.fr += 1;
        scores.pt += 1;
      }
      if ('êôÊÔ'.includes(char)) {
        scores.fr += 2;
        scores.pt += 2;
      }
      if ('áíóúÁÍÓÚ'.includes(char)) {
        scores.es += 2;
        scores.pt += 2;
      }
      if ('éÉ'.includes(char)) {
        scores.fr += 1;
        scores.es += 1;
        scores.pt += 1;
        scores.it += 1;
      }
    }

    // Elisioni tipiche francesi e italiane
    if (/\b(?:c'|qu'|d'|l'|j'|m'|t'|s'|n')/i.test(trimmed)) scores.fr += 3;
    if (/\b(?:l'|dell'|nell'|all'|un'|d')/i.test(trimmed)) scores.it += 3;

    // Tokenizzazione in parole
    const words = trimmed.toLowerCase()
      .replace(/[^\p{L}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 0);

    for (const word of words) {
      for (const [lang, wordSet] of Object.entries(LATIN_WORD_LISTS)) {
        if (wordSet.has(word)) {
          scores[lang] += 3;
        }
      }

      // Morfologia / suffissi per vocaboli non presenti nella lista di stopwords
      if (/[aeiou]$/i.test(word)) scores.it += 0.5;
      if (/[aeiou][s]$/i.test(word)) {
        scores.es += 0.5;
        scores.pt += 0.5;
      }
      if (/(?:ung|lich|isch|keit|schaft|heit|chen|lein|end|ten)$/i.test(word)) scores.de += 2;
      if (/(?:ing|tion|ment|ness|less|ful|able|ible)$/i.test(word)) scores.en += 1.5;
      if (/(?:tion|ment|eur|euse|eux|ique|iste|isme|ait)$/i.test(word)) scores.fr += 1.5;
      if (/(?:cion|ción|mente|idad|ador|adora)$/i.test(word)) scores.es += 2;
      if (/(?:cao|ção|mente|idade|ador|adora)$/i.test(word)) scores.pt += 2;
      if (/(?:zione|zioni|mente|issimo|issima|issimi|issime|tore|trice)$/i.test(word)) scores.it += 2;
    }

    let topLang = 'en';
    let topScore = -1;

    for (const [lang, score] of Object.entries(scores)) {
      if (score > topScore) {
        topScore = score;
        topLang = lang;
      }
    }

    return topScore > 0 ? topLang : 'en';
  } catch (err) {
    console.warn('Errore durante il rilevamento della lingua:', err);
    return 'en';
  }
}

/**
 * Formatta un intervallo in secondi in una stringa leggibile (es. '2m 30s' o '< 1m').
 * @param {number} seconds - Numero di secondi da formattare.
 * @returns {string} Stringa formattata.
 */
export function formatTime(seconds) {
  try {
    const sec = Math.round(Number(seconds) || 0);
    if (sec < 60) {
      return '< 1m';
    }

    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;

    if (h > 0) {
      return m > 0 ? `${h}h ${m}m` : `${h}h`;
    }

    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  } catch (err) {
    console.warn('Errore formattazione tempo:', err);
    return '< 1m';
  }
}

/**
 * Formatta un numero con separatore delle migliaia in stile italiano (punto per le migliaia, es. 1.234).
 * @param {number|string} n - Numero da formattare.
 * @returns {string} Numero formattato come stringa.
 */
export function formatNumber(n) {
  try {
    if (n === null || n === undefined || isNaN(Number(n))) {
      return '0';
    }

    const num = Number(n);

    // Tentativo con Intl.NumberFormat in stile italiano
    try {
      const formatted = new Intl.NumberFormat('it-IT', { useGrouping: 'always' }).format(num);
      // Garantisce che i numeri >= 1000 abbiano il separatore punto
      if (Math.abs(num) >= 1000 && !formatted.includes('.')) {
        const parts = num.toString().split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        return parts.join(',');
      }
      return formatted;
    } catch {
      const parts = num.toString().split('.');
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
      return parts.join(',');
    }
  } catch (err) {
    console.warn('Errore formattazione numero:', err);
    return String(n ?? '0');
  }
}

/**
 * Attende per un numero specificato di millisecondi.
 * @param {number} ms - Millisecondi da attendere.
 * @returns {Promise<void>} Promise che si risolve dopo il tempo specificato.
 */
export async function sleep(ms) {
  const duration = Math.max(0, Number(ms) || 0);
  return new Promise((resolve) => setTimeout(resolve, duration));
}

/**
 * Esegue l'escape dei caratteri speciali HTML per prevenire vulnerabilità XSS.
 * @param {string} str - Stringa di input da sanificare.
 * @returns {string} Stringa con caratteri HTML sottoposti ad escape.
 */
export function escapeHtml(str) {
  try {
    if (str === null || str === undefined) {
      return '';
    }
    const s = String(str);
    const htmlEntities = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return s.replace(/[&<>"']/g, (char) => htmlEntities[char]);
  } catch (err) {
    console.warn('Errore escape HTML:', err);
    return String(str ?? '');
  }
}

/**
 * Calcola l'hash djb2 di una stringa e restituisce una stringa esadecimale.
 * @param {string} str - Stringa di input.
 * @returns {string} Hash esadecimale a 8 caratteri.
 */
export function hashString(str) {
  try {
    const s = str === null || str === undefined ? '' : String(str);
    let hash = 5381;

    for (let i = 0; i < s.length; i++) {
      hash = ((hash << 5) + hash) + s.charCodeAt(i);
      hash = hash & hash; // Converte in intero a 32 bit con segno
    }

    // Converte l'intero senza segno a 32 bit in stringa esadecimale a 8 caratteri
    return (hash >>> 0).toString(16).padStart(8, '0');
  } catch (err) {
    console.warn('Errore calcolo hash stringa:', err);
    return '00000000';
  }
}
