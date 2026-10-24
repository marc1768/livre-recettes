/* Service worker : appli disponible hors ligne + cache des photos.
 * Les données (recettes) sont gérées par app.js (cache local), pas ici. */
const VERSION = 'lr-v10';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];
const PHOTOS = 'lr-photos';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== PHOTOS).map(k => caches.delete(k))))
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
    e.respondWith(fetch(req)
      .then(r => { const copy = r.clone(); caches.open(VERSION).then(c => c.put(req, copy)); return r; })
      .catch(() => caches.match(req).then(r => r || caches.match('index.html'))));
  }
});
