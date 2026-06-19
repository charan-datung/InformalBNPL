/* Informal BNPL — basic service worker.
 *
 * Deliberately minimal for the pilot: it makes the app installable (a fetch
 * handler is required) and gives a friendly offline fallback. It is NOT a
 * caching layer for live data — loan/escrow state must always be fetched fresh,
 * so navigations and API/auth calls are network-first and never served stale.
 */

const VERSION = "bnpl-v1";
const STATIC_CACHE = `static-${VERSION}`;
const OFFLINE_URL = "/offline.html";

const PRECACHE = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // don't touch Supabase, etc.

  // Page navigations: network-first, fall back to the offline page when down.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL).then((r) => r || Response.error()),
      ),
    );
    return;
  }

  // Static same-origin assets: cache-first (icons, manifest, build assets).
  if (
    url.pathname.startsWith("/_next/static/") ||
    PRECACHE.includes(url.pathname) ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".webmanifest")
  ) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((resp) => {
            const copy = resp.clone();
            caches.open(STATIC_CACHE).then((c) => c.put(request, copy));
            return resp;
          }),
      ),
    );
  }
});
