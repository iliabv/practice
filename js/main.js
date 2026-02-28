import { parseSentences } from './sentence-parser.js';
import { createState } from './state.js';
import { textToSpeech, VOICES, LANGUAGES } from './elevenlabs.js';
import { startRecording, stopRecording } from './recorder.js';
import { playBlob, stopPlayback } from './audio-utils.js';
import {
  els, showBanner, hideBanner,
  showInputView, showPracticeView,
  renderSentences, setActiveSentence, updateSentenceColor,
  renderPlayer, clearPlayer, renderHistory, setTextHidden,
  renderFullPlayerIdle, renderFullPlayerLoading, renderFullPlayer, updateFullPlayerProgress, updateFullPlayerButton,
  clearFullPlayer, setFullPlayingSentence,
} from './ui.js';

const state = createState();
let sentences = [];
let loopGeneration = 0;

// Play-all state
let playAllAudio = null;
let playAllRafId = null;
let playAllCharFractions = [];

// --- Hash-based routing ---
function setHash(hash) {
  if (location.hash === hash) return;
  location.hash = hash;
}

function getRouteFromHash() {
  const hash = location.hash || '#/';
  if (hash.startsWith('#/practice?text=')) {
    return { view: 'practice', textId: decodeURIComponent(hash.slice('#/practice?text='.length)) };
  }
  return { view: 'input', textId: null };
}

function practiceHash(textId) {
  return '#/practice?text=' + encodeURIComponent(textId);
}

// --- Populate voice selector ---
function initVoiceSelect() {
  const select = els.voiceSelect;
  VOICES.forEach((v) => {
    const opt = document.createElement('option');
    opt.value = v.id;
    opt.textContent = v.name;
    select.appendChild(opt);
  });
  select.value = state.get().voiceId;
}

// --- Populate language selector ---
function initLanguageSelect() {
  const select = els.languageSelect;
  LANGUAGES.forEach((l) => {
    const opt = document.createElement('option');
    opt.value = l.code;
    opt.textContent = l.name;
    select.appendChild(opt);
  });
  select.value = state.get().languageCode;
}

// --- Restore persisted state ---
function init() {
  const s = state.get();
  els.apiKeyInput.value = s.apiKey;
  initVoiceSelect();
  initLanguageSelect();
  els.speedRange.value = s.speed;
  els.speedValue.textContent = s.speed.toFixed(1);

  // Try hash-driven resume, then fall back to state-driven resume
  const route = getRouteFromHash();
  if (route.view === 'practice' && route.textId) {
    state.setActiveTextId(route.textId);
  }

  const active = state.getActiveText();
  if (active) {
    sentences = parseSentences(active.text);
    if (sentences.length === active.sentenceProgress.length) {
      setHash(practiceHash(state.get().activeTextId));
      enterPracticeView(active.text);
      return;
    }
  }
  setHash('#/');
  showInputView('');
  refreshHistory();
}

function refreshHistory() {
  renderHistory(state.getTexts(), {
    practiceHref: practiceHash,
    onDelete: onHistoryDelete,
  });
}

// --- API key ---
els.apiKeyInput.addEventListener('input', () => {
  state.setApiKey(els.apiKeyInput.value.trim());
});

// --- Voice selector ---
els.voiceSelect.addEventListener('change', () => {
  state.setVoiceId(els.voiceSelect.value);
});

// --- Language selector ---
els.languageSelect.addEventListener('change', () => {
  state.setLanguageCode(els.languageSelect.value);
});

// --- Speed slider ---
els.speedRange.addEventListener('input', () => {
  const speed = parseFloat(els.speedRange.value);
  els.speedValue.textContent = speed.toFixed(1);
  state.setSpeed(speed);
});

// --- Start button ---
els.startBtn.addEventListener('click', () => {
  const text = els.textInput.value.trim();
  if (!text) return;

  const apiKey = state.get().apiKey;
  if (!apiKey) {
    showBanner('Please enter your ElevenLabs API key first.');
    return;
  }

  hideBanner();
  sentences = parseSentences(text);
  if (sentences.length === 0) return;

  state.setText(text, sentences.length);
  setHash(practiceHash(state.get().activeTextId));
  enterPracticeView(text);
});

