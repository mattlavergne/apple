// Retired. The web copy used to work offline through this service worker, but
// it's now a private test site behind a sign-in, which an old worker couldn't
// load pages through (it showed a blank page). A browser that still has the old
// worker installs this one on its next update check: it deletes the cached
// files, removes itself and reloads the open pages from the network.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const key of await caches.keys()) await caches.delete(key);
    await self.registration.unregister();
    for (const client of await self.clients.matchAll({ type: 'window' })) client.navigate(client.url).catch(() => {});
  })());
});
