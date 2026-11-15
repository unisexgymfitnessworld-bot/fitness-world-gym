const CACHE_NAME = "fitness-world-gymos-v6";
const APP_SHELL = ["/", "/manifest.webmanifest", "/favicon.svg", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Per-asset caching: one flaky file must not fail the whole install.
      const results = await Promise.allSettled(
        APP_SHELL.map((url) =>
          fetch(new Request(url, { cache: "reload" })).then((response) => {
            if (response.ok) {
              return cache.put(url, response);
            }
            throw new Error(`Bad response for ${url}: ${response.status}`);
          }),
        ),
      );
      const failed = results.filter((result) => result.status === "rejected");
      if (failed.length > 0) {
        console.warn("Service worker precache skipped files:", failed.length);
      }
      await self.skipWaiting();
    }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function fetchWithTimeout(request, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(request, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

function isHtmlServedAsAsset(request, response) {
  if (request.mode === "navigate") {
    return false;
  }
  const contentType = response.headers.get("content-type") || "";
  return contentType.includes("text/html");
}

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  const isNavigation = request.mode === "navigate";

  // Network-first strategy for navigation and assets to avoid stale UI.
  // Never cache an HTML page as a script/style: the SPA fallback serves
  // index.html (200) for missing old-hashed chunks, and caching that as JS
  // white-screens the app until the cache is cleared.
  // The network race has a timeout: on a stalled mobile connection the
  // worker falls back to cache instead of hanging the page forever.
  event.respondWith(
    fetchWithTimeout(request, 10000)
      .then((response) => {
        if (response.ok && !isHtmlServedAsAsset(request, response)) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() =>
        caches.match(request).then((cached) => {
          if (cached) {
            return cached;
          }
          // Only navigations may fall back to the app shell. Serving HTML
          // for a failed JS/CSS chunk breaks parsing and white-screens the app.
          if (isNavigation) {
            return caches.match("/");
          }
          return Response.error();
        }),
      )
  );
});
