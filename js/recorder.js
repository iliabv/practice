const MAX_RECORDING_MS = 30000;

let mediaRecorder = null;
let chunks = [];
let resolveRecording = null;
let recordingTimer = null;
/**
 * Acquire the microphone and start recording immediately.
 * Call this early (e.g. during the beep) so the mic is already "hot"
 * by the time the user needs to speak.
 */
export async function startRecording() {
  const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

  return new Promise((resolve) => {
    resolveRecording = resolve;
    chunks = [];
    mediaRecorder = new MediaRecorder(stream, { mimeType });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(chunks, { type: mimeType });
      if (resolveRecording) {
        resolveRecording(blob);
        resolveRecording = null;
      }
    };

    mediaRecorder.start();
    recordingTimer = setTimeout(() => stopRecording(), MAX_RECORDING_MS);
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
