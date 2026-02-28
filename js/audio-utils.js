let currentAudio = null;
let currentOscCtx = null;

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
 * Play a short beep via Web Audio API oscillator.
 * Returns a Promise that resolves when the beep finishes.
 */
export function playBeep(durationMs = 200, frequency = 880) {
  return new Promise((resolve) => {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    currentOscCtx = ctx;
    let settled = false;

    const done = () => {
      if (settled) return;
      settled = true;
      if (currentOscCtx === ctx) currentOscCtx = null;
      ctx.close().catch(() => {});
      resolve();
    };

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = frequency;
    gain.gain.value = 0.3;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + durationMs / 1000);
    osc.onended = done;
    // Fallback: Safari may not fire onended on OscillatorNode
    setTimeout(done, durationMs + 100);
  });
}

/**
 * Stop any currently playing audio or beep.
 * The Promises from playBlob/playBeep will hang (never resolve),
 * but that's fine — the caller uses a generation counter to abandon them.
 */
export function stopPlayback() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = '';
    currentAudio = null;
  }
  if (currentOscCtx) {
    currentOscCtx.close().catch(() => {});
    currentOscCtx = null;
  }
}
