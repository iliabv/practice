import { parseSentences } from './sentence-parser.js';
import { createState } from './state.js';
import { textToSpeech, textToSpeechWithTimestamps, fetchVoices, LANGUAGES } from './tts.js';
import { startRecording, stopRecording, ensurePipeline, releasePipeline } from './recorder.js';
import { playBlob, stopPlayback, getAudioContext, getAudioContextSync } from './audio-utils.js';
import {
  els, showBanner, hideBanner,
  showInputView, showPracticeView,
  renderSentences, setActiveSentence, updateSentenceColor,
  renderPlayer, clearPlayer, renderHistory, setTextHidden, setHoldMic, setSentenceRevealed,
  renderFullPlayerIdle, renderFullPlayerLoading, renderFullPlayer, updateFullPlayerProgress, updateFullPlayerButton,
  clearFullPlayer, setFullPlayingSentence,
  enableWordInteraction, disableWordInteraction,
  showWordPopup, hideWordPopup,
  showWordsView, hideWordsView, renderWordPractice,
} from './ui.js';
import { translateText } from './translate.js';

const state = createState();
let sentences = [];
let lineBreaks = new Map();
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
  if (hash === '#/words') {
    return { view: 'words', textId: null };
  }
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
    // Auto-select first voice if current selection is empty or not in list
    if (!s.voiceName || !voices.some(v => v.name === s.voiceName)) {
      const first = voices[0]?.name || '';
      state.setVoiceName(first);
      els.voiceSelect.value = first;
    }
  } catch (err) {
    console.error('Failed to fetch voices:', err);
  }
}

// --- Restore persisted state ---
function init() {
  const s = state.get();
  els.apiKeyInput.value = s.apiKey;
  populateSelect(els.languageSelect, LANGUAGES.map(l => ({ value: l.code, label: l.name })), s.languageCode);
  els.speedRange.value = s.speed;
  els.speedValue.textContent = s.speed.toFixed(1);
  refreshVoices();

  // Try hash-driven resume, then fall back to state-driven resume
  const route = getRouteFromHash();

  if (route.view === 'words') {
    enterWordsView();
    return;
  }

  if (route.view === 'practice' && route.textId) {
    state.setActiveTextId(route.textId);
  }

  const active = state.getActiveText();
  if (active) {
    ({ sentences, lineBreaks } = parseSentences(active.text));
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
let apiKeyTimer;
els.apiKeyInput.addEventListener('input', () => {
  state.setApiKey(els.apiKeyInput.value.trim());
  clearTimeout(apiKeyTimer);
  apiKeyTimer = setTimeout(refreshVoices, 500);
});

// --- Voice selector ---
els.voiceSelect.addEventListener('change', () => {
  state.setVoiceName(els.voiceSelect.value);
});

// --- Language selector ---
els.languageSelect.addEventListener('change', () => {
  state.setLanguageCode(els.languageSelect.value);
  refreshVoices();
});

// --- Speed slider ---
els.speedRange.addEventListener('input', () => {
  const speed = parseFloat(els.speedRange.value);
  els.speedValue.textContent = speed.toFixed(1);
  state.setSpeed(speed);
});

// --- Allow Enter in textarea (prevent global keydown handler interference) ---
els.textInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') e.stopPropagation();
});

