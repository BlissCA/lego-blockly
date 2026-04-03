// ------------------------------
// FINAL AUTO-UPDATE SERVICE WORKER
// ------------------------------
importScripts("./version.js");

const CACHE_NAME = "lego-blockly-cache-" + LEGO_BLOCKLY_VERSION;

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
  "./device/DeviceLegoA.js",
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

// Fetch: network-only for version.js, network-first for everything else
self.addEventListener("fetch", event => {
  const url = event.request.url;

  // Always fetch version.js fresh
  if (url.endsWith("version.js")) {
    return event.respondWith(
        fetch(event.request, { cache: "no-store" })
    );
  }

  // Normal network-first strategy
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

self.addEventListener("message", event => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
