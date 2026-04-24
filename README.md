# LPR App — Test-Bereich

Interaktive Test-Umgebung für **Leben Pflegen Reisen e.V.** (Berlin) — zur UX-Validierung des Mitwirkenden-Bereichs.

🌐 **Live:** https://mein.lebenpflegenreisen.de  
🌐 **GitHub Pages URL:** https://ericborchert11-web.github.io/lpr-app/

## Was ist das hier?

Eine vollständig clientseitige Prototyp-Anwendung. Alle Daten werden im `localStorage` des Browsers gespeichert — es gibt kein Backend. Das ist so gewollt: Die App dient **nur der UX-Validierung**, nicht dem produktiven Betrieb.

## Struktur

| Datei | Zweck |
|---|---|
| `index.html` | Landing für Tester mit Anleitung |
| `start.html` | Schnellstart: Demo-Daten laden, Test-Logins |
| `login.html` | Normaler Login / Registrierung |
| `mein-bereich.html` | Dashboard für eingeloggte Mitwirkende |
| `meine-praeferenzen.html` | Persönliche Präferenzen (Schichten, Kliniken) |
| `schichtplaner.html` | Übersicht offener Reisen + Anmeldung |
| `schulung.html` | Schulungsportal (iframe auf `ericborchert11-web.github.io/einfuehrung/`) |
| `profil.html` | Persönliche Daten, Passwort, Konto löschen |
| `abrechnung.html` | Aufwandsentschädigung anfordern |
| `admin-mitwirkende.html` | Admin: Mitwirkende + Präferenzen verwalten |
| `sitzwachen.html` / `kliniken.html` | Klinik-Bereich (Verfügbarkeiten, Buchungen) |
| `barrierefreiheit.html` | A11y-Hinweise |
| `app.js` / `layout.js` / `shared.css` | Kern-Assets |

## Demo-Zugänge

Alle haben das Passwort `demo1234`:

| E-Mail | Rolle |
|---|---|
| `margarete@demo.de` | Ehrenamtliche |
| `hans@demo.de` | Ehrenamtlicher |
| `fatma@demo.de` | Ehrenamtliche (türkisch-sprechend) |
| `charite@demo.de` | Klinik |
| `hedwig@demo.de` | Klinik |
| `vorstand@demo.de` | Admin/Vorstand |

**Wichtig:** Vor dem ersten Login auf `start.html` klicken und „Zurücksetzen & Demo-Daten laden" drücken.

## Deployment

Automatisch via GitHub Pages aus dem `main`-Branch.

## Lizenz

Privates Projekt — keine Lizenz für Drittverwendung.
