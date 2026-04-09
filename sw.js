const CACHE_NAME = "audio-analyzer-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./js/app.js",
  "./js/audio.js",
  "./js/dom.js",
  "./js/layout.js",
  "./js/render.js",
  "./js/settings.js",
  "./js/state.js",
  "./js/render/spectrogram.js",
  "./js/render/spectrum.js",
  "./js/render/vectorscope.js",
  "./js/render/waveformMeter.js"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener("fetch", (e) => {
  e.respondWith(
    caches.match(e.request).then((res) => res || fetch(e.request))
  );
});
