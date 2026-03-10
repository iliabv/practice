const $ = (sel) => document.querySelector(sel);

/** Make a delete button require two clicks: first shows '?', second confirms. */
export function confirmDelete(btn, onConfirm) {
  const original = btn.textContent;
  let timer;
  const reset = () => {
    clearTimeout(timer);
    delete btn.dataset.confirming;
    btn.textContent = original;
    btn.classList.remove('confirming');
  };
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (btn.dataset.confirming) {
      clearTimeout(timer);
      onConfirm();
    } else {
      btn.dataset.confirming = '1';
      btn.textContent = '?';
      btn.classList.add('confirming');
      timer = setTimeout(reset, 5000);
    }
  });
}

/**
 * Compute sentence background color from loop count.
 * Subtle bg at 0 → orange at 1 → gradually to dark green at 10+ loops.
 */
export function loopColor(loopCount) {
  if (loopCount === 0) return 'hsl(240, 25%, 18%)';
  const t = Math.min(loopCount / 10, 1);
  const hue = 30 + t * 90;   // 30° (orange) → 120° (green)
  const sat = 70;
  const lit = 25 + t * 5;    // 25% → 30%
  return `hsl(${hue}, ${sat}%, ${lit}%)`;
}

export const els = {
  apiKeyInput: $('#api-key-input'),
  voiceSelect: $('#voice-select'),
  speedRange: $('#speed-range'),
  speedValue: $('#speed-value'),
  languageSelect: $('#language-select'),
  banner: $('#banner'),
  inputView: $('#input-view'),
  textInput: $('#text-input'),
  startBtn: $('#start-btn'),
  textView: $('#text-view'),
  sentencesPanel: $('#sentences-panel'),
  inlinePlayer: $('#inline-player'),
  backBtn: $('#back-btn'),
  historyList: $('#history-list'),
  toggleTextBtn: $('#toggle-text-btn'),
  holdMicBtn: $('#hold-mic-btn'),
  fullPlayer: $('#full-player'),
  navText: $('#nav-text'),
  navWords: $('#nav-words'),
  wordsView: $('#words-view'),
  wordCardsContainer: $('#word-cards-container'),
  sortRecentBtn: $('#sort-recent-btn'),
  sortDueBtn: $('#sort-due-btn'),
};

/** Show an error banner. Click to dismiss. */
export function showBanner(msg) {
  els.banner.textContent = msg;
  els.banner.classList.remove('hidden');
  els.banner.onclick = () => els.banner.classList.add('hidden');
}

export function hideBanner() {
  els.banner.classList.add('hidden');
}

export function setActiveNav(view) {
  els.navText.classList.toggle('active', view === 'text');
  els.navWords.classList.toggle('active', view === 'words');
}

export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export function formatTime(secs) {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