// --- Start button ---
els.startBtn.addEventListener('click', () => {
  const text = els.textInput.value.trim();
  if (!text) return;

  const apiKey = state.get().apiKey;
  if (!apiKey) {
    showBanner('Please enter your Google Cloud API key first.');
    return;
  }

  hideBanner();
  ({ sentences, lineBreaks } = parseSentences(text));
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

// --- Toggle hold mic ---
function toggleHoldMic() {
  const hold = !state.get().holdMic;
  state.setHoldMic(hold);
  setHoldMic(hold);
  if (hold) {
    ensurePipeline().catch(() => { });
  } else {
    releasePipeline();
  }
}

els.holdMicBtn.addEventListener('click', toggleHoldMic);

function leavePracticeView() {
  stopPlayAll();
  clearFullPlayer();
  cancelActiveLoop();
  releasePipeline();
  state.clearActiveText();
  sentences = [];
  lineBreaks = new Map();
  showInputView('');
  refreshHistory();
}

function enterPracticeView(text) {
  els.textInput.value = text;
  showPracticeView();
  const active = state.getActiveText();
  renderSentences(sentences, active.sentenceProgress, onSentenceClick, lineBreaks);
  setTextHidden(state.get().textHidden);
  setHoldMic(state.get().holdMic);
  clearPlayer();
  renderFullPlayerIdle(playAll);
}

// --- History handlers ---

function onHistoryDelete(id) {
  state.deleteText(id);
  refreshHistory();
}

// --- Word interaction state ---
let wordSortMode = 'recent';
let activeWordIndex = -1; // sentence index that has word interaction enabled

function dismissWordPopup() {
  hideWordPopup();
}

async function onWordClick(word, wordSpan, sentenceText) {
  const s = state.get();
  const isSaved = state.isWordSaved(word, sentenceText);

  const onSave = async () => {
    const savedWord = state.saveWord({
      word,
      sentence: sentenceText,
      translation: currentTranslation || '',
      languageCode: s.languageCode,
      voiceName: s.voiceName,
      speed: s.speed,
    });
    // Update popup to show delete button
    showWordPopup(wordSpan, {
      word,
      translation: currentTranslation || '',
      isSaved: true,
      onSave: null,
      onDelete: () => {
        state.deleteWord(savedWord.id);
        hideWordPopup();
      },
    });
  };

  const onDelete = () => {
    const saved = state.getSavedWord(word, sentenceText);
    if (saved) state.deleteWord(saved.id);
    hideWordPopup();
  };

  let currentTranslation = null;

  // Show popup with spinner while loading translation (save hidden until translation loads)
  showWordPopup(wordSpan, {
    word,
    translation: null,
    isSaved,
    onSave: null,
    onDelete,
  });

  // Fetch translation
  try {
    const sourceLang = s.languageCode.split('-')[0];
    currentTranslation = await translateText(word, s.apiKey, sourceLang);
    // Re-render popup with translation (if still visible)
    if (!els.wordPopup.classList.contains('hidden')) {
      const stillSaved = state.isWordSaved(word, sentenceText);
      showWordPopup(wordSpan, {
        word,
        translation: currentTranslation,
        isSaved: stillSaved,
        onSave,
        onDelete: () => {
          const saved = state.getSavedWord(word, sentenceText);
          if (saved) state.deleteWord(saved.id);
          hideWordPopup();
        },
      });
    }
  } catch (err) {
    console.error('Translation failed:', err);
    if (!els.wordPopup.classList.contains('hidden')) {
      const stillSaved = state.isWordSaved(word, sentenceText);
      showWordPopup(wordSpan, {
        word,
        translation: '(translation failed)',
        isSaved: stillSaved,
        onSave,
        onDelete: () => {
          const saved = state.getSavedWord(word, sentenceText);
          if (saved) state.deleteWord(saved.id);
          hideWordPopup();
        },
      });
    }
  }
}

// Click outside sentences/popups/player → close popups
// Use mousedown instead of click: captures target before popup re-renders on save
document.addEventListener('mousedown', (e) => {
  const target = e.target;
  if (target.closest('.sentence')) return;
  if (target.closest('.inline-player')) return;
  if (target.closest('.word-popup')) return;
  if (!els.wordPopup.classList.contains('hidden')) {
    hideWordPopup();
  }
  if (!els.inlinePlayer.classList.contains('hidden')) {
    abortLoop();
    state.setPhase('idle');
    clearPlayer();
  }
});

/** Stop any in-flight loop: halt audio/recording, bump generation, un-reveal text. */
function abortLoop() {
  const prev = state.get().activeSentenceIndex;
  stopPlayback();
  if (state.get().phase === 'recording' || state.get().phase === 'preparing') stopRecording();
  resolveRecordTrigger = null;
  loopGeneration++;
  if (prev >= 0) {
    setSentenceRevealed(prev, false);
    disableWordInteraction(prev);
  }
  hideWordPopup();
  activeWordIndex = -1;
}

// --- Sentence click ---
function onSentenceClick(index) {
  const s = state.get();
  if (s.playingAll) pausePlayAll();
  if (s.holdMic) ensurePipeline().catch(() => { });
  if (s.activeSentenceIndex === index) {
    updatePlayer();
    return;
  }

  // Disable word interaction on previous sentence
  if (activeWordIndex >= 0) {
    disableWordInteraction(activeWordIndex);
    activeWordIndex = -1;
  }
  hideWordPopup();

  abortLoop();
  state.setActiveSentence(index);
  setActiveSentence(index);
  updatePlayer();

  // Enable word interaction on new active sentence
  enableWordInteraction(index, onWordClick);
  activeWordIndex = index;
}

/** Cancel any in-flight loop, stop audio/recording, and clear inline player. */
function cancelActiveLoop() {
  abortLoop();
  state.setActiveSentence(-1);
  setActiveSentence(-1);
  clearPlayer();
  hideWordPopup();
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
      state.setPhase('preparing');
      updatePlayer();
      try {
        const blob = await startRecording({
          onReady() {
            if (cancelled()) return;
            state.setPhase('recording');
            updatePlayer();
          }
        });
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
  if (s.phase === 'recording' || s.phase === 'preparing') {
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
    showBanner('Please enter your Google Cloud API key first.');
    return;
  }

  // Helper: bail if the user switched sentences since this loop started
  const cancelled = () => gen !== loopGeneration;

  try {
    // 1. Fetch TTS audio, then play original
    state.setPhase('loading');
    updatePlayer();
    const audioBlob = await textToSpeech(sentenceText, apiKey, {
      voiceName: s.voiceName,
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

    // Release mic if not holding
    if (!state.get().holdMic) releasePipeline();

    // 3. Play user's recording back (delay lets Bluetooth switch from HFP to A2DP)
    state.setUserRecording(userBlob);
    state.setPhase('playing-user');
    updatePlayer();
    if (state.get().textHidden) setSentenceRevealed(index, true);
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
    setSentenceRevealed(index, false);

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

/** Escape handler: close popup first, then player, then deselect sentence. */
function onEscape() {
  // Close word popup first
  if (!els.wordPopup.classList.contains('hidden')) {
    hideWordPopup();
    return;
  }

  const playerOpen = !els.inlinePlayer.classList.contains('hidden');

  if (playerOpen) {
    abortLoop();
    state.setPhase('idle');
    clearPlayer();
    return;
  }

  if (state.get().activeSentenceIndex >= 0) {
    if (activeWordIndex >= 0) {
      disableWordInteraction(activeWordIndex);
      activeWordIndex = -1;
    }
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

/** Build sentence time ranges from Google TTS timepoints. */
function buildSentenceTimes(timepoints, sentenceList, duration) {
  // If we have valid timepoints, use them
  if (timepoints && timepoints.length > 0) {
    const times = [];
    for (let i = 0; i < sentenceList.length; i++) {
      const tp = timepoints.find(t => t.markName === `s${i}`);
      const nextTp = timepoints.find(t => t.markName === `s${i + 1}`);
      const start = tp ? parseFloat(tp.timeSeconds) : 0;
      const end = nextTp ? parseFloat(nextTp.timeSeconds) : duration;
      times.push({ start, end });
    }
    return times;
  }

  // Fallback: distribute proportionally by character count
  const totalChars = sentenceList.reduce((sum, s) => sum + s.length, 0);
  const times = [];
  let offset = 0;
  for (const s of sentenceList) {
    const len = (s.length / totalChars) * duration;
    times.push({ start: offset, end: offset + len });
    offset += len;
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
    showBanner('Please enter your Google Cloud API key first.');
    return;
  }

  cancelActiveLoop();
  state.setPlayingAll(true);

  renderFullPlayerLoading();

  try {
    const { blob, timepoints } = await textToSpeechWithTimestamps(sentences, apiKey, {
      voiceName: s.voiceName,
      speed: s.speed,
      languageCode: s.languageCode,
    });

    if (!state.get().playingAll) return; // stopped while fetching

    const ctx = await getAudioContext();
    pa.buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
    pa.sentenceTimes = buildSentenceTimes(timepoints, sentences, pa.buffer.duration);

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
    return;
  }

  if (e.key === 'm' || e.key === 'M') {
    e.preventDefault();
    toggleHoldMic();
  }
});

// --- Words view ---

function enterWordsView() {
  hideWordsView(); // reset
  cancelActiveLoop();
  stopPlayAll();
  clearFullPlayer();
  els.inputView.classList.add('hidden');
  els.practiceView.classList.add('hidden');
  showWordsView();
  renderWordCards();
}

function leaveWordsView() {
  hideWordsView();
}

function renderWordCards() {
  const words = state.getSavedWordsSorted(wordSortMode);
  renderWordPractice(words, {
    onCheck: (wordId, correct) => {
      state.recordPractice(wordId, correct);
    },
    onPlay: async (wordEntry) => {
      try {
        const blob = await textToSpeech(wordEntry.sentence, state.get().apiKey, {
          voiceName: wordEntry.voiceName,
          speed: wordEntry.speed,
          languageCode: wordEntry.languageCode,
        });
        await playBlob(blob);
      } catch (err) {
        console.error('TTS playback failed:', err);
        showBanner(err.message || 'Playback failed');
      }
    },
    onDelete: (id) => {
      state.deleteWord(id);
      renderWordCards();
    },
    sortMode: wordSortMode,
    onSortChange: (mode) => {
      wordSortMode = mode;
      renderWordCards();
    },
  });
}

// --- Hash-based navigation ---
window.addEventListener('hashchange', () => {
  const route = getRouteFromHash();
  if (route.view === 'words') {
    leaveWordsView(); // clean up if already in words
    if (state.getActiveText()) {
      // Coming from practice view
      stopPlayAll();
      clearFullPlayer();
      cancelActiveLoop();
      releasePipeline();
    }
    enterWordsView();
    return;
  }
  // Leaving words view if we were in it
  leaveWordsView();
  if (route.view === 'input') {
    if (!state.getActiveText()) return; // already on input view
    leavePracticeView();
  } else if (route.view === 'practice' && route.textId) {
    leavePracticeView();
    state.setActiveTextId(route.textId);
    const active = state.getActiveText();
    if (active) {
      ({ sentences, lineBreaks } = parseSentences(active.text));
      enterPracticeView(active.text);
    } else {
      setHash('#/');
    }
  }
});

// --- Init ---
init();
