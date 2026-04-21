function drawGrid(ctx, w, h) {
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, h / 2);
  ctx.lineTo(w, h / 2);
  ctx.stroke();
}

function estimateRt60Ms(buffer, sampleRate, peakIndex, peakValue) {
  if (!buffer || !sampleRate || peakValue <= 0) return null;
  const threshold = peakValue * 0.001; // -60 dB
  for (let i = peakIndex; i < buffer.length; i++) {
    if (Math.abs(buffer[i]) <= threshold) {
      return ((i - peakIndex) / sampleRate) * 1000;
    }
  }
  return null;
}

export function drawImpulseViewer({ state, dom, frame }) {
  const { ctxImpulse, canvasImpulse } = dom;
  if (!ctxImpulse || !canvasImpulse) return;

  const w = canvasImpulse.width / (window.devicePixelRatio || 1);
  const h = canvasImpulse.height / (window.devicePixelRatio || 1);
  if (w <= 0 || h <= 0) return;

  const impulse = state.impulse;

  if (impulse.captureRequested && frame.timeData && state.audioCtx) {
    impulse.captureRequested = false;
    impulse.capturedAt = Date.now();
    const src = frame.timeData;
    let peak = 0;
    let peakIndex = 0;
    for (let i = 0; i < src.length; i++) {
      const v = Math.abs(src[i]);
      if (v > peak) {
        peak = v;
        peakIndex = i;
      }
    }

    if (peak > 0.06) {
      const pre = Math.min(256, peakIndex);
      const post = Math.min(src.length - peakIndex - 1, 2048);
      const start = Math.max(0, peakIndex - pre);
      const end = Math.min(src.length, peakIndex + post);
      impulse.buffer = src.slice(start, end);
      impulse.peak = peak;
      impulse.rt60Ms = estimateRt60Ms(
        impulse.buffer,
        state.audioCtx.sampleRate,
        pre,
        peak,
      );
    } else {
      impulse.buffer = null;
      impulse.peak = 0;
      impulse.rt60Ms = null;
    }
  }

  ctxImpulse.clearRect(0, 0, w, h);
  ctxImpulse.fillStyle = "rgb(10, 15, 20)";
  ctxImpulse.fillRect(0, 0, w, h);
  drawGrid(ctxImpulse, w, h);

  const buffer = impulse.buffer || frame.timeData;
  if (!buffer || buffer.length < 2) return;

  ctxImpulse.strokeStyle = "#e2e8f0";
  ctxImpulse.lineWidth = 1.2;
  ctxImpulse.beginPath();
  for (let i = 0; i < buffer.length; i++) {
    const x = (i / (buffer.length - 1)) * w;
    const y = h / 2 - buffer[i] * (h * 0.45);
    if (i === 0) ctxImpulse.moveTo(x, y);
    else ctxImpulse.lineTo(x, y);
  }
  ctxImpulse.stroke();

  if (dom.impulseStatus) {
    if (impulse.buffer) {
      dom.impulseStatus.textContent = `Captured (${(impulse.peak * 100).toFixed(1)}% peak)`;
    } else if (impulse.capturedAt) {
      dom.impulseStatus.textContent = "No strong transient detected";
    } else {
      dom.impulseStatus.textContent = "Waiting";
    }
  }
  if (dom.impulseRt60) {
    dom.impulseRt60.textContent =
      impulse.rt60Ms != null ? `${impulse.rt60Ms.toFixed(1)} ms` : "--";
  }
}
