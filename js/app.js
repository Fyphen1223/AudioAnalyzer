import { getDomRefs } from "./dom.js";
import { createInitialState } from "./state.js";
import { resizeCanvases } from "./layout.js";
import { createAudioController } from "./audio.js";
import { bindSettings } from "./settings.js";
import { createRenderer } from "./render.js";

export function initApp() {
  const dom = getDomRefs();
  const state = createInitialState();

  function syncConfig() {
    if (!state.config) return;
    let minF = parseInt(dom.freqMinInput?.value, 10) || 20;
    let maxF = parseInt(dom.freqMaxInput?.value, 10) || 20000;
    if (minF < 1) minF = 1;
    if (maxF <= minF) maxF = minF + 100;
    state.config.freqMinLog = minF;
    state.config.freqMaxLog = maxF;
    state.config.useLogScale = dom.freqScaleSelect?.value === "logarithmic";
    let pc = parseInt(dom.peakCountInput?.value, 10);
    state.config.peakCount = isNaN(pc) ? 10 : pc;
    state.config.meteringStandard = dom.meteringStandard?.value || "peak";
    state.config.specMode = dom.specModeSelect?.value || "standard";
    state.config.specTheme = dom.specThemeSelect?.value || "classic";
    state.config.updateRateFps =
      parseInt(dom.updateRateSelect?.value, 10) || 60;
    console.log(
      "syncConfig",
      state.config.freqMinLog,
      state.config.freqMaxLog,
      state.config.useLogScale,
    );
  }

  [
    dom.freqMinInput,
    dom.freqMaxInput,
    dom.freqScaleSelect,
    dom.peakCountInput,
    dom.meteringStandard,
    dom.specModeSelect,
    dom.specThemeSelect,
    dom.updateRateSelect,
  ].forEach((el) => {
    if (el) {
      el.addEventListener("input", syncConfig);
      el.addEventListener("change", syncConfig);
    }
  });

  syncConfig(); // Initialize config from DOM right away

  const handleResize = () => {
    resizeCanvases(dom);
    const dpr = window.devicePixelRatio || 1;
    if (state.config) {
      if (dom.canvasSpectrum) {
        state.config.wSpec = dom.canvasSpectrum.width / dpr || 0;
        state.config.hSpec = dom.canvasSpectrum.height / dpr || 0;
      }
      if (dom.canvasWaveform) {
        state.config.wWave = dom.canvasWaveform.width / dpr || 0;
        state.config.hWave = dom.canvasWaveform.height / dpr || 0;
      }
      if (dom.canvasSpectrogram) {
        state.config.wSpecg = dom.canvasSpectrogram.width / dpr || 0;
        state.config.hSpecg = dom.canvasSpectrogram.height / dpr || 0;
      }
      if (dom.canvasVectorscope) {
        state.config.wVec = dom.canvasVectorscope.width / dpr || 0;
        state.config.hVec = dom.canvasVectorscope.height / dpr || 0;
      }
    }
  };

  if (dom.canvasSpectrum) {
    dom.canvasSpectrum.addEventListener("mousemove", (e) => {
      state.mouseX = e.offsetX;
      state.mouseY = e.offsetY;
    });

    dom.canvasSpectrum.addEventListener("mouseenter", () => {
      state.isHovering = true;
    });

    dom.canvasSpectrum.addEventListener("mouseleave", () => {
      state.isHovering = false;
      if (dom.hoverTooltip) {
        dom.hoverTooltip.style.display = "none";
      }
    });
  }

  const renderer = createRenderer({ state, dom });

  const audio = createAudioController({
    state,
    dom,
    resizeCanvases: handleResize,
    draw: renderer.draw,
  });

  bindSettings({
    state,
    dom,
    resizeCanvases: handleResize,
    startAudio: audio.startAudio,
    stopAudio: audio.stopAudio,
  });

  dom.btnMic.addEventListener("click", async () => {
    if (state.isRunning) {
      audio.stopAudio();
    } else {
      await audio.startAudio();
    }
  });

  window.addEventListener("resize", handleResize);

  audio.refreshMicrophones();
  handleResize();
}
