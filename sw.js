/* Downbeat's offline shell. An installed app has to work with no connection —
   that is most of the point of installing it — so the whole shell is cached on
   first run and served from the cache whenever the network fails. */
const CACHE = 'downbeat-shell-v13';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/tokens.css',
  './css/base.css',
  './css/components.css',
  './css/screens.css',
  './css/device.css',
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
  './src/ios.js',
  './src/ui.js',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

/* cache.addAll() is atomic: one 404 rejects the whole install and the worker
   never activates — with no visible symptom, because the page swallows the
   registration rejection. The document and the code it needs are required; the
   fonts and icons are best-effort, so a missing icon can never cost the app
   its offline mode. */
const REQUIRED = SHELL.filter((url) => /\.(html|css|js)$|\/$/.test(url));
const OPTIONAL = SHELL.filter((url) => REQUIRED.indexOf(url) < 0);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(REQUIRED).then(() =>
        Promise.all(OPTIONAL.map((url) => cache.add(url).catch(() => null)))))
      .then(() => self.skipWaiting())
  );
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

  /* Stale-while-revalidate, for both the document and everything under it.

     This used to be network-first, which on a good connection is invisible and
     on a bad one is the whole experience: an installed app with its entire
     shell already on disk would sit on a white screen waiting for a request
     that was going to time out. The shell is versioned by CACHE, so serving
     the copy we have is always serving a coherent app — and the fetch still
     runs, so the next launch has whatever changed. */
  const key = request.mode === 'navigate' ? './index.html' : request;

  event.respondWith(
    caches.match(key).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(key, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
