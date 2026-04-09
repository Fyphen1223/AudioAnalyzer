let _lastWaveCacheKey = "";
let _xTimeCache = null;

export function drawWaveformAndMeter({ state, dom, frame }) {
  const { wWave, hWave, timeData } = frame;

  dom.ctxWaveform.clearRect(0, 0, wWave, hWave);

  dom.ctxWaveform.lineWidth = 2;
  dom.ctxWaveform.strokeStyle = "#e2e8f0";
  dom.ctxWaveform.beginPath();

  const fftSize = state.analyser.fftSize;
  const cacheKey = `${wWave}_${fftSize}`;

  if (_lastWaveCacheKey !== cacheKey) {
    _lastWaveCacheKey = cacheKey;
    _xTimeCache = new Float32Array(fftSize);
    const sliceWidth = wWave / fftSize;
    let xTime = 0;
    for (let i = 0; i < fftSize; i++) {
      _xTimeCache[i] = xTime;
      xTime += sliceWidth;
    }
  }

  let maxAbs = 0;
  let sumSquares = 0;

  let lastIx = -1;
  let minPixelY = hWave;
  let maxPixelY = 0;

  for (let i = 0; i < fftSize; i++) {
    const v = timeData[i];
    const y = (v * 0.5 + 0.5) * hWave;
    const xTime = _xTimeCache[i];
    const ix = Math.floor(xTime);

    const absV = Math.abs(v);
    if (absV > maxAbs) maxAbs = absV;
    sumSquares += v * v;

    if (ix === lastIx) {
      if (y < minPixelY) minPixelY = y;
      if (y > maxPixelY) maxPixelY = y;
    } else {
      if (lastIx !== -1) {
        if (Math.abs(minPixelY - maxPixelY) > 1) {
          dom.ctxWaveform.lineTo(lastIx, minPixelY);
          dom.ctxWaveform.lineTo(lastIx, maxPixelY);
          dom.ctxWaveform.lineTo(lastIx, y);
        } else {
          dom.ctxWaveform.lineTo(lastIx, y);
        }
      } else {
        dom.ctxWaveform.moveTo(xTime, y);
      }
      lastIx = ix;
      minPixelY = y;
      maxPixelY = y;
    }
  }

  if (lastIx !== -1) {
    if (Math.abs(minPixelY - maxPixelY) > 1) {
      dom.ctxWaveform.lineTo(lastIx, minPixelY);
      dom.ctxWaveform.lineTo(lastIx, maxPixelY);
    }
  }

  dom.ctxWaveform.lineTo(wWave, hWave / 2);
  dom.ctxWaveform.stroke();

  let currentPeakDb = -Infinity;
  const standard = state.config.meteringStandard || "peak";

  if (maxAbs > 0) {
    if (standard === "rms") {
      const rms = Math.sqrt(sumSquares / state.analyser.fftSize);
      currentPeakDb = 20 * Math.log10(rms);
    } else if (standard === "lufs") {
      const rms = Math.sqrt(sumSquares / state.analyser.fftSize);
      currentPeakDb = 20 * Math.log10(rms) + 3;
    } else {
      currentPeakDb = 20 * Math.log10(maxAbs);
    }
  }

  if (currentPeakDb > state.prevPeakValue) {
    state.prevPeakValue = currentPeakDb;
  } else {
    state.prevPeakValue -= 0.5;
  }

  let meterOffset = 0;
  if (standard === "k-12") {
    meterOffset = -12;
  } else if (standard === "k-14") {
    meterOffset = -14;
  } else if (standard === "k-20") {
    meterOffset = -20;
  }

  let displayDb = state.prevPeakValue - meterOffset;
  if (displayDb < -60) displayDb = -60;

  const meterPercent = Math.max(0, (displayDb + 60) / 60) * 100;
  const widthStr = Math.min(100, meterPercent) + "%";
  if (dom.peakFill.style.width !== widthStr) {
    dom.peakFill.style.width = widthStr;
  }

  let textContent = "-∞ dB";
  if (state.prevPeakValue > -100) {
    textContent =
      state.prevPeakValue.toFixed(1) +
      " dB" +
      (meterOffset ? ` (${standard})` : "");
  }

  if (dom.peakValue.textContent !== textContent) {
    dom.peakValue.textContent = textContent;
  }

  if (dom.peakFill.style.backgroundColor !== "#e2e8f0")
    dom.peakFill.style.backgroundColor = "#e2e8f0";
  if (dom.peakValue.style.color !== "#e2e8f0")
    dom.peakValue.style.color = "#e2e8f0";
}
