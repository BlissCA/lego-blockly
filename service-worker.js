/*
self.addEventListener("install", event => {
  self.skipWaiting(); // allow SW to move to "waiting" immediately
});
*/

const CACHE_NAME = "lego-blockly-cache-v3";

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
  "./icons/icon-512.png",

  // External CDN scripts (optional but recommended)
  "https://unpkg.com/blockly@12.4.1/blockly.min.js"
];

// Install: cache all assets
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

// Activate: remove old caches
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(key => key !== CACHE_NAME && caches.delete(key)))
    )
  );
});

// Fetch: serve from cache first
self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});

self.addEventListener("message", event => {
  if (event.data && event.data.action === "skipWaiting") {
    self.skipWaiting();
  }
});