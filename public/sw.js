const CACHE_NAME = "netcheck-v5";
const OFFLINE_URL = "/public/offline.html";

// Assets to cache on install — non-hashed, essential resources
const PRECACHE = [
  "/",
  OFFLINE_URL,
  "/public/css/tokens.css",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

function isImmutableAsset(url) {
  // Hashed assets from Vite builds (e.g., /assets/index-CKpnwR68.js)
  return url.pathname.startsWith("/assets/") || url.pathname.startsWith("/css/");
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // API requests: network-only with offline fallback
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(JSON.stringify({ error: "offline" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        })
      )
    );
    return;
  }

  // Navigation: network-first, cache the shell, offline fallback
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("/", clone));
        }
        return response;
      }).catch(() => caches.match("/").then((cached) => cached || caches.match(OFFLINE_URL)))
    );
    return;
  }

  // Immutable hashed assets (JS/CSS): cache-first
  if (isImmutableAsset(url)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Everything else: network-first with cache fallback
  event.respondWith(
    fetch(event.request).then((response) => {
      if (response.ok && url.protocol === "https:") {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
      }
      return response;
    }).catch(() => caches.match(event.request))
  );
});
