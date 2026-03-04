class RecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.recording = true;
    this.port.onmessage = (e) => {
      if (e.data === 'stop') this.recording = false;
    };
  }

  process(inputs) {
    if (!this.recording) return false;
    const input = inputs[0];
    if (input.length > 0) {
      // Copy the first channel's samples and send to main thread
      this.port.postMessage(new Float32Array(input[0]));
    }
    return true;
  }
}

registerProcessor('recorder-processor', RecorderProcessor);
