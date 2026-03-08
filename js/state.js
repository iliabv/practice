import { updateSR, smartSort } from './spaced-repetition.js';

const STORAGE_KEY = 'dutch-practice';

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);

    // Migrate old format: { apiKey, text, sentenceProgress } → new format
    if (data.text !== undefined && data.texts === undefined) {
      const migrated = {
        apiKey: data.apiKey || '',
        activeTextId: null,
        texts: [],
      };
      if (data.text) {
        const id = generateId();
        migrated.texts.push({
          id,
          text: data.text,
          sentenceProgress: data.sentenceProgress || [],
          createdAt: Date.now(),
        });
        migrated.activeTextId = id;
      }
      return migrated;
    }

    return data;
  } catch {
    return null;
  }
}

function save(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function createState() {
  const stored = load();

  const state = {
    apiKey: stored?.apiKey || '',
    activeTextId: stored?.activeTextId || null,
    texts: stored?.texts || [],
    voiceName: stored?.voiceName || '',
    speed: stored?.speed ?? 1.0,
    languageCode: stored?.languageCode?.includes('-') ? stored.languageCode : 'nl-NL',
    textHidden: stored?.textHidden ?? false,
    holdMic: stored?.holdMic ?? false,
    savedWords: stored?.savedWords || [],
    lastHash: stored?.lastHash || null,
    // Runtime-only (not persisted)
    activeSentenceIndex: -1,
    phase: 'idle',
    userRecording: null,
    playingAll: false,
  };

  function resetRuntime() {
    state.activeSentenceIndex = -1;
    state.phase = 'idle';
    state.userRecording = null;
  }

  return {
    get: () => state,

    getActiveText() {
      if (!state.activeTextId) return null;
      return state.texts.find((t) => t.id === state.activeTextId) || null;
    },

    getTexts() {
      return state.texts;
    },

    setApiKey(key) {
      state.apiKey = key;
      this.persist();
    },

    setVoiceName(name) {
      state.voiceName = name;
      this.persist();
    },

    setSpeed(speed) {
      state.speed = speed;
      this.persist();
    },

    setLanguageCode(code) {
      state.languageCode = code;
      this.persist();
    },

    setTextHidden(hidden) {
      state.textHidden = hidden;
      this.persist();
    },

    setHoldMic(hold) {
      state.holdMic = hold;
      this.persist();
    },

    setLastHash(hash) {
      state.lastHash = hash;
      this.persist();
    },

    setText(text, sentenceCount) {
      // Reuse existing entry with same text
      let entry = state.texts.find((t) => t.text === text);
      if (entry) {
        // If sentence count changed, reset progress
        if (entry.sentenceProgress.length !== sentenceCount) {
          entry.sentenceProgress = Array.from({ length: sentenceCount }, () => ({ loopCount: 0 }));
        }
      } else {
        entry = {
          id: generateId(),
          text,
          sentenceProgress: Array.from({ length: sentenceCount }, () => ({ loopCount: 0 })),
          createdAt: Date.now(),
        };
        state.texts.push(entry);
      }
      state.activeTextId = entry.id;
      resetRuntime();
      this.persist();
    },

    setActiveTextId(id) {
      state.activeTextId = id;
      resetRuntime();
      this.persist();
    },

    clearActiveText() {
      state.activeTextId = null;
      resetRuntime();
      this.persist();
    },

    deleteText(id) {
      state.texts = state.texts.filter((t) => t.id !== id);
      if (state.activeTextId === id) {
        state.activeTextId = null;
      }
      this.persist();
    },

    setActiveSentence(index) {
      resetRuntime();
      state.activeSentenceIndex = index;
    },

    setPhase(phase) {
      state.phase = phase;
    },

    incrementLoop(index) {
      const active = this.getActiveText();
      if (active?.sentenceProgress[index]) {
        active.sentenceProgress[index].loopCount++;
        this.persist();
      }
    },

    setPlayingAll(playing) {
      state.playingAll = playing;
    },

    setUserRecording(blob) {
      state.userRecording = blob;
    },

    // --- Saved words ---

    saveWord({ word, sentence, translation, languageCode, voiceName, speed }) {
      const entry = {
        id: generateId(),
        word,
        wordLower: word.toLowerCase(),
        sentence,
        translation,
        languageCode,
        voiceName,
        speed,
        createdAt: Date.now(),
        practices: [],
        easeFactor: 2.5,
        interval: 1,
        nextDue: 0,
      };
      state.savedWords.push(entry);
      this.persist();
      return entry;
    },

    deleteWord(id) {
      state.savedWords = state.savedWords.filter(w => w.id !== id);
      this.persist();
    },

    isWordSaved(word, sentence) {
      const lower = word.toLowerCase();
      return state.savedWords.some(w => w.wordLower === lower && w.sentence === sentence);
    },

    getSavedWord(word, sentence) {
      const lower = word.toLowerCase();
      return state.savedWords.find(w => w.wordLower === lower && w.sentence === sentence) || null;
    },

    recordPractice(wordId, correct) {
      const word = state.savedWords.find(w => w.id === wordId);
      if (!word) return;
      word.practices.push({ at: Date.now(), correct });
      const sr = updateSR(word, correct);
      word.easeFactor = sr.easeFactor;
      word.interval = sr.interval;
      word.nextDue = sr.nextDue;
      this.persist();
    },

    getSavedWords() {
      return state.savedWords;
    },

    getSavedWordsSorted(mode) {
      if (mode === 'smart') return smartSort(state.savedWords);
      // 'recent' — newest first
      return [...state.savedWords].sort((a, b) => b.createdAt - a.createdAt);
    },

    persist() {
      save({
        apiKey: state.apiKey,
        activeTextId: state.activeTextId,
        texts: state.texts,
        voiceName: state.voiceName,
        speed: state.speed,
        languageCode: state.languageCode,
        textHidden: state.textHidden,
        holdMic: state.holdMic,
        savedWords: state.savedWords,
        lastHash: state.lastHash,
      });
    },

    clear() {
      localStorage.removeItem(STORAGE_KEY);
    },
  };
}
