const $ = (sel) => document.querySelector(sel);

/** Make a delete button require two clicks: first shows '?', second confirms. */
function confirmDelete(btn, onConfirm) {
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
function loopColor(loopCount) {
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
  practiceView: $('#practice-view'),
  sentencesPanel: $('#sentences-panel'),
  inlinePlayer: $('#inline-player'),
  backBtn: $('#back-btn'),
  historyList: $('#history-list'),
  toggleTextBtn: $('#toggle-text-btn'),
  holdMicBtn: $('#hold-mic-btn'),
  fullPlayer: $('#full-player'),
  wordPopup: $('#word-popup'),
  navText: $('#nav-text'),
  navWords: $('#nav-words'),
  wordsView: $('#words-view'),
  wordCardsContainer: $('#word-cards-container'),
  sortRecentBtn: $('#sort-recent-btn'),
  sortSmartBtn: $('#sort-smart-btn'),
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

function setActiveNav(view) {
  els.navText.classList.toggle('active', view === 'text');
  els.navWords.classList.toggle('active', view === 'words');
}

/** Switch to input view. */
export function showInputView(text) {
  els.inputView.classList.remove('hidden');
  els.practiceView.classList.add('hidden');
  els.textInput.value = text;
  setActiveNav('text');
}

/** Switch to practice view. */
export function showPracticeView() {
  els.inputView.classList.add('hidden');
  els.practiceView.classList.remove('hidden');
  setActiveNav('text');
}

/**
 * Render sentence spans into the sentences panel.
 * @param {string[]} sentences
 * @param {Array<{loopCount: number}>} progress
 * @param {function} onClick - called with sentence index
 * @param {Map<number, number>} lineBreaks - maps sentence index → number of \n chars before it
 */
export function renderSentences(sentences, progress, onClick, lineBreaks = new Map()) {
  // Detach inline player and word popup before clearing
  const player = els.inlinePlayer;
  if (player.parentNode === els.sentencesPanel) {
    els.sentencesPanel.removeChild(player);
  }
  const popup = els.wordPopup;
  if (popup.parentNode === els.sentencesPanel) {
    els.sentencesPanel.removeChild(popup);
  }

  els.sentencesPanel.innerHTML = '';
  sentences.forEach((text, i) => {
    const span = document.createElement('span');
    span.className = 'sentence';
    span.textContent = text;
    span.dataset.index = i;
    span.style.backgroundColor = loopColor(progress[i]?.loopCount || 0);
    span.addEventListener('click', () => onClick(i));
    if (i > 0) {
      const count = lineBreaks.get(i);
      if (count > 0) {
        for (let b = 0; b < count; b++) {
          els.sentencesPanel.appendChild(document.createElement('br'));
        }
      } else {
        els.sentencesPanel.appendChild(document.createTextNode(' '));
      }
    }
    els.sentencesPanel.appendChild(span);
  });

  // Re-append inline player and word popup
  els.sentencesPanel.appendChild(player);
  els.sentencesPanel.appendChild(popup);
}

/** Highlight the active sentence and remove highlight from others. */
export function setActiveSentence(index) {
  els.sentencesPanel.querySelectorAll('.sentence').forEach((span) => {
    span.classList.toggle('active', Number(span.dataset.index) === index);
  });
  positionInlinePlayer();
}

/** Update a single sentence's background color. */
export function updateSentenceColor(index, loopCount) {
  const span = els.sentencesPanel.querySelector(`.sentence[data-index="${index}"]`);
  if (span) span.style.backgroundColor = loopColor(loopCount);
}

/**
 * Position the inline player below the active sentence.
 */
function positionInlinePlayer() {
  const active = els.sentencesPanel.querySelector('.sentence.active');
  const player = els.inlinePlayer;
  if (!active || player.classList.contains('hidden')) return;

  const sentenceRect = active.getBoundingClientRect();
  const panelRect = els.sentencesPanel.getBoundingClientRect();

  // Position below the active sentence, aligned to its left edge
  let left = sentenceRect.left - panelRect.left;
  const top = sentenceRect.bottom - panelRect.top + 6;

  // Keep it within the panel bounds
  const playerWidth = player.offsetWidth;
  if (left + playerWidth > panelRect.width) {
    left = Math.max(0, panelRect.width - playerWidth);
  }

  player.style.top = `${top}px`;
  player.style.left = `${left}px`;
}

/**
 * Render the inline player for a selected sentence.
 * @param {object} opts
 * @param {string} opts.phase
 * @param {number} opts.loopCount
 * @param {function} opts.onPlay - called when play/stop button clicked
 */
export function renderPlayer({ phase, loopCount, onPlay }) {
  const isRecording = phase === 'recording';
  const isIdle = phase === 'idle';
  const isLoading = phase === 'loading';
  const isAwaitingRecord = phase === 'awaiting-record';
  const isPreparing = phase === 'preparing';
  const interactive = isIdle || isRecording || isAwaitingRecord;

  const iconContent = (isLoading || isPreparing)
    ? '<div class="spinner"></div>'
    : isRecording ? '⏹' : isAwaitingRecord ? '⏺' : '▶';

  let phaseText = '';
  if (phase === 'loading') phaseText = 'Loading…';
  else if (phase === 'playing-original') phaseText = 'Playing…';
  else if (phase === 'awaiting-record') phaseText = 'Press to record';
  else if (phase === 'preparing') phaseText = 'Preparing…';
  else if (phase === 'recording') phaseText = 'Recording…';
  else if (phase === 'playing-user') phaseText = 'Your recording…';

  const player = els.inlinePlayer;
  const iconClasses = 'play-icon' + (isRecording ? ' recording' : '') + (isAwaitingRecord ? ' awaiting-record' : '') + ((isLoading || isPreparing) ? ' loading' : '');
  player.innerHTML = `
    <span class="${iconClasses}">${iconContent}</span>
    <span class="loop-counter">${loopCount}x</span>
    ${phaseText ? `<span class="phase-label">${phaseText}</span>` : ''}
  `;
  player.classList.toggle('disabled', !interactive);
  player.classList.toggle('recording', isRecording);
  player.classList.remove('hidden');

  player.onclick = interactive ? onPlay : null;
  positionInlinePlayer();
}

/** Hide the inline player. */
export function clearPlayer() {
  els.inlinePlayer.classList.add('hidden');
  els.inlinePlayer.innerHTML = '';
}

/** Render history list below the textarea. */
export function renderHistory(texts, { practiceHref, onDelete }) {
  const container = els.historyList;
  container.innerHTML = '';
  if (texts.length === 0) return;

  const heading = document.createElement('h3');
  heading.className = 'history-heading';
  heading.textContent = 'History';
  container.appendChild(heading);

  // Show newest first
  [...texts].reverse().forEach((entry) => {
    const item = document.createElement('a');
    item.className = 'history-item';
    item.href = practiceHref(entry.id);

    const preview = document.createElement('span');
    preview.className = 'history-preview';
    const truncated = entry.text.length > 80 ? entry.text.slice(0, 80) + '…' : entry.text;
    preview.textContent = truncated;

    const meta = document.createElement('span');
    meta.className = 'history-meta';
    meta.textContent = `${entry.sentenceProgress.length} sentences`;

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'history-delete';
    deleteBtn.textContent = '×';
    confirmDelete(deleteBtn, () => onDelete(entry.id));

    item.appendChild(preview);
    item.appendChild(meta);
    item.appendChild(deleteBtn);
    container.appendChild(item);
  });
}

/** Temporarily reveal/hide a sentence when text is hidden. */
export function setSentenceRevealed(index, revealed) {
  const span = els.sentencesPanel.querySelector(`.sentence[data-index="${index}"]`);
  if (span) span.classList.toggle('revealed', revealed);
}

/** Apply text-hidden state to the sentences panel and button. */
export function setTextHidden(hidden) {
  els.sentencesPanel.classList.toggle('text-hidden', hidden);
  els.toggleTextBtn.classList.toggle('active', hidden);
  els.toggleTextBtn.textContent = hidden ? 'Show text' : 'Hide text';
}

/** Apply hold-mic state to the button. */
export function setHoldMic(active) {
  els.holdMicBtn.classList.toggle('active', active);
}

// --- Full-text player ---

/** Show the full player bar in idle state (play button only, no seek). */
export function renderFullPlayerIdle(onPlay) {
  const player = els.fullPlayer;
  player.innerHTML = `
    <button class="full-player-btn">▶</button>
    <div class="full-player-track disabled">
      <div class="full-player-fill" style="width:0%"></div>
    </div>
  `;
  player.classList.remove('hidden');
  player.querySelector('.full-player-btn').onclick = onPlay;
}

/** Show the full player bar in loading state (spinner instead of play button). */
export function renderFullPlayerLoading() {
  const player = els.fullPlayer;
  player.innerHTML = `
    <div class="full-player-btn loading"><div class="spinner"></div></div>
    <div class="full-player-track disabled">
      <div class="full-player-fill" style="width:0%"></div>
    </div>
  `;
  player.classList.remove('hidden');
}

/** Show the full player bar with play/pause button and seek track. */
export function renderFullPlayer({ playing, onPlayPause, onSeek }) {
  const player = els.fullPlayer;
  player.innerHTML = `
    <button class="full-player-btn">${playing ? '⏸' : '▶'}</button>
    <div class="full-player-track">
      <div class="full-player-fill" style="width:0%"></div>
      <div class="full-player-caret" style="left:0%"></div>
    </div>
    <span class="full-player-time">0:00 / 0:00</span>
  `;
  player.classList.remove('hidden');

  player.querySelector('.full-player-btn').onclick = onPlayPause;

  // Seek interaction on the track
  const track = player.querySelector('.full-player-track');
  const seekTo = (e) => {
    const rect = track.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSeek(fraction);
  };

  track.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    seekTo(e);
    const onMove = (ev) => seekTo(ev);
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });
}

