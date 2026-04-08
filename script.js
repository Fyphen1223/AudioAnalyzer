// Audio Context and Nodes
let audioCtx;
let analyser;
let source;
let stream;
let animationId;

// UI Elements
const btnMic = document.getElementById("btn-mic");
const statusText = document.getElementById("audio-status");
const sampleRateText = document.getElementById("sample-rate");
const channelsText = document.getElementById("audio-channels");
const deviceNameText = document.getElementById("audio-device-name");

// Settings Elements
const fftSizeSelect = document.getElementById("fft-size");
const smoothingInput = document.getElementById("smoothing");
const smoothingVal = document.getElementById("smoothing-val");
const minDbInput = document.getElementById("min-db");
const minDbVal = document.getElementById("min-db-val");
const maxDbInput = document.getElementById("max-db");
const maxDbVal = document.getElementById("max-db-val");
const micSelect = document.getElementById("mic-select");
const updateRateSelect = document.getElementById("update-rate");
const freqScaleSelect = document.getElementById("freq-scale");
const freqMinInput = document.getElementById("freq-min");
const freqMaxInput = document.getElementById("freq-max");
const peakCountInput = document.getElementById("peak-count");
const peakCountVal = document.getElementById("peak-count-val");
const howlingWarning = document.getElementById("howling-warning");

// Peak Meter Elements
const peakFill = document.getElementById("peak-fill");
const peakValue = document.getElementById("peak-value");
const peakFreqValue = document.getElementById("peak-freq");

// Canvases
const canvasSpectrum = document.getElementById("canvas-spectrum");
const ctxSpectrum = canvasSpectrum.getContext("2d");
const canvasWaveform = document.getElementById("canvas-waveform");
const ctxWaveform = canvasWaveform.getContext("2d");
const hoverTooltip = document.getElementById("hover-tooltip");

let isRunning = false;
let mouseX = -1;
let mouseY = -1;
let isHovering = false;

canvasSpectrum.addEventListener("mousemove", (e) => {
  mouseX = e.offsetX;
  mouseY = e.offsetY;
});

canvasSpectrum.addEventListener("mouseenter", () => {
  isHovering = true;
});

canvasSpectrum.addEventListener("mouseleave", () => {
  isHovering = false;
  hoverTooltip.style.display = "none";
});

// Handle window resize dynamically to keep canvases crisp
function resizeCanvases() {
  const specRect = canvasSpectrum.parentElement.getBoundingClientRect();
  const waveRect = canvasWaveform.parentElement.getBoundingClientRect();

  // Use devicePixelRatio for crisp rendering on high-DPI screens
  const dpr = window.devicePixelRatio || 1;

  canvasSpectrum.width = specRect.width * dpr;
  canvasSpectrum.height = specRect.height * dpr;
  ctxSpectrum.scale(dpr, dpr);
  canvasSpectrum.style.width = specRect.width + "px";
  canvasSpectrum.style.height = specRect.height + "px";

  canvasWaveform.width = waveRect.width * dpr;
  canvasWaveform.height = waveRect.height * dpr;
  ctxWaveform.scale(dpr, dpr);
  canvasWaveform.style.width = waveRect.width + "px";
  canvasWaveform.style.height = waveRect.height + "px";
}
window.addEventListener("resize", resizeCanvases);

// Settings Event Listeners
let availableMics = [];
async function refreshMicrophones() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    availableMics = devices.filter((d) => d.kind === "audioinput");

    // remember selection
    const currentVal = micSelect.value;

    micSelect.innerHTML = "";
    const defaultOpt = document.createElement("option");
    defaultOpt.value = "default";
    defaultOpt.textContent = "Default Device";
    micSelect.appendChild(defaultOpt);

    availableMics.forEach((mic, idx) => {
      if (mic.deviceId === "default" || mic.deviceId === "") return;
      const opt = document.createElement("option");
      opt.value = mic.deviceId;
      opt.textContent = mic.label || `Microphone ${idx + 1}`;
      micSelect.appendChild(opt);
    });

    if (Array.from(micSelect.options).some((o) => o.value === currentVal)) {
      micSelect.value = currentVal;
    }
  } catch (e) {
    console.log("Could not enumerate devices", e);
  }
}

