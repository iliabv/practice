import { parseSentences } from './sentence-parser.js';
import { createState } from './state.js';
import { textToSpeech } from './elevenlabs.js';
import { startRecording, stopRecording } from './recorder.js';
import { playBlob, playBeep, stopPlayback } from './audio-utils.js';
import {
  els, showBanner, hideBanner,
  showInputView, showPracticeView,
  renderSentences, setActiveSentence, updateSentenceColor,
  renderPlayer, clearPlayer,
} from './ui.js';

const state = createState();
let sentences = [];
let loopGeneration = 0;

// --- Restore persisted state ---
function init() {
  const s = state.get();
  els.apiKeyInput.value = s.apiKey;

  if (s.text && s.sentenceProgress.length > 0) {
    sentences = parseSentences(s.text);
    if (sentences.length === s.sentenceProgress.length) {
      enterPracticeView(s.text);
      return;
    }
  }
  showInputView(s.text);
}

// --- API key ---
els.apiKeyInput.addEventListener('input', () => {
  state.setApiKey(els.apiKeyInput.value.trim());
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
  enterPracticeView(text);
});

// --- Back button ---
els.backBtn.addEventListener('click', () => {
  stopPlayback();
  stopRecording();
  loopGeneration++;
  showInputView(state.get().text);
  clearPlayer();
  state.setActiveSentence(-1);
});

function enterPracticeView(text) {
  els.textInput.value = text;
  showPracticeView();
  renderSentences(sentences, state.get().sentenceProgress, onSentenceClick);
  clearPlayer();
}

// --- Sentence click ---
function onSentenceClick(index) {
  const s = state.get();
  if (s.activeSentenceIndex === index) return;

  // Stop any in-flight audio and recording
  stopPlayback();
  if (s.phase === 'recording') {
    stopRecording();
  }

  // Cancel any in-flight loop by bumping a generation counter
  loopGeneration++;

  state.setActiveSentence(index);
  setActiveSentence(index);
  updatePlayer();
}

// --- Play/Stop button ---
function onPlayStop() {
  const s = state.get();
  if (s.phase === 'recording') {
    stopRecording();
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
    // 1. Play original
    state.setPhase('playing-original');
    updatePlayer();
    const audioBlob = await textToSpeech(sentenceText, apiKey);
    if (cancelled()) return;
    await playBlob(audioBlob);
    if (cancelled()) return;

    // 2 + 3. Start recording + beep simultaneously so mic is "hot" immediately
    state.setPhase('recording');
    updatePlayer();
    const recordingPromise = startRecording();
    await playBeep();
    if (cancelled()) { stopRecording(); return; }
    const userBlob = await recordingPromise;
    if (cancelled()) { stopRecording(); return; }

    // 4. End-recording beep
    state.setUserRecording(userBlob);
    state.setPhase('beeping');
    updatePlayer();
    await playBeep(200, 660);
    if (cancelled()) return;

    // 5. Play user's recording back
    state.setPhase('playing-user');
    updatePlayer();
    await playBlob(userBlob);
    if (cancelled()) return;

    // 6. Play original again
    state.setPhase('playing-original');
    updatePlayer();
    await playBlob(audioBlob);
    if (cancelled()) return;

    // Done
    state.incrementLoop(index);
    state.setPhase('idle');
    updateSentenceColor(index, s.sentenceProgress[index].loopCount);
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

function updatePlayer() {
  const s = state.get();
  if (s.activeSentenceIndex < 0) {
    clearPlayer();
    return;
  }
  const progress = s.sentenceProgress[s.activeSentenceIndex];
  renderPlayer({
    phase: s.phase,
    loopCount: progress?.loopCount || 0,
    onPlay: onPlayStop,
  });
}

// --- Keyboard shortcuts ---
const NEXT_KEYS = new Set(['Enter', 'ArrowDown', 'ArrowRight']);
const PREV_KEYS = new Set(['Backspace', 'Delete', 'ArrowUp', 'ArrowLeft']);

document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (sentences.length === 0) return;

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

  if (PREV_KEYS.has(e.key)) {
    e.preventDefault();
    const current = state.get().activeSentenceIndex;
    if (current < 0) return;
    const prev = Math.max(current - 1, 0);
    if (prev !== current) onSentenceClick(prev);
  }
});

// --- Init ---
init();
