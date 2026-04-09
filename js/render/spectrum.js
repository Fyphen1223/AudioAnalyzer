// WebGL Shader Configs
const VS_SOURCE = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
    v_uv = a_position * 0.5 + 0.5; // (0,0) to (1,1)
    gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const FS_SOURCE = `
precision mediump float;
varying vec2 v_uv;

uniform sampler2D u_dataTex;
uniform int u_bufferLength;
uniform int u_useLogScale;
uniform float u_minFreqLog;
uniform float u_maxFreqLog;
uniform float u_logMinFreq;
uniform float u_logMaxMinRatio;
uniform float u_linearRange;
uniform float u_hzPerBin;

void main() {
    float freqIndex;
    if (u_useLogScale == 1) {
        float freq = pow(10.0, v_uv.x * u_logMaxMinRatio + u_logMinFreq);
        freqIndex = freq / u_hzPerBin;
    } else {
        float freq = u_minFreqLog + v_uv.x * u_linearRange;
        freqIndex = freq / u_hzPerBin;
    }

    if (freqIndex < 0.0 || freqIndex >= float(u_bufferLength)) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
        return;
    }

    float texX = (freqIndex + 0.5) / float(u_bufferLength);
    float dataVal = texture2D(u_dataTex, vec2(texX, 0.5)).a; 
    
    if (v_uv.y <= dataVal) {
        gl_FragColor = vec4(0.886, 0.910, 0.941, 1.0); // #e2e8f0
    } else {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
    }
}`;

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error("Shader Err:", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function initWebGL(gl) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, VS_SOURCE);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FS_SOURCE);
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("Program Err:", gl.getProgramInfoLog(program));
    return null;
  }

  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW,
  );

  return { program, positionBuffer };
}

let webglStateSpec = null;
let currentU8DataSpec = null;

function setupWebGLSpec(gl) {
  const result = initWebGL(gl);
  if (!result) return false;

  const { program, positionBuffer } = result;

  const dataTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, dataTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  webglStateSpec = {
    gl,
    program,
    positionBuffer,
    dataTex,
    uploadedBufferLength: 0,
    locs: {
      a_pos: gl.getAttribLocation(program, "a_position"),
      u_dataTex: gl.getUniformLocation(program, "u_dataTex"),
      u_bufferLength: gl.getUniformLocation(program, "u_bufferLength"),
      u_useLogScale: gl.getUniformLocation(program, "u_useLogScale"),
      u_minFreqLog: gl.getUniformLocation(program, "u_minFreqLog"),
      u_maxFreqLog: gl.getUniformLocation(program, "u_maxFreqLog"),
      u_logMinFreq: gl.getUniformLocation(program, "u_logMinFreq"),
      u_logMaxMinRatio: gl.getUniformLocation(program, "u_logMaxMinRatio"),
      u_linearRange: gl.getUniformLocation(program, "u_linearRange"),
      u_hzPerBin: gl.getUniformLocation(program, "u_hzPerBin"),
    },
  };
  return true;
}

