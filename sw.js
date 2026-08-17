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
 *
 * Seit 08/2026 kommt Web Push dazu (unten). Das ist der zweite Grund, warum es
 * diesen Worker gibt: eine Schicht, die in einer halben Stunde beginnt,
 * erreicht per E-Mail niemanden, der schon unterwegs ist.
 */
const CACHE = 'lpr-shell-v4';

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

// ───────────────────────────────────────────────────────────────────────────
// Web Push
//
// Die Nutzlast kommt verschluesselt aus der Edge Function send-push und
// enthaelt nur, was auf den Sperrbildschirm darf: Klinik, Datum, Schicht.
// KEINE Patientendaten — ein Sperrbildschirm ist oeffentlich, jeder im Bus
// liest mit. Zimmer, Fallnummer und Hinweise stehen erst hinter der Anmeldung.
// ───────────────────────────────────────────────────────────────────────────

const PUSH_STANDARD = {
  titel: 'Leben Pflegen Reisen',
  text: 'Es gibt Neues zu deinem Einsatz.',
  url: '/mein-bereich.html'
};

self.addEventListener('push', event => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch (e) {
    // Nutzlast unlesbar? Lieber eine schlichte Nachricht als gar keine —
    // stillschweigend verschlucken waere der schlechtere Ausgang.
    d = {};
  }

  const titel = d.titel || PUSH_STANDARD.titel;
  const optionen = {
    body: d.text || PUSH_STANDARD.text,
    icon: '/favicon-192.png',
    badge: '/favicon-192.png',
    lang: 'de',
    // Gleiches tag = die neue Nachricht ersetzt die alte. Sonst stapeln sich
    // bei einer Buchung, die geaendert und wieder geaendert wird, drei
    // widerspruechliche Meldungen auf dem Display.
    tag: d.tag || 'lpr-allgemein',
    renotify: true,
    // Kurzfristige Dienste duerfen nicht lautlos in der Leiste verschwinden.
    requireInteraction: !!d.dringend,
    timestamp: Date.now(),
    data: { url: d.url || PUSH_STANDARD.url }
  };

  event.waitUntil(self.registration.showNotification(titel, optionen));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const ziel = new URL(
    (event.notification.data && event.notification.data.url) || PUSH_STANDARD.url,
    self.location.origin
  ).href;

  // Ein schon offenes Fenster dieser App bekommt den Fokus, statt ein zweites
  // aufzumachen: wer mitten im Einsatz ist, soll nicht zwei Staende derselben
  // Seite nebeneinander haben.
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(fenster => {
      for (const f of fenster) {
        if (new URL(f.url).origin === self.location.origin && 'focus' in f) {
          if ('navigate' in f) f.navigate(ziel).catch(() => {});
          return f.focus();
        }
      }
      return self.clients.openWindow(ziel);
    })
  );
});

// Der Push-Dienst kann ein Abo erneuern. Ohne diesen Handler faellt das Geraet
// still aus der Zustellung — und niemand merkt es, bis ein Dienst nicht
// ankommt. Die Seite holt das beim naechsten Start nach (siehe pushAnmelden).
self.addEventListener('pushsubscriptionchange', event => {
  event.waitUntil(
    self.clients.matchAll({ includeUncontrolled: true }).then(fenster => {
      fenster.forEach(f => f.postMessage({ typ: 'push-abo-erneuern' }));
    })
  );
});
