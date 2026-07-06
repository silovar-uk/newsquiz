const CACHE_NAME = 'news-context-quiz-v6-source-links';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './app-icon.png',
  './freshness-patch.js',
  './external-links-patch.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      const responseCopy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseCopy));
      return response;
    }).catch(() => caches.match('./index.html')))
  );
});
