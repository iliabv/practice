let mediaRecorder = null;
let chunks = [];
let resolveRecording = null;
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
  });
}

/**
 * Stop the current recording. The Promise from startRecording() will resolve with the Blob.
 */
export function stopRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
  }
}
