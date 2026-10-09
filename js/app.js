/**
 * TranslateAnything — Main Application Controller
 * Orchestrates UI, file parsing, translation, and file building.
 */

import { parseFile, getFileIcon, formatFileSize } from './file-parser.js';
import { TranslationEngine } from './translation/engine.js';
import { buildFile } from './builders/builder.js';
import { ProgressTracker } from './progress.js';
import { TranslationCache } from './cache.js';
import { formatTime, formatNumber, detectLanguage } from './utils.js';

// ─── State ──────────────────────────────────────────────
let currentFile = null;
let parsedFile = null;
let translatedChunks = null;
let outputBlob = null;
let outputFilename = null;
let engine = null;
let progressTracker = null;
const cache = new TranslationCache();

// ─── DOM References ─────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const dom = {
  // Theme
  themeToggle: $('#themeToggle'),
  // Upload
  dropZone: $('#dropZone'),
  fileInput: $('#fileInput'),
  fileInfo: $('#fileInfo'),
  fileIcon: $('#fileIcon'),
  fileName: $('#fileName'),
  fileMeta: $('#fileMeta'),
  removeFile: $('#removeFile'),
  // Settings
  settingsSection: $('#settingsSection'),
  sourceLang: $('#sourceLang'),
  targetLang: $('#targetLang'),
  engineRadios: $$('input[name="engine"]'),
  geminiKeyBox: $('#geminiKeyBox'),
  geminiKey: $('#geminiKey'),
  startBtn: $('#startBtn'),
  // Progress
  progressSection: $('#progressSection'),
  progressFill: $('#progressFill'),
  progressText: $('#progressText'),
  statPosition: $('#statPosition'),
  statWords: $('#statWords'),
  statSpeed: $('#statSpeed'),
  statEta: $('#statEta'),
  statEngine: $('#statEngine'),
  statErrors: $('#statErrors'),
  previewOriginal: $('#previewOriginal'),
  previewTranslated: $('#previewTranslated'),
  cancelBtn: $('#cancelBtn'),
  // Complete
  completeSection: $('#completeSection'),
  completeStats: $('#completeStats'),
  downloadBtn: $('#downloadBtn'),
  newFileBtn: $('#newFileBtn'),
  // Sections
  uploadSection: $('#uploadSection'),
};

// ─── Theme ──────────────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem('ta_theme');
  if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.setAttribute('data-theme', 'dark');
    dom.themeToggle.textContent = '☀️';
  }
}

function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  if (isDark) {
    document.documentElement.removeAttribute('data-theme');
    dom.themeToggle.textContent = '🌙';
    localStorage.setItem('ta_theme', 'light');
  } else {
    document.documentElement.setAttribute('data-theme', 'dark');
    dom.themeToggle.textContent = '☀️';
    localStorage.setItem('ta_theme', 'dark');
  }
}

// ─── File Upload ────────────────────────────────────────
function handleFileSelect(file) {
  if (!file) return;
  currentFile = file;

  const ext = file.name.split('.').pop().toLowerCase();
  const icon = getFileIcon(ext);

  dom.fileIcon.textContent = icon;
  dom.fileName.textContent = file.name;
  dom.fileMeta.textContent = `${formatFileSize(file.size)} · ${ext.toUpperCase()}`;

  dom.dropZone.classList.add('hidden');
  dom.fileInfo.classList.remove('hidden');
  dom.settingsSection.classList.remove('hidden');
  dom.startBtn.disabled = false;

  // Try to auto-detect language from first KB of text
  autoDetectLanguage(file);
}

async function autoDetectLanguage(file) {
  try {
    const ext = file.name.split('.').pop().toLowerCase();
    if (['pdf', 'docx', 'epub'].includes(ext)) return; // Can't easily peek these

    const slice = file.slice(0, 2048);
    const text = await slice.text();
    const detected = detectLanguage(text);
    if (detected && detected !== 'unknown') {
      dom.sourceLang.value = detected;
    }
  } catch {
    // Ignore — auto-detect is best-effort
  }
}

