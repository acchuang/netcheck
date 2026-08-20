const CACHE = "netcheck-v3";
const SHELL = ["/", "/index.html", "/manifest.json", "/icon.svg", "/css/styles.css"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith("/api/")) return; // never cache diagnostics
  // Data fetches must always hit the network: `cache: "no-store"` requests
  // (speed tests) and cross-origin traffic (Ookla/fast.com download hosts,
  // header scans). Caching those made repeat speed tests read from the SW
  // cache instead of the wire — garbage results.
  if (e.request.cache === "no-store" || url.origin !== self.location.origin) return;

  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request).catch(() => caches.match("/index.html").then((r) => r || caches.match("/")))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cached) =>
      cached || fetch(e.request).then((res) => {
        if (res.ok && e.request.method === "GET") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      }).catch(() => cached)
    )
  );
});
