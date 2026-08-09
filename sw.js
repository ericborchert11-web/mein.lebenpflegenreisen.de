/**
 * Service Worker — bewusst minimal.
 *
 * Zweck ist NUR, dass sich die Seite als App auf den Homescreen legen laesst
 * (Chrome verlangt dafuer einen Worker mit fetch-Handler). Es gibt hier
 * KEINEN Offline-Betrieb fuer Einsaetze — Start, Pause, Uebergabe und
 * Abschluss brauchen die Datenbank, und ein halb funktionierender
 * Offline-Modus waere schlimmer als gar keiner.
 *
 * Wichtigste Entscheidung: HTML und Skripte kommen IMMER zuerst aus dem Netz.
 * Die App wird mehrmals am Tag deployt; ein Worker, der eine alte Fassung aus
 * dem Cache ausliefert, waere ein Fehler, den niemand findet. Der Cache ist
 * nur das Netz fuer den Fall, dass gar nichts geht.
 */
const CACHE = 'lpr-shell-v3';

const SHELL = [
  '/einsatz.html',
  '/mein-bereich.html',
  '/shared.css',
  '/app.js',
  '/layout.js',
  '/favicon.svg',
  '/favicon-192.png',
  '/favicon-512.png'
];

self.addEventListener('install', event => {
  // Sofort uebernehmen, damit ein Deploy nicht erst beim uebernaechsten
  // Start ankommt.
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {})
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(namen => Promise.all(namen.filter(n => n !== CACHE).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Nur eigene Dateien. Supabase, Schriften und alles andere laufen
  // unangetastet durch — Daten haben im Cache nichts verloren.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then(antwort => {
        if (antwort && antwort.ok) {
          const kopie = antwort.clone();
          caches.open(CACHE).then(c => c.put(req, kopie)).catch(() => {});
        }
        return antwort;
      })
      .catch(() => caches.match(req).then(treffer => treffer || caches.match('/einsatz.html')))
  );
});
