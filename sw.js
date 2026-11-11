// Guarda la app en el móvil para que funcione sin conexión (en el palomar).
const CACHE = 'colombaire-v52';
const FILES = ['./', './index.html', './styles.css', './config.js', './app.js', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png', './lib/supabase.js', './lib/qrcode.min.js', './lib/jspdf.umd.min.js', './lib/jspdf.plugin.autotable.min.js', './fuentes/fuentes.css', './fuentes/inter-normal-latin-ext.woff2', './fuentes/inter-normal-latin.woff2', './fuentes/source-serif-4-cursiva-latin-ext.woff2', './fuentes/source-serif-4-cursiva-latin.woff2', './fuentes/source-serif-4-normal-latin-ext.woff2', './fuentes/source-serif-4-normal-latin.woff2'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Primero intenta la red (para recibir mejoras); si no hay conexión, usa la copia guardada.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // El vídeo se pide por trozos (Range): sin conexión se sirve completo desde la caché.
  if (req.headers.has('range')) {
    e.respondWith(fetch(req).catch(() => caches.match(req.url)));
    return;
  }
  // «no-cache»: siempre pregunta al servidor si hay versión nueva (sin esperar a que caduque la copia del navegador).
  e.respondWith(
    fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })
      .then(res => {
        if (res.status === 200) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('./index.html')))
  );
});