// --- Back button ---
els.backBtn.addEventListener('click', () => {
  setHash('#/');
});

// --- Toggle text visibility ---
function toggleTextHidden() {
  const hidden = !state.get().textHidden;
  state.setTextHidden(hidden);
  setTextHidden(hidden);
}

els.toggleTextBtn.addEventListener('click', toggleTextHidden);

function leavePracticeView() {
  stopPlayAll();
  clearFullPlayer();
  stopPlayback();
  stopRecording();
  resolveRecordTrigger = null;
  loopGeneration++;
  state.clearActiveText();
  sentences = [];
  showInputView('');
  clearPlayer();
  refreshHistory();
}

function enterPracticeView(text) {
  els.textInput.value = text;
  showPracticeView();
  const active = state.getActiveText();
  renderSentences(sentences, active.sentenceProgress, onSentenceClick);
  setTextHidden(state.get().textHidden);
  clearPlayer();
  renderFullPlayerIdle(playAll);
}

// --- History handlers ---

function onHistoryDelete(id) {
  state.deleteText(id);
  refreshHistory();
}

// --- Sentence click ---
function onSentenceClick(index) {
  const s = state.get();
  if (s.playingAll) pausePlayAll();
  if (s.activeSentenceIndex === index) {
    updatePlayer();
    return;
  }

  // Stop any in-flight audio and recording
  stopPlayback();
  if (s.phase === 'recording') {
    stopRecording();
  }

  // Cancel any in-flight loop by bumping a generation counter
  resolveRecordTrigger = null;
  loopGeneration++;

  state.setActiveSentence(index);
  setActiveSentence(index);
  updatePlayer();
}

// --- Record trigger ---
// When the loop is awaiting user action, resolving this starts the recording.
let resolveRecordTrigger = null;

/**
 * Wait for the user to press record, record, then wait for them to stop.
 * Returns the recorded audio Blob, or null if cancelled.
 */
function waitForRecording(gen) {
  return new Promise((resolve) => {
    const cancelled = () => gen !== loopGeneration;
    resolveRecordTrigger = async () => {
      resolveRecordTrigger = null;
      if (cancelled()) { resolve(null); return; }
      state.setPhase('recording');
      updatePlayer();
      try {
        const blob = await startRecording();
        resolve(cancelled() ? null : blob);
      } catch (err) {
        resolve(null);
        throw err;
      }
    };
  });
}

// --- Play/Stop button ---
function onPlayStop() {
  const s = state.get();
  if (s.phase === 'recording') {
    stopRecording();
    return;
  }
  if (s.phase === 'awaiting-record' && resolveRecordTrigger) {
    resolveRecordTrigger();
    return;
  }
  if (s.phase === 'idle') {
    runLoop();
  }
}

// --- Main practice loop ---
async function runLoop() {
  const s = state.get();
  const index = s.activeSentenceIndex;
  const sentenceText = sentences[index];
  const apiKey = s.apiKey;
  const gen = loopGeneration;

  if (!apiKey) {
    showBanner('Please enter your ElevenLabs API key first.');
    return;
  }

  // Helper: bail if the user switched sentences since this loop started
  const cancelled = () => gen !== loopGeneration;

  try {
    // 1. Fetch TTS audio, then play original
    state.setPhase('loading');
    updatePlayer();
    const audioBlob = await textToSpeech(sentenceText, apiKey, {
      previousText: sentences[index - 1],
      nextText: sentences[index + 1],
      voiceId: s.voiceId,
      speed: s.speed,
      languageCode: s.languageCode,
    });
    if (cancelled()) return;
    state.setPhase('playing-original');
    updatePlayer();
    await playBlob(audioBlob);
    if (cancelled()) return;

    // 2. Wait for user to press record
    state.setPhase('awaiting-record');
    updatePlayer();
    const userBlob = await waitForRecording(gen);
    if (cancelled() || !userBlob) return;

    // 3. Play user's recording back
    state.setUserRecording(userBlob);
    state.setPhase('playing-user');
    updatePlayer();
    await playBlob(userBlob);
    if (cancelled()) return;

    // 4. Play original again
    state.setPhase('playing-original');
    updatePlayer();
    await playBlob(audioBlob);
    if (cancelled()) return;

    // Done
    state.incrementLoop(index);
    state.setPhase('idle');
    const active = state.getActiveText();
    updateSentenceColor(index, active.sentenceProgress[index].loopCount);
    updatePlayer();
  } catch (err) {
    if (cancelled()) return;
    console.error(err);
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      showBanner('Microphone access required. Please allow microphone permissions.');
    } else {
      showBanner(err.message || 'An error occurred');
    }
    state.setPhase('idle');
    updatePlayer();
  }
}