function bindSettings() {
  micSelect.addEventListener("change", async () => {
    if (isRunning) {
      stopAudio();
      await startAudio();
    }
  });

  freqScaleSelect.addEventListener("change", updateXLabels);
  freqMinInput.addEventListener("input", updateXLabels);
  freqMaxInput.addEventListener("input", updateXLabels);

  function updateXLabels() {
    const xLabels = document.querySelector(".x-labels");
    let minF = parseInt(freqMinInput.value) || 20;
    let maxF = parseInt(freqMaxInput.value) || 20000;
    if (minF < 1) minF = 1;
    if (maxF <= minF) maxF = minF + 100;

    // Generate 5 labels
    let labels = [];
    if (freqScaleSelect.value === "linear") {
      for (let i = 0; i < 5; i++) {
        let f = minF + (maxF - minF) * (i / 4);
        labels.push(f >= 1000 ? (f / 1000).toFixed(1) + "k" : Math.round(f));
      }
    } else {
      // Logarithmic division
      for (let i = 0; i < 5; i++) {
        let f = minF * Math.pow(maxF / minF, i / 4);
        labels.push(f >= 1000 ? (f / 1000).toFixed(1) + "k" : Math.round(f));
      }
    }

    xLabels.innerHTML = labels.map((l) => `<span>${l}</span>`).join("");
  }

  peakCountInput.addEventListener("input", () => {
    peakCountVal.textContent = peakCountInput.value;
  });

  fftSizeSelect.addEventListener("change", () => {
    if (analyser) analyser.fftSize = parseInt(fftSizeSelect.value);
  });

  smoothingInput.addEventListener("input", () => {
    smoothingVal.textContent = smoothingInput.value;
    if (analyser)
      analyser.smoothingTimeConstant = parseFloat(smoothingInput.value);
  });

  minDbInput.addEventListener("input", () => {
    minDbVal.textContent = minDbInput.value;
    if (analyser) analyser.minDecibels = parseFloat(minDbInput.value);
  });

  maxDbInput.addEventListener("input", () => {
    maxDbVal.textContent = maxDbInput.value;
    if (analyser) analyser.maxDecibels = parseFloat(maxDbInput.value);
  });
}

// Start / Stop Microphone
btnMic.addEventListener("click", async () => {
  if (isRunning) {
    stopAudio();
  } else {
    await startAudio();
  }
});

async function startAudio() {
  try {
    const constraints = {
      audio: {
        echoCancellation: false,
        autoGainControl: false,
        noiseSuppression: false,
      },
    };

    if (micSelect.value !== "default") {
      constraints.audio.deviceId = { exact: micSelect.value };
    }

    stream = await navigator.mediaDevices.getUserMedia(constraints);
    await refreshMicrophones(); // refresh once permission is granted

    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();

    // Apply initial settings
    analyser.fftSize = parseInt(fftSizeSelect.value);
    analyser.smoothingTimeConstant = parseFloat(smoothingInput.value);
    analyser.minDecibels = parseFloat(minDbInput.value);
    analyser.maxDecibels = parseFloat(maxDbInput.value);

    source = audioCtx.createMediaStreamSource(stream);
    source.connect(analyser);

    // Update UI status
    isRunning = true;
    btnMic.textContent = "Stop Microphone";
    btnMic.classList.add("active");
    statusText.textContent = "Online";

    // Get audio track info for more detail
    if (stream && stream.getAudioTracks().length > 0) {
      const track = stream.getAudioTracks()[0];
      const settings = track.getSettings();
      channelsText.textContent = settings.channelCount || "--";
      deviceNameText.textContent = track.label || "Default Device";
    }
    statusText.className = "status-online";
    sampleRateText.textContent = audioCtx.sampleRate;

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
  if (audioCtx) {
    audioCtx.close();
  }
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
  }

  channelsText.textContent = "--";
  deviceNameText.textContent = "--";
  isRunning = false;
  cancelAnimationFrame(animationId);

  btnMic.textContent = "Start Microphone";
  btnMic.classList.remove("active");
  statusText.textContent = "Offline";
  statusText.className = "status-offline";
  sampleRateText.textContent = "--";

  // Clear display
  const wSpec = canvasSpectrum.width / (window.devicePixelRatio || 1);
  const hSpec = canvasSpectrum.height / (window.devicePixelRatio || 1);
  ctxSpectrum.clearRect(0, 0, wSpec, hSpec);

  const wWave = canvasWaveform.width / (window.devicePixelRatio || 1);
  const hWave = canvasWaveform.height / (window.devicePixelRatio || 1);
  ctxWaveform.clearRect(0, 0, wWave, hWave);

  peakFill.style.width = "0%";
  peakValue.textContent = "-∞ dB";
  peakValue.style.color = "var(--text-muted)";
}

