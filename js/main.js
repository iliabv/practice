import { parseSentences } from './sentence-parser.js';
import { createState } from './state.js';
import { textToSpeech, textToSpeechWithTimestamps, VOICES, LANGUAGES } from './elevenlabs.js';
import { startRecording, stopRecording } from './recorder.js';
import { playBlob, stopPlayback, getAudioContext, getAudioContextSync } from './audio-utils.js';
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
const pa = {
  source: null,       // AudioBufferSourceNode
  buffer: null,       // decoded AudioBuffer
  startTime: 0,       // ctx.currentTime when playback started
  offset: 0,          // offset into buffer (for pause/resume)
  rafId: null,
  sentenceTimes: [],  // array of { start, end } from alignment data
};

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

/** Populate a <select> element with options from a { value, label } array. */
function populateSelect(selectEl, items, selectedValue) {
  for (const { value, label } of items) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    selectEl.appendChild(opt);
  }
  selectEl.value = selectedValue;
}

// --- Restore persisted state ---
function init() {
  const s = state.get();
  els.apiKeyInput.value = s.apiKey;
  populateSelect(els.voiceSelect, VOICES.map(v => ({ value: v.id, label: v.name })), s.voiceId);
  populateSelect(els.languageSelect, LANGUAGES.map(l => ({ value: l.code, label: l.name })), s.languageCode);
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
  cancelActiveLoop();
  state.clearActiveText();
  sentences = [];
  showInputView('');
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

  // Cancel any in-flight loop before selecting new sentence
  stopPlayback();
  if (s.phase === 'recording') stopRecording();
  resolveRecordTrigger = null;
  loopGeneration++;

  state.setActiveSentence(index);
  setActiveSentence(index);
  updatePlayer();
}

