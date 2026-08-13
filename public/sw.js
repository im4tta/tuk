// Minimal offline app-shell cache for Tuk.
//
// This only caches the app shell (HTML/JS/CSS/icons) — your actual
// screenshots live in IndexedDB, which this file never touches. Bump
// CACHE_NAME on any shell change you want clients to pick up immediately;
// stale caches from older versions are swept in `activate`.
const CACHE_NAME = 'tuk-shell-v3';
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

// Holds image(s) handed to Tuk via the OS share sheet (see handleShareTarget
// below) until main.js picks them up on next load. Named separately from
// CACHE_NAME so the version-sweep in `activate` doesn't wipe out a share
// that's mid-flight when a new service-worker version installs.
const SHARE_CACHE = 'tuk-share-target-v1';
const SHARE_MANIFEST_KEY = '/__share-manifest__';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch(() => { /* best-effort precache; runtime caching below still works */ })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME && key !== SHARE_CACHE).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

/**
 * Handle a share-sheet POST from the OS ("Share" → Tuk on an image in
 * Photos/Files). This is what makes Android/Chrome's share target work —
 * iOS Safari doesn't implement the Web Share Target API at all, so this
 * handler simply never fires there; the manifest.webmanifest entry is
 * inert on iOS rather than broken.
 *
 * Each shared file is stashed in a dedicated cache (screenshots never touch
 * the network either way — this just bridges the SW's one-shot POST handler
 * to the page, which is where the real IndexedDB storage happens) alongside
 * a small manifest of keys, then the browser is redirected to a normal GET
 * so the page can pick the files up on load (see main.js's `?shared=1`
 * handling) and clear the cache once they're safely in IndexedDB.
 */
async function handleShareTarget(event) {
  try {
    const formData = await event.request.formData();
    const files = formData.getAll('images').filter((f) => f && typeof f.type === 'string' && f.type.startsWith('image/'));
    const cache = await caches.open(SHARE_CACHE);
    const keys = [];
    for (let i = 0; i < files.length; i++) {
      const key = '/__shared-image-' + Date.now() + '-' + i + '__';
      await cache.put(key, new Response(files[i], { headers: { 'Content-Type': files[i].type || 'application/octet-stream' } }));
      keys.push(key);
    }
    await cache.put(SHARE_MANIFEST_KEY, new Response(JSON.stringify(keys), { headers: { 'Content-Type': 'application/json' } }));
  } catch {
    // Fall through to the redirect either way — worst case the share is
    // dropped and the person just re-shares, rather than getting stuck.
  }
  return Response.redirect('/?shared=1', 303);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method === 'POST' && url.pathname === '/share-target') {
    event.respondWith(handleShareTarget(event));
    return;
  }
  if (req.method !== 'GET') return; // never intercept other POST/etc.

  // Page navigations: try the network first so people get the latest build
  // while online, falling back to the cached shell when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy));
          return res;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Same-origin static assets (hashed JS/CSS bundles, icons, fonts CSS):
  // serve from cache instantly if we have it, but always refresh the cache
  // in the background so a stale asset doesn't linger forever.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res.ok) caches.open(CACHE_NAME).then((cache) => cache.put(req, res.clone()));
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
