const CACHE = "netcheck-v6";
const SHELL = ["/", "/index.html", "/manifest.json", "/icon.svg"];

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
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.pathname.startsWith("/api/")) return; // never cache diagnostics
  // Data fetches must always hit the network: `cache: "no-store"` requests
  // (speed tests) and cross-origin traffic.
  if (e.request.cache === "no-store" || url.origin !== self.location.origin) return;

  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => caches.match("/index.html").then((r) => r || caches.match("/")))
    );
    return;
  }

  // Vite content-hashed immutable assets: cache-first.
  if (url.pathname.startsWith("/assets/")) {
    e.respondWith(
      caches.match(e.request).then((cached) =>
        cached || fetch(e.request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        })
      )
    );
    return;
  }

  // Unhashed same-origin static files (manifest, icon, fonts): stale-while-revalidate.
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const refresh = fetch(e.request).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      });
      if (cached) {
        e.waitUntil(refresh.catch(() => {}));
        return cached;
      }
      return refresh;
    })
  );
});
