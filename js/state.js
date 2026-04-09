export function createInitialState() {
  return {
    audioCtx: null,
    analyser: null,
    analyserL: null,
    analyserR: null,
    splitter: null,
    source: null,
    stream: null,
    animationId: null,

    isRunning: false,
    mouseX: -1,
    mouseY: -1,
    isHovering: false,

    availableMics: [],

    prevPeakValue: -Infinity,
    eventLogs: [],
    lastDrawTime: 0,
    fpsFrameCount: 0,
    lastFpsTime: 0,

    freqDataBuffer: null,
    timeDataBuffer: null,
    timeLBuffer: null,
    timeRBuffer: null,

    config: {
      freqMinLog: 20,
      freqMaxLog: 20000,
      useLogScale: true,
      peakCount: 0,
      meteringStandard: "peak",
      specMode: "standard",
      specTheme: "classic",
      updateRateFps: 60,
      wSpec: 0,
      hSpec: 0,
      wWave: 0,
      hWave: 0,
      wSpecg: 0,
      hSpecg: 0,
      wVec: 0,
      hVec: 0,
    },
  };
}
