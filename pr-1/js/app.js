import { getDomRefs } from "./dom.js";
import { createInitialState } from "./state.js";
import { resizeCanvases } from "./layout.js";
import { createAudioController } from "./audio.js";
import { bindSettings } from "./settings.js";
import { createRenderer } from "./render.js";
import { startTransmission } from "./modem.js";
import { drawTextToAudioBuffer } from "./spectrogramDraw.js";

export function initApp() {
  const dom = getDomRefs();
  const state = createInitialState();
  const TARGET_NOMINAL_PEAK_DB = -18;
  const LOW_HEADROOM_THRESHOLD_DB = -6;

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
    const el = dom.canvasSpectrum;
    el.addEventListener("mousemove", (e) => {
      state.mouseX = e.offsetX;
      state.mouseY = e.offsetY;
      if (state.isDraggingFilter) {
        state.filterEndX = e.offsetX;
      }
    });

    el.addEventListener("mouseenter", () => {
      state.isHovering = true;
    });

    el.addEventListener("mouseleave", () => {
      state.isHovering = false;
      state.isDraggingFilter = false;
      if (state.soloGain && state.audioCtx) {
        state.soloGain.gain.cancelScheduledValues(state.audioCtx.currentTime);
        state.soloGain.gain.setTargetAtTime(
          0,
          state.audioCtx.currentTime,
          0.05,
        );
      }
      if (dom.hoverTooltip) {
        dom.hoverTooltip.style.display = "none";
      }
    });

    el.addEventListener("mousedown", (e) => {
      // Only trigger if it's the primary (left) mouse button
      if (e.button !== 0) return;
      state.isDraggingFilter = true;
      state.filterStartX = e.offsetX;
      state.filterEndX = e.offsetX;
      if (state.soloGain && state.audioCtx) {
        state.soloGain.gain.cancelScheduledValues(state.audioCtx.currentTime);
        state.soloGain.gain.setTargetAtTime(
          1,
          state.audioCtx.currentTime,
          0.05,
        );
      }
    });

    el.addEventListener("mouseup", () => {
      state.isDraggingFilter = false;
      if (state.soloGain && state.audioCtx) {
        state.soloGain.gain.cancelScheduledValues(state.audioCtx.currentTime);
        state.soloGain.gain.setTargetAtTime(
          0,
          state.audioCtx.currentTime,
          0.05,
        );
      }
    });
  }

  if (dom.btnFreeze) {
    dom.btnFreeze.addEventListener("click", () => {
      state.isFrozen = !state.isFrozen;
      dom.btnFreeze.textContent = state.isFrozen ? "Unfreeze" : "Freeze";
      if (state.isFrozen) {
        dom.btnFreeze.style.background = "#3b82f6";
        dom.btnFreeze.style.color = "white";
      } else {
        dom.btnFreeze.style.background = "";
        dom.btnFreeze.style.color = "";
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

  function getPercentile(samples, p) {
    if (!samples || samples.length === 0) return null;
    const arr = samples.filter(Number.isFinite).slice().sort((a, b) => a - b);
    if (arr.length === 0) return null;
    const rawPos = (arr.length - 1) * p;
    const pos = Math.max(0, Math.min(arr.length - 1, rawPos));
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    if (lo === hi) return arr[lo];
    const t = pos - lo;
    return arr[lo] * (1 - t) + arr[hi] * t;
  }

  if (dom.btnNoiseProfile) {
    dom.btnNoiseProfile.addEventListener("click", () => {
      state.noiseProfile.active = !state.noiseProfile.active;
      if (state.noiseProfile.active) {
        state.noiseProfile.startTime = Date.now();
        state.noiseProfile.samples = [];
        state.noiseProfile.baselineDb = null;
        state.noiseProfile.trendDbPerMin = 0;
        dom.btnNoiseProfile.textContent = "Stop Profiling";
        if (dom.noiseProfileStatus) dom.noiseProfileStatus.textContent = "Running";
      } else {
        dom.btnNoiseProfile.textContent = "Start Profiling";
        if (dom.noiseProfileStatus) dom.noiseProfileStatus.textContent = "Stopped";
      }
    });
  }

  if (dom.btnCalibrationStart) {
    dom.btnCalibrationStart.addEventListener("click", () => {
      state.calibration.active = true;
      state.calibration.step = 1;
      state.calibration.samples = [];
      state.calibration.noiseFloorDb = null;
      state.calibration.nominalPeakDb = null;
      state.calibration.loudPeakDb = null;
      state.calibration.recommendedGainDeltaDb = null;
      if (dom.calibrationStatus) dom.calibrationStatus.textContent = "Running step 1";
      if (dom.calibrationInstruction) {
        dom.calibrationInstruction.textContent =
          "Step 1/3: Stay quiet for room noise capture, then press Next.";
      }
      if (dom.calibrationResult) dom.calibrationResult.textContent = "--";
    });
  }

  if (dom.btnCalibrationNext) {
    dom.btnCalibrationNext.addEventListener("click", () => {
      if (!state.calibration.active) return;
      if (state.calibration.step === 1) {
        state.calibration.noiseFloorDb = getPercentile(state.calibration.samples, 0.5);
        state.calibration.step = 2;
        state.calibration.samples = [];
        if (dom.calibrationInstruction) {
          dom.calibrationInstruction.textContent =
            "Step 2/3: Speak/play at normal working level, then press Next.";
        }
      } else if (state.calibration.step === 2) {
        state.calibration.nominalPeakDb = getPercentile(state.calibration.samples, 0.9);
        if (state.calibration.nominalPeakDb != null) {
          state.calibration.recommendedGainDeltaDb =
            TARGET_NOMINAL_PEAK_DB - state.calibration.nominalPeakDb;
        }
        state.calibration.step = 3;
        state.calibration.samples = [];
        if (dom.calibrationInstruction) {
          dom.calibrationInstruction.textContent =
            "Step 3/3: Produce the loudest expected level, then press Next.";
        }
      } else {
        state.calibration.loudPeakDb = getPercentile(state.calibration.samples, 0.98);
        state.calibration.active = false;
        const rec = state.calibration.recommendedGainDeltaDb;
        const loud = state.calibration.loudPeakDb;
        const safety =
          loud != null && loud > LOW_HEADROOM_THRESHOLD_DB
            ? "Headroom low; reduce gain."
            : "Headroom looks safe.";
        if (dom.calibrationInstruction) {
          dom.calibrationInstruction.textContent = "Calibration complete.";
        }
        if (dom.calibrationStatus) dom.calibrationStatus.textContent = "Completed";
        if (dom.calibrationResult) {
          const recText =
            rec == null ? "--" : `${rec >= 0 ? "+" : ""}${rec.toFixed(1)} dB`;
          const noiseText =
            state.calibration.noiseFloorDb == null
              ? "--"
              : `${state.calibration.noiseFloorDb.toFixed(1)} dB`;
          const nominalText =
            state.calibration.nominalPeakDb == null
              ? "--"
              : `${state.calibration.nominalPeakDb.toFixed(1)} dB`;
          const loudText = loud == null ? "--" : `${loud.toFixed(1)} dB`;
          dom.calibrationResult.textContent = `Noise: ${noiseText} | Nominal peak: ${nominalText} | Loud peak: ${loudText} | Gain adjust: ${recText} | ${safety}`;
        }
        state.calibration.step = 0;
        state.calibration.samples = [];
      }
    });
  }

  if (dom.btnCalibrationReset) {
    dom.btnCalibrationReset.addEventListener("click", () => {
      state.calibration.active = false;
      state.calibration.step = 0;
      state.calibration.samples = [];
      state.calibration.noiseFloorDb = null;
      state.calibration.nominalPeakDb = null;
      state.calibration.loudPeakDb = null;
      state.calibration.recommendedGainDeltaDb = null;
      if (dom.calibrationStatus) dom.calibrationStatus.textContent = "Idle";
      if (dom.calibrationInstruction) {
        dom.calibrationInstruction.textContent = "Press Start to begin 3-step calibration.";
      }
      if (dom.calibrationResult) dom.calibrationResult.textContent = "--";
    });
  }

  if (dom.btnImpulseCapture) {
    dom.btnImpulseCapture.addEventListener("click", () => {
      state.impulse.captureRequested = true;
      if (dom.impulseStatus) dom.impulseStatus.textContent = "Capturing...";
    });
  }

  // FSK Modem Handlers
  if (dom.btnModemTx) {
    dom.btnModemTx.addEventListener("click", () => {
      if (!state.audioCtx || state.audioCtx.state === "suspended") {
        alert("Please start the microphone or audio first.");
        return;
      }
      const text = dom.modemTxText.value;
      if (!text) return;

      const mode = dom.modemMode.value;
      const speed = dom.modemSpeed ? parseInt(dom.modemSpeed.value, 10) : 20;
      const volDb = dom.modemVol ? parseFloat(dom.modemVol.value) : -12;
      const duration = startTransmission(state, text, mode, volDb, speed);

      dom.btnModemTx.disabled = true;
      dom.btnModemTx.textContent = "Sending...";
      setTimeout(() => {
        dom.btnModemTx.disabled = false;
        dom.btnModemTx.textContent = "Send";
      }, duration * 1000);
    });
  }

  if (dom.btnModemRx) {
    dom.btnModemRx.addEventListener("click", () => {
      state.modemActive = !state.modemActive;
      if (state.modemActive) {
        dom.btnModemRx.textContent = "Stop Rx";
        dom.btnModemRx.classList.add("active");
        dom.modemStatus.style.display = "block";
        state.modemMode = dom.modemMode.value;
        state.modemBaudRate = dom.modemSpeed
          ? parseInt(dom.modemSpeed.value, 10)
          : 20;
      } else {
        dom.btnModemRx.textContent = "Start Rx";
        dom.btnModemRx.classList.remove("active");
        dom.modemStatus.style.display = "none";
      }
    });

    // Check FFT size changes
    dom.fftSizeSelect?.addEventListener("change", () => {
      if (state.modemActive) {
        // Warning no longer needed since we use dedicated modemAnalyser
      }
    });
  }

  if (dom.btnModemClear) {
    dom.btnModemClear.addEventListener("click", () => {
      state.modemRxBuffer = "";
      dom.modemRxLog.value = "";
    });
  }

  if (dom.modemVol) {
    dom.modemVol.addEventListener("input", () => {
      if (dom.modemVolVal) {
        dom.modemVolVal.textContent = dom.modemVol.value;
      }
    });
  }

  if (dom.btnSpecDraw) {
    dom.btnSpecDraw.addEventListener("click", async () => {
      if (!state.audioCtx) {
        alert("Please start the microphone or audio first.");
        return;
      }

      // Ensure context is not blocked (ChromeOS/mobile tight audio policy)
      if (state.audioCtx.state === "suspended") {
        await state.audioCtx.resume();
      }

      const text = dom.specDrawText?.value;
      if (!text) return;

      dom.btnSpecDraw.disabled = true;
      dom.btnSpecDraw.textContent = "Generating...";

      // Yield briefly to let the browser actually render the button update
      await new Promise((r) => setTimeout(r, 10));

      try {
        const colDuration = dom.specDrawSpeed
          ? parseFloat(dom.specDrawSpeed.value)
          : 0.05;
        const { buffer, duration } = await drawTextToAudioBuffer(
          state.audioCtx,
          text,
          colDuration,
        );

        const source = state.audioCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(state.audioCtx.destination);
        source.start();

        dom.btnSpecDraw.textContent = "Playing...";
        setTimeout(() => {
          dom.btnSpecDraw.disabled = false;
          dom.btnSpecDraw.textContent = "Play";
        }, duration * 1000);
      } catch (err) {
        console.error(err);
        dom.btnSpecDraw.disabled = false;
        dom.btnSpecDraw.textContent = "Play";
        alert("Failed to generate audio.");
      }
    });
  }

  if (dom.btnBenchmark) {
    dom.btnBenchmark.addEventListener("click", () => {
      state.isBenchmarking = true;
      dom.btnBenchmark.textContent = "Running...";
      dom.btnBenchmark.disabled = true;

      setTimeout(() => {
        let maxFrames = 1000;
        let t0 = performance.now();
        for (let i = 0; i < maxFrames; i++) {
          renderer.draw(performance.now(), true); // Force bypass rate limit
        }
        let t1 = performance.now();

        state.isBenchmarking = false;
        dom.btnBenchmark.textContent = "Benchmark";
        dom.btnBenchmark.disabled = false;

        let avg = (t1 - t0) / maxFrames;
        let estimatedFps = Math.floor(1000 / avg);

        let interpretation = "";
        if (avg < 4) {
          interpretation =
            "Status: Excellent.\nThis device is very powerful and can run the application flawlessly at high refresh rates without any lag.";
        } else if (avg < 8) {
          interpretation =
            "Status: Great.\nThis device can easily maintain a smooth 60 FPS experience.";
        } else if (avg < 15) {
          interpretation =
            "Status: Good.\nThis device can manage 60 FPS, but might occasionally drop frames under heavy continuous load.";
        } else {
          interpretation =
            "Status: Suboptimal.\nThis device may struggle to maintain a smooth framerate. Consider reducing the visualizer complexity if you experience lag.";
        }

        alert(
          `Benchmark completed:\nRendered ${maxFrames} frames synchronously.\nAverage execution time: ${avg.toFixed(3)} ms per frame.\nEstimated Max FPS: ${estimatedFps}\n\n${interpretation}`,
        );
      }, 100); // give UI time to update button text
    });
  }

  dom.btnMic.addEventListener("click", async () => {
    if (state.isRunning) {
      audio.stopAudio();
    } else {
      await audio.startAudio();
    }
  });

  window.addEventListener("resize", handleResize);

  const dropZone = document.getElementById("drop-zone");
  document.body.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (dropZone) dropZone.style.display = "flex";
  });

  document.body.addEventListener("dragleave", (e) => {
    e.preventDefault();
    if (e.relatedTarget === null) {
      if (dropZone) dropZone.style.display = "none";
    }
  });

  document.body.addEventListener("drop", (e) => {
    e.preventDefault();
    if (dropZone) dropZone.style.display = "none";
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (
        file.type.startsWith("audio/") ||
        file.name.endsWith(".wav") ||
        file.name.endsWith(".mp3")
      ) {
        audio.startAudioFromFile(file);
      } else {
        alert("Please drop a valid audio file (e.g. .wav or .mp3)");
      }
    }
  });

  // Setup Fullscreen Buttons
  const fsBtns = document.querySelectorAll(".btn-fullscreen");
  console.log("Found fullscreen buttons:", fsBtns.length);

  fsBtns.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const card = btn.closest(".viz-card");
      if (card) {
        const isFullscreen = card.classList.toggle("fullscreen-card");
        btn.innerHTML = isFullscreen ? "&#x2715;" : "&#x26F6;";

        // Ensure zIndex is applied directly to bypass any css specificity issues
        if (isFullscreen) {
          card.style.position = "fixed";
          card.style.top = "0";
          card.style.left = "0";
          card.style.width = "100vw";
          card.style.height = "100vh";
          card.style.zIndex = "9999";
          card.style.background = "var(--bg-panel)";
          card.style.margin = "0";
          card.style.borderRadius = "0";
          card.style.padding = "1rem";
        } else {
          card.style.position = "";
          card.style.top = "";
          card.style.left = "";
          card.style.width = "";
          card.style.height = "";
          card.style.zIndex = "";
          card.style.background = "";
          card.style.margin = "";
          card.style.borderRadius = "";
          card.style.padding = "";
        }

        setTimeout(handleResize, 50);
      }
    });
  });

  audio.refreshMicrophones();
  handleResize();
}