function removeCurrentFile() {
  currentFile = null;
  parsedFile = null;
  translatedChunks = null;
  outputBlob = null;

  dom.dropZone.classList.remove('hidden');
  dom.fileInfo.classList.add('hidden');
  dom.settingsSection.classList.add('hidden');
  dom.fileInput.value = '';
}

// ─── Engine Selection ───────────────────────────────────
function getSelectedEngine() {
  for (const radio of dom.engineRadios) {
    if (radio.checked) return radio.value;
  }
  return 'auto';
}

function handleEngineChange() {
  const selected = getSelectedEngine();
  if (selected === 'gemini') {
    dom.geminiKeyBox.classList.remove('hidden');
  } else {
    dom.geminiKeyBox.classList.add('hidden');
  }
}

// ─── Translation ────────────────────────────────────────
async function startTranslation() {
  if (!currentFile) return;

  const sourceLang = dom.sourceLang.value;
  const targetLang = dom.targetLang.value;
  const engineMode = getSelectedEngine();
  const geminiKey = dom.geminiKey.value.trim() || null;

  // Show progress section
  dom.settingsSection.classList.add('hidden');
  dom.uploadSection.classList.add('hidden');
  dom.progressSection.classList.remove('hidden');
  dom.completeSection.classList.add('hidden');
  document.body.classList.add('translating');

  // Reset progress UI
  updateProgressUI({ percent: 0, completed: 0, total: 0, wordsTranslated: 0 });
  dom.statEngine.textContent = '—';
  dom.statErrors.textContent = '0';

  try {
    // Step 1: Parse file
    dom.statPosition.textContent = 'Analisi file...';
    parsedFile = await parseFile(currentFile);

    if (!parsedFile || !parsedFile.chunks || parsedFile.chunks.length === 0) {
      throw new Error('Nessun testo trovato nel file.');
    }

    const totalChunks = parsedFile.chunks.length;
    const totalWords = parsedFile.metadata.wordCount || 0;
    progressTracker = new ProgressTracker(totalChunks, totalWords);

    // Step 2: Translate
    let errorCount = 0;
    engine = new TranslationEngine({
      sourceLang,
      targetLang,
      engineMode,
      geminiKey,
      cache,
      onProgress: (info) => {
        const chunkWords = info.chunkWords || 0;
        progressTracker.update(chunkWords);
        const stats = progressTracker.getStats();
        errorCount = info.errors || 0;

        updateProgressUI({
          percent: stats.percent,
          completed: stats.completed,
          total: stats.total,
          wordsTranslated: stats.wordsTranslated,
          wordsPerMin: stats.wordsPerMin,
          etaSeconds: stats.etaSeconds,
          currentEngine: info.currentEngine,
          errors: errorCount,
          chapterInfo: info.chapterInfo || null,
        });
      },
      onPreview: (preview) => {
        dom.previewOriginal.textContent = preview.original || '';
        dom.previewTranslated.textContent = preview.translated || '';
      },
    });

    translatedChunks = await engine.translateChunks(parsedFile.chunks);

    if (!translatedChunks) {
      throw new Error('Traduzione annullata.');
    }

    // Step 3: Build output file
    dom.statPosition.textContent = 'Generazione file...';
    const result = await buildFile(parsedFile, translatedChunks, targetLang);
    outputBlob = result.blob;
    outputFilename = result.filename;

    // Step 4: Show completion
    showCompletion(progressTracker.getStats(), errorCount);

  } catch (err) {
    console.error('Translation error:', err);
    alert(`Errore: ${err.message}`);
    resetToUpload();
  }
}

function updateProgressUI({ percent, completed, total, wordsTranslated, wordsPerMin, etaSeconds, currentEngine, errors, chapterInfo }) {
  const pct = Math.min(100, Math.round(percent || 0));
  dom.progressFill.style.width = `${pct}%`;
  dom.progressText.textContent = `${pct}%`;
  dom.progressFill.parentElement.setAttribute('aria-valuenow', pct);

  if (chapterInfo) {
    dom.statPosition.textContent = chapterInfo;
  } else if (total > 0) {
    dom.statPosition.textContent = `${completed} / ${total}`;
  }

  dom.statWords.textContent = formatNumber(wordsTranslated || 0);
  dom.statSpeed.textContent = wordsPerMin ? `${formatNumber(Math.round(wordsPerMin))} p/min` : '—';
  dom.statEta.textContent = etaSeconds != null && isFinite(etaSeconds) ? formatTime(etaSeconds) : '—';
  if (currentEngine) dom.statEngine.textContent = currentEngine;
  if (errors != null) dom.statErrors.textContent = String(errors);
}

