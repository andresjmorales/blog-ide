/*
 * BlogIDE service worker (M1: app-shell caching).
 * Strategy: network-first for navigations (so deploys are picked up),
 * cache-first for static assets. Document content is never cached here —
 * offline editing is handled by IndexedDB (milestone 3).
 */
// v3: drops caches that could hold redirected or per-invitee pages.
const CACHE_NAME = "blogide-shell-v3";
const SHELL_URLS = [
  "/",
  "/editor",
  "/offline.html",
  "/manifest.webmanifest",
  "/icons/icon.svg",
];
const NAV_TIMEOUT_MS = 4000;

/**
 * Navigations the worker leaves to the browser. Auth links carry one-time
 * tokens and always redirect; share pages hold another person's essay and
 * must never be cached on this device.
 */
const BYPASS_PREFIXES = [
  "/auth/",
  "/login",
  "/signup",
  "/reset",
  "/s/",
  "/shared",
];

function bypassesWorker(pathname) {
  return BYPASS_PREFIXES.some(
    (prefix) =>
      pathname === prefix ||
      pathname.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`)
  );
}

/**
 * Safari (and Chrome) refuse a navigation answered with a response that
 * already followed a redirect ("Response served by service worker has
 * redirections"). Hand the browser a plain redirect to the final URL instead.
 */
function forNavigation(response) {
  return response.redirected ? Response.redirect(response.url, 302) : response;
}

function fetchWithTimeout(request, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(request, { signal: controller.signal }).finally(() => {
    clearTimeout(timer);
  });
}

self.addEventListener("install", (event) => {
  // Cache each shell URL on its own: a signed-in "/" redirects to /editor,
  // and a redirected copy must not be stored (or fail the whole install).
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        Promise.allSettled(
          SHELL_URLS.map((url) =>
            fetch(url).then((response) => {
              if (response.ok && !response.redirected) {
                return cache.put(url, response);
              }
              return undefined;
            })
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // never intercept API/CDN calls
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    if (bypassesWorker(url.pathname)) return;
    event.respondWith(
      fetchWithTimeout(request, NAV_TIMEOUT_MS)
        .then((response) => {
          // Don't let a 500, a maintenance page, or a sign-in redirect
          // replace the good offline copy of the app shell.
          if (response.ok && !response.redirected) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return forNavigation(response);
        })
        .catch(() =>
          caches
            .match(request)
            .then((cached) => cached ?? caches.match("/editor"))
            .then((cached) => cached ?? caches.match("/offline.html"))
            .then((cached) => cached ?? Response.error())
        )
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ??
        fetch(request).then((response) => {
          if (
            response.ok &&
            (url.pathname.startsWith("/_next/static/") ||
              url.pathname.startsWith("/icons/"))
          ) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
    )
  );
});
