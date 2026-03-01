const MAX_RECORDING_MS = 30000;

let stream = null;
let mediaRecorder = null;
let chunks = [];
let resolveRecording = null;
let recordingTimer = null;

/**
 * Acquire the microphone once and keep it hot.
 * Call early (e.g. on entering practice view) so recordings start instantly.
 */
export async function ensurePipeline() {
  if (!stream) {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
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
 */
export async function startRecording() {
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

  mediaRecorder.start();
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
