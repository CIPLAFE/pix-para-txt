/*
 * sw.js - deixa o app funcionando offline. Ao publicar mudanca em qualquer
 * arquivo, aumente CACHE para o celular baixar a versao nova.
 */
'use strict';

const CACHE = 'pix-para-txt-v2';
const ARQUIVOS = [
  './',
  './index.html',
  './style.css',
  './pix.js',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png'
];

self.addEventListener('install', (ev) => {
  ev.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  // Abertura pelo "Compartilhar" chega como ./?text=... : serve a pagina do cache.
  if (req.mode === 'navigate') {
    ev.respondWith(caches.match('./index.html').then((r) => r || fetch(req)));
    return;
  }
  ev.respondWith(caches.match(req, { ignoreSearch: true }).then((r) => r || fetch(req)));
});
