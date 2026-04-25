let gl = null;
let program = null;
let lBuffer = null;
let rBuffer = null;
let aLLoc = -1;
let aRLoc = -1;
let uColorLoc = -1;

const VS_SOURCE = `
attribute float a_l;
attribute float a_r;
void main() {
    float x = a_r - a_l;
    float y = -(a_l + a_r);
    gl_Position = vec4(x, y, 0.0, 1.0);
}`;

const FS_SOURCE = `
precision mediump float;
uniform vec4 u_color;
void main() {
    gl_FragColor = u_color;
}`;

function initWebGL(context) {
  if (gl === context) return;
  gl = context;
  if (!gl) return;

  const vs = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vs, VS_SOURCE);
  gl.compileShader(vs);

  const fs = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fs, FS_SOURCE);
  gl.compileShader(fs);

  program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);

  aLLoc = gl.getAttribLocation(program, "a_l");
  aRLoc = gl.getAttribLocation(program, "a_r");
  uColorLoc = gl.getUniformLocation(program, "u_color");

  lBuffer = gl.createBuffer();
  rBuffer = gl.createBuffer();
}

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

  const fftSize = state.analyserL.fftSize;

  if (!state.timeLBuffer || state.timeLBuffer.length !== fftSize) {
    state.timeLBuffer = new Float32Array(fftSize);
  }
  const timeL = state.timeLBuffer;

  if (
    !state.timeRBuffer ||
    state.timeRBuffer.length !== state.analyserR.fftSize
  ) {
    state.timeRBuffer = new Float32Array(state.analyserR.fftSize);
  }
  const timeR = state.timeRBuffer;

  const minFftSize = Math.min(fftSize, state.analyserR.fftSize);

  if (!state.isFrozen) {
    state.analyserL.getFloatTimeDomainData(timeL);
    state.analyserR.getFloatTimeDomainData(timeR);
  }

  let dot = 0;
  let normL = 0;
  let normR = 0;

  for (let i = 0; i < minFftSize; i++) {
    const l = timeL[i];
    const r = timeR[i];
    dot += l * r;
    normL += l * l;
    normR += r * r;
  }

  initWebGL(dom.ctxVectorscope);

  gl.viewport(0, 0, dom.canvasVectorscope.width, dom.canvasVectorscope.height);

  // Clear with background color: rgba(10, 15, 20, 0.2)
  gl.clearColor(10 / 255, 15 / 255, 20 / 255, 0.2);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  gl.useProgram(program);

  gl.bindBuffer(gl.ARRAY_BUFFER, lBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, timeL, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(aLLoc);
  gl.vertexAttribPointer(aLLoc, 1, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, rBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, timeR, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(aRLoc);
  gl.vertexAttribPointer(aRLoc, 1, gl.FLOAT, false, 0, 0);

  // Line color: rgba(226, 232, 240, 0.8)
  gl.uniform4f(uColorLoc, 226 / 255, 232 / 255, 240 / 255, 0.8);
  gl.lineWidth(1.0);
  gl.drawArrays(gl.LINE_STRIP, 0, minFftSize);

  gl.disableVertexAttribArray(aLLoc);
  gl.disableVertexAttribArray(aRLoc);

  // NOTE: Text overlays (M, -, L, R) were rendered here in Canvas2D.
  // Since we moved to WebGL, we drop the text overlay for now, or you can
  // add a separate overlapping 2D canvas for labels in the future.

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
