/**
 * TranslateAnything — Google Translate Proxy Client
 * Client per Google Translate (chiamata diretta ad endpoint pubblico o tramite eventuale proxy configurato).
 */

/**
 * Traduce un testo utilizzando Google Translate.
 * Se proxyUrl è specificato, instrada la richiesta attraverso l'endpoint proxy indicato;
 * altrimenti, effettua un tentativo diretto verso l'endpoint pubblico googleapis.
 *
 * @param {string} text - Testo da tradurre.
 * @param {string} [sourceLang='auto'] - Lingua sorgente ('auto' per rilevamento automatico).
 * @param {string} [targetLang='it'] - Lingua di arrivo (es. 'it').
 * @param {string|null} [proxyUrl=null] - URL opzionale del proxy di traduzione.
 * @returns {Promise<{text: string, engine: 'Google'}|null>} Oggetto traduzione o null in caso di errore.
 */
export async function translateGoogle(text, sourceLang = 'auto', targetLang = 'it', proxyUrl = null) {
  if (!text || typeof text !== 'string') {
    return { text: text || '', engine: 'Google' };
  }

  if (text.trim().length === 0) {
    return { text, engine: 'Google' };
  }

  const sl = (!sourceLang || sourceLang.toLowerCase() === 'auto')
    ? 'auto'
    : sourceLang.toLowerCase();
  const tl = (targetLang || 'it').toLowerCase();

  let targetEndpoint;
  if (proxyUrl) {
    const separator = proxyUrl.includes('?') ? '&' : '?';
    targetEndpoint = `${proxyUrl}${separator}q=${encodeURIComponent(text)}&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(tl)}`;
  } else {
    targetEndpoint = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(tl)}&dt=t&q=${encodeURIComponent(text)}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch(targetEndpoint, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'Accept': 'application/json, text/plain, */*',
      },
    });

    if (!res.ok) {
      console.warn(`[Google] Errore risposta HTTP: ${res.status} ${res.statusText}`);
      return null;
    }

    const rawText = await res.text();
    if (!rawText || !rawText.trim()) {
      console.warn('[Google] Risposta vuota dal server.');
      return null;
    }

    const trimmedRaw = rawText.trim();

    // Rileva se è stata restituita una pagina HTML di errore o captcha
    if (trimmedRaw.startsWith('<') || /<!doctype html/i.test(trimmedRaw)) {
      console.warn('[Google] Ricevuta risposta HTML (possibile blocco o redirect). Fallback necessario.');
      return null;
    }

    // Tentativo di parsing come JSON
    let parsedData;
    try {
      parsedData = JSON.parse(trimmedRaw);
    } catch {
      // Se non è JSON valido ma è testo semplice valido (es. proxy che ritorna plain text puro)
      return { text: trimmedRaw, engine: 'Google' };
    }

    // Formato standard Google GTX: [[["Traduzione", "Originale", ...], ...], ...]
    if (Array.isArray(parsedData) && Array.isArray(parsedData[0])) {
      const segments = parsedData[0]
        .filter(item => Array.isArray(item) && typeof item[0] === 'string')
        .map(item => item[0]);

      if (segments.length > 0) {
        return {
          text: segments.join(''),
          engine: 'Google',
        };
      }
    }

    // Formato oggetto tipico di proxy personalizzati: { translatedText: "..." } o { text: "..." }
    if (parsedData && typeof parsedData === 'object') {
      const candidate = parsedData.translatedText
        || parsedData.text
        || parsedData.result
        || parsedData.translation;

      if (typeof candidate === 'string' && candidate.length > 0) {
        return {
          text: candidate,
          engine: 'Google',
        };
      }
    }

    console.warn('[Google] Struttura risposta non riconosciuta:', parsedData);
    return null;
  } catch (err) {
    console.warn('[Google] Chiamata di traduzione fallita:', err.message || err);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}
