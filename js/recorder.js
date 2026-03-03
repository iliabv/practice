const MAX_RECORDING_MS = 30000;

let stream = null;
let mediaRecorder = null;
let chunks = [];
let resolveRecording = null;
let recordingTimer = null;

/**
 * Acquire the microphone once and keep it hot.
 */
export async function ensurePipeline() {
  if (!stream) {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  }
}

/** Release the microphone stream so the browser indicator turns off. */
export function releasePipeline() {
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
}

/**
 * Start recording from the already-hot mic stream.
 * Returns a Promise that resolves with the audio Blob when stopped.
 * @param {object} [opts]
 * @param {function} [opts.onReady] - called after mic is warm and recording has started
 */
export async function startRecording({ onReady } = {}) {
  await ensurePipeline();

  const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
  chunks = [];
  mediaRecorder = new MediaRecorder(stream, { mimeType });

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  mediaRecorder.onstop = () => {
    const blob = new Blob(chunks, { type: mimeType });
    if (resolveRecording) {
      resolveRecording(blob);
      resolveRecording = null;
    }
  };

  mediaRecorder.start(1000);
  onReady?.();
  recordingTimer = setTimeout(() => stopRecording(), MAX_RECORDING_MS);

  return new Promise((resolve) => {
    resolveRecording = resolve;
  });
}

/**
 * Stop the current recording. The Promise from startRecording() will resolve with the Blob.
 */
export function stopRecording() {
  if (recordingTimer) {
    clearTimeout(recordingTimer);
    recordingTimer = null;
  }
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
  }
}
