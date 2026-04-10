// FSK Modem implementation
export const MODEM_CONFIG = {
  baudRate: 10, // bits per second
  freqs: {
    audible: { space: 1200, mark: 2200 },
    ultrasonic: { space: 18000, mark: 19000 },
  },
  thresholdDb: -60, // basic detection threshold
};

// Text -> bit array (1 byte = 8 bits, MSB to LSB or LSB to MSB. Let's do LSB first typical UART)
// Frame: 1 Start bit (space), 8 data bits (LSB), 1 Stop bit (mark)
export function encodeTextToBits(text) {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);
  const bits = [];

  // Preamble: to wake up the receiver and stabilize mark frequency
  for (let i = 0; i < 4; i++) {
    bits.push(1);
  }

  for (let b of bytes) {
    bits.push(0); // Start bit (Space = 0)
    for (let i = 0; i < 8; i++) {
      bits.push((b >> i) & 1); // LSB first
    }
    bits.push(1); // Stop bit (Mark = 1)
  }
  return bits;
}

export function decodeBitsToText(rawBits) {
  // Simple decoder assuming perfect frame alignment if preamble skipped
  // Actually, we'll decode on the fly in the receiver.
  return "";
}

// Global modem state for the receiver
let rxState = {
  active: false,
  mode: "audible",
  bitBuffer: [],
  currentByte: 0,
  bitIndex: 0,
  state: "IDLE", // IDLE, START, DATA, STOP
  lastBitTime: 0,
  history: [],
  lastSymbol: 1, // Idle is MARK (1)
  startTime: 0,
};

export function startTransmission(state, text, mode, volDb = -12) {
  if (!state.audioCtx) return;
  const bits = encodeTextToBits(text);
  const T = 1.0 / MODEM_CONFIG.baudRate;

  const osc = state.audioCtx.createOscillator();
  const gainNode = state.audioCtx.createGain();

  const linearGain = Math.pow(10, volDb / 20);
  gainNode.gain.value = linearGain;

  const T0 = state.audioCtx.currentTime + 0.1;

  const freqs = MODEM_CONFIG.freqs[mode];

  // Set initial freq to MARK (idle state)
  osc.frequency.setValueAtTime(freqs.mark, T0);

  for (let i = 0; i < bits.length; i++) {
    const f = bits[i] === 1 ? freqs.mark : freqs.space;
    osc.frequency.setValueAtTime(f, T0 + i * T);
  }

  const totalTime = T0 + bits.length * T;
  // Return to idle MARK for 1 bit, then stop
  osc.frequency.setValueAtTime(freqs.mark, totalTime);

  osc.connect(gainNode);
  gainNode.connect(state.audioCtx.destination); // Play through gain node

  osc.start(T0);
  osc.stop(totalTime + T);

  return totalTime + T - state.audioCtx.currentTime;
}

