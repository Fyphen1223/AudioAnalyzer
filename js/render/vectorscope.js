export function drawVectorscope({ state, dom }) {
  if (
    !dom.ctxVectorscope ||
    !dom.canvasVectorscope ||
    !state.analyserL ||
    !state.analyserR
  ) {
    return;
  }

  const wVec = state.config.wVec;
  const hVec = state.config.hVec;

  if (wVec === 0 || hVec === 0) return;

  dom.ctxVectorscope.fillStyle = "rgba(10, 15, 20, 0.2)";
  dom.ctxVectorscope.fillRect(0, 0, wVec, hVec);
  dom.ctxVectorscope.strokeStyle = "rgba(226, 232, 240, 0.8)";
  dom.ctxVectorscope.lineWidth = 1;

  dom.ctxVectorscope.fillStyle = "rgba(226, 232, 240, 0.5)";
  dom.ctxVectorscope.font = "12px monospace";
  dom.ctxVectorscope.textAlign = "center";
  dom.ctxVectorscope.textBaseline = "middle";
  dom.ctxVectorscope.fillText("M", wVec / 2, 12);
  dom.ctxVectorscope.fillText("-", wVec / 2, hVec - 12);
  dom.ctxVectorscope.fillText("L", 12, hVec / 2);
  dom.ctxVectorscope.fillText("R", wVec - 12, hVec / 2);

  if (
    !state.timeLBuffer ||
    state.timeLBuffer.length !== state.analyserL.fftSize
  ) {
    state.timeLBuffer = new Float32Array(state.analyserL.fftSize);
  }
  const timeL = state.timeLBuffer;

  if (
    !state.timeRBuffer ||
    state.timeRBuffer.length !== state.analyserR.fftSize
  ) {
    state.timeRBuffer = new Float32Array(state.analyserR.fftSize);
  }
  const timeR = state.timeRBuffer;

  state.analyserL.getFloatTimeDomainData(timeL);
  state.analyserR.getFloatTimeDomainData(timeR);

  dom.ctxVectorscope.beginPath();
  const wCenter = wVec / 2;
  const hCenter = hVec / 2;

  let dot = 0;
  let normL = 0;
  let normR = 0;

  let lastPx = -1;
  let lastPy = -1;

  for (let i = 0; i < timeL.length; i++) {
    const l = timeL[i];
    const r = timeR[i];

    const px = wCenter + (r - l) * (wVec / 2);
    const py = hCenter - (l + r) * (hVec / 2);

    const ipx = Math.floor(px);
    const ipy = Math.floor(py);

    if (i === 0) {
      dom.ctxVectorscope.moveTo(px, py);
      lastPx = ipx;
      lastPy = ipy;
    } else {
      if (ipx !== lastPx || ipy !== lastPy) {
        dom.ctxVectorscope.lineTo(px, py);
        lastPx = ipx;
        lastPy = ipy;
      }
    }

    dot += l * r;
    normL += l * l;
    normR += r * r;
  }
  dom.ctxVectorscope.stroke();

  if (dom.correlationValue && dom.correlationFill) {
    let corr = 0;
    if (normL > 0 && normR > 0) {
      corr = dot / Math.sqrt(normL * normR);
    } else if (normL > 0 || normR > 0) {
      corr = 0;
    } else {
      corr = 1;
    }

    const textCorr = corr.toFixed(2);
    if (dom.correlationValue.textContent !== textCorr) {
      dom.correlationValue.textContent = textCorr;
    }

    const corrPercent = ((corr + 1) / 2) * 100;
    const corrWidth = `${Math.min(100, Math.max(0, corrPercent))}%`;
    if (dom.correlationFill.style.width !== corrWidth) {
      dom.correlationFill.style.width = corrWidth;
    }

    const hue = (corr + 1) * 60;
    const color = `hsl(${hue}, 100%, 40%)`;
    if (dom.correlationFill.style.backgroundColor !== color) {
      dom.correlationFill.style.backgroundColor = color;
    }
  }
}
