export function createAudioController({ state, dom, resizeCanvases, draw }) {
  async function refreshMicrophones() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      state.availableMics = devices.filter((d) => d.kind === "audioinput");

      const currentVal = dom.micSelect ? dom.micSelect.value : "default";

      if (!dom.micSelect) return;

      dom.micSelect.innerHTML = "";
      const defaultOpt = document.createElement("option");
      defaultOpt.value = "default";
      defaultOpt.textContent = "Default Device";
      dom.micSelect.appendChild(defaultOpt);

      state.availableMics.forEach((mic, idx) => {
        if (mic.deviceId === "default" || mic.deviceId === "") return;
        const opt = document.createElement("option");
        opt.value = mic.deviceId;
        opt.textContent = mic.label || `Microphone ${idx + 1}`;
        dom.micSelect.appendChild(opt);
      });

      if (
        Array.from(dom.micSelect.options).some((o) => o.value === currentVal)
      ) {
        dom.micSelect.value = currentVal;
      }
    } catch (e) {
      console.log("Could not enumerate devices", e);
    }
  }

  async function startAudio() {
    try {
      const constraints = {
        audio: {
          echoCancellation: false,
          autoGainControl: false,
          noiseSuppression: false,
        },
      };

      if (dom.micSelect && dom.micSelect.value !== "default") {
        constraints.audio.deviceId = { exact: dom.micSelect.value };
      }

      state.stream = await navigator.mediaDevices.getUserMedia(constraints);
      await refreshMicrophones();

      state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      state.analyser = state.audioCtx.createAnalyser();

      state.splitter = state.audioCtx.createChannelSplitter(2);
      state.analyserL = state.audioCtx.createAnalyser();
      state.analyserR = state.audioCtx.createAnalyser();

      state.analyser.fftSize = parseInt(dom.fftSizeSelect.value, 10);
      state.analyserL.fftSize = state.analyser.fftSize;
      state.analyserR.fftSize = state.analyser.fftSize;

      state.analyser.smoothingTimeConstant = parseFloat(
        dom.smoothingInput.value,
      );
      state.analyser.minDecibels = parseFloat(dom.minDbInput.value);
      state.analyser.maxDecibels = parseFloat(dom.maxDbInput.value);

      state.source = state.audioCtx.createMediaStreamSource(state.stream);

      // Solo (Bandpass Filter) Setup
      state.bandpassFilter = state.audioCtx.createBiquadFilter();
      state.bandpassFilter.type = "bandpass";
      state.bandpassFilter.Q.value = 1;

      state.soloGain = state.audioCtx.createGain();
      state.soloGain.gain.value = 0; // Muted by default

      state.source.connect(state.bandpassFilter);
      state.bandpassFilter.connect(state.soloGain);
      state.soloGain.connect(state.audioCtx.destination);

      state.source.connect(state.analyser);
      state.source.connect(state.splitter);
      state.splitter.connect(state.analyserL, 0);

      let channelCount = 1;
      if (state.stream && state.stream.getAudioTracks().length > 0) {
        const settings = state.stream.getAudioTracks()[0].getSettings();
        channelCount = settings.channelCount || 1;
      }

      if (channelCount > 1) {
        state.splitter.connect(state.analyserR, 1);
      } else {
        state.splitter.connect(state.analyserR, 0);
      }

      state.isRunning = true;
      dom.btnMic.textContent = "Stop Microphone";
      dom.btnMic.classList.add("active");
      dom.statusText.textContent = "Online";

      if (state.stream && state.stream.getAudioTracks().length > 0) {
        const track = state.stream.getAudioTracks()[0];
        const settings = track.getSettings();
        dom.channelsText.textContent = settings.channelCount || "--";
        dom.deviceNameText.textContent = track.label || "Default Device";
      }

      dom.statusText.className = "status-online";
      dom.sampleRateText.textContent = state.audioCtx.sampleRate;

      resizeCanvases();
      draw();
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert(
        "Could not access microphone automatically. Please check your browser permissions.",
      );
    }
  }

  function stopAudio() {
    if (state.audioCtx) {
      state.audioCtx.close();
    }
    if (state.stream) {
      state.stream.getTracks().forEach((track) => track.stop());
    }

    dom.channelsText.textContent = "--";
    dom.deviceNameText.textContent = "--";
    state.isRunning = false;

    if (state.animationId) {
      cancelAnimationFrame(state.animationId);
      state.animationId = null;
    }

    dom.btnMic.textContent = "Start Microphone";
    dom.btnMic.classList.remove("active");
    dom.statusText.textContent = "Offline";
    dom.statusText.className = "status-offline";
    dom.sampleRateText.textContent = "--";

    const wSpec = dom.canvasSpectrum.width / (window.devicePixelRatio || 1);
    const hSpec = dom.canvasSpectrum.height / (window.devicePixelRatio || 1);

    // Clear WebGL
    const gl = dom.ctxSpectrum;
    if (gl) {
      gl.clearColor(0.0, 0.0, 0.0, 0.0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    // Clear Overlay
    if (dom.ctxSpectrumOverlay) {
      dom.ctxSpectrumOverlay.clearRect(0, 0, wSpec, hSpec);
    }

    const wWave = dom.canvasWaveform.width / (window.devicePixelRatio || 1);
    const hWave = dom.canvasWaveform.height / (window.devicePixelRatio || 1);
    if (dom.ctxWaveform.clearColor) {
      dom.ctxWaveform.clearColor(0.0, 0.0, 0.0, 0.0);
      dom.ctxWaveform.clear(dom.ctxWaveform.COLOR_BUFFER_BIT);
    } else if (dom.ctxWaveform.clearRect) {
      dom.ctxWaveform.clearRect(0, 0, wWave, hWave);
    }

    if (dom.ctxVectorscope) {
      if (dom.ctxVectorscope.clearColor) {
        dom.ctxVectorscope.clearColor(10 / 255, 15 / 255, 20 / 255, 0.2);
        dom.ctxVectorscope.clear(dom.ctxVectorscope.COLOR_BUFFER_BIT);
      } else if (dom.ctxVectorscope.clearRect) {
        const wVec =
          dom.canvasVectorscope.width / (window.devicePixelRatio || 1);
        const hVec =
          dom.canvasVectorscope.height / (window.devicePixelRatio || 1);
        dom.ctxVectorscope.clearRect(0, 0, wVec, hVec);
      }
    }

    dom.peakFill.style.width = "0%";
    dom.peakValue.textContent = "-∞ dB";
    dom.peakValue.style.color = "var(--text-muted)";
  }

  return {
    refreshMicrophones,
    startAudio,
    stopAudio,
  };
}