export function demodulateFrame(state, dom, timestamp) {
  if (!state.audioCtx || !state.modemAnalyser) return;

  if (state.modemRxBuffer === "" && rxState.history.length > 0) {
    rxState.history = [];
  }

  const now = state.audioCtx.currentTime;
  const mode = state.modemMode || "audible";
  const freqs = MODEM_CONFIG.freqs[mode];
  const T = 1.0 / MODEM_CONFIG.baudRate;

  const bufferLength = state.modemAnalyser.frequencyBinCount;
  const hzPerBin = state.audioCtx.sampleRate / 2 / bufferLength;

  if (!state.modemFreqData || state.modemFreqData.length !== bufferLength) {
    state.modemFreqData = new Float32Array(bufferLength);
  }
  const freqData = state.modemFreqData;
  state.modemAnalyser.getFloatFrequencyData(freqData);

  const binSpace = Math.round(freqs.space / hzPerBin);
  const binMark = Math.round(freqs.mark / hzPerBin);
  const searchBins = Math.max(1, Math.ceil(50 / hzPerBin)); // ±50Hz tolerance window
  const noiseBins = Math.max(3, Math.ceil(300 / hzPerBin)); // ±300Hz surrounding noise context

  // Look around the target bin for max energy and the surrounding noise floor
  const getSignalAndNoise = (centerBin) => {
    let peak = -Infinity;
    let noiseMax = -Infinity;
    for (let i = centerBin - noiseBins; i <= centerBin + noiseBins; i++) {
      if (i >= 0 && i < bufferLength) {
        if (i >= centerBin - searchBins && i <= centerBin + searchBins) {
          if (freqData[i] > peak) peak = freqData[i];
        } else {
          if (freqData[i] > noiseMax) noiseMax = freqData[i];
        }
      }
    }
    return { peak, noiseMax };
  };

  const space = getSignalAndNoise(binSpace);
  const mark = getSignalAndNoise(binMark);

  // Dynamic strict thresholding to ignore room noise and typing
  const ABS_THRESH = state.modemAnalyser.minDecibels + 15;
  const SNR_THRESH = 10; // Peak must be 10dB louder than its surrounding ±300Hz noise

  const isSpaceValid =
    space.peak > ABS_THRESH && space.peak > space.noiseMax + SNR_THRESH;
  const isMarkValid =
    mark.peak > ABS_THRESH && mark.peak > mark.noiseMax + SNR_THRESH;

  let currentSymbol = null; // null = noise, 0 = space, 1 = mark

  if (isMarkValid && space.peak < mark.peak - 5) {
    currentSymbol = 1;
  } else if (isSpaceValid && mark.peak < space.peak - 5) {
    currentSymbol = 0;
  }

  // Update UI status to show if a carrier is detected
  if (dom.modemStatus) {
    if (currentSymbol !== null && rxState.state === "IDLE") {
      dom.modemStatus.textContent = "(Carrier Detect)";
      dom.modemStatus.style.color = "#facc15"; // yellow
    } else if (rxState.state !== "IDLE") {
      dom.modemStatus.textContent = "(Receiving...)";
      dom.modemStatus.style.color = "#10b981"; // green
    } else {
      dom.modemStatus.textContent = "(Listening)";
      dom.modemStatus.style.color = "var(--text-muted)";
    }
  }

  // State machine for asynchronous receiver
  if (rxState.state === "IDLE") {
    if (currentSymbol === 0 && rxState.lastSymbol === 1) {
      // Detected Start Bit (1 -> 0 transition)
      rxState.state = "RECEIVING";
      rxState.startTime = now;
      rxState.bitIndex = 0;
      rxState.currentByte = 0;
    }
  } else {
    const elapsedTime = now - rxState.startTime;

    // Sample continuously when elapsed Time hits `(bitIndex + 0.5) * T`
    while (elapsedTime > (rxState.bitIndex + 0.5) * T) {
      const bitVal = currentSymbol !== null ? currentSymbol : 1;

      if (rxState.bitIndex === 0) {
        // start bit verification: should be 0. If it's 1, false start.
        if (bitVal === 1) {
          rxState.state = "IDLE";
          break;
        }
      } else if (rxState.bitIndex >= 1 && rxState.bitIndex <= 8) {
        // DATA bits 1..8
        const shift = rxState.bitIndex - 1;
        if (bitVal === 1) {
          rxState.currentByte |= 1 << shift;
        }
      } else if (rxState.bitIndex === 9) {
        // STOP bit (should be 1)
        rxState.history.push(rxState.currentByte);
        try {
          const decoder = new TextDecoder("utf-8");
          let str = decoder.decode(new Uint8Array(rxState.history));

          // Replace replacement character with [Unknown]
          str = str.replace(/\uFFFD/g, "[Unknown]");

          state.modemRxBuffer = str;
          if (dom.modemRxLog) {
            dom.modemRxLog.value = state.modemRxBuffer;
            dom.modemRxLog.scrollTop = dom.modemRxLog.scrollHeight;
          }
        } catch (e) {}

        rxState.state = "IDLE";
        break;
      }

      rxState.bitIndex++;
    }
  }

  if (currentSymbol !== null) {
    rxState.lastSymbol = currentSymbol;
  }
}
