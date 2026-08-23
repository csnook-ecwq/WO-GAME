/**
 * sw.js — a service worker whose only job is to remove itself.
 *
 * The previous version of this app installed a caching service worker. It is
 * still registered on any phone that opened the old build, and it holds a cache
 * of files that no longer exist. Simply deleting this file would leave that old
 * worker in place with nothing to update it against.
 *
 * So instead: install, purge every cache, unregister, and reload whatever
 * windows are open so they pick up the real build from the network.
 *
 * A proper caching worker can come back later, once the app is worth caching.
 * It will need a different filename or a version bump to get past this one.
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));

    await self.registration.unregister();

    const windows = await self.clients.matchAll({ type: 'window' });
    for (const w of windows) {
      try { w.navigate(w.url); } catch { /* already gone */ }
    }
  })());
});

// No fetch handler at all: everything goes straight to the network.
