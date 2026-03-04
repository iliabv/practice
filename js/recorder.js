const MAX_RECORDING_MS = 30000;

let stream = null;
let audioCtx = null;
let workletReady = false;
let sourceNode = null;
let workletNode = null;
let chunks = [];
let resolveRecording = null;
let recordingTimer = null;

/**
 * Acquire the microphone and prepare the AudioWorklet.
 */
export async function ensurePipeline() {
  if (!stream) {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  }
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }
  if (!workletReady) {
    await audioCtx.audioWorklet.addModule('js/recorder-worklet.js');
    workletReady = true;
  }
}

/** Release the microphone stream and close AudioContext. */
export function releasePipeline() {
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
  if (audioCtx) {
    audioCtx.close();
    audioCtx = null;
    workletReady = false;
  }
}

/**
 * Start recording from the already-hot mic stream.
 * Returns a Promise that resolves with a WAV audio Blob when stopped.
 * @param {object} [opts]
 * @param {function} [opts.onReady] - called after mic is warm and recording has started
 */
export async function startRecording({ onReady } = {}) {
  await ensurePipeline();

  chunks = [];
  sourceNode = audioCtx.createMediaStreamSource(stream);
  workletNode = new AudioWorkletNode(audioCtx, 'recorder-processor');

  workletNode.port.onmessage = (e) => {
    chunks.push(e.data);
  };

  sourceNode.connect(workletNode);
  // Don't connect workletNode to destination — we don't want to hear the mic

  onReady?.();
  recordingTimer = setTimeout(() => stopRecording(), MAX_RECORDING_MS);

  return new Promise((resolve) => {
    resolveRecording = resolve;
  });
}

/**
 * Stop the current recording. The Promise from startRecording() will resolve with the WAV Blob.
 */
export function stopRecording() {
  if (recordingTimer) {
    clearTimeout(recordingTimer);
    recordingTimer = null;
  }
  if (workletNode) {
    workletNode.port.postMessage('stop');
    sourceNode.disconnect();
    workletNode.disconnect();
    sourceNode = null;
    workletNode = null;
  }
  if (resolveRecording) {
    const blob = encodeWav(chunks, audioCtx.sampleRate);
    resolveRecording(blob);
    resolveRecording = null;
  }
}

/**
 * Encode Float32 PCM chunks into a WAV Blob (mono, 16-bit).
 */
function encodeWav(float32Chunks, sampleRate) {
  const numChannels = 1;
  const bitsPerSample = 16;

  // Calculate total sample count
  let totalSamples = 0;
  for (const chunk of float32Chunks) totalSamples += chunk.length;

  const dataBytes = totalSamples * (bitsPerSample / 8);
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeString(view, 8, 'WAVE');

  // fmt sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);                          // sub-chunk size
  view.setUint16(20, 1, true);                           // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true); // byte rate
  view.setUint16(32, numChannels * (bitsPerSample / 8), true);              // block align
  view.setUint16(34, bitsPerSample, true);

  // data sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataBytes, true);

  // Write PCM samples (float32 → int16)
  let offset = 44;
  for (const chunk of float32Chunks) {
    for (let i = 0; i < chunk.length; i++) {
      const s = Math.max(-1, Math.min(1, chunk[i]));
      view.setInt16(offset, s * 0x7FFF, true);
      offset += 2;
    }
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

function writeString(view, offset, str) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
