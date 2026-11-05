// Service Worker for 城プロRE 編成・バフ/デバフ統合ダッシュボード
// アプリ更新時は以下の CACHE_VERSION のバージョン番号をインクリメントしてください。
const CACHE_VERSION = "scre-helper-v1.0.0";
const PRECACHE_ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./data.js",
  "./guides.js",
  "./tier_data.js",
  "./style.css",
  "./manifest.json",
  "./icons/pwa-192.png",
  "./icons/pwa-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn("[SW] Some assets failed to precache:", err);
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  // Ignore non-GET and chrome-extension/data schemes
  if (req.method !== "GET" || !req.url.startsWith("http")) return;

  event.respondWith(
    caches.match(req).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch in background for update if network is available (stale-while-revalidate for local assets)
        if (req.url.includes("/app/") || req.url.endsWith(".js") || req.url.endsWith(".css") || req.url.endsWith(".html")) {
          fetch(req).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const respClone = networkResponse.clone();
              caches.open(CACHE_VERSION).then((cache) => cache.put(req, respClone));
            }
          }).catch(() => {});
        }
        return cachedResponse;
      }

      return fetch(req).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== "basic") {
          return networkResponse;
        }
        // Cache icons and core assets dynamically
        if (req.url.includes("/icons/") || req.url.includes("pwa-")) {
          const respClone = networkResponse.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, respClone));
        }
        return networkResponse;
      }).catch(() => {
        // Fallback for html pages
        if (req.headers.get("accept") && req.headers.get("accept").includes("text/html")) {
          return caches.match("./index.html");
        }
      });
    })
  );
});
