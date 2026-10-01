/* PortPass service worker (round 5, §6). Hand-written on purpose: no build
   step and no dependency to keep in step with Next. Bump CACHE_VERSION to
   drop every cache on the next visit.

   Rules:
   - App shell and static assets: cached, served stale-while-revalidate.
   - Pages: network first; the last copy of each public page is kept so it
     still opens offline; with nothing saved, /offline is shown.
   - Never cached and never answered from cache: every /api/ call, staff
     and admin areas, account pages, and every page that shows or collects
     personal data. Those requests are not intercepted at all. */

const CACHE_VERSION = "v3";
const SHELL_CACHE = `portpass-shell-${CACHE_VERSION}`;
const PAGES_CACHE = `portpass-pages-${CACHE_VERSION}`;
const ASSETS_CACHE = `portpass-assets-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline";
const SHELL_URLS = ["/", "/app", "/favicon.svg", "/brand/logo/portpass-logo-horizontal-light.svg", "/brand/logo/portpass-logo-horizontal-dark.svg", "/brand/icons/app-icon-192.png", "/brand/icons/app-icon-512.png", "/manifest.webmanifest"];
const MAX_PAGES = 40;

const NEVER_CACHE = [
  /^\/api\//,
  /^\/admin/,
  /^\/organizations/,
  /^\/account/,
  /^\/business\//,
  /^\/login/,
  /^\/signup/,
  /^\/where-to/,
  /^\/futprep\/(staff|my|register|coaches|trial)/,
  /^\/weddings\/(admin|staff)/,
  /\/plan(\/|$)/,
  /^\/sports-fitness\/notify/,
  /^\/apply/,
  /^\/_vercel\//,
  /^\/sw\.js$/,
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // The offline page must be there; the rest of the shell is best effort
      // so one slow icon can't stop the worker installing.
      await cache.add(OFFLINE_URL);
      await Promise.allSettled(SHELL_URLS.map((url) => cache.add(url)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith("portpass-") && !key.endsWith(`-${CACHE_VERSION}`)).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

function neverCache(url) {
  return NEVER_CACHE.some((pattern) => pattern.test(url.pathname));
}

function isAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/brand/") ||
    url.pathname === "/favicon.ico" ||
    /\.(png|jpe?g|webp|gif|svg|ico|woff2?|css|js)$/i.test(url.pathname)
  );
}

// Pages are keyed without the query string, so /?source=pwa and
// /?utm_source=qr are the same saved page as /.
function pageKey(url) {
  return url.origin + url.pathname;
}

function cacheable(response) {
  return Boolean(response) && response.status === 200 && (response.type === "basic" || response.type === "default") && !response.redirected;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || neverCache(url)) return;
  if (request.mode === "navigate") {
    event.respondWith(pageNetworkFirst(request, url));
    return;
  }
  if (isAsset(url)) {
    event.respondWith(assetStaleWhileRevalidate(request));
  }
  // Everything else (RSC payloads, prefetches) goes to the network as usual.
});

async function pageNetworkFirst(request, url) {
  const cache = await caches.open(PAGES_CACHE);
  try {
    const response = await fetch(request);
    if (cacheable(response)) {
      await cache.put(pageKey(url), response.clone());
      trimPages(cache);
    }
    return response;
  } catch {
    const saved = (await cache.match(pageKey(url))) || (await caches.match(pageKey(url)));
    if (saved) return saved;
    const offline = await caches.match(OFFLINE_URL);
    return offline || new Response("You're offline.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}

async function trimPages(cache) {
  const keys = await cache.keys();
  if (keys.length <= MAX_PAGES) return;
  for (const key of keys.slice(0, keys.length - MAX_PAGES)) await cache.delete(key);
}

async function assetStaleWhileRevalidate(request) {
  const cache = await caches.open(ASSETS_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (cacheable(response)) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  if (cached) return cached;
  const response = await network;
  return response || new Response("", { status: 504 });
}
