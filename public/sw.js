const CACHE_NAME = "zoomigo-shell-v5";
const IS_DEV_PREVIEW = self.location.hostname.startsWith("dev.");
const APP_SHELL = [
  "/",
  "/log",
  "/team",
  "/me",
  "/prizes",
  "/login",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  if (IS_DEV_PREVIEW) {
    event.waitUntil(clearAllCaches());
    self.skipWaiting();
    return;
  }
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  if (IS_DEV_PREVIEW) {
    event.waitUntil(
      clearAllCaches()
        .then(() => self.clients.claim())
        .then(() => self.registration.unregister()),
    );
    return;
  }
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (IS_DEV_PREVIEW) return;
  if (event.request.method !== "GET") return;
  const requestURL = new URL(event.request.url);
  if (
    requestURL.origin !== self.location.origin ||
    requestURL.pathname.startsWith("/api/")
  ) {
    return;
  }
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (
          response.ok &&
          !response.headers.get("Cache-Control")?.includes("no-store")
        ) {
          const copy = response.clone();
          event.waitUntil(
            caches
              .open(CACHE_NAME)
              .then((cache) => cache.put(event.request, copy)),
          );
        }
        return response;
      })
      .catch(() =>
        caches
          .match(event.request)
          .then((cached) => cached || caches.match("/")),
      ),
  );
});

function clearAllCaches() {
  return caches
    .keys()
    .then((keys) => Promise.all(keys.map((key) => caches.delete(key))));
}
