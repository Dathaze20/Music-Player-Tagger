const CACHE = 'muzio-ai-v2';
const SHELL = ['./', './index.html', './app.js', './style.css', './icon.svg', './manifest.json', './text-utils.js', './native-bridge.js'];

self.addEventListener('install', function(e) {
  e.waitUntil(caches.open(CACHE).then(function(c) { return c.addAll(SHELL); }));
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.filter(function(k) { return k !== CACHE; }).map(function(k) { return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(e) {
  var url = new URL(e.request.url);
  if (url.protocol === 'blob:') return;
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(function(res) {
      if (res.ok && url.origin === self.location.origin) {
        var ct = res.headers.get('content-type') || '';
        if (!ct.startsWith('audio/') && !ct.startsWith('video/')) {
          caches.open(CACHE).then(function(c) { c.put(e.request, res.clone()); });
        }
      }
      return res;
    }).catch(function() { return caches.match(e.request); })
  );
});
