// ------------------------------
// FINAL AUTO-UPDATE SERVICE WORKER
// ------------------------------

const CACHE_NAME = "lego-blockly-cache-v2026-03-29-1112"; // bump on each deploy

const ASSETS = [
  "./",
  "./index.html",
  "./main.js",
  "./styles.css",
  "./manifest.json",

  // Blocks
  "./blocks/lego_blocks.js",

  // Generators
  "./generators/lego_generators.js",

  // Toolbox
  "./toolbox/toolbox.js",

  // Devices
  "./device/DeviceLegoB.js",
  "./device/DeviceLegoRcx.js",

  // Icons
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

// Install: cache all assets and activate immediately
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );

  // Auto-activate immediately
  self.skipWaiting();
});

// Activate: remove old caches and take control immediately
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );

  self.clients.claim();
});

// Fetch: network-first, fallback to cache
self.addEventListener("fetch", event => {
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});