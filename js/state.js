const STORAGE_KEY = 'dutch-practice';

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
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
    text: stored?.text || '',
    sentenceProgress: stored?.sentenceProgress || [],
    // Runtime-only (not persisted)
    activeSentenceIndex: -1,
    phase: 'idle', // idle | playing-original | beeping | recording | playing-user
    userRecording: null, // Blob
  };

  return {
    get: () => state,

    setApiKey(key) {
      state.apiKey = key;
      this.persist();
    },

    setText(text, sentenceCount) {
      state.text = text;
      state.sentenceProgress = Array.from({ length: sentenceCount }, () => ({ loopCount: 0 }));
      state.activeSentenceIndex = -1;
      state.phase = 'idle';
      state.userRecording = null;
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
      if (state.sentenceProgress[index]) {
        state.sentenceProgress[index].loopCount++;
        this.persist();
      }
    },

    setUserRecording(blob) {
      state.userRecording = blob;
    },

    persist() {
      save({
        apiKey: state.apiKey,
        text: state.text,
        sentenceProgress: state.sentenceProgress,
      });
    },

    clear() {
      localStorage.removeItem(STORAGE_KEY);
    },
  };
}
