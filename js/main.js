import { parseSentences } from './sentence-parser.js';
import { createState } from './state.js';
import { fetchVoices, LANGUAGES } from './tts.js';
import { els, showBanner, hideBanner, confirmDelete, loopColor, setActiveNav, escapeHtml, formatTime } from './ui.js';
import { createMainView } from './views/main-view.js';
import { createTextView } from './views/text-view.js';
import { createWordsView } from './views/words-view.js';

const state = createState();
const ui = { showBanner, hideBanner, confirmDelete, loopColor, setActiveNav, escapeHtml, formatTime };

// --- Hash-based routing ---

function setHash(hash) {
  if (location.hash === hash) return;
  location.hash = hash;
}

function getRouteFromHash() {
  const hash = location.hash || '#/';
  if (hash === '#/words') return { view: 'words', textId: null };
  if (hash.startsWith('#/text?id=')) {
    return { view: 'text', textId: decodeURIComponent(hash.slice('#/text?id='.length)) };
  }
  return { view: 'input', textId: null };
}

function textHash(textId) {
  return '#/text?id=' + encodeURIComponent(textId);
}

/** Populate a <select> element with options from a { value, label } array. */
function populateSelect(selectEl, items, selectedValue) {
  selectEl.innerHTML = '';
  for (const { value, label } of items) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    selectEl.appendChild(opt);
  }
  if (selectedValue && items.some(i => i.value === selectedValue)) {
    selectEl.value = selectedValue;
  }
}

/** Fetch voices for the current language and populate the voice dropdown. */
async function refreshVoices() {
  const s = state.get();
  if (!s.apiKey) return;
  try {
    const voices = await fetchVoices(s.apiKey, s.languageCode);
    const items = voices.map(v => ({ value: v.name, label: v.label }));
    populateSelect(els.voiceSelect, items, s.voiceName);
    if (!s.voiceName || !voices.some(v => v.name === s.voiceName)) {
      const first = voices[0]?.name || '';
      state.setVoiceName(first);
      els.voiceSelect.value = first;
    }
  } catch (err) {
    console.error('Failed to fetch voices:', err);
  }
}

// --- Create views ---

const textView = createTextView({ state, els, ui });
const wordsView = createWordsView({ state, els, ui });

function onStartText(text) {
  const { sentences } = parseSentences(text);
  if (sentences.length === 0) return;
  state.setText(text, sentences.length);
  setHash(textHash(state.get().activeTextId));
}
const mainView = createMainView({ state, els, ui, textHash, onStartText });

const views = { input: mainView, text: textView, words: wordsView };
let activeView = null;

function updateTextNavLink() {
  const last = state.get().lastTextHash;
  els.navText.href = last || '#/';
}

function navigate(route) {
  if (activeView) {
    activeView.leave();
    activeView = null;
  }
  const view = views[route.view];
  try {
    view.enter(route);
    activeView = view;
    state.setLastHash(route.view !== 'input' ? location.hash : null);
    if (route.view === 'input') state.setLastTextHash(null);
    else if (route.view === 'text') state.setLastTextHash(location.hash);
  } catch (e) {
    console.error('Navigation failed:', e);
    history.replaceState(null, '', '#/');
    views.input.enter({ view: 'input' });
    activeView = views.input;
    state.setLastHash(null);
  }
  updateTextNavLink();
}

// --- Settings listeners ---

let apiKeyTimer;
els.apiKeyInput.addEventListener('input', () => {
  state.setApiKey(els.apiKeyInput.value.trim());
  clearTimeout(apiKeyTimer);
  apiKeyTimer = setTimeout(refreshVoices, 500);
});

els.voiceSelect.addEventListener('change', () => {
  state.setVoiceName(els.voiceSelect.value);
});

els.languageSelect.addEventListener('change', () => {
  state.setLanguageCode(els.languageSelect.value);
  refreshVoices();
});

els.speedRange.addEventListener('input', () => {
  const speed = parseFloat(els.speedRange.value);
  els.speedValue.textContent = speed.toFixed(1);
  state.setSpeed(speed);
});

// --- Init ---

function init() {
  const s = state.get();
  els.apiKeyInput.value = s.apiKey;
  populateSelect(els.languageSelect, LANGUAGES.map(l => ({ value: l.code, label: l.name })), s.languageCode);
  els.speedRange.value = s.speed;
  els.speedValue.textContent = s.speed.toFixed(1);
  refreshVoices();

  let route = getRouteFromHash();
  // Resume last active non-input view on fresh page load
  if (route.view === 'input' && s.lastHash) {
    history.replaceState(null, '', s.lastHash);
    route = getRouteFromHash();
  }
  navigate(route);
}

// --- Hash-based navigation ---

window.addEventListener('hashchange', () => navigate(getRouteFromHash()));

init();
