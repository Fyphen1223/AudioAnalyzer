import { drawSpectrum } from "./render/spectrum.js";
import { drawWaveformAndMeter } from "./render/waveformMeter.js";
import { drawSpectrogram } from "./render/spectrogram.js";
import { drawVectorscope } from "./render/vectorscope.js";
import { drawImpulseViewer } from "./render/impulse.js";
import { demodulateFrame } from "./modem.js";

function buildFrameData({ state, dom }) {
  const {
    wSpec,
    hSpec,
    wWave,
    hWave,
    freqMinLog,
    freqMaxLog,
    useLogScale,
    updateRateFps,
    meteringStandard,
    specMode,
    specTheme,
    peakCount,
  } = state.config;

  const bufferLength = state.analyser.frequencyBinCount;
  if (!state.freqDataBuffer || state.freqDataBuffer.length !== bufferLength) {
    state.freqDataBuffer = new Float32Array(bufferLength);
  }
  const freqData = state.freqDataBuffer;

  if (
    !state.timeDataBuffer ||
    state.timeDataBuffer.length !== state.analyser.fftSize
  ) {
    state.timeDataBuffer = new Float32Array(state.analyser.fftSize);
  }
  const timeData = state.timeDataBuffer;

  if (!state.isFrozen) {
    state.analyser.getFloatFrequencyData(freqData);
    state.analyser.getFloatTimeDomainData(timeData);
  }

  const minDb = state.analyser.minDecibels;
  const maxDb = state.analyser.maxDecibels;
  const dbRange = maxDb - minDb;

  const hzPerBin = state.audioCtx
    ? state.audioCtx.sampleRate / 2 / bufferLength
    : 22050 / bufferLength;

  let maxAllowed = state.audioCtx ? state.audioCtx.sampleRate / 2 : 24000;
  let currentMaxFreqLog = freqMaxLog > maxAllowed ? maxAllowed : freqMaxLog;

  const logMaxMinRatio = Math.log10(currentMaxFreqLog / freqMinLog);
  const logMinFreq = Math.log10(freqMinLog);
  const linearRange = currentMaxFreqLog - freqMinLog;
  const hzPerBinClamped = Math.max(1, hzPerBin);
  const linearBarWidth = wSpec / (linearRange / hzPerBin);
  const linearBarWidthActual =
    linearBarWidth > 2 ? linearBarWidth - 1 : linearBarWidth;

  return {
    wSpec,
    hSpec,
    wWave,
    hWave,
    bufferLength,
    freqData,
    timeData,
    minDb,
    maxDb,
    dbRange,
    useLogScale,
    hzPerBin,
    minFreqLog: freqMinLog,
    maxFreqLog: currentMaxFreqLog,
    logMaxMinRatio,
    logMinFreq,
    linearRange,
    hzPerBinClamped,
    linearBarWidthActual,
  };
}

export function createRenderer({ state, dom }) {
  function draw(timestamp = 0, force = false) {
    if (!force) {
      state.animationId = requestAnimationFrame(draw);
    }

    if (!force) {
      state.fpsFrameCount++;
      if (timestamp - state.lastFpsTime >= 1000) {
        if (dom.fpsDisplay) {
          dom.fpsDisplay.textContent = `${state.fpsFrameCount}`;
        }
        state.fpsFrameCount = 0;
        state.lastFpsTime = timestamp;
      }

      const fpsThreshold = 1000 / (state.config.updateRateFps || 60);
      if (timestamp - state.lastDrawTime < fpsThreshold) return;
      state.lastDrawTime = timestamp;
    }

    if (!state.analyser || !dom.ctxSpectrum || !dom.ctxWaveform) return;

    let t0 = performance.now();

    const frame = buildFrameData({ state, dom });

    drawSpectrum({ state, dom, frame });
    drawWaveformAndMeter({ state, dom, frame });
    drawSpectrogram({ dom, frame, state });
    drawVectorscope({ state, dom });
    drawImpulseViewer({ state, dom, frame });

    if (state.modemActive && state.modemAnalyser) {
      demodulateFrame(state, dom, timestamp);
    }

    let t1 = performance.now();
    let ms = t1 - t0;

    // Average rendering time
    if (!force && dom.renderTimeDisplay) {
      state.renderTimes.push(ms);
      if (state.renderTimes.length > 60) state.renderTimes.shift();
      if (state.fpsFrameCount % 10 === 0) {
        // update display every 10 frames
        let avg =
          state.renderTimes.reduce((a, b) => a + b, 0) /
          state.renderTimes.length;
        dom.renderTimeDisplay.textContent = `Render: ${avg.toFixed(2)} ms`;
        if (avg < 8) dom.renderTimeDisplay.style.color = "#4ade80";
        else if (avg < 16) dom.renderTimeDisplay.style.color = "#facc15";
        else dom.renderTimeDisplay.style.color = "#f87171";
      }
    }
  }

  return { draw };
}
