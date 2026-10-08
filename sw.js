// Offline support: the game always opens, even with no connection, and a new
// version appears on the next launch. Bump VERSION when the file list changes.
const VERSION = 'apple-v4';
const SHELL = [
  './', 'index.html', 'css/style.css', 'favicon.svg', 'manifest.webmanifest',
  'js/main.js', 'js/engine.js', 'js/render.js', 'js/config.js', 'js/audio.js', 'js/input.js', 'js/save.js',
  'js/levels.js', 'js/sync.js', 'js/platform.js',
  'fonts/fredoka-latin.woff2', 'fonts/fredoka-latin-ext.woff2', 'vendor/qrcode-1.4.4.min.js',
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

// Network first, so a new version shows up on the very next launch; the cache
// is only the fallback when you're offline.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (new URL(req.url).pathname.includes('/api/')) return;
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    try {
      const res = await fetch(req, { cache: 'no-cache' });
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch {
      return (await cache.match(req, { ignoreSearch: true })) || Response.error();
    }
  })());
});
