/**
 * Service worker: makes the deployed game work with the network off (N2).
 *
 * Bump CACHE_NAME whenever a shell file changes, otherwise tablets that already
 * installed the game keep serving the old copy.
 */
const CACHE_NAME = 'racing-quiz-v2';

const SHELL = [
  './',
  './index.html',
  './styles.css',
  './config.js',
  './game.js',
  './ui.js',
  './sw-register.js',
  './questions.json',
  './manifest.webmanifest',
  './favicon.svg',
  './assets/car.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)))
      )
      .then(() => self.clients.claim())
  );
});

/**
 * Stale-while-revalidate for our own files: the classroom gets an instant,
 * offline-capable load, and a new deploy is picked up on the next reload.
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request, { ignoreSearch: true });

      const network = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            cache.put(request, response.clone());
          }
          return response;
        })
        .catch(() => null);

      if (cached) {
        event.waitUntil(network); // refresh in the background
        return cached;
      }

      const fresh = await network;
      if (fresh) {
        return fresh;
      }

      // Offline and never cached: fall back to the app shell for navigations.
      if (request.mode === 'navigate') {
        const shell = await cache.match('./index.html');
        if (shell) {
          return shell;
        }
      }
      return Response.error();
    })
  );
});
