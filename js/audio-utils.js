let currentAudio = null;

/**
 * Play an audio Blob. Returns a Promise that resolves when playback ends.
 */
export function playBlob(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    currentAudio = audio;
    let settled = false;

    const done = () => {
      if (settled) return;
      settled = true;
      if (currentAudio === audio) currentAudio = null;
      URL.revokeObjectURL(url);
      resolve();
    };

    const fail = (e) => {
      if (settled) return;
      settled = true;
      if (currentAudio === audio) currentAudio = null;
      URL.revokeObjectURL(url);
      reject(e);
    };

    audio.onended = done;
    // Fallback: some browsers fire 'pause' instead of 'ended' for blob URLs
    audio.onpause = () => {
      if (audio.currentTime > 0 && audio.duration > 0
          && audio.currentTime >= audio.duration - 0.05) {
        done();
      }
    };
    audio.onerror = fail;
    audio.play().catch(fail);
  });
}

/**
 * Stop any currently playing audio.
 * The Promise from playBlob will hang (never resolve),
 * but that's fine — the caller uses a generation counter to abandon them.
 */
export function stopPlayback() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = '';
    currentAudio = null;
  }
}