/** Escape handler: close player first, deselect sentence on second press. */
function onEscape() {
  const s = state.get();
  const playerOpen = !els.inlinePlayer.classList.contains('hidden');

  if (playerOpen) {
    stopPlayback();
    if (s.phase === 'recording') stopRecording();
    resolveRecordTrigger = null;
    loopGeneration++;
    state.setPhase('idle');
    clearPlayer();
    return;
  }

  if (s.activeSentenceIndex >= 0) {
    state.setActiveSentence(-1);
    setActiveSentence(-1);
  }
}

function updatePlayer() {
  const s = state.get();
  if (s.activeSentenceIndex < 0) {
    clearPlayer();
    return;
  }
  const active = state.getActiveText();
  if (!active) {
    clearPlayer();
    return;
  }
  const progress = active.sentenceProgress[s.activeSentenceIndex];
  renderPlayer({
    phase: s.phase,
    loopCount: progress?.loopCount || 0,
    onPlay: onPlayStop,
  });
}

// --- Play all ---

/** Build cumulative character-fraction array for sentence estimation. */
function buildCharFractions() {
  const totalChars = sentences.reduce((sum, s) => sum + s.length, 0);
  if (totalChars === 0) return [];
  const fractions = [];
  let cumulative = 0;
  for (const s of sentences) {
    cumulative += s.length;
    fractions.push(cumulative / totalChars);
  }
  return fractions;
}

/** Find which sentence index corresponds to a playback fraction (0–1). */
function estimateSentenceIndex(fraction, charFractions) {
  for (let i = 0; i < charFractions.length; i++) {
    if (fraction < charFractions[i]) return i;
  }
  return charFractions.length - 1;
}

async function playAll() {
  if (state.get().playingAll) {
    // Toggle pause/resume
    if (playAllAudio) {
      if (playAllAudio.paused) {
        // Clear any active single-sentence state before resuming
        stopPlayback();
        if (state.get().phase === 'recording') stopRecording();
        loopGeneration++;
        state.setActiveSentence(-1);
        setActiveSentence(-1);
        clearPlayer();

        playAllAudio.play();
        updateFullPlayerButton(true);
        startPlayAllTick();
      } else {
        pausePlayAll();
      }
    }
    return;
  }

  const s = state.get();
  const apiKey = s.apiKey;
  if (!apiKey) {
    showBanner('Please enter your ElevenLabs API key first.');
    return;
  }

  // Deselect current sentence and clear inline player
  stopPlayback();
  if (s.phase === 'recording') stopRecording();
  loopGeneration++;
  state.setActiveSentence(-1);
  setActiveSentence(-1);
  clearPlayer();

  state.setPlayingAll(true);

  const fullText = sentences.join(' ');
  playAllCharFractions = buildCharFractions();

  renderFullPlayerLoading();

  try {
    const blob = await textToSpeech(fullText, apiKey, {
      voiceId: s.voiceId,
      speed: s.speed,
      languageCode: s.languageCode,
    });

    if (!state.get().playingAll) return; // stopped while fetching

    renderFullPlayer({
      playing: true,
      onPlayPause: playAll,
      onSeek: (fraction) => {
        if (playAllAudio && playAllAudio.duration) {
          playAllAudio.currentTime = fraction * playAllAudio.duration;
        }
      },
    });

    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    playAllAudio = audio;

    audio.onended = () => {
      URL.revokeObjectURL(url);
      stopPlayAll();
    };

    audio.onerror = () => {
      URL.revokeObjectURL(url);
      stopPlayAll();
    };

    await audio.play();

    startPlayAllTick();
  } catch (err) {
    console.error(err);
    showBanner(err.message || 'An error occurred');
    stopPlayAll();
  }
}