/** Update the progress bar position and time label. */
export function updateFullPlayerProgress(currentTime, duration) {
  const player = els.fullPlayer;
  if (player.classList.contains('hidden')) return;
  const fraction = duration > 0 ? currentTime / duration : 0;
  const pct = (fraction * 100).toFixed(2) + '%';
  const fill = player.querySelector('.full-player-fill');
  const caret = player.querySelector('.full-player-caret');
  const time = player.querySelector('.full-player-time');
  if (fill) fill.style.width = pct;
  if (caret) caret.style.left = pct;
  if (time) time.textContent = `${formatTime(currentTime)} / ${formatTime(duration)}`;
}

function formatTime(secs) {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Update the play/pause icon on the full player. */
export function updateFullPlayerButton(playing) {
  const btn = els.fullPlayer.querySelector('.full-player-btn');
  if (btn) btn.textContent = playing ? '⏸' : '▶';
}

/** Hide and clear the full player bar. */
export function clearFullPlayer() {
  els.fullPlayer.classList.add('hidden');
  els.fullPlayer.innerHTML = '';
}

/** Highlight the sentence currently being spoken in play-all mode. */
export function setFullPlayingSentence(index) {
  els.sentencesPanel.querySelectorAll('.sentence').forEach((span) => {
    span.classList.toggle('full-playing', Number(span.dataset.index) === index);
  });
}

// --- Word interaction ---

/**
 * Replace sentence text with clickable word spans.
 * @param {number} index - sentence index
 * @param {function} onWordClick - called with (word, wordSpan, sentenceText)
 */
export function enableWordInteraction(index, onWordClick) {
  const span = els.sentencesPanel.querySelector(`.sentence[data-index="${index}"]`);
  if (!span || span.querySelector('.word')) return; // already enabled
  const text = span.textContent;
  span.innerHTML = '';
  // Split into words preserving whitespace
  const parts = text.split(/(\s+)/);
  parts.forEach(part => {
    if (/^\s+$/.test(part)) {
      span.appendChild(document.createTextNode(part));
    } else {
      const wordSpan = document.createElement('span');
      wordSpan.className = 'word';
      wordSpan.textContent = part;
      // Strip punctuation for the word lookup
      const cleanWord = part.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
      wordSpan.addEventListener('click', (e) => {
        e.stopPropagation();
        if (cleanWord) onWordClick(cleanWord, wordSpan, text);
      });
      span.appendChild(wordSpan);
    }
  });
}

/** Restore sentence to plain text. */
export function disableWordInteraction(index) {
  const span = els.sentencesPanel.querySelector(`.sentence[data-index="${index}"]`);
  if (span) span.textContent = span.textContent;
}

// --- Word popup ---

/**
 * Show word popup above the clicked word span.
 * @param {HTMLElement} wordSpan
 * @param {object} opts - { word, translation, isSaved, onSave, onDelete }
 */
export function showWordPopup(wordSpan, { word, translation, isSaved, onSave, onDelete }) {
  const popup = els.wordPopup;
  const handler = isSaved ? onDelete : onSave;
  const translationHtml = translation === null
    ? '<span class="word-popup-translation"><div class="spinner"></div></span>'
    : `<span class="word-popup-translation">${escapeHtml(translation)}</span>`;

  let btnHtml = '';
  if (handler) {
    const btnClass = isSaved ? 'word-popup-btn delete' : 'word-popup-btn save';
    const btnText = isSaved ? 'Delete' : 'Save';
    btnHtml = `<button class="${btnClass}">${btnText}</button>`;
  }

  popup.innerHTML = `
    <span class="word-popup-word">${escapeHtml(word)}</span>
    ${translationHtml}
    ${btnHtml}
  `;

  const btn = popup.querySelector('button');
  if (btn) {
    if (isSaved) {
      confirmDelete(btn, handler);
    } else {
      btn.onclick = handler;
    }
  }

  // Make visible off-screen first to measure dimensions
  popup.style.top = '0px';
  popup.style.left = '-9999px';
  popup.classList.remove('hidden');

  // Position above the word (now offsetHeight/offsetWidth are accurate)
  const wordRect = wordSpan.getBoundingClientRect();
  const panelRect = els.sentencesPanel.getBoundingClientRect();
  let left = wordRect.left - panelRect.left;
  let top = wordRect.top - panelRect.top - popup.offsetHeight - 6;

  // If popup would go above the panel, show below the word instead
  if (top < 0) {
    top = wordRect.bottom - panelRect.top + 6;
  }

  // Keep within panel horizontal bounds
  const popupWidth = popup.offsetWidth;
  if (left + popupWidth > panelRect.width) {
    left = Math.max(0, panelRect.width - popupWidth);
  }

  popup.style.top = `${top}px`;
  popup.style.left = `${left}px`;
}

/** Hide and clear word popup. */
export function hideWordPopup() {
  els.wordPopup.classList.add('hidden');
  els.wordPopup.innerHTML = '';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// --- Words view ---

export function showWordsView() {
  els.inputView.classList.add('hidden');
  els.practiceView.classList.add('hidden');
  els.wordsView.classList.remove('hidden');
  setActiveNav('words');
}

export function hideWordsView() {
  els.wordsView.classList.add('hidden');
}

/**
 * Render word practice cards.
 * @param {Array} words - saved words array
 * @param {object} opts - { onCheck, onPlay, onDelete, sortMode, onSortChange }
 */
export function renderWordPractice(words, { onCheck, onPlay, onDelete, sortMode, onSortChange }) {
  const container = els.wordCardsContainer;
  container.innerHTML = '';

  // Sort controls
  els.sortRecentBtn.classList.toggle('active', sortMode === 'recent');
  els.sortSmartBtn.classList.toggle('active', sortMode === 'smart');
  els.sortRecentBtn.onclick = () => onSortChange('recent');
  els.sortSmartBtn.onclick = () => onSortChange('smart');

  if (words.length === 0) {
    container.innerHTML = '<div class="word-cards-empty">No saved words yet. Click words in practice sentences to save them.</div>';
    return;
  }

  words.forEach(wordEntry => {
    const card = document.createElement('div');
    card.className = 'word-card';

    const sentenceDiv = document.createElement('div');
    sentenceDiv.className = 'word-card-sentence';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'word-card-gap';
    input.placeholder = '…';

    const settled = () => input.classList.contains('correct') || input.classList.contains('incorrect');

    let checkBtn; // forward reference

    const doCheck = () => {
      if (settled()) return;
      const val = input.value.trim();
      if (!val) return;
      const correct = val.toLowerCase() === wordEntry.word.toLowerCase();
      const cls = correct ? 'correct' : 'incorrect';
      input.classList.add(cls);
      if (checkBtn) checkBtn.classList.add(cls);
      onCheck(wordEntry.id, correct);
    };

    // Build sentence with gap replacing the saved word
    // Use case-insensitive indexOf instead of \b regex (works with Unicode)
    const lowerSentence = wordEntry.sentence.toLowerCase();
    const wordLower = wordEntry.word.toLowerCase();
    const idx = lowerSentence.indexOf(wordLower);

    const inputWrap = document.createElement('span');
    inputWrap.className = 'word-card-gap-wrap';
    inputWrap.appendChild(input);

    if (idx >= 0) {
      const before = wordEntry.sentence.slice(0, idx);
      const after = wordEntry.sentence.slice(idx + wordEntry.word.length);
      if (before) sentenceDiv.appendChild(document.createTextNode(before));
      sentenceDiv.appendChild(inputWrap);
      if (after) sentenceDiv.appendChild(document.createTextNode(after));
    } else {
      sentenceDiv.appendChild(document.createTextNode(wordEntry.sentence));
      sentenceDiv.appendChild(document.createTextNode(' '));
      sentenceDiv.appendChild(inputWrap);
    }

    checkBtn = document.createElement('button');
    checkBtn.className = 'word-card-btn check';
    checkBtn.textContent = '✓';
    checkBtn.title = 'Check answer';
    checkBtn.onclick = doCheck;

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); doCheck(); }
    });
    input.addEventListener('input', () => {
      input.classList.remove('incorrect');
      checkBtn.classList.remove('incorrect');
    });

    const revealBtn = document.createElement('button');
    revealBtn.className = 'word-card-hint';
    revealBtn.textContent = '?';
    revealBtn.title = wordEntry.translation || 'Reveal answer';
    revealBtn.onclick = () => {
      if (settled()) return;
      input.value = '';
      input.placeholder = wordEntry.word;
      input.focus();
    };

    const playBtn = document.createElement('button');
    playBtn.className = 'word-card-btn';
    playBtn.textContent = '▶';
    playBtn.title = 'Play sentence';
    playBtn.onclick = () => onPlay(wordEntry);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'word-card-btn';
    deleteBtn.textContent = '×';
    deleteBtn.title = 'Delete word';
    confirmDelete(deleteBtn, () => onDelete(wordEntry.id));

    inputWrap.appendChild(revealBtn);

    card.appendChild(sentenceDiv);
    card.appendChild(checkBtn);
    card.appendChild(playBtn);
    card.appendChild(deleteBtn);
    container.appendChild(card);
  });
}

window.addEventListener('resize', positionInlinePlayer);