/** Cancel any in-flight loop, stop audio/recording, and clear inline player. */
function cancelActiveLoop() {
  stopPlayback();
  if (state.get().phase === 'recording') stopRecording();
  resolveRecordTrigger = null;
  loopGeneration++;
  state.setActiveSentence(-1);
  setActiveSentence(-1);
  clearPlayer();
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

    // 3. Play user's recording back (delay lets Bluetooth switch from HFP to A2DP)
    state.setUserRecording(userBlob);
    state.setPhase('playing-user');
    updatePlayer();
    await new Promise(r => setTimeout(r, 500));
    if (cancelled()) return;
    await playBlob(userBlob);
    if (cancelled()) return;

    // 4. Play original again
    state.setPhase('playing-original');
    updatePlayer();
    await new Promise(r => setTimeout(r, 500));
    if (cancelled()) return;
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
  const playerOpen = !els.inlinePlayer.classList.contains('hidden');

  if (playerOpen) {
    stopPlayback();
    if (state.get().phase === 'recording') stopRecording();
    resolveRecordTrigger = null;
    loopGeneration++;
    state.setPhase('idle');
    clearPlayer();
    return;
  }

  if (state.get().activeSentenceIndex >= 0) {
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

/** Build sentence time ranges from alignment character data. */
function buildSentenceTimes(alignment) {
  const fullText = sentences.join(' ');
  const { characters, character_start_times_seconds, character_end_times_seconds } = alignment;
  const times = [];
  let charPos = 0; // position in fullText

  for (const sentence of sentences) {
    const sentenceStart = charPos;
    const sentenceEnd = charPos + sentence.length;
    let start = Infinity;
    let end = 0;

    for (let i = 0; i < characters.length; i++) {
      // Map alignment character index to position in fullText
      // The alignment characters array corresponds to the full text
      if (i >= sentenceStart && i < sentenceEnd) {
        start = Math.min(start, character_start_times_seconds[i]);
        end = Math.max(end, character_end_times_seconds[i]);
      }
    }

    if (start === Infinity) start = end;
    times.push({ start, end });
    charPos = sentenceEnd + 1; // +1 for the joining space
  }
  return times;
}

/** Find which sentence index corresponds to a playback time. */
function findSentenceAtTime(currentTime, sentenceTimes) {
  for (let i = 0; i < sentenceTimes.length; i++) {
    if (currentTime < sentenceTimes[i].end) return i;
  }
  return sentenceTimes.length - 1;
}

function playAllCurrentTime() {
  if (!pa.source) return pa.offset;
  const ctx = getAudioContextSync();
  return pa.offset + (ctx.currentTime - pa.startTime);
}

function startPlayAllSource(offset) {
  const ctx = getAudioContextSync();
  const source = ctx.createBufferSource();
  source.buffer = pa.buffer;
  source.connect(ctx.destination);
  source.onended = () => {
    if (pa.source !== source) return;
    // Only stop if we actually reached the end (not paused/seeked)
    const elapsed = ctx.currentTime - pa.startTime;
    if (offset + elapsed >= pa.buffer.duration - 0.05) {
      stopPlayAll();
    }
  };
  pa.source = source;
  pa.startTime = ctx.currentTime;
  pa.offset = offset;
  source.start(0, offset);
}

async function playAll() {
  if (state.get().playingAll) {
    // Toggle pause/resume
    if (pa.source) {
      pausePlayAll();
    } else if (pa.buffer) {
      // Resume from paused offset
      cancelActiveLoop();
      await getAudioContext();
      startPlayAllSource(pa.offset);
      updateFullPlayerButton(true);
      startPlayAllTick();
    }
    return;
  }

  const s = state.get();
  const apiKey = s.apiKey;
  if (!apiKey) {
    showBanner('Please enter your ElevenLabs API key first.');
    return;
  }

  cancelActiveLoop();
  state.setPlayingAll(true);

  const fullText = sentences.join(' ');

  renderFullPlayerLoading();

  try {
    const { blob, alignment } = await textToSpeechWithTimestamps(fullText, apiKey, {
      voiceId: s.voiceId,
      speed: s.speed,
      languageCode: s.languageCode,
    });
    pa.sentenceTimes = buildSentenceTimes(alignment);

    if (!state.get().playingAll) return; // stopped while fetching

    const ctx = await getAudioContext();
    pa.buffer = await ctx.decodeAudioData(await blob.arrayBuffer());

    if (!state.get().playingAll) return;

    renderFullPlayer({
      playing: true,
      onPlayPause: playAll,
      onSeek: (fraction) => {
        if (!pa.buffer) return;
        const wasPlaying = !!pa.source;
        if (pa.source) {
          pa.source.onended = null;
          pa.source.stop();
          pa.source = null;
        }
        const newOffset = fraction * pa.buffer.duration;
        if (wasPlaying) {
          startPlayAllSource(newOffset);
        } else {
          pa.offset = newOffset;
        }
      },
    });

    startPlayAllSource(0);
    startPlayAllTick();
  } catch (err) {
    console.error(err);
    showBanner(err.message || 'An error occurred');
    stopPlayAll();
  }
}

function startPlayAllTick() {
  if (pa.rafId) cancelAnimationFrame(pa.rafId);
  const tick = () => {
    if (!state.get().playingAll || !pa.source) return;
    const ct = playAllCurrentTime();
    const dur = pa.buffer ? pa.buffer.duration : 0;
    updateFullPlayerProgress(ct, dur);
    if (dur > 0 && pa.sentenceTimes.length > 0) {
      const idx = findSentenceAtTime(ct, pa.sentenceTimes);
      setFullPlayingSentence(idx);
    }
    pa.rafId = requestAnimationFrame(tick);
  };
  pa.rafId = requestAnimationFrame(tick);
}

function pausePlayAll() {
  if (!pa.source) return;
  // Capture current position before stopping
  pa.offset = playAllCurrentTime();
  pa.source.onended = null;
  pa.source.stop();
  pa.source = null;
  if (pa.rafId) {
    cancelAnimationFrame(pa.rafId);
    pa.rafId = null;
  }
  setFullPlayingSentence(-1);
  updateFullPlayerButton(false);
}

function stopPlayAll() {
  if (pa.rafId) {
    cancelAnimationFrame(pa.rafId);
    pa.rafId = null;
  }
  if (pa.source) {
    pa.source.onended = null;
    pa.source.stop();
    pa.source = null;
  }
  pa.buffer = null;
  pa.offset = 0;
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

  const dir = NEXT_KEYS.has(e.key) ? 1 : PREV_KEYS.has(e.key) ? -1 : 0;
  if (dir) {
    e.preventDefault();
    const current = state.get().activeSentenceIndex;
    if (dir === -1 && current < 0) return;
    const target = current < 0 ? 0 : Math.max(0, Math.min(current + dir, sentences.length - 1));
    if (target !== current) onSentenceClick(target);
    return;
  }

  if (e.key === 't' || e.key === 'T' || e.key === 'h' || e.key === 'H') {
    e.preventDefault();
    toggleTextHidden();
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