export function drawSpectrum({ state, dom, frame }) {
  if (!dom.ctxSpectrum || !dom.ctxSpectrumOverlay) return;
  const gl = dom.ctxSpectrum;
  const ctxOvl = dom.ctxSpectrumOverlay;

  if (!webglStateSpec) {
    if (!setupWebGLSpec(gl)) return;
  }
  const ws = webglStateSpec;

  const {
    wSpec,
    hSpec,
    bufferLength,
    freqData,
    minDb,
    dbRange,
    useLogScale,
    hzPerBin,
    minFreqLog,
    maxFreqLog,
    logMaxMinRatio,
    logMinFreq,
    linearRange,
  } = frame;

  if (wSpec === 0 || hSpec === 0) return;

  gl.bindTexture(gl.TEXTURE_2D, ws.dataTex);

  if (ws.uploadedBufferLength !== bufferLength) {
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.ALPHA,
      bufferLength,
      1,
      0,
      gl.ALPHA,
      gl.UNSIGNED_BYTE,
      null,
    );
    ws.uploadedBufferLength = bufferLength;
    currentU8DataSpec = new Uint8Array(bufferLength);
  }

  let maxFreqVal = -Infinity;
  let maxFreqIndex = 0;

  for (let i = 0; i < bufferLength; i++) {
    const val = freqData[i];
    if (val > maxFreqVal) {
      maxFreqVal = val;
      maxFreqIndex = i;
    }
    let p = (val - minDb) / dbRange;
    if (p < 0) p = 0;
    else if (p > 1) p = 1;
    currentU8DataSpec[i] = p * 255;
  }

  gl.texSubImage2D(
    gl.TEXTURE_2D,
    0,
    0,
    0,
    bufferLength,
    1,
    gl.ALPHA,
    gl.UNSIGNED_BYTE,
    currentU8DataSpec,
  );

  gl.useProgram(ws.program);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, ws.dataTex);
  gl.uniform1i(ws.locs.u_dataTex, 0);

  gl.uniform1i(ws.locs.u_bufferLength, bufferLength);
  gl.uniform1i(ws.locs.u_useLogScale, useLogScale ? 1 : 0);
  gl.uniform1f(ws.locs.u_minFreqLog, minFreqLog);
  gl.uniform1f(ws.locs.u_maxFreqLog, maxFreqLog);
  gl.uniform1f(ws.locs.u_logMinFreq, logMinFreq);
  gl.uniform1f(ws.locs.u_logMaxMinRatio, logMaxMinRatio);
  gl.uniform1f(ws.locs.u_linearRange, linearRange);
  gl.uniform1f(ws.locs.u_hzPerBin, hzPerBin);

  gl.bindBuffer(gl.ARRAY_BUFFER, ws.positionBuffer);
  gl.enableVertexAttribArray(ws.locs.a_pos);
  gl.vertexAttribPointer(ws.locs.a_pos, 2, gl.FLOAT, false, 0, 0);

  // Clear transparent
  gl.clearColor(0.0, 0.0, 0.0, 0.0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  // -- CPU Overlay Rendering --
  ctxOvl.clearRect(0, 0, wSpec, hSpec);

  const howlingEnabled = dom.howlingWarning !== null;
  let peaks = [];
  let howlingDetected = false;
  const { peakCount } = state.config;

  if (howlingEnabled || peakCount > 0) {
    let sumPower = 0;
    let sampleCount = 0;
    for (let i = 0; i < bufferLength; i += 4) {
      sumPower += Math.pow(10, freqData[i] / 10);
      sampleCount++;
    }
    const avgDb = 10 * Math.log10(sumPower / sampleCount);
    const mOffset = Math.max(2, Math.round(150 / hzPerBin));

    for (let i = 2; i < bufferLength - 2; i++) {
      const val = freqData[i];
      if (val <= minDb + 5) continue;
      const f = i * hzPerBin;
      if (f < minFreqLog || f > maxFreqLog) continue;

      if (
        val > freqData[i - 1] &&
        val > freqData[i + 1] &&
        val > freqData[i - 2] &&
        val > freqData[i + 2]
      ) {
        peaks.push({ index: i, val, freq: f });

        if (howlingEnabled) {
          const papr = val - avgDb;
          let pnpr = 0;
          if (i - mOffset >= 0 && i + mOffset < bufferLength) {
            pnpr = Math.min(
              val - freqData[i - mOffset],
              val - freqData[i + mOffset],
            );
          }
          let phpr = 0;
          const h2Index = i * 2;
          if (h2Index < bufferLength) phpr = val - freqData[h2Index];

          if (
            f > 200 &&
            val > -35 &&
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

  if (dom.howlingWarning) {
    const disp = howlingDetected ? "inline-block" : "none";
    if (dom.howlingWarning.style.display !== disp) {
      dom.howlingWarning.style.display = disp;
    }
  }

  ctxOvl.fillStyle = "#fff";
  ctxOvl.font = "12px monospace";
  ctxOvl.textAlign = "center";

  peaks.sort((a, b) => b.val - a.val);
  const maxPeaksToShow = peakCount;
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

    if (peakX >= 0 && peakX <= wSpec) {
      ctxOvl.beginPath();
      ctxOvl.arc(peakX, peakY - 4, 3, 0, 2 * Math.PI);
      ctxOvl.fill();

      const freqText =
        freq >= 1000 ? (freq / 1000).toFixed(1) + "k" : Math.round(freq);
      const textY = peakY - 10;
      let align = "center";

      if (peakX < 40) align = "left";
      if (peakX > wSpec - 20) align = "right";

      ctxOvl.textAlign = align;
      ctxOvl.fillText(freqText, peakX, textY);
    }
  });

  if (state.isHovering && state.mouseX >= 0 && state.mouseY >= 0 && minDb < 0) {
    let hoverFreq = 0;
    if (useLogScale) {
      hoverFreq =
        minFreqLog * Math.pow(maxFreqLog / minFreqLog, state.mouseX / wSpec);
    } else {
      hoverFreq =
        minFreqLog + (maxFreqLog - minFreqLog) * (state.mouseX / wSpec);
    }

    let hoverFreqText =
      hoverFreq >= 1000
        ? (hoverFreq / 1000).toFixed(1) + "k"
        : Math.round(hoverFreq);
    hoverFreqText += " Hz";

    if (dom.hoverTooltip && dom.canvasSpectrum) {
      const canvasRect = dom.canvasSpectrum.getBoundingClientRect();
      const tooltipX = canvasRect.left + state.mouseX;
      const tooltipY = canvasRect.top + state.mouseY;

      if (dom.hoverTooltip.style.display !== "block") {
        dom.hoverTooltip.style.display = "block";
      }
      dom.hoverTooltip.style.left = tooltipX + "px";
      dom.hoverTooltip.style.top = tooltipY + "px";
      if (dom.hoverTooltip.textContent !== hoverFreqText) {
        dom.hoverTooltip.textContent = hoverFreqText;
      }
    }
  } else if (dom.hoverTooltip) {
    if (dom.hoverTooltip.style.display !== "none") {
      dom.hoverTooltip.style.display = "none";
    }
  }

  if (dom.peakFreqValue) {
    if (state.audioCtx && maxFreqVal > minDb + 10) {
      const dominantFreq = maxFreqIndex * hzPerBin;
      const text = dominantFreq.toFixed(0);
      if (dom.peakFreqValue.textContent !== text) {
        dom.peakFreqValue.textContent = text;
      }
    } else {
      if (dom.peakFreqValue.textContent !== "--") {
        dom.peakFreqValue.textContent = "--";
      }
    }
  }

  // Draw horizontal frequency axis
  ctxOvl.textAlign = "center";
  ctxOvl.textBaseline = "bottom";
  ctxOvl.fillStyle = "rgba(226, 232, 240, 0.4)";

  const labels = [minFreqLog];
  const steps = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 15000, 20000];
  if (useLogScale) {
    for (let s of steps) {
      if (s > minFreqLog && s < maxFreqLog) labels.push(s);
    }
  } else {
    const step =
      Math.pow(10, Math.max(1, Math.floor(Math.log10(linearRange)) - 1)) * 5;
    for (
      let f = Math.ceil(minFreqLog / step) * step;
      f < maxFreqLog;
      f += step
    ) {
      labels.push(f);
    }
  }
  labels.push(maxFreqLog);

  for (let f of labels) {
    let ratio = useLogScale
      ? (Math.log10(f) - logMinFreq) / logMaxMinRatio
      : (f - minFreqLog) / linearRange;

    const fStr = f >= 1000 ? `${(f / 1000).toFixed(1)}k` : `${f}`;
    ctxOvl.fillText(fStr, ratio * wSpec, hSpec - 2);

    // Draw subtle vertical grid line
    ctxOvl.beginPath();
    ctxOvl.moveTo(ratio * wSpec, 0);
    ctxOvl.lineTo(ratio * wSpec, hSpec - 15);
    ctxOvl.strokeStyle = "rgba(255, 255, 255, 0.05)";
    ctxOvl.stroke();
  }
}
