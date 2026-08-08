/* Downbeat's offline shell. The song itself is also saved in localStorage by
   ui.js, so an interrupted connection loses neither the app nor the work. */
const CACHE = 'downbeat-shell-v3';
/* The fetch handler below returns early for cross-origin requests, so anything
   not in this array and not same-origin simply does not exist offline. That is
   why the two typefaces are here: without them the installed app — which is
   this product's primary form — would fall back to system faces in the one
   context it was built for. */
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/tokens.css',
  './css/base.css',
  './css/layout.css',
  './css/controls.css',
  './css/lane.css',
  './css/run.css',
  './css/faceplate.css',
  './css/sheets.css',
  './css/overlays.css',
  './css/motion.css',
  './css/responsive.css',
  './css/a11y.css',
  './fonts/archivo-latin.woff2',
  './fonts/archivo-latin-ext.woff2',
  './fonts/martianmono-latin.woff2',
  './fonts/martianmono-latin-ext.woff2',
  './src/theory.js',
  './src/genres.js',
  './src/compose.js',
  './src/audio.js',
  './src/midi.js',
  './src/mark.js',
  './src/motion.js',
  './src/devices.js',
  './src/arrange.js',
  './src/library.js',
  './src/ui.js',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put('./index.html', copy));
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
        return response;
      })
      .catch(() => caches.match(request))
  );
});
