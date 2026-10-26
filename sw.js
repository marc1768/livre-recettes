/* Service worker : appli disponible hors ligne + cache des photos.
 * Les données (recettes) sont gérées par app.js (cache local), pas ici. */
const VERSION = 'lr-v24';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'help.js', 'manifest.webmanifest', 'icons/icon-192.png?v=3', 'icons/icon-512.png?v=3'];
const PHOTOS = 'lr-photos';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== PHOTOS && k !== 'lr-badge').map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Vidéo d'accueil : laissée au navigateur (requêtes partielles, indispensable sur iPhone)
  if (url.pathname.endsWith('.mp4')) return;

  // API Apps Script : toujours le réseau (app.js gère le hors ligne)
  if (url.hostname.endsWith('script.google.com') || url.hostname.endsWith('googleusercontent.com') && url.pathname.indexOf('/macros/') >= 0) return;

  // Photos (Drive / web) : cache puis réseau en arrière-plan
  if (req.destination === 'image' && url.origin !== location.origin) {
    e.respondWith(caches.open(PHOTOS).then(async c => {
      const hit = await c.match(req);
      const net = fetch(req).then(r => { if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }

  // Fichiers de l'appli : réseau d'abord (mises à jour), cache si hors ligne
  if (url.origin === location.origin) {
    e.respondWith(fetch(req, { cache: 'no-cache' })          // toujours revalider : les mises à jour arrivent tout de suite
      .then(r => { const copy = r.clone(); caches.open(VERSION).then(c => c.put(req, copy)); return r; })
      .catch(() => caches.match(req).then(r => r || caches.match('index.html'))));
  }
});

// ---------- notifications push (Firebase Cloud Messaging) ----------
// Pastille chiffrée sur l'icône : compteur partagé avec l'appli (cache « lr-badge »), remis à zéro à l'ouverture des courses
async function majBadge(ajout) {
  try {
    const c = await caches.open('lr-badge');
    const r = await c.match('n');
    const n = (r ? (parseInt(await r.text(), 10) || 0) : 0) + ajout;
    await c.put('n', new Response(String(n)));
    if (self.navigator && self.navigator.setAppBadge) await self.navigator.setAppBadge(n);
  } catch (e) { /* non pris en charge */ }
}
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { data: { body: e.data ? e.data.text() : '' } }; }
  const m = d.data || d.notification || d;
  e.waitUntil(self.registration.showNotification(m.title || 'Livre de recettes', {
    body: m.body || '', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png',
    tag: 'courses', renotify: true, data: { vue: m.vue || 'courses' }
  }).then(() => majBadge(+(m.n || 1))));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const vue = (e.notification.data && e.notification.data.vue) || 'courses';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => {
    for (const w of ws) { if ('focus' in w) { w.postMessage({ vue: vue }); return w.focus(); } }
    return self.clients.openWindow(new URL('./#' + vue, self.registration.scope).href);
  }));
});
