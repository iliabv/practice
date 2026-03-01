const $ = (sel) => document.querySelector(sel);

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
  fullPlayer: $('#full-player'),
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

/** Switch to input view. */
export function showInputView(text) {
  els.inputView.classList.remove('hidden');
  els.practiceView.classList.add('hidden');
  els.textInput.value = text;
}

/** Switch to practice view. */
export function showPracticeView() {
  els.inputView.classList.add('hidden');
  els.practiceView.classList.remove('hidden');
}

/**
 * Render sentence spans into the sentences panel.
 * @param {string[]} sentences
 * @param {Array<{loopCount: number}>} progress
 * @param {function} onClick - called with sentence index
 * @param {Map<number, number>} lineBreaks - maps sentence index → number of \n chars before it
 */
export function renderSentences(sentences, progress, onClick, lineBreaks = new Map()) {
  // Detach inline player before clearing
  const player = els.inlinePlayer;
  if (player.parentNode === els.sentencesPanel) {
    els.sentencesPanel.removeChild(player);
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

  // Re-append inline player
  els.sentencesPanel.appendChild(player);
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
  const interactive = isIdle || isRecording || isAwaitingRecord;

  const iconContent = isLoading
    ? '<div class="spinner"></div>'
    : isRecording ? '⏹' : isAwaitingRecord ? '⏺' : '▶';

  let phaseText = '';
  if (phase === 'loading') phaseText = 'Loading…';
  else if (phase === 'playing-original') phaseText = 'Playing…';
  else if (phase === 'awaiting-record') phaseText = 'Press to record';
  else if (phase === 'recording') phaseText = 'Recording…';
  else if (phase === 'playing-user') phaseText = 'Your recording…';

  const player = els.inlinePlayer;
  const iconClasses = 'play-icon' + (isRecording ? ' recording' : '') + (isAwaitingRecord ? ' awaiting-record' : '') + (isLoading ? ' loading' : '');
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
    deleteBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onDelete(entry.id);
    });

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

window.addEventListener('resize', positionInlinePlayer);
