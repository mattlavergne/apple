// Offline support. Serve from cache instantly, refresh the cache in the
// background, so the game always opens (even offline) and picks up updates on
// the next launch. Bump VERSION when the list of files changes.
const VERSION = 'apple-v2';
const SHELL = [
  './', 'index.html', 'css/style.css', 'favicon.svg', 'manifest.webmanifest',
  'js/main.js', 'js/engine.js', 'js/render.js', 'js/config.js', 'js/audio.js', 'js/input.js', 'js/save.js',
  'assets/icon-192.png', 'assets/icon-512.png', 'assets/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.open(VERSION).then(async cache => {
    const cached = await cache.match(req, { ignoreSearch: true });
    const fresh = fetch(req).then(res => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    }).catch(() => cached);
    return cached || fresh;
  }));
});