function showCompletion(stats, errors) {
  document.body.classList.remove('translating');
  dom.progressSection.classList.add('hidden');
  dom.completeSection.classList.remove('hidden');

  dom.completeStats.innerHTML = `
    <div class="stat">
      <span class="stat__label">Parole tradotte</span>
      <span class="stat__value">${formatNumber(stats.wordsTranslated)}</span>
    </div>
    <div class="stat">
      <span class="stat__label">Tempo impiegato</span>
      <span class="stat__value">${formatTime(stats.elapsed)}</span>
    </div>
    <div class="stat">
      <span class="stat__label">Velocità media</span>
      <span class="stat__value">${formatNumber(Math.round(stats.wordsPerMin || 0))} p/min</span>
    </div>
    <div class="stat">
      <span class="stat__label">Errori</span>
      <span class="stat__value">${errors}</span>
    </div>
  `;
}

function cancelTranslation() {
  if (engine) {
    engine.cancel();
    engine = null;
  }
  resetToUpload();
}

function downloadOutput() {
  if (!outputBlob || !outputFilename) return;
  const url = URL.createObjectURL(outputBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = outputFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function resetToUpload() {
  document.body.classList.remove('translating');
  dom.progressSection.classList.add('hidden');
  dom.completeSection.classList.add('hidden');

  if (currentFile) {
    dom.uploadSection.classList.remove('hidden');
    dom.settingsSection.classList.remove('hidden');
  } else {
    dom.uploadSection.classList.remove('hidden');
    removeCurrentFile();
  }
}

// ─── Event Listeners ────────────────────────────────────
function initEvents() {
  // Theme
  dom.themeToggle.addEventListener('click', toggleTheme);

  // Drag & Drop
  dom.dropZone.addEventListener('click', () => dom.fileInput.click());
  dom.dropZone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); dom.fileInput.click(); }
  });

  dom.dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dom.dropZone.classList.add('drop-zone--active');
  });
  dom.dropZone.addEventListener('dragleave', () => {
    dom.dropZone.classList.remove('drop-zone--active');
  });
  dom.dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dom.dropZone.classList.remove('drop-zone--active');
    const files = e.dataTransfer.files;
    if (files.length > 0) handleFileSelect(files[0]);
  });

  dom.fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) handleFileSelect(e.target.files[0]);
  });

  dom.removeFile.addEventListener('click', removeCurrentFile);

  // Engine selection
  dom.engineRadios.forEach(r => r.addEventListener('change', handleEngineChange));

  // Start
  dom.startBtn.addEventListener('click', startTranslation);

  // Cancel
  dom.cancelBtn.addEventListener('click', cancelTranslation);

  // Download
  dom.downloadBtn.addEventListener('click', downloadOutput);

  // New file
  dom.newFileBtn.addEventListener('click', () => {
    currentFile = null;
    parsedFile = null;
    translatedChunks = null;
    outputBlob = null;
    resetToUpload();
    removeCurrentFile();
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'o') {
      e.preventDefault();
      dom.fileInput.click();
    }
    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault();
      if (!dom.startBtn.disabled) startTranslation();
    }
  });
}

// ─── Init ───────────────────────────────────────────────
function init() {
  initTheme();
  initEvents();

  // Restore Gemini key from localStorage
  const savedKey = localStorage.getItem('ta_gemini_key');
  if (savedKey) dom.geminiKey.value = savedKey;

  // Save Gemini key when changed
  dom.geminiKey.addEventListener('change', () => {
    localStorage.setItem('ta_gemini_key', dom.geminiKey.value.trim());
  });
}

init();
