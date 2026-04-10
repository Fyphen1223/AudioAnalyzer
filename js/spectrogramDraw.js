export async function drawTextToAudioBuffer(audioCtx, text) {
  const minFreq = 1000;
  const maxFreq = 15000;
  const colDuration = 0.05; // 50ms per column
  const sampleRate = audioCtx.sampleRate;

  // Use a canvas to draw the text
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  // Set font
  ctx.font = "bold 40px sans-serif";
  const metrics = ctx.measureText(text);
  const textWidth = Math.ceil(metrics.width) || 1;
  // Let's add some padding
  const width = textWidth + 10;
  const height = 50; // number of frequency bins (pixels)

  canvas.width = width;
  canvas.height = height;

  // Background black, text white
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "white";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 5, height / 2);

  const imgData = ctx.getImageData(0, 0, width, height).data;

  const numSamples = Math.floor(width * colDuration * sampleRate);

  // To avoid blocking the main thread too long, we could use OfflineAudioContext
  // but direct array math is very fast for short sounds.
  const buffer = audioCtx.createBuffer(1, numSamples, sampleRate);
  const channel = buffer.getChannelData(0);

  // Pre-calculate frequencies for each row (logarithmic or linear spacing)
  // Linear looks better for text on a linear spectrogram,
  // but if the user uses a log spectrogram, it will be distorted.
  // We will assume linear spectrogram visually, so linear frequencies mapping.
  const rowFreqs = [];
  for (let y = 0; y < height; y++) {
    // 0 is top (maxFreq), height-1 is bottom (minFreq)
    const freq = maxFreq - (y / (height - 1)) * (maxFreq - minFreq);
    rowFreqs.push(freq);
  }

  for (let x = 0; x < width; x++) {
    const sampleStart = Math.floor(x * colDuration * sampleRate);
    const sampleEnd = Math.floor((x + 1) * colDuration * sampleRate);
    const colSamples = sampleEnd - sampleStart;

    // Active rows in this column
    const activeRows = [];
    for (let y = 0; y < height; y++) {
      const idx = (y * width + x) * 4;
      const r = imgData[idx]; // red channel
      // if lit pixel
      if (r > 128) {
        activeRows.push(y);
      }
    }

    if (activeRows.length > 0) {
      // Normalize amplitude so we don't clip when many pixels are active
      const amplitude = 0.5 / Math.sqrt(activeRows.length);
      for (let y of activeRows) {
        const f = rowFreqs[y];
        for (let i = sampleStart; i < sampleEnd; i++) {
          if (i >= numSamples) break;
          const t = i / sampleRate;

          // Apply a gentle sine envelope per pixel-column to avoid clicks
          const localI = i - sampleStart;
          const env = Math.sin((localI / colSamples) * Math.PI);

          channel[i] += amplitude * env * Math.sin(2 * Math.PI * f * t);
        }
      }
    }
  }

  return { buffer, duration: numSamples / sampleRate };
}
