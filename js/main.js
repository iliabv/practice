import { parseSentences } from './sentence-parser.js';
import { createState } from './state.js';
import { VOICES, MODELS, SPEEDS, LANGUAGES } from './tts.js';
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

function updateTextNavLink(currentView) {
  els.navText.href = currentView === 'text' ? '#/' : (state.get().lastTextHash || '#/');
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
  updateTextNavLink(route.view);
}

// --- Settings listeners ---

els.apiKeyInput.addEventListener('input', () => {
  state.setApiKey(els.apiKeyInput.value.trim());
});

els.voiceSelect.addEventListener('change', () => {
  state.setVoiceName(els.voiceSelect.value);
});

els.modelSelect.addEventListener('change', () => {
  state.setModel(els.modelSelect.value);
});

els.speedSelect.addEventListener('change', () => {
  state.setSpeed(els.speedSelect.value);
});

els.languageSelect.addEventListener('change', () => {
  state.setLanguageCode(els.languageSelect.value);
});

// --- Init ---

function init() {
  const s = state.get();
  els.apiKeyInput.value = s.apiKey;
  populateSelect(els.voiceSelect, VOICES.map(v => ({ value: v, label: v })), s.voiceName);
  if (!s.voiceName || !VOICES.includes(s.voiceName)) {
    state.setVoiceName(VOICES[0]);
    els.voiceSelect.value = VOICES[0];
  }
  populateSelect(els.modelSelect, MODELS.map(m => ({ value: m.value, label: m.label })), s.ttsModel);
  populateSelect(els.speedSelect, SPEEDS.map(sp => ({ value: sp.value, label: sp.label })), s.speed);
  populateSelect(els.languageSelect, LANGUAGES.map(l => ({ value: l.code, label: l.name })), s.languageCode);

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