function startPlayAllTick() {
  if (playAllRafId) cancelAnimationFrame(playAllRafId);
  const tick = () => {
    if (!state.get().playingAll || !playAllAudio) return;
    const ct = playAllAudio.currentTime;
    const dur = playAllAudio.duration || 0;
    updateFullPlayerProgress(ct, dur);
    if (dur > 0) {
      const idx = estimateSentenceIndex(ct / dur, playAllCharFractions);
      setFullPlayingSentence(idx);
    }
    playAllRafId = requestAnimationFrame(tick);
  };
  playAllRafId = requestAnimationFrame(tick);
}

function pausePlayAll() {
  if (!playAllAudio) return;
  playAllAudio.pause();
  if (playAllRafId) {
    cancelAnimationFrame(playAllRafId);
    playAllRafId = null;
  }
  setFullPlayingSentence(-1);
  updateFullPlayerButton(false);
}

function stopPlayAll() {
  if (playAllRafId) {
    cancelAnimationFrame(playAllRafId);
    playAllRafId = null;
  }
  if (playAllAudio) {
    playAllAudio.pause();
    playAllAudio.src = '';
    playAllAudio = null;
  }
  state.setPlayingAll(false);
  setFullPlayingSentence(-1);
  // Return to idle player (visible but non-interactive scrubber)
  if (sentences.length > 0) {
    renderFullPlayerIdle(playAll);
  } else {
    clearFullPlayer();
  }
}

// --- Keyboard shortcuts ---
const NEXT_KEYS = new Set(['Enter', 'ArrowDown', 'ArrowRight']);
const PREV_KEYS = new Set(['Backspace', 'Delete', 'ArrowUp', 'ArrowLeft']);

document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (sentences.length === 0) return;

  if (e.key === 'Escape') {
    e.preventDefault();
    if (state.get().playingAll) {
      stopPlayAll();
      return;
    }
    onEscape();
    return;
  }

  if (e.key === 'p' || e.key === 'P') {
    e.preventDefault();
    playAll();
    return;
  }

  if (e.code === 'Space') {
    if (state.get().activeSentenceIndex < 0) return;
    e.preventDefault();
    onPlayStop();
    return;
  }

  if (NEXT_KEYS.has(e.key)) {
    e.preventDefault();
    const current = state.get().activeSentenceIndex;
    const next = current < 0 ? 0 : Math.min(current + 1, sentences.length - 1);
    if (next !== current) onSentenceClick(next);
    return;
  }

  if (e.key === 't' || e.key === 'T' || e.key === 'h' || e.key === 'H') {
    e.preventDefault();
    toggleTextHidden();
    return;
  }

  if (PREV_KEYS.has(e.key)) {
    e.preventDefault();
    const current = state.get().activeSentenceIndex;
    if (current < 0) return;
    const prev = Math.max(current - 1, 0);
    if (prev !== current) onSentenceClick(prev);
  }
});

// --- Hash-based navigation ---
window.addEventListener('hashchange', () => {
  const route = getRouteFromHash();
  if (route.view === 'input') {
    if (!state.getActiveText()) return; // already on input view
    leavePracticeView();
  } else if (route.view === 'practice' && route.textId) {
    leavePracticeView();
    state.setActiveTextId(route.textId);
    const active = state.getActiveText();
    if (active) {
      sentences = parseSentences(active.text);
      enterPracticeView(active.text);
    } else {
      setHash('#/');
    }
  }
});

// --- Init ---
init();
