# 🌍 TranslateAnything

> Applicazione web statica hostabile gratuitamente su **GitHub Pages** per tradurre file di qualsiasi dimensione (EPUB, TXT, SRT, VTT, DOCX, PDF, HTML, JSON) mantenendo la struttura originale.

---

## ✨ Funzionalità

- 🌐 **100% Client-Side:** I file vengono elaborati direttamente nel browser (nessun caricamento su server remoti).
- 💸 **Totalmente Gratuito:** Funziona senza abbonamenti a pagamento.
- ⚡ **Strategia di traduzione multi-motore a cascata:**
  1. **MyMemory API** (Nativa, zero configurazione).
  2. **Google Translate (Proxy Worker)** (Opzionale con Cloudflare Worker gratuito per 100k richieste/giorno).
  3. **IA (Google Gemini 2.0 / Flash)** (Opzionale: richiede solo una chiave gratuita di Google AI Studio inseribile dall'utente).
- 📊 **Status & Progress Bar Realistica:** Mostra avanzamento effettivo, percentuale, parole elaborate, velocità e tempo stimato (ETA).
- 👁️ **Anteprima Live Affiancata:** Visualizzazione del testo originale e tradotto durante l'elaborazione.
- 🌙 **Supporto Dark Mode automatico o manuale**.
- 📚 **Preservazione formati complessi:**
  - EPUB con immagini, CSS, capitoli e metadati.
  - Sottotitoli SRT / VTT con timing esatti.
  - Documenti HTML con preservazione dei tag.

---

## 🚀 Come pubblicare su GitHub Pages

1. Crea un repository pubblico su GitHub (es. `translate-anything`).
2. Clona il repository o carica i file di questo progetto:
   ```bash
   git init
   git add .
   git commit -m "Initial commit of TranslateAnything"
   git branch -M main
   git remote add origin https://github.com/TUO-USERNAME/translate-anything.git
   git push -u origin main
   ```
3. Vai nelle impostazioni del repository su GitHub:
   - **Settings** → **Pages**
   - Sotto **Branch**, seleziona `main` e cartella `/ (root)`
   - Clicca **Save**
4. In un minuto il sito sarà online all'indirizzo `https://TUO-USERNAME.github.io/translate-anything/`.

---

## 🛠️ Configurazione Cloudflare Worker (Facoltativo)

Se vuoi abilitare il fallback illimitato di Google Translate tramite Cloudflare Worker gratuito:
1. Crea un account gratuito su [Cloudflare Workers](https://workers.cloudflare.com/).
2. Crea un nuovo Worker e incolla il codice presente in `cf-worker/index.js`.
3. Clicca su **Deploy**.
4. Imposta l'URL del Worker nelle opzioni di traduzione o configuralo in `js/translation/google-proxy.js`.
