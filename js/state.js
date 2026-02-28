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
    voiceId: stored?.voiceId || 'EXAVITQu4vr4xnSDxMaL',
    speed: stored?.speed ?? 1.0,
    languageCode: stored?.languageCode || 'auto',
    // Runtime-only (not persisted)
    activeSentenceIndex: -1,
    phase: 'idle',
    userRecording: null,
  };

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

    setVoiceId(id) {
      state.voiceId = id;
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
      state.activeSentenceIndex = -1;
      state.phase = 'idle';
      state.userRecording = null;
      this.persist();
    },

    setActiveTextId(id) {
      state.activeTextId = id;
      state.activeSentenceIndex = -1;
      state.phase = 'idle';
      state.userRecording = null;
      this.persist();
    },

    clearActiveText() {
      state.activeTextId = null;
      state.activeSentenceIndex = -1;
      state.phase = 'idle';
      state.userRecording = null;
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
      state.activeSentenceIndex = index;
      state.phase = 'idle';
      state.userRecording = null;
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

    setUserRecording(blob) {
      state.userRecording = blob;
    },

    persist() {
      save({
        apiKey: state.apiKey,
        activeTextId: state.activeTextId,
        texts: state.texts,
        voiceId: state.voiceId,
        speed: state.speed,
        languageCode: state.languageCode,
      });
    },

    clear() {
      localStorage.removeItem(STORAGE_KEY);
    },
  };
}