// Rendering Logic
let prevPeakValue = -Infinity;
let lastDrawTime = 0;

function draw(timestamp) {
  animationId = requestAnimationFrame(draw);

  const fpsThreshold = 1000 / parseInt(updateRateSelect.value);
  if (timestamp - lastDrawTime < fpsThreshold) return;
  lastDrawTime = timestamp;

  if (!analyser) return;

  // Dimensions
  const wSpec = canvasSpectrum.width / (window.devicePixelRatio || 1);
  const hSpec = canvasSpectrum.height / (window.devicePixelRatio || 1);
  const wWave = canvasWaveform.width / (window.devicePixelRatio || 1);
  const hWave = canvasWaveform.height / (window.devicePixelRatio || 1);

  // Get Data
  const bufferLength = analyser.frequencyBinCount;
  const freqData = new Float32Array(bufferLength);
  analyser.getFloatFrequencyData(freqData);

  const timeData = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(timeData);

  // --- 1. Draw Spectrum ---
  ctxSpectrum.clearRect(0, 0, wSpec, hSpec);

  const minDb = analyser.minDecibels;
  const maxDb = analyser.maxDecibels;
  const dbRange = maxDb - minDb;

  ctxSpectrum.fillStyle = "#e2e8f0"; // Simple uniform color

  let maxFreqVal = -Infinity;
  let maxFreqIndex = 0;

  const useLogScale = freqScaleSelect.value === "logarithmic";
  const hzPerBin = audioCtx
    ? audioCtx.sampleRate / 2 / bufferLength
    : 22050 / bufferLength;

  let minFreqLog = parseInt(freqMinInput.value) || 20;
  let maxFreqLog = parseInt(freqMaxInput.value) || 20000;
  if (minFreqLog < 1) minFreqLog = 1;
  const maxAllowed = audioCtx ? audioCtx.sampleRate / 2 : 24000;
  if (maxFreqLog > maxAllowed) maxFreqLog = maxAllowed;
  if (maxFreqLog <= minFreqLog) maxFreqLog = minFreqLog + 100;

  // Calculate Average Power for PAPR (Peak-to-Average Power Ratio)
  let sumPower = 0;
  for (let i = 0; i < bufferLength; i++) {
    // freqData is in dB. Convert to power to average properly.
    sumPower += Math.pow(10, freqData[i] / 10);
  }
  const avgDb = 10 * Math.log10(sumPower / bufferLength);

  // Array to store peak candidates
  const peaks = [];
  let howlingDetected = false;

  // Cache some frequently computed values outside the loop for rendering optimization
  const logMaxMinRatio = Math.log10(maxFreqLog / minFreqLog);
  const logMinFreq = Math.log10(minFreqLog);
  const linearRange = maxFreqLog - minFreqLog;
  const mOffset = Math.max(2, Math.round(150 / hzPerBin));
  const hzPerBinClamped = Math.max(1, hzPerBin);
  const linearBarWidth = wSpec / (linearRange / hzPerBin);
  const linearBarWidthActual =
    linearBarWidth > 2 ? linearBarWidth - 1 : linearBarWidth;

  // Single path for bars instead of thousands of fillRect calls
  ctxSpectrum.beginPath();

  for (let i = 0; i < bufferLength; i++) {
    const val = freqData[i];
    const freqBinBase = i * hzPerBin;
    if (freqBinBase < minFreqLog || freqBinBase > maxFreqLog) continue;

    if (val > maxFreqVal) {
      maxFreqVal = val;
      maxFreqIndex = i;
    }

    // Check for local maxima (peaks) to display later
    if (i > 1 && i < bufferLength - 2) {
      if (
        val > freqData[i - 1] &&
        val > freqData[i + 1] &&
        val > freqData[i - 2] &&
        val > freqData[i + 2]
      ) {
        // Only consider peaks that are somewhat prominent above noise floor
        if (val > minDb + 5) {
          peaks.push({ index: i, val: val, freq: freqBinBase });

          // --- Howling Detection Heuristics based on PMC11950036 ---
          // 1. PAPR (Peak-to-Average Power Ratio)
          const papr = val - avgDb;

          // 2. PNPR (Peak-to-Neighboring Power Ratio)
          let pnpr = 0;
          if (i - mOffset >= 0 && i + mOffset < bufferLength) {
            pnpr = Math.min(
              val - freqData[i - mOffset],
              val - freqData[i + mOffset],
            );
          }

          // 3. PHPR (Peak-to-Harmonic Power Ratio)
          let phpr = 0;
          let h2Index = i * 2;
          if (h2Index < bufferLength) {
            phpr = val - freqData[h2Index];
          }

          if (freqBinBase > 200 && val > -35) {
            if (
              papr > 25 &&
              pnpr > 15 &&
              (phpr > 15 || h2Index >= bufferLength)
            ) {
              howlingDetected = true;
            }
          }
        }
      }
    }

    // Calculate height percentage based on dB limits
    let percent = (val - minDb) / dbRange;
    percent = Math.max(0, Math.min(1, percent));

    const barHeight = hSpec * percent;
    let x, barWidthActual;

    if (useLogScale) {
      let freqStart = (i - 0.5) * hzPerBinClamped;
      let freqEnd = (i + 0.5) * hzPerBinClamped;
      if (freqStart < minFreqLog) freqStart = minFreqLog;
      if (freqEnd > maxFreqLog) freqEnd = maxFreqLog;

      let xStart =
        ((Math.log10(freqStart) - logMinFreq) / logMaxMinRatio) * wSpec;
      let xEnd = ((Math.log10(freqEnd) - logMinFreq) / logMaxMinRatio) * wSpec;

      x = xStart < 0 ? 0 : xStart;
      barWidthActual = xEnd - x;
      // make sure there's no 0-width bars that fail to draw correctly
      if (barWidthActual < 1 && i < bufferLength - 1) {
        barWidthActual = 1.0;
      }
    } else {
      // linear bin mapping within bounds
      x = ((freqBinBase - minFreqLog) / linearRange) * wSpec;
      barWidthActual = linearBarWidthActual;
    }

    const y = hSpec - barHeight;

    // Add to path instead of filling immediately
    ctxSpectrum.rect(x, y, barWidthActual, barHeight);
  }

  // Draw all bars in one go
  ctxSpectrum.fill();

  if (howlingWarning) {
    howlingWarning.style.display = howlingDetected ? "inline-block" : "none";
  }

  // Draw peaks
  ctxSpectrum.fillStyle = "#fff";
  ctxSpectrum.font = "12px monospace";
  ctxSpectrum.textAlign = "center";

  // Sort peaks by magnitude and show user-defined count
  peaks.sort((a, b) => b.val - a.val);
  const maxPeaksToShow = parseInt(peakCountInput.value) || 0;
  const topPeaks = peaks.slice(0, maxPeaksToShow);

  topPeaks.forEach((peak) => {
    let percent = (peak.val - minDb) / dbRange;
    percent = Math.max(0, Math.min(1, percent));
    const peakY = hSpec - hSpec * percent;

    let freq = peak.freq;
    let peakX;

    if (useLogScale) {
      if (freq < minFreqLog) freq = minFreqLog;
      peakX =
        (Math.log10(freq / minFreqLog) / Math.log10(maxFreqLog / minFreqLog)) *
        wSpec;
    } else {
      peakX = ((freq - minFreqLog) / (maxFreqLog - minFreqLog)) * wSpec;
    }

    // Check if peakX is in visible range
    if (peakX >= 0 && peakX <= wSpec) {
      // Draw dot
      ctxSpectrum.beginPath();
      ctxSpectrum.arc(peakX, peakY - 4, 3, 0, 2 * Math.PI);
      ctxSpectrum.fill();
      // Draw text
      let freqText =
        freq >= 1000 ? (freq / 1000).toFixed(1) + "k" : Math.round(freq);

      // Avoid overlapping with Y-axis label on extreme left by drawing text more to right,
      // and X-axis labels at bottom by raising y
      let textY = peakY - 10;
      let align = "center";

      if (peakX < 40) align = "left";
      if (peakX > wSpec - 20) align = "right";

      ctxSpectrum.textAlign = align;
      ctxSpectrum.fillText(freqText, peakX, textY);
    }
  });

  // Handle Hover Tooltip
  if (isHovering && mouseX >= 0 && mouseY >= 0 && minDb < 0) {
    let hoverFreq = 0;
    if (useLogScale) {
      hoverFreq =
        minFreqLog * Math.pow(maxFreqLog / minFreqLog, mouseX / wSpec);
    } else {
      hoverFreq = minFreqLog + (maxFreqLog - minFreqLog) * (mouseX / wSpec);
    }

    let hoverFreqText =
      hoverFreq >= 1000
        ? (hoverFreq / 1000).toFixed(1) + "k"
        : Math.round(hoverFreq);
    hoverFreqText += " Hz";

    // Show tooltip mapped to page coordinates
    const canvasRect = canvasSpectrum.getBoundingClientRect();
    const tooltipX = canvasRect.left + mouseX;
    const tooltipY = canvasRect.top + mouseY;

    hoverTooltip.style.display = "block";
    hoverTooltip.style.left = tooltipX + "px";
    hoverTooltip.style.top = tooltipY + "px";
    hoverTooltip.textContent = hoverFreqText;
  } else {
    hoverTooltip.style.display = "none";
  }

  const peakFreqEl = document.getElementById("peak-freq");
  if (peakFreqEl) {
    if (audioCtx && maxFreqVal > minDb + 10) {
      const dominantFreq = maxFreqIndex * hzPerBin;
      peakFreqEl.textContent = dominantFreq.toFixed(0);
    } else {
      peakFreqEl.textContent = "--";
    }
  }

  // --- 2. Draw Waveform (Oscilloscope) ---
  ctxWaveform.clearRect(0, 0, wWave, hWave);

  ctxWaveform.lineWidth = 2;
  ctxWaveform.strokeStyle = "#e2e8f0"; // Simple minimal line
  ctxWaveform.beginPath();

  const sliceWidth = (wWave * 1.0) / analyser.fftSize;
  let xTime = 0;

  // Variables for Peak Detection
  let maxAbs = 0;

  for (let i = 0; i < analyser.fftSize; i++) {
    const v = timeData[i]; // range -1.0 to 1.0
    const y = (v * 0.5 + 0.5) * hWave;

    if (i === 0) {
      ctxWaveform.moveTo(xTime, y);
    } else {
      ctxWaveform.lineTo(xTime, y);
    }

    xTime += sliceWidth;

    // Compare peak
    const absV = Math.abs(v);
    if (absV > maxAbs) maxAbs = absV;
  }

  ctxWaveform.lineTo(wWave, hWave / 2);
  ctxWaveform.stroke();

  // --- 3. Update Peak Meter ---
  // Convert amplitude (maxAbs) to Decibels
  let currentPeakDb = maxAbs > 0 ? 20 * Math.log10(maxAbs) : -Infinity;

  // Peak hold physics (decay)
  if (currentPeakDb > prevPeakValue) {
    prevPeakValue = currentPeakDb;
  } else {
    prevPeakValue -= 0.5; // falloff rate
  }

  let displayDb = prevPeakValue;
  if (displayDb < -60) displayDb = -60;

  // Convert -60..0 db to 0..100%
  const meterPercent = Math.max(0, (displayDb + 60) / 60) * 100;

  peakFill.style.width = meterPercent + "%";

  // Formatting dB value
  if (displayDb > -60) {
    peakValue.textContent = displayDb.toFixed(1) + " dB";
  } else {
    peakValue.textContent = "-∞ dB";
  }

  // Color logic
  peakFill.style.backgroundColor = "#e2e8f0";
  peakValue.style.color = "#e2e8f0";
}

// Init
bindSettings();
resizeCanvases();
