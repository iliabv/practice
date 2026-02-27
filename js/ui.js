import { loopColor } from './state.js';

const $ = (sel) => document.querySelector(sel);

export const els = {
  get apiKeyInput() { return $('#api-key-input'); },
  get banner() { return $('#banner'); },
  get inputView() { return $('#input-view'); },
  get textInput() { return $('#text-input'); },
  get startBtn() { return $('#start-btn'); },
  get practiceView() { return $('#practice-view'); },
  get sentencesPanel() { return $('#sentences-panel'); },
  get playerPanel() { return $('#player-panel'); },
  get backBtn() { return $('#back-btn'); },
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
  if (text) els.textInput.value = text;
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
 */
export function renderSentences(sentences, progress, onClick) {
  els.sentencesPanel.innerHTML = '';
  sentences.forEach((text, i) => {
    const span = document.createElement('span');
    span.className = 'sentence';
    span.textContent = text;
    span.dataset.index = i;
    span.style.backgroundColor = loopColor(progress[i]?.loopCount || 0);
    span.addEventListener('click', () => onClick(i));
    els.sentencesPanel.appendChild(span);
  });
}

/** Highlight the active sentence and remove highlight from others. */
export function setActiveSentence(index) {
  els.sentencesPanel.querySelectorAll('.sentence').forEach((span) => {
    span.classList.toggle('active', Number(span.dataset.index) === index);
  });
}

/** Update a single sentence's background color. */
export function updateSentenceColor(index, loopCount) {
  const span = els.sentencesPanel.querySelector(`.sentence[data-index="${index}"]`);
  if (span) span.style.backgroundColor = loopColor(loopCount);
}

/**
 * Render the player panel for a selected sentence.
 * @param {object} opts
 * @param {string} opts.phase
 * @param {number} opts.loopCount
 * @param {function} opts.onPlay - called when play/stop button clicked
 */
export function renderPlayer({ phase, loopCount, onPlay }) {
  const isRecording = phase === 'recording';
  const isIdle = phase === 'idle' || phase === 'stopped';
  const disabled = !isIdle && !isRecording;

  const icon = isRecording ? '⏹' : '▶';
  const btnClass = `play-btn${isRecording ? ' recording' : ''}`;

  let phaseText = '';
  if (phase === 'playing-original') phaseText = 'Playing original…';
  else if (phase === 'beeping') phaseText = 'Get ready…';
  else if (phase === 'recording') phaseText = 'Recording…';
  else if (phase === 'playing-user') phaseText = 'Playing your recording…';

  els.playerPanel.innerHTML = `
    <button class="${btnClass}" ${disabled ? 'disabled' : ''} id="play-btn">${icon}</button>
    <div class="loop-counter">Loops: ${loopCount}</div>
    <div class="phase-label">${phaseText}</div>
  `;

  $('#play-btn').addEventListener('click', onPlay);
}

/** Show the placeholder in the player panel. */
export function clearPlayer() {
  els.playerPanel.innerHTML = '<p class="player-placeholder">Click a sentence to begin</p>';
}
