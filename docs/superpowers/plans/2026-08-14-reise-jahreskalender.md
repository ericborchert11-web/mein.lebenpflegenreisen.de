# Reise-Jahreskalender Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine Jahressicht auf alle Reisen für den Vorstand, mit Besetzungs-Ampel je Reise und einer umschaltbaren Personen-Ansicht.

**Architecture:** Neue statische Seite `admin-jahreskalender.html`, die ausschließlich vorhandene `LPR.*`-Funktionen liest. Die Besetzungslogik (Halbtags-Regel) wandert vorher aus `admin-reisen.html` nach `app.js`, damit Kalender und Reisen-Seite dieselbe Wahrheit benutzen. Keine Datenbank-Migration, keine neuen Policies.

**Tech Stack:** Reines HTML/CSS/JavaScript ohne Build-Schritt, `app.js` als IIFE mit `window.LPR`, `layout.js` für Kopf und Navigation, `shared.css` für Farbvariablen. Supabase über die bestehenden `LPR.*`-Wrapper. Deployment via GitHub Pages aus `main`.

---

## Wichtig für die ausführende Person

**Dieses Repository hat keine Testinfrastruktur.** Kein `package.json`, kein Testrunner, keine Testdateien. Das ist eine bewusste Entscheidung des Projekts und wurde für dieses Vorhaben ausdrücklich bestätigt.

**Lege keine Testinfrastruktur an.** Installiere kein npm, richte kein Jest, Vitest oder Playwright ein, schreibe keine `*.test.js`. Wo in anderen Plänen „Test schreiben, Test laufen lassen" stünde, steht hier ein **Browser-Check** mit exakter Klickfolge und exakt erwartetem Ergebnis. Diese Checks sind die Verifikation. Führe sie wirklich aus und lies das Ergebnis ab, bevor du einen Haken setzt.

**So startest du die Seite lokal:**

```bash
cd ~/Documents/GitHub/mein.lebenpflegenreisen.de
python3 -m http.server 8080
```

Dann `http://localhost:8080/admin-reisen.html` im Browser öffnen und mit einem Vorstands-Zugang anmelden. Die Seite spricht mit der echten Supabase-Instanz, es gibt keine lokale Datenbank.

**Sprache im Code:** Bezeichner und Kommentare in diesem Projekt sind deutsch, ohne Umlaute in Bezeichnern. Kommentare erklären das Warum, nicht das Was. Inline-Styles sind hier üblich, aber neue Flächen bekommen Klassen im `<style>`-Block der Seite.

**Barrierefreiheit:** Das Portal hat einen Kontrastmodus (`body.contrast`) und eine Schriftgrößen-Skalierung. Neue Farben gehören deshalb als CSS-Variablen auf `:root` und brauchen eine Entsprechung unter `body.contrast`. Farbe darf nie der einzige Informationsträger sein — jede Ampel trägt zusätzlich Text.

**Commits:** Nach jeder Aufgabe ein Commit. Branch ist `feat/reise-jahreskalender`, er existiert bereits und enthält die Spec.

**Die Spec liegt in** `docs/superpowers/specs/2026-08-14-reise-jahreskalender-design.md`.

---

## Dateiübersicht

| Datei | Verantwortung | Änderung |
|---|---|---|
| `app.js` | Fachlogik und Datenzugriff für alle Seiten. Bekommt die sieben Besetzungsfunktionen als einzige Wahrheit. | ändern |
| `admin-reisen.html` | Reisen anlegen, ändern, löschen, Anmeldungen verwalten. Verliert die lokalen Besetzungsfunktionen, bekommt ein Sprungziel. | ändern |
| `layout.js` | Kopfzeile und Navigation. Bekommt den Menüpunkt „Jahreskalender". | ändern |
| `admin-jahreskalender.html` | Die neue Jahressicht: Kopfzeile, Reise-Ansicht, Personen-Ansicht, Detail-Panel. | neu |
| `README.md` | Seitenübersicht des Projekts. | ändern |

`admin-jahreskalender.html` bleibt eine Datei, weil das Portal durchgehend so aufgebaut ist und die Seite ohne Build-Schritt ausgeliefert wird. Innerhalb der Datei ist der Skriptteil in vier klar getrennte Abschnitte gegliedert: Zustand und Laden, Reise-Ansicht, Personen-Ansicht, Detail-Panel. Jeder Abschnitt liest denselben Zustand und schreibt in genau einen Container.

**Die sieben Funktionen, die nach `app.js` wandern** — diese Namen gelten für den ganzen Plan:

| neu in `app.js` | ersetzt in `admin-reisen.html` |
|---|---|
| `LPR.enumTripDays(start, end)` | `enumTripDays` |
| `LPR.formatTripDay(iso)` | `fmtDay` |
| `LPR.signupEffectiveDays(s, allDays)` | `effectiveDays` |
| `LPR.signupEffectiveHalf(s, day)` | `effectiveHalf` |
| `LPR.signupCoversHalf(s, day, half)` | `coversHalf` |
| `LPR.tripDayGaps(signups, trip, day)` | `dayGaps` |
| `LPR.tripCoverage(signups, trip)` | `coverageSummary` |

Die Spec nennt fünf Funktionen. `formatTripDay` und `signupEffectiveHalf` kommen dazu, weil das Detail-Panel des Kalenders die Tagesliste mit Halbtags-Angaben rendert und sonst zwei weitere Kopien entstünden.

---

## Task 1: Besetzungslogik nach `app.js`

**Files:**
- Modify: `app.js` (neuer Block vor dem Export-Objekt, Ergänzung im Export-Objekt bei Zeile ~2941)

- [ ] **Schritt 1: Den neuen Block in `app.js` einfügen**

Füge diesen Block direkt **vor** die Zeile `  // --- Reisen (trips) ---` ein (aktuell Zeile 495):

```js
  // ── Reise-Besetzung: Tages- und Halbtagsregel ──
  // Ein Reisetag gilt erst als besetzt, wenn Vormittag UND Nachmittag von einer
  // bestaetigten Anmeldung abgedeckt sind. Die Regel stand frueher nur in
  // admin-reisen.html; seit der Jahreskalender dieselbe Zahl anzeigt, lebt sie
  // hier, damit beide Seiten nicht auseinanderlaufen koennen.
  // Alles hier sind reine Funktionen: kein Netzzugriff, kein Zustand.

  // Alle Tage einer Reise als 'YYYY-MM-DD'. Unplausible Zeitraeume (Ende vor
  // Start) liefern den Starttag, damit die Oberflaeche nicht leer bleibt.
  function enumTripDays(start, end) {
    if (!start) return [];
    const out = [];
    const sd = new Date(start + 'T00:00:00Z');
    const ed = new Date((end || start) + 'T00:00:00Z');
    if (isNaN(sd) || isNaN(ed) || ed < sd) return [start];
    for (let d = new Date(sd); d <= ed; d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0,10));
    return out;
  }

  // '2026-08-15' -> 'Sa 15.08.'
  function formatTripDay(iso) {
    const d = new Date(iso + 'T00:00:00Z');
    const wd = ['So','Mo','Di','Mi','Do','Fr','Sa'][d.getUTCDay()];
    return wd + ' ' + String(d.getUTCDate()).padStart(2,'0') + '.' + String(d.getUTCMonth()+1).padStart(2,'0') + '.';
  }

  // Ohne eigene Tageseintraege gilt eine Anmeldung fuer die ganze Reise.
  function signupEffectiveDays(s, allDays) {
    return (s.days && s.days.length) ? s.days : allDays;
  }

  // Tageshaelfte einer Anmeldung: 'full' | 'am' (Vormittag) | 'pm' (Nachmittag).
  function signupEffectiveHalf(s, day) {
    return (s.dayHalves && s.dayHalves[day]) || 'full';
  }

  function signupCoversHalf(s, day, half) {
    const h = signupEffectiveHalf(s, day);
    return h === 'full' || h === half;
  }

  // Offene Haelften eines Tages, z. B. ['pm'] oder ['am','pm'].
  function tripDayGaps(signups, trip, day) {
    const allDays = enumTripDays(trip.start_date, trip.end_date);
    const onDay = s => signupEffectiveDays(s, allDays).indexOf(day) !== -1;
    const conf = (signups || []).filter(s => s.status === 'confirmed' && onDay(s));
    return ['am', 'pm'].filter(h => !conf.some(s => signupCoversHalf(s, day, h)));
  }

  // { total, uncovered } ueber die ganze Reise.
  function tripCoverage(signups, trip) {
    const allDays = enumTripDays(trip.start_date, trip.end_date);
    let uncovered = 0;
    allDays.forEach(day => { if (tripDayGaps(signups, trip, day).length) uncovered++; });
    return { total: allDays.length, uncovered: uncovered };
  }
```

- [ ] **Schritt 2: Die Funktionen exportieren**

In `app.js` im Rückgabe-Objekt, direkt **nach** der Zeile

```js
    listTrips, getTrip, getTripSignups, getMySignup, signupForTrip, cancelSignup,
```

diese Zeilen einfügen:

```js
    // Besetzungsregel — geteilt von admin-reisen.html und admin-jahreskalender.html
    enumTripDays, formatTripDay, signupEffectiveDays, signupEffectiveHalf,
    signupCoversHalf, tripDayGaps, tripCoverage,
```

- [ ] **Schritt 3: Browser-Check — die Funktionen sind erreichbar und rechnen richtig**

Server starten, `http://localhost:8080/admin-reisen.html` öffnen, anmelden, Konsole öffnen und einfügen:

```js
const t = { start_date: '2026-08-15', end_date: '2026-08-18' };
console.log('A', LPR.enumTripDays(t.start_date, t.end_date));
console.log('B', LPR.formatTripDay('2026-08-15'));
console.log('C', LPR.tripCoverage([], t));
console.log('D', LPR.tripCoverage([{ status: 'confirmed', days: [], dayHalves: {} }], t));
console.log('E', LPR.tripCoverage([{ status: 'confirmed', days: ['2026-08-15','2026-08-16'], dayHalves: {} }], t));
console.log('F', LPR.tripCoverage([{ status: 'confirmed', days: [], dayHalves: { '2026-08-16': 'am' } }], t));
console.log('G', LPR.tripDayGaps([{ status: 'confirmed', days: [], dayHalves: { '2026-08-16': 'am' } }], t, '2026-08-16'));
console.log('H', LPR.tripCoverage([{ status: 'waitlist', days: [], dayHalves: {} }], t));
console.log('I', LPR.enumTripDays('2026-08-18', '2026-08-15'));
```

Erwartete Ausgabe, Zeile für Zeile:

| | Erwartung | warum |
|---|---|---|
| A | `['2026-08-15','2026-08-16','2026-08-17','2026-08-18']` | vier Tage |
| B | `'Sa 15.08.'` | 15.08.2026 ist ein Samstag |
| C | `{ total: 4, uncovered: 4 }` | niemand angemeldet |
| D | `{ total: 4, uncovered: 0 }` | ganze Reise, ganze Tage |
| E | `{ total: 4, uncovered: 2 }` | nur die ersten beiden Tage |
| F | `{ total: 4, uncovered: 1 }` | am 16.08. fehlt der Nachmittag |
| G | `['pm']` | genau die fehlende Hälfte |
| H | `{ total: 4, uncovered: 4 }` | Warteliste zählt nicht |
| I | `['2026-08-18']` | Ende vor Start liefert den Starttag |

Stimmt eine Zeile nicht, korrigiere den Block aus Schritt 1, bevor du weitergehst.

- [ ] **Schritt 4: Commit**

```bash
git add app.js
git commit -m "feat(app): Besetzungsregel als geteilte Funktionen in app.js"
```

---

## Task 2: `admin-reisen.html` auf die geteilten Funktionen umstellen

Die Seite behält ihre kurzen lokalen Namen, damit die rund fünfzehn Aufrufstellen unverändert bleiben. Aus den Definitionen werden dünne Weiterleitungen. Bewusst `function`-Deklarationen und keine `const`-Zuweisungen: Funktionsdeklarationen werden hochgezogen, damit kann keine Aufrufstelle in eine temporale Todeszone laufen.

**Files:**
- Modify: `admin-reisen.html:643-669` (die fünf Basisfunktionen und die Beschriftungshelfer)
- Modify: `admin-reisen.html:758-771` (`dayGaps` und `coverageSummary` — sie stehen **nicht** im ersten Block, sondern weiter unten vor `renderDayCoverage`)

- [ ] **Schritt 1: Vorzustand festhalten**

Seite öffnen, anmelden, im Statusfilter **Alle Reisen** wählen. Bei jeder Reise auf **Anmeldungen** klicken. Notiere für **drei** Reisen — davon möglichst eine mit Teil-Anmeldung oder Halbtag —:

- den Text der Abdeckungs-Plakette an der Karte, etwa „⚠ 3 Tag(e) nicht vollständig besetzt"
- die Kopfzeile im aufgeklappten Bereich, etwa „⚠ 3 von 8 Tagen nicht vollständig besetzt"
- zwei Tageszeilen im Wortlaut, inklusive Namenszusätzen wie „(Vm)" und Warnungen wie „⚠ Nachmittag unbesetzt"

Diese Notizen sind der Vergleichsmaßstab für Schritt 3.

- [ ] **Schritt 2: Den Block ersetzen**

Ersetze in `admin-reisen.html` den Bereich von der Zeile `// ── Tages-Abdeckung (Teil-Reisen) ──` bis einschließlich der Zeile mit `function dayWithHalf(s, day)` durch:

```js
// ── Tages-Abdeckung (Teil-Reisen) ──
// Die Regel selbst steht in app.js, damit der Jahreskalender dieselbe Zahl
// anzeigt. Hier stehen nur die kurzen Namen, die diese Seite ueberall benutzt.
function enumTripDays(start, end)      { return LPR.enumTripDays(start, end); }
function fmtDay(iso)                   { return LPR.formatTripDay(iso); }
function effectiveDays(s, allDays)     { return LPR.signupEffectiveDays(s, allDays); }
function effectiveHalf(s, day)         { return LPR.signupEffectiveHalf(s, day); }
function coversHalf(s, day, half)      { return LPR.signupCoversHalf(s, day, half); }
function dayGaps(signups, trip, day)   { return LPR.tripDayGaps(signups, trip, day); }
function coverageSummary(signups, trip) { return LPR.tripCoverage(signups, trip); }

const HALF_SHORT = { am: 'Vm', pm: 'Nm' };
const HALF_LONG  = { am: 'Vormittag', pm: 'Nachmittag' };
function halfSuffix(h) { return HALF_SHORT[h] ? ' (' + HALF_SHORT[h] + ')' : ''; }
function dayWithHalf(s, day) { return fmtDay(day) + halfSuffix(effectiveHalf(s, day)); }
```

`HALF_SHORT`, `HALF_LONG`, `halfSuffix` und `dayWithHalf` bleiben lokal: das sind Beschriftungen dieser Oberfläche, keine Fachregel.

- [ ] **Schritt 2b: Den zweiten Block ersetzen**

`dayGaps` und `coverageSummary` stehen nicht im Block von Schritt 2, sondern weiter unten direkt vor `renderDayCoverage` (aktuell Zeilen 758–771). Ersetze dort

```js
// Ein Tag gilt erst als besetzt, wenn Vormittag UND Nachmittag jemanden haben.
function dayGaps(signups, trip, day) {
  const allDays = enumTripDays(trip.start_date, trip.end_date);
  const onDay = s => effectiveDays(s, allDays).indexOf(day) !== -1;
  const conf = signups.filter(s => s.status === 'confirmed' && onDay(s));
  const gaps = ['am', 'pm'].filter(h => !conf.some(s => coversHalf(s, day, h)));
  return gaps;
}
function coverageSummary(signups, trip) {
  const allDays = enumTripDays(trip.start_date, trip.end_date);
  let uncovered = 0;
  allDays.forEach(day => { if (dayGaps(signups, trip, day).length) uncovered++; });
  return { total: allDays.length, uncovered };
}
```

ersatzlos durch **nichts** — die beiden Weiterleitungen stehen bereits im Block aus Schritt 2. Lass keine leere Kommentarzeile zurück; die Erklärung der Regel steht jetzt in `app.js`.

Prüfe danach mit

```bash
grep -n "function dayGaps\|function coverageSummary\|function enumTripDays\|function effectiveDays\|function coversHalf\|function effectiveHalf\|function fmtDay" admin-reisen.html
```

Erwartet: **genau sieben** Treffer, alle im Block aus Schritt 2, jeder davon eine einzeilige Weiterleitung auf `LPR.*`. Findet sich ein Treffer ausserhalb, ist noch eine Doppelung übrig.

- [ ] **Schritt 3: Browser-Check — nichts hat sich verändert**

Seite neu laden, anmelden, Statusfilter auf **Alle Reisen**, dieselben drei Reisen aufklappen.

Erwartet: Alle in Schritt 1 notierten Texte sind **zeichengleich**. Die Konsole zeigt keine Fehler, insbesondere kein „is not defined".

Zusätzlich prüfen: Die Zeile „⚠ N Tag(e) nicht vollständig besetzt" an der Karte und die Kopfzeile „⚠ N von M Tagen nicht vollständig besetzt" im aufgeklappten Bereich nennen dasselbe N.

Weicht irgendetwas ab, ist der Block aus Task 1 Schritt 1 nicht deckungsgleich mit dem Original — vergleiche ihn zeichenweise mit `git show HEAD~1:admin-reisen.html`.

- [ ] **Schritt 4: Commit**

```bash
git add admin-reisen.html
git commit -m "refactor(reisen): Besetzungsregel aus der Seite nach app.js"
```

---

## Task 3: Sprungziel `#trip-<id>` in `admin-reisen.html`

Der Kalender verlinkt später auf `admin-reisen.html#trip-<id>`. Die Seite muss die passende Reise finden, sichtbar machen, aufklappen und hervorheben. Der Statusfilter steht auf „Offen" — eine verlinkte Entwurfs- oder abgeschlossene Reise wäre sonst gar nicht gerendert, deshalb schaltet der Anker den Filter auf „Alle Reisen".

**Files:**
- Modify: `admin-reisen.html` (Kartenmarkup bei Zeile ~619, Ende von `loadTrips` bei Zeile ~587, neue Funktion nach `toggleSignups` bei Zeile ~958, `<style>`-Block)

- [ ] **Schritt 1: Der Karte eine Kennung geben**

Ersetze in `render()` die Zeile

```js
    <article class="trip-card">
```

durch

```js
    <article class="trip-card" id="trip-${t.id}">
```

- [ ] **Schritt 2: Hervorhebung als CSS ergänzen**

Im `<style>`-Block der Seite ans Ende einfügen:

```css
/* Ziel eines Sprungs aus dem Jahreskalender — blitzt kurz auf. */
.trip-card.trip-ziel { outline: 3px solid var(--lime); outline-offset: 3px; }
@media (prefers-reduced-motion: no-preference) {
  .trip-card.trip-ziel { transition: outline-color .3s ease; }
}
```

- [ ] **Schritt 3: Die Sprungfunktion einfügen**

Direkt **nach** der schließenden Klammer von `function toggleSignups(...)` einfügen:

```js
// Sprungziel aus dem Jahreskalender: admin-reisen.html#trip-<id>.
// Wird nach jedem render() aufgerufen; ohne passenden Anker passiert nichts.
function oeffneAusAnker() {
  const treffer = /^#trip-(.+)$/.exec(location.hash || '');
  if (!treffer) return;
  const id = treffer[1];
  const karte = document.getElementById('trip-' + id);
  if (!karte) return;
  const panel = document.getElementById('signups-' + id);
  if (panel && panel.hasAttribute('hidden')) {
    toggleSignups(id, karte.querySelector('.trip-actions .btn-ghost'));
  }
  karte.scrollIntoView({ behavior: 'smooth', block: 'start' });
  karte.classList.add('trip-ziel');
  setTimeout(() => karte.classList.remove('trip-ziel'), 2500);
}
```

- [ ] **Schritt 4: Den Filter öffnen und die Funktion aufrufen**

In `loadTrips()` die Zeile

```js
    document.getElementById('loading-state').hidden = true;
    render();
```

ersetzen durch

```js
    document.getElementById('loading-state').hidden = true;
    // Ein Anker kann auf einen Entwurf oder eine abgeschlossene Reise zeigen.
    // Der Standardfilter "Offen" wuerde sie ausblenden, also oeffnen wir ihn.
    if (/^#trip-/.test(location.hash || '')) {
      document.getElementById('status-filter').value = 'all';
    }
    render();
    oeffneAusAnker();
```

- [ ] **Schritt 5: Browser-Check — der Sprung funktioniert**

Öffne `admin-reisen.html`, kopiere aus der Konsole eine Reise-Kennung:

```js
console.log(document.querySelector('.trip-card').id);
```

Rufe dann `http://localhost:8080/admin-reisen.html#trip-<die-Kennung>` auf.

Erwartet: Der Statusfilter steht auf „Alle Reisen", die Seite scrollt zu dieser Karte, deren Anmeldungsbereich ist aufgeklappt, die Karte hat für gut zwei Sekunden einen limettenfarbenen Rahmen.

Zweiter Check: `http://localhost:8080/admin-reisen.html#trip-gibtesnicht` aufrufen. Erwartet: Die Seite lädt normal, Filter steht auf „Alle Reisen", keine Fehlermeldung in der Konsole.

Dritter Check: `http://localhost:8080/admin-reisen.html` ohne Anker aufrufen. Erwartet: Filter steht wie bisher auf „Offen", nichts ist aufgeklappt.

- [ ] **Schritt 6: Commit**

```bash
git add admin-reisen.html
git commit -m "feat(reisen): Sprungziel #trip-<id> fuer den Jahreskalender"
```

---

## Task 4: Seitengerüst, Navigation und Datenladen

**Files:**
- Create: `admin-jahreskalender.html`
- Modify: `layout.js:88-98` (Admin-Navigation)

- [ ] **Schritt 1: Menüpunkt in `layout.js`**

Im Admin-Zweig von `renderHeader`, direkt **nach** der Zeile mit `admin-reisen.html`, einfügen:

```js
          <li><a href="admin-jahreskalender.html" class="${c('jahreskalender')}">Jahreskalender</a></li>
```

- [ ] **Schritt 2: Die Seite anlegen**

Neue Datei `admin-jahreskalender.html` mit genau diesem Inhalt:

```html
<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="icon" type="image/svg+xml" href="favicon.svg">
<link rel="icon" type="image/png" sizes="32x32" href="favicon-32.png">
<link rel="icon" type="image/png" sizes="16x16" href="favicon-16.png">
<link rel="apple-touch-icon" sizes="180x180" href="apple-touch-icon.png">
<link rel="manifest" href="site.webmanifest">
<meta name="theme-color" content="#1A3A2A">
<title>Jahreskalender · Leben Pflegen Reisen e.V.</title>
<meta name="robots" content="noindex, nofollow">
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,700;12..96,800&family=Instrument+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="shared.css">
<style>
:root {
  --jk-gruen:#2E7D32; --jk-gelb:#B36A00; --jk-rot:#C62828; --jk-grau:#767676;
  /* Entwurf und Abgesagt sind keine Ampelstufen, brauchen aber eine Textfarbe,
     weil schmale Balken ihre Beschriftung neben den Balken schreiben. */
  --jk-entwurf: var(--text); --jk-abgesagt: var(--muted);
  --jk-raster:#EFEFEF; --jk-raster-linie:#E0E0E0; --jk-tot:#DADADA;
}
/* Im Kontrastmodus zaehlt nicht die Nuance, sondern der Abstand zum Weiss.
   Die Ampel traegt ohnehin immer zusaetzlich Text. */
body.contrast {
  --jk-gruen:#006400; --jk-gelb:#7A4A00; --jk-rot:#B32400; --jk-grau:#333;
  --jk-raster:#FFF; --jk-raster-linie:#000; --jk-tot:#BBB;
}

.jk-wrap { max-width: 1180px; margin: 28px auto 60px; padding: 0 20px; }

.jk-kopf {
  background:#fff; border-radius: var(--radius); box-shadow: var(--shadow);
  padding: 16px 20px; margin-bottom: 16px;
  display:flex; align-items:center; gap:18px; flex-wrap:wrap;
}
.jk-jahr { display:flex; align-items:center; gap:10px; }
.jk-jahr strong { font-size:22px; color: var(--green-deep); min-width:4ch; text-align:center; }
.jk-jahr button {
  border:1px solid var(--border); background:#fff; color:var(--green-deep);
  border-radius:8px; padding:4px 12px; font-size:18px; cursor:pointer; line-height:1.2;
}
.jk-jahr button:hover { background: var(--sand); }

.jk-umschalter { display:flex; border:1px solid var(--border); border-radius:20px; overflow:hidden; }
.jk-umschalter button {
  border:0; background:#fff; color: var(--muted);
  padding:7px 16px; font-size:14px; font-weight:600; cursor:pointer;
}
.jk-umschalter button[aria-pressed="true"] { background: var(--lime); color: var(--green-deep); }
.jk-umschalter button:disabled { opacity:.45; cursor:not-allowed; }

.jk-filter { display:flex; gap:6px; flex-wrap:wrap; }
.jk-filter button {
  border:1px solid var(--border); background:#fff; color: var(--muted);
  border-radius:14px; padding:5px 12px; font-size:13px; cursor:pointer;
}
.jk-filter button[aria-pressed="true"] { background: var(--green-deep); border-color: var(--green-deep); color:#fff; }
.jk-kennzahl { margin-left:auto; font-size:14px; color: var(--muted); }
.jk-kennzahl .kritisch { color: var(--jk-rot); font-weight:700; }

.jk-buehne { display:flex; align-items:flex-start; gap:0; background:#fff;
  border-radius: var(--radius); box-shadow: var(--shadow); overflow:hidden; }
.jk-flaeche { flex:1; min-width:0; padding:14px 18px; overflow-x:auto; }

.jk-hinweis { background:#FFF7E8; border:1px solid #E8D9B0; color:#6B4E00;
  border-radius: var(--radius-sm); padding:10px 14px; margin-bottom:12px; font-size:14px; }
.jk-fehler { background:#FCEDEA; border:1px solid #E8BCB0; color:#8A2B12;
  border-radius: var(--radius); padding:20px 24px; font-size:15px; }
.jk-leer { text-align:center; padding:48px 24px; color: var(--muted); }
.jk-leer .jk-leer-icon { font-size:44px; margin-bottom:10px; }
</style>
</head>
<body>

<main class="jk-wrap">
  <a href="admin-reisen.html" style="display:inline-flex;gap:6px;margin-bottom:12px;font-size:14px;font-weight:600;color:var(--green-deep);text-decoration:none;">← Zur Reisen-Verwaltung</a>

  <h1 style="font-size:var(--fs-h2);margin:0 0 14px;color:var(--green-deep);">Jahreskalender</h1>

  <div class="jk-kopf" id="jk-kopf" hidden>
    <div class="jk-jahr">
      <button type="button" id="jk-jahr-zurueck" aria-label="Vorheriges Jahr">‹</button>
      <strong id="jk-jahr-label">—</strong>
      <button type="button" id="jk-jahr-vor" aria-label="Nächstes Jahr">›</button>
    </div>

    <div class="jk-umschalter" role="group" aria-label="Ansicht">
      <button type="button" id="jk-ansicht-reise" aria-pressed="true">Nach Reise</button>
      <button type="button" id="jk-ansicht-person" aria-pressed="false">Nach Person</button>
    </div>

    <div class="jk-filter" id="jk-filter" role="group" aria-label="Status-Filter"></div>

    <div class="jk-kennzahl" id="jk-kennzahl"></div>
  </div>

  <div id="jk-meldung"></div>

  <div class="jk-buehne" id="jk-buehne" hidden>
    <div class="jk-flaeche" id="jk-flaeche"></div>
    <div id="jk-panel"></div>
  </div>
</main>

<script src="app.js"></script>
<script src="layout.js"></script>
<script>
'use strict';

LPR_Layout.init({ page: 'jahreskalender' });
if (!LPR.requireRole('admin', 'login.html?next=admin-jahreskalender.html')) throw new Error('kein Zugriff');

function escapeHtml(s) { return LPR_Layout.escapeHtml(s); }

// ══════ Zustand ══════

let JAHR = new Date().getFullYear();
let ANSICHT = 'reise';                 // 'reise' | 'person'
const STATUS_AN = new Set(['draft','open','closed','completed']);
let REISEN = [];                       // Reisen, die JAHR beruehren
let ANMELDUNGEN = {};                  // trip_id -> bestaetigte Anmeldungen
let ABDECKUNG = {};                    // trip_id -> { total, uncovered }
let MITGLIEDER = [];                   // aus listVolunteersAdmin
let SITZWACHEN = null;                 // null = noch nicht geladen
let SITZWACHEN_FEHLER = null;
let PERSONEN_AUS = false;              // true, wenn die Personen-Ansicht nicht geht
let PANEL_ID = null;                   // offene Reise im Detail-Panel
let UNPLAUSIBEL = [];                  // Reisen mit Ende vor Start

const STATUS_LABEL = {
  draft: 'Entwurf', open: 'Offen', closed: 'Geschlossen',
  completed: 'Abgeschlossen', cancelled: 'Abgesagt'
};

// ══════ Kleine Helfer ══════

function zwei(n) { return String(n).padStart(2, '0'); }
function iso(jahr, monat, tag) { return jahr + '-' + zwei(monat) + '-' + zwei(tag); }
function tageImMonat(jahr, monat) { return new Date(Date.UTC(jahr, monat, 0)).getUTCDate(); }
function tageImJahr(jahr) { return (new Date(Date.UTC(jahr,1,29)).getUTCMonth() === 1) ? 366 : 365; }

// Beruehrt die Reise das Jahr? Zeichenkettenvergleich reicht, weil alle Daten
// im Format YYYY-MM-DD vorliegen und damit lexikografisch sortierbar sind.
function beruehrtJahr(t, jahr) {
  return t.start_date <= iso(jahr,12,31) && (t.end_date || t.start_date) >= iso(jahr,1,1);
}
function beruehrtMonat(t, jahr, monat) {
  const erster  = iso(jahr, monat, 1);
  const letzter = iso(jahr, monat, tageImMonat(jahr, monat));
  return t.start_date <= letzter && (t.end_date || t.start_date) >= erster;
}

// ══════ Laden ══════

async function laden() {
  meldung('');
  document.getElementById('jk-buehne').hidden = true;
  document.getElementById('jk-kopf').hidden = true;
  meldung('<div class="jk-leer">Der Kalender wird geladen …</div>');

  const [rRes, aRes, mRes] = await Promise.all([
    LPR.listAllTripsAdmin(),
    LPR.getAllTripSignupsAdmin(),
    LPR.listVolunteersAdmin()
  ]);

  // Eine leere Liste ist hier nie automatisch "keine Daten": RLS kann Zeilen
  // wegfiltern. Bei einem Fehler zeigen wir ihn, statt ein leeres Jahr zu
  // behaupten.
  if (!rRes.ok) return meldung(fehlerKasten('Die Reisen konnten nicht geladen werden.', rRes.error));
  if (!aRes.ok) return meldung(fehlerKasten('Die Anmeldungen konnten nicht geladen werden.', aRes.error));

  const alle = rRes.trips || [];
  REISEN = alle.filter(t => beruehrtJahr(t, JAHR));
  UNPLAUSIBEL = REISEN.filter(t => t.end_date && t.end_date < t.start_date);
  REISEN = REISEN.filter(t => UNPLAUSIBEL.indexOf(t) === -1);

  ANMELDUNGEN = {};
  (aRes.signups || []).forEach(s => {
    if (s.status !== 'confirmed') return;
    (ANMELDUNGEN[s.trip_id] = ANMELDUNGEN[s.trip_id] || []).push(s);
  });

  // Einmal rechnen, danach nur noch nachschlagen — Filter- und
  // Ansichtswechsel sollen nicht erneut ueber alle Tage laufen.
  ABDECKUNG = {};
  REISEN.forEach(t => { ABDECKUNG[t.id] = LPR.tripCoverage(ANMELDUNGEN[t.id] || [], t); });

  PERSONEN_AUS = !mRes.ok;
  MITGLIEDER = mRes.ok ? (mRes.members || []) : [];
  if (!mRes.ok) console.warn('[jahreskalender] Mitglieder:', mRes.error);

  SITZWACHEN = null;
  SITZWACHEN_FEHLER = null;

  meldung('');
  document.getElementById('jk-kopf').hidden = false;
  document.getElementById('jk-buehne').hidden = false;
  zeichne();
}

async function ladeSitzwachen() {
  if (SITZWACHEN !== null || SITZWACHEN_FEHLER) return;
  const res = await LPR.adminListBookings(iso(JAHR,1,1), iso(JAHR,12,31));
  if (!res.ok) { SITZWACHEN_FEHLER = res.error || 'unbekannter Fehler'; SITZWACHEN = []; return; }
  // Abgesagte Buchungen sind keine Verplanung.
  SITZWACHEN = (res.bookings || []).filter(b => !b.cancelled_at && b.status !== 'cancelled');
}

function meldung(html) { document.getElementById('jk-meldung').innerHTML = html; }

function fehlerKasten(text, detail) {
  return '<div class="jk-fehler"><strong>' + escapeHtml(text) + '</strong>'
    + (detail ? '<div style="margin-top:6px;font-size:13px;">' + escapeHtml(String(detail)) + '</div>' : '')
    + '<div style="margin-top:10px;font-size:13px;">Lade die Seite neu. Bleibt es dabei, liegt es vermutlich an den Zugriffsregeln — melde dich einmal ab und wieder an.</div></div>';
}

// ══════ Kopfzeile ══════

function zeichneKopf() {
  document.getElementById('jk-jahr-label').textContent = JAHR;

  document.getElementById('jk-filter').innerHTML =
    ['draft','open','closed','completed','cancelled'].map(s =>
      '<button type="button" data-status="' + s + '" aria-pressed="' + (STATUS_AN.has(s) ? 'true' : 'false') + '">'
      + STATUS_LABEL[s] + '</button>').join('');

  document.getElementById('jk-filter').querySelectorAll('button').forEach(b => {
    b.addEventListener('click', () => {
      const s = b.dataset.status;
      if (STATUS_AN.has(s)) STATUS_AN.delete(s); else STATUS_AN.add(s);
      zeichne();
    });
  });

  const sichtbar = sichtbareReisen();
  const kritisch = sichtbar.filter(t => ampel(t).klasse === 'jk-rot').length;
  document.getElementById('jk-kennzahl').innerHTML =
    sichtbar.length + (sichtbar.length === 1 ? ' Reise' : ' Reisen')
    + (kritisch ? ' · <span class="kritisch">' + kritisch + ' kritisch</span>' : '');

  document.getElementById('jk-ansicht-reise').setAttribute('aria-pressed', ANSICHT === 'reise' ? 'true' : 'false');
  const pBtn = document.getElementById('jk-ansicht-person');
  pBtn.setAttribute('aria-pressed', ANSICHT === 'person' ? 'true' : 'false');
  pBtn.disabled = PERSONEN_AUS;
  pBtn.title = PERSONEN_AUS ? 'Die Mitgliederliste konnte nicht geladen werden.' : '';
}

function sichtbareReisen() { return REISEN.filter(t => STATUS_AN.has(t.status)); }

// ══════ Ampel ══════

// Grün = kein offener Tag. Gelb = hoechstens die Haelfte offen. Rot = mehr.
// Entwuerfe bekommen keine Ampel: solange die Reise nicht offen ist, sagt
// "unbesetzt" nichts aus.
function ampel(t) {
  if (t.status === 'draft')     return { klasse: 'jk-entwurf', text: 'Entwurf' };
  if (t.status === 'cancelled') return { klasse: 'jk-abgesagt', text: 'Abgesagt' };
  const c = ABDECKUNG[t.id] || { total: 0, uncovered: 0 };
  if (!c.total)         return { klasse: 'jk-grau', text: '' };
  if (!c.uncovered)     return { klasse: 'jk-gruen', text: 'alle Tage besetzt' };
  const text = c.uncovered + ' von ' + c.total + ' Tagen offen';
  return { klasse: c.uncovered * 2 <= c.total ? 'jk-gelb' : 'jk-rot', text: text };
}

// ══════ Zeichnen ══════

async function zeichne() {
  if (ANSICHT === 'person') await ladeSitzwachen();
  zeichneKopf();
  const flaeche = document.getElementById('jk-flaeche');

  if (!sichtbareReisen().length) {
    flaeche.innerHTML = hinweisZeile() +
      '<div class="jk-leer"><div class="jk-leer-icon">🧳</div>'
      + '<p>Für ' + JAHR + ' gibt es keine Reisen mit diesen Status.</p>'
      + '<p><a href="admin-reisen.html" style="color:var(--green-deep);font-weight:600;">Reise anlegen →</a></p></div>';
    zeichnePanel();
    return;
  }

  flaeche.innerHTML = hinweisZeile()
    + (ANSICHT === 'reise' ? reiseAnsichtHtml() : personenAnsichtHtml());
  verdrahteFlaeche();
  zeichnePanel();
}

function hinweisZeile() {
  let out = '';
  if (UNPLAUSIBEL.length) {
    out += '<div class="jk-hinweis">' + UNPLAUSIBEL.length + ' Reise(n) haben ein Enddatum vor dem Startdatum '
      + 'und werden nicht gezeichnet: ' + UNPLAUSIBEL.map(t => escapeHtml(t.title)).join(', ')
      + '. Bitte in der Reisen-Verwaltung korrigieren.</div>';
  }
  if (ANSICHT === 'person' && SITZWACHEN_FEHLER) {
    out += '<div class="jk-hinweis">Die Sitzwachen konnten nicht geladen werden, die Reisen stimmen trotzdem. '
      + '(' + escapeHtml(SITZWACHEN_FEHLER) + ')</div>';
  }
  return out;
}

// Platzhalter — Task 5, 6 und 7 fuellen diese drei.
function reiseAnsichtHtml() { return ''; }
function personenAnsichtHtml() { return ''; }
function verdrahteFlaeche() {}
function zeichnePanel() {}

// ══════ Start ══════

document.getElementById('jk-jahr-zurueck').addEventListener('click', () => { JAHR--; PANEL_ID = null; laden(); });
document.getElementById('jk-jahr-vor').addEventListener('click',    () => { JAHR++; PANEL_ID = null; laden(); });
document.getElementById('jk-ansicht-reise').addEventListener('click',  () => { ANSICHT = 'reise';  zeichne(); });
document.getElementById('jk-ansicht-person').addEventListener('click', () => { ANSICHT = 'person'; zeichne(); });

laden();
</script>
</body>
</html>
```

- [ ] **Schritt 3: Browser-Check — Gerüst, Zugang und Navigation**

1. `http://localhost:8080/admin-jahreskalender.html` als Vorstand öffnen.
   Erwartet: Kopfzeile mit dem laufenden Jahr, den beiden Ansichts-Knöpfen, fünf Status-Chips (Entwurf, Offen, Geschlossen, Abgeschlossen aktiv; Abgesagt inaktiv) und rechts der Reise-Zähler. Die Fläche darunter ist leer — die Ansichten kommen in den nächsten Aufgaben. Keine Konsolenfehler.
2. Auf `‹` und `›` klicken. Erwartet: Die Jahreszahl ändert sich, der Zähler ebenfalls, die Seite lädt neu ohne Fehler.
3. Ein Status-Chip anklicken. Erwartet: Der Chip wechselt die Farbe, der Zähler ändert sich entsprechend.
4. Ein Jahr ohne Reisen ansteuern, etwa 2019. Erwartet: Leerzustand mit Koffer-Symbol und dem Link „Reise anlegen →".
5. In einem privaten Fenster ohne Anmeldung `admin-jahreskalender.html` aufrufen. Erwartet: Weiterleitung auf `login.html?next=admin-jahreskalender.html`.
6. Im Admin-Menü oben prüfen: „Jahreskalender" steht zwischen „Reisen" und „Pauschalen" und ist auf dieser Seite hervorgehoben.

- [ ] **Schritt 4: Commit**

```bash
git add admin-jahreskalender.html layout.js
git commit -m "feat(jahreskalender): Seitengeruest, Navigation und Datenladen"
```

---

## Task 5: Reise-Ansicht

**Files:**
- Modify: `admin-jahreskalender.html` (`<style>`-Block und die Platzhalter `reiseAnsichtHtml` / `verdrahteFlaeche`)

- [ ] **Schritt 1: CSS ergänzen**

Ans Ende des `<style>`-Blocks einfügen:

```css
/* ── Reise-Ansicht ── */
.jk-lineal { display:flex; gap:8px; margin-bottom:5px; }
.jk-lineal-spur { flex:1; position:relative; height:14px; font-size:11px; color: var(--muted); }
.jk-lineal-spur span { position:absolute; transform:translateX(-50%); }

.jk-zeile { display:flex; align-items:stretch; gap:8px; margin-bottom:5px; }
.jk-monat { width:38px; flex:none; font-size:13px; font-weight:700;
  color: var(--green-deep); line-height:30px; }
.jk-spur {
  position:relative; flex:1; height:30px; border-radius:5px; min-width:520px;
  background: repeating-linear-gradient(90deg,
    var(--jk-raster) 0, var(--jk-raster) calc(100%/31 - 1px),
    var(--jk-raster-linie) calc(100%/31 - 1px), var(--jk-raster-linie) calc(100%/31));
}
/* Tage, die es in diesem Monat nicht gibt. Ohne das liest man eine
   Februarwoche als laenger, als sie ist — alle Zeilen sind gleich breit. */
.jk-tot { position:absolute; top:0; bottom:0; right:0; border-radius:0 5px 5px 0;
  background: repeating-linear-gradient(45deg, var(--jk-tot) 0 3px, transparent 3px 6px); }

.jk-balken {
  position:absolute; top:3px; bottom:3px; border-radius:5px;
  display:flex; align-items:center; gap:6px; padding:0 7px;
  font-size:12px; font-weight:600; white-space:nowrap; cursor:pointer;
  border:0; color:#fff; text-align:left; overflow:visible;
}
.jk-balken.jk-gruen { background: var(--jk-gruen); }
.jk-balken.jk-gelb  { background: var(--jk-gelb); }
.jk-balken.jk-rot   { background: var(--jk-rot); }
.jk-balken.jk-grau  { background: var(--jk-grau); }
.jk-balken.jk-entwurf {
  background: repeating-linear-gradient(45deg,#EDEDED 0 4px,#DFDFDF 4px 8px);
  border:1.5px dashed var(--muted); color: var(--text);
}
.jk-balken.jk-abgesagt { background:#E4E4E4; color: var(--muted); text-decoration: line-through; }
.jk-balken:focus-visible { outline:3px solid var(--green-deep); outline-offset:2px; }

.jk-balken-titel { overflow:hidden; text-overflow:ellipsis; }
.jk-chip { background: rgba(255,255,255,.9); color:#222; border-radius:9px;
  padding:2px 7px; font-size:11px; margin-left:auto; flex:none; }
.jk-balken.jk-entwurf .jk-chip { background: rgba(255,255,255,.75); }

/* Zu schmal fuer eine Beschriftung: der Titel steht dann rechts daneben. */
.jk-aussen { position:absolute; left:calc(100% + 9px); color: var(--text);
  font-weight:600; text-decoration:none; }
.jk-aussen .jk-aussen-ampel { font-weight:600; }
.jk-kante { opacity:.75; flex:none; }
</style>
```

Achtung: Das schließende `</style>` steht bereits in der Datei — füge den Block **davor** ein und lasse das vorhandene `</style>` stehen.

- [ ] **Schritt 2: `reiseAnsichtHtml` ersetzen**

Ersetze `function reiseAnsichtHtml() { return ''; }` durch:

```js
const MONAT_KURZ = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];

function reiseAnsichtHtml() {
  const sichtbar = sichtbareReisen();

  let out = '<div class="jk-lineal"><div style="width:38px;flex:none"></div><div class="jk-lineal-spur">';
  [1,5,10,15,20,25,31].forEach(tag => {
    out += '<span style="left:' + ((tag - 0.5) / 31 * 100).toFixed(2) + '%">' + tag + '</span>';
  });
  out += '</div></div>';

  for (let m = 1; m <= 12; m++) {
    const anzahl = tageImMonat(JAHR, m);
    const erster  = iso(JAHR, m, 1);
    const letzter = iso(JAHR, m, anzahl);

    out += '<div class="jk-zeile"><div class="jk-monat">' + MONAT_KURZ[m-1] + '</div><div class="jk-spur">';
    if (anzahl < 31) {
      out += '<div class="jk-tot" style="left:' + (anzahl / 31 * 100).toFixed(2) + '%"></div>';
    }

    sichtbar.filter(t => beruehrtMonat(t, JAHR, m)).forEach(t => {
      const ende = t.end_date || t.start_date;
      const linksAb  = t.start_date < erster;
      const rechtsAb = ende > letzter;
      const vonTag = linksAb  ? 1      : Number(t.start_date.slice(8,10));
      const bisTag = rechtsAb ? anzahl : Number(ende.slice(8,10));
      const links  = (vonTag - 1) / 31 * 100;
      const breite = (bisTag - vonTag + 1) / 31 * 100;
      const a = ampel(t);
      const eck = (linksAb ? '0 ' : '5px ') + (rechtsAb ? '0 0 ' : '5px 5px ') + (linksAb ? '0' : '5px');

      out += '<button type="button" class="jk-balken ' + a.klasse + '"'
        + ' data-reise="' + escapeHtml(t.id) + '"'
        + ' style="left:' + links.toFixed(2) + '%;width:' + breite.toFixed(2) + '%;border-radius:' + eck + '"'
        + ' title="' + escapeHtml(t.title + ' · ' + t.start_date + ' bis ' + ende + (a.text ? ' · ' + a.text : '')) + '">';

      if (linksAb) out += '<span class="jk-kante" aria-hidden="true">◀</span>';

      // Unter rund 30 % Zeilenbreite passt kein Titel mehr in den Balken.
      if (breite >= 30) {
        out += '<span class="jk-balken-titel">' + escapeHtml(t.title) + '</span>';
        if (a.text) out += '<span class="jk-chip">' + escapeHtml(a.text) + '</span>';
      } else {
        out += '<span class="jk-aussen">' + escapeHtml(t.title)
          + (a.text ? ' <span class="jk-aussen-ampel" style="color:var(--' + a.klasse + ')">· ' + escapeHtml(a.text) + '</span>' : '')
          + '</span>';
      }

      if (rechtsAb) out += '<span class="jk-kante" style="margin-left:auto" aria-hidden="true">▶</span>';
      out += '</button>';
    });

    out += '</div></div>';
  }
  return out;
}
```

- [ ] **Schritt 3: `verdrahteFlaeche` ersetzen**

Ersetze `function verdrahteFlaeche() {}` durch:

```js
function verdrahteFlaeche() {
  document.getElementById('jk-flaeche').querySelectorAll('[data-reise]').forEach(el => {
    el.addEventListener('click', () => { PANEL_ID = el.dataset.reise; zeichnePanel(); });
  });
}
```

- [ ] **Schritt 4: Browser-Check — die Monatszeilen stimmen**

Seite neu laden, ein Jahr mit Reisen wählen.

1. Zwölf Monatszeilen sind da, auch leere. Über allen steht ein Lineal mit 1, 5, 10, 15, 20, 25, 31.
2. Februar ist ab dem 29. schraffiert abgeblendet, April, Juni, September und November ab dem 31. Januar hat keine Schraffur.
3. Jede Reise sitzt im richtigen Monat. Öffne zur Kontrolle die Konsole:

```js
sichtbareReisen().map(t => t.title + ' ' + t.start_date + '…' + (t.end_date||t.start_date));
```

   Vergleiche die Liste mit dem Bild.
4. Farben: eine voll besetzte Reise ist grün mit „alle Tage besetzt", eine teilweise besetzte gelb oder rot mit „N von M Tagen offen". Ein Entwurf ist grau schraffiert und gestrichelt umrandet, ohne Ampeltext außer „Entwurf".
5. Chip „Abgesagt" anklicken. Erwartet: abgesagte Reisen erscheinen grau und durchgestrichen. Nochmal klicken: sie verschwinden.
6. Eine kurze Reise (unter zehn Tagen) hat ihren Titel **rechts neben** dem Balken, eine lange **im** Balken.
7. Falls es eine Reise über eine Monatsgrenze gibt: Sie erscheint in beiden Zeilen, die erste endet mit `▶`, die zweite beginnt mit `◀`, und beide Enden sind an der Schnittkante eckig. Gibt es keine solche Reise, lege in `admin-reisen.html` testweise einen **Entwurf** vom 28.09. bis 03.10. an, prüfe und lösche ihn wieder.
8. Ampel gegenprüfen: Notiere für eine gelbe oder rote Reise den Text „N von M Tagen offen", öffne `admin-reisen.html`, klappe dieselbe Reise auf. Erwartet: Die Kopfzeile nennt dasselbe N und M.
9. Kontrastmodus über die Leiste oben einschalten. Erwartet: Die Balken bleiben unterscheidbar und die Ampeltexte lesbar.
10. Fenster auf Handybreite verkleinern. Erwartet: Die Kalenderfläche scrollt waagerecht, die Seite selbst nicht.

- [ ] **Schritt 5: Commit**

```bash
git add admin-jahreskalender.html
git commit -m "feat(jahreskalender): Reise-Ansicht mit Monatszeilen und Ampel"
```

---

## Task 6: Detail-Panel

**Files:**
- Modify: `admin-jahreskalender.html` (`<style>`-Block und der Platzhalter `zeichnePanel`)

- [ ] **Schritt 1: CSS ergänzen**

Vor das schließende `</style>` einfügen:

```css
/* ── Detail-Panel ── */
.jk-panel { width:300px; flex:none; border-left:1px solid var(--border);
  padding:14px 16px; font-size:14px; line-height:1.55; }
.jk-panel-kopf { display:flex; justify-content:space-between; align-items:flex-start; gap:8px; }
.jk-panel-titel { font-size:17px; font-weight:700; color: var(--green-deep); }
.jk-panel-zu { border:0; background:none; font-size:20px; line-height:1;
  color: var(--muted); cursor:pointer; padding:0 2px; }
.jk-marken { display:flex; gap:6px; flex-wrap:wrap; margin:9px 0 11px; }
.jk-marke { background: var(--sand); color: var(--green-deep);
  border-radius:11px; padding:2px 9px; font-size:12px; }
.jk-abdeckung { border-radius: var(--radius-sm); padding:8px 10px;
  font-weight:600; margin-bottom:10px; font-size:13px; }
.jk-abdeckung.offen { background:#FCEDEA; border:1px solid #E8BCB0; color:#8A2B12; }
.jk-abdeckung.voll  { background:#EAF3EC; border:1px solid #B7D4BF; color:#1F5B31; }
.jk-tagzeile { display:flex; gap:8px; padding:3px 5px; border-radius:4px; font-size:13px; }
.jk-tagzeile.luecke { background:#FCEDEA; }
.jk-tagdatum { width:72px; flex:none; color: var(--muted); }
.jk-tagwarn { color: var(--jk-rot); font-weight:600; }
.jk-panel-knopf { display:block; text-align:center; margin-top:14px;
  background: var(--green-deep); color:#fff; padding:10px; border-radius: var(--radius-sm);
  text-decoration:none; font-weight:600; }

@media (max-width: 900px) {
  .jk-buehne { flex-direction: column; }
  .jk-panel { width:auto; border-left:0; border-top:2px solid var(--border); }
}
```

- [ ] **Schritt 2: `zeichnePanel` ersetzen**

Ersetze `function zeichnePanel() {}` durch:

```js
function zeichnePanel() {
  const ziel = document.getElementById('jk-panel');
  const t = PANEL_ID ? REISEN.filter(x => x.id === PANEL_ID)[0] : null;
  if (!t) { ziel.innerHTML = ''; ziel.className = ''; return; }
  ziel.className = 'jk-panel';

  const signups = ANMELDUNGEN[t.id] || [];
  const tage = LPR.enumTripDays(t.start_date, t.end_date);
  const c = ABDECKUNG[t.id] || { total: 0, uncovered: 0 };
  const ende = t.end_date || t.start_date;

  const marken = ['<span class="jk-marke">' + STATUS_LABEL[t.status] + '</span>'];
  if (t.max_spots) marken.push('<span class="jk-marke">' + t.max_spots + ' Plätze</span>');
  if (t.partner)   marken.push('<span class="jk-marke">Partner: ' + escapeHtml(t.partner) + '</span>');
  if (t.rate_override_per_day != null)
    marken.push('<span class="jk-marke">Tagessatz: ' + Number(t.rate_override_per_day).toFixed(2) + ' €</span>');

  const kopf = c.uncovered
    ? '<div class="jk-abdeckung offen">⚠ ' + c.uncovered + ' von ' + c.total + ' Tagen nicht vollständig besetzt</div>'
    : '<div class="jk-abdeckung voll">✓ Alle ' + c.total + ' Tage sind vollständig besetzt</div>';

  const HALB_LANG = { am: 'Vormittag', pm: 'Nachmittag' };
  const HALB_KURZ = { am: 'Vm', pm: 'Nm' };

  const zeilen = tage.map(tag => {
    const drauf = signups.filter(s => LPR.signupEffectiveDays(s, tage).indexOf(tag) !== -1);
    const namen = drauf.map(s => {
      const h = LPR.signupEffectiveHalf(s, tag);
      return escapeHtml(s.full_name || 'Mitglied') + (HALB_KURZ[h] ? ' (' + HALB_KURZ[h] + ')' : '');
    }).join(' · ');
    const luecken = LPR.tripDayGaps(signups, t, tag);
    const warn = luecken.length === 2 ? '⚠ unbesetzt'
      : (luecken.length ? '⚠ ' + HALB_LANG[luecken[0]] + ' unbesetzt' : '');
    return '<div class="jk-tagzeile' + (luecken.length ? ' luecke' : '') + '">'
      + '<span class="jk-tagdatum">' + LPR.formatTripDay(tag) + '</span>'
      + '<span>' + namen + (warn ? (namen ? ' · ' : '') + '<span class="jk-tagwarn">' + warn + '</span>' : '') + '</span>'
      + '</div>';
  }).join('');

  ziel.innerHTML =
    '<div class="jk-panel-kopf"><div>'
    + '<div class="jk-panel-titel">' + escapeHtml(t.title) + '</div>'
    + '<div style="color:var(--muted);font-size:13px;">' + LPR.formatTripDay(t.start_date)
      + ' – ' + LPR.formatTripDay(ende) + ' · ' + escapeHtml(t.location || '') + '</div>'
    + '</div><button type="button" class="jk-panel-zu" id="jk-panel-zu" aria-label="Panel schließen">✕</button></div>'
    + '<div class="jk-marken">' + marken.join('') + '</div>'
    + (t.status === 'draft'
        ? '<div class="jk-abdeckung" style="background:var(--sand);color:var(--muted);">Entwurf — die Besetzung wird erst gezählt, wenn die Reise offen ist.</div>'
        : kopf)
    + '<div style="font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);margin-bottom:4px;">Tagesabdeckung</div>'
    + zeilen
    + '<a class="jk-panel-knopf" href="admin-reisen.html#trip-' + encodeURIComponent(t.id) + '">In Reisen bearbeiten →</a>';

  document.getElementById('jk-panel-zu').addEventListener('click', () => { PANEL_ID = null; zeichnePanel(); });
}
```

- [ ] **Schritt 3: Browser-Check — das Panel stimmt mit `admin-reisen.html` überein**

1. Auf einen Balken klicken. Erwartet: Rechts öffnet sich das Panel mit Titel, Zeitraum, Ort, Marken für Status und Plätze, Abdeckungs-Kopf und der Tagesliste.
2. Dieselbe Reise in `admin-reisen.html` aufklappen und **Zeile für Zeile** vergleichen: Tagesdatum, Namen, die Zusätze „(Vm)" und „(Nm)", die Warnungen „⚠ unbesetzt", „⚠ Vormittag unbesetzt", „⚠ Nachmittag unbesetzt". Erwartet: identischer Wortlaut, identische Reihenfolge.
3. Auf einen Entwurf klicken. Erwartet: Statt der Ampel steht der Hinweis, dass die Besetzung erst bei offener Reise zählt. Die Tagesliste erscheint trotzdem.
4. „In Reisen bearbeiten →" klicken. Erwartet: `admin-reisen.html` öffnet sich, springt zu genau dieser Reise, klappt sie auf und hebt sie kurz hervor.
5. `✕` klicken. Erwartet: Das Panel verschwindet, der Kalender nimmt die volle Breite ein.
6. Fenster unter 900 px verkleinern. Erwartet: Das Panel rutscht unter den Kalender statt daneben.
7. Mit `Tab` durch die Balken gehen und mit `Enter` einen öffnen. Erwartet: Der fokussierte Balken hat einen sichtbaren Rahmen, `Enter` öffnet das Panel.

- [ ] **Schritt 4: Commit**

```bash
git add admin-jahreskalender.html
git commit -m "feat(jahreskalender): Detail-Panel mit Tagesabdeckung"
```

---

## Task 7: Personen-Ansicht

**Files:**
- Modify: `admin-jahreskalender.html` (`<style>`-Block und der Platzhalter `personenAnsichtHtml`)

- [ ] **Schritt 1: CSS ergänzen**

Vor das schließende `</style>` einfügen:

```css
/* ── Personen-Ansicht ── */
.jk-p-zeile { display:flex; align-items:stretch; gap:8px; margin-bottom:5px; }
.jk-p-name { width:150px; flex:none; font-size:13px; line-height:28px;
  color: var(--green-deep); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.jk-p-name .jk-p-tage { color: var(--muted); font-size:11px; }
.jk-p-spur { position:relative; flex:1; height:28px; border-radius:5px;
  background: var(--jk-raster); min-width:520px; }
.jk-p-monat { position:absolute; top:0; bottom:0; width:1px; background: var(--jk-raster-linie); }
.jk-p-reise { position:absolute; top:4px; bottom:4px; min-width:7px;
  border-radius:3px; border:0; padding:0; cursor:pointer; }
.jk-p-reise.jk-gruen { background: var(--jk-gruen); }
.jk-p-reise.jk-gelb  { background: var(--jk-gelb); }
.jk-p-reise.jk-rot   { background: var(--jk-rot); }
.jk-p-reise.jk-grau, .jk-p-reise.jk-entwurf, .jk-p-reise.jk-abgesagt { background: var(--jk-grau); }
.jk-p-reise:focus-visible { outline:3px solid var(--green-deep); outline-offset:2px; }
/* Sitzwachen sind Nebeninformation und duerfen den Blick nicht ziehen. */
.jk-p-sw { position:absolute; top:9px; bottom:9px; width:3px;
  border-radius:1px; background: var(--jk-grau); }
.jk-p-sw.konflikt { box-shadow:0 0 0 2px var(--jk-rot); }
.jk-p-konflikte { margin:10px 0 4px; font-size:13px; color: var(--jk-rot); font-weight:600; }
.jk-p-rest { margin-top:12px; font-size:14px; }
.jk-p-rest summary { cursor:pointer; color: var(--green-deep); font-weight:600; }
.jk-p-rest div { color: var(--muted); font-size:13px; padding-top:6px; }
```

- [ ] **Schritt 2: `personenAnsichtHtml` ersetzen**

Ersetze `function personenAnsichtHtml() { return ''; }` durch:

```js
// Tag im Jahr, 1-basiert, auf das angezeigte Jahr beschnitten. Reisen ueber
// den Jahreswechsel werden dadurch am Rand abgeschnitten statt verschoben.
function tagImJahr(isoTag) {
  const d = new Date(isoTag + 'T00:00:00Z');
  const n = Math.floor((d.getTime() - Date.UTC(JAHR,0,1)) / 86400000) + 1;
  return Math.min(Math.max(n, 1), tageImJahr(JAHR));
}

// Aus einer sortierten Tagesliste zusammenhaengende Abschnitte machen, damit
// eine Teil-Anmeldung mit Luecke nicht als ein durchgehender Block erscheint.
function laeufe(tage) {
  const s = tage.slice().sort();
  const out = [];
  s.forEach(tag => {
    const letzter = out[out.length - 1];
    if (letzter && tagImJahr(tag) === tagImJahr(letzter.bis) + 1) letzter.bis = tag;
    else out.push({ von: tag, bis: tag });
  });
  return out;
}

function personenZeilen() {
  const nachId = {};
  function zeile(id, name) {
    if (!nachId[id]) nachId[id] = { id: id, name: name || 'Mitglied', reisen: [], sw: [], tage: new Set() };
    else if (name && nachId[id].name === 'Mitglied') nachId[id].name = name;
    return nachId[id];
  }

  MITGLIEDER.forEach(m => zeile(m.id, m.full_name));

  sichtbareReisen().forEach(t => {
    const alle = LPR.enumTripDays(t.start_date, t.end_date);
    (ANMELDUNGEN[t.id] || []).forEach(s => {
      const z = zeile(s.user_id, s.full_name);
      const eigene = LPR.signupEffectiveDays(s, alle).filter(tag => tag >= iso(JAHR,1,1) && tag <= iso(JAHR,12,31));
      if (!eigene.length) return;
      eigene.forEach(tag => z.tage.add(tag));
      laeufe(eigene).forEach(l => z.reisen.push({ trip: t, von: l.von, bis: l.bis }));
    });
  });

  (SITZWACHEN || []).forEach(b => {
    if (!b.date || b.date < iso(JAHR,1,1) || b.date > iso(JAHR,12,31)) return;
    zeile(b.volunteer_id, b.volunteer_name).sw.push(b.date);
  });

  const liste = Object.keys(nachId).map(k => nachId[k]);
  liste.forEach(z => {
    z.konflikte = z.sw.filter(tag => z.tage.has(tag));
    z.anzahl = z.tage.size;
  });
  liste.sort((a, b) => b.anzahl - a.anzahl || a.name.localeCompare(b.name, 'de'));
  return liste;
}

function personenAnsichtHtml() {
  const zeilen = personenZeilen();
  const mit  = zeilen.filter(z => z.anzahl || z.sw.length);
  const ohne = zeilen.filter(z => !z.anzahl && !z.sw.length);
  const laenge = tageImJahr(JAHR);

  let out = '<div class="jk-lineal"><div style="width:150px;flex:none"></div><div class="jk-lineal-spur">';
  for (let m = 1; m <= 12; m++) {
    out += '<span style="left:' + ((tagImJahr(iso(JAHR,m,1)) - 1) / laenge * 100).toFixed(2) + '%;transform:none">'
      + MONAT_KURZ[m-1] + '</span>';
  }
  out += '</div></div>';

  mit.forEach(z => {
    out += '<div class="jk-p-zeile"><div class="jk-p-name" title="' + escapeHtml(z.name) + '">'
      + escapeHtml(z.name) + ' <span class="jk-p-tage">' + z.anzahl + ' T</span></div>'
      + '<div class="jk-p-spur">';

    for (let m = 2; m <= 12; m++) {
      out += '<div class="jk-p-monat" style="left:' + ((tagImJahr(iso(JAHR,m,1)) - 1) / laenge * 100).toFixed(2) + '%"></div>';
    }

    z.reisen.forEach(r => {
      const links  = (tagImJahr(r.von) - 1) / laenge * 100;
      const breite = (tagImJahr(r.bis) - tagImJahr(r.von) + 1) / laenge * 100;
      out += '<button type="button" class="jk-p-reise ' + ampel(r.trip).klasse + '"'
        + ' data-reise="' + escapeHtml(r.trip.id) + '"'
        + ' style="left:' + links.toFixed(2) + '%;width:' + breite.toFixed(2) + '%"'
        + ' title="' + escapeHtml(r.trip.title + ' · ' + r.von + ' bis ' + r.bis) + '"></button>';
    });

    z.sw.forEach(tag => {
      const konflikt = z.tage.has(tag);
      out += '<div class="jk-p-sw' + (konflikt ? ' konflikt' : '') + '"'
        + ' style="left:' + ((tagImJahr(tag) - 1) / laenge * 100).toFixed(2) + '%"'
        + ' title="Sitzwache ' + escapeHtml(tag) + (konflikt ? ' — am selben Tag auch auf Reise' : '') + '"></div>';
    });

    out += '</div></div>';
  });

  if (!mit.length) {
    out += '<div class="jk-leer">Für ' + JAHR + ' ist niemand verplant.</div>';
  }

  const konflikte = mit.filter(z => z.konflikte.length);
  if (konflikte.length) {
    const anzahl = konflikte.reduce((n, z) => n + z.konflikte.length, 0);
    out += '<div class="jk-p-konflikte">⚠ ' + anzahl + ' mögliche Doppelverplanung'
      + (anzahl === 1 ? '' : 'en') + ' — '
      + konflikte.map(z => escapeHtml(z.name) + ' am ' + z.konflikte.map(t => LPR.formatTripDay(t)).join(', ')).join('; ')
      + '</div>';
  }

  if (ohne.length) {
    out += '<details class="jk-p-rest"><summary>Ohne Einsatz ' + JAHR + ' (' + ohne.length + ')</summary>'
      + '<div>' + ohne.map(z => escapeHtml(z.name)).join(' · ') + '</div></details>';
  }
  return out;
}
```

- [ ] **Schritt 3: Browser-Check — die Personen-Ansicht stimmt**

1. Auf „Nach Person" umschalten. Erwartet: Ein Monatslineal von Jan bis Dez, darunter eine Zeile je verplanter Person mit Namen und Tageszähler.
2. Sortierung prüfen: Die Person mit den meisten Einsatztagen steht oben.
3. Reise-Blöcke tragen die Ampelfarbe **ihrer Reise**. Fahre mit der Maus darüber: Der Tooltip nennt Titel und Zeitraum. Ein Klick öffnet dasselbe Detail-Panel wie in der Reise-Ansicht.
4. Sitzwachen sind schmale graue Striche und deutlich unauffälliger als die Reise-Blöcke.
5. `<details>`-Block „Ohne Einsatz JJJJ (N)" steht unten und klappt auf.
6. Gegenprobe zur Teil-Anmeldung: Suche eine Anmeldung mit gesetzten Tagen. In der Konsole:

```js
Object.values(ANMELDUNGEN).flat().filter(s => s.days && s.days.length).slice(0,3)
  .map(s => s.full_name + ': ' + s.days.join(','));
```

   Erwartet: Der Block dieser Person deckt genau diese Tage ab, nicht die ganze Reise. Bei einer Lücke in den Tagen entstehen **zwei** Blöcke.
7. Konflikt prüfen: Wenn die Warnzeile „⚠ N mögliche Doppelverplanungen" erscheint, hat der genannte Strich einen roten Ring. Gibt es keinen Konflikt in den Echtdaten, prüfe die Logik in der Konsole:

```js
personenZeilen().filter(z => z.konflikte.length).map(z => z.name + ': ' + z.konflikte.join(','));
```

   Erwartet: leeres Array, wenn es keine Konflikte gibt — und keine Fehlermeldung.
8. Jahr mit `‹` wechseln und wieder auf „Nach Person" gehen. Erwartet: Die Sitzwachen des neuen Jahres werden geladen, die Zeilen ändern sich.
9. Fehlerfall: In der Konsole `LPR.adminListBookings = async () => ({ ok:false, error:'Testfehler', bookings:[] });` setzen, dann Jahr wechseln und auf „Nach Person" gehen. Erwartet: Gelber Hinweis „Die Sitzwachen konnten nicht geladen werden…", die Reise-Blöcke sind trotzdem da. Danach Seite neu laden.

- [ ] **Schritt 4: Commit**

```bash
git add admin-jahreskalender.html
git commit -m "feat(jahreskalender): Personen-Ansicht mit Sitzwachen und Konflikten"
```

---

## Task 8: Abschluss — Gesamtdurchlauf und Doku

**Files:**
- Modify: `README.md` (Tabelle „Struktur")

- [ ] **Schritt 1: README ergänzen**

In der Tabelle unter „Struktur", direkt nach der Zeile für `admin-mitwirkende.html`, einfügen:

```markdown
| `admin-jahreskalender.html` | Admin: Jahressicht auf alle Reisen, Besetzungs-Ampel, Personen-Ansicht |
```

- [ ] **Schritt 2: Gesamtdurchlauf**

Seite neu laden und der Reihe nach prüfen:

1. Ohne Anmeldung aufrufen → Weiterleitung auf `login.html?next=admin-jahreskalender.html`.
2. Als Vorstand anmelden → Kalender erscheint im laufenden Jahr.
3. Ein Jahr zurück, ein Jahr vor, zurück auf das laufende Jahr → keine Fehler, Zahlen ändern sich plausibel.
4. Alle fünf Status-Chips einmal an- und wieder ausschalten → keine Fehler, der Zähler folgt.
5. Zwischen den beiden Ansichten dreimal hin- und herschalten → keine Fehler, kein doppeltes Panel.
6. Balken anklicken, Panel öffnen, „In Reisen bearbeiten" folgen, mit dem Zurück-Knopf des Browsers zurück → der Kalender ist wieder da.
7. Schriftgröße auf A++ stellen → nichts überlappt, die Kalenderfläche scrollt waagerecht.
8. Kontrastmodus einschalten → Ampeln bleiben unterscheidbar, Texte lesbar.
9. Konsole prüfen: keine Fehler, keine Warnungen aus `[jahreskalender]`.

- [ ] **Schritt 3: Ampel-Gegenprobe über alle Reisen**

Auf `admin-jahreskalender.html` in der Konsole:

```js
sichtbareReisen().map(t => t.title + ' → ' + ABDECKUNG[t.id].uncovered + '/' + ABDECKUNG[t.id].total).join('\n');
```

Ausgabe notieren. Dann `admin-reisen.html` öffnen, Filter auf „Alle Reisen", in der Konsole:

```js
_trips.map(t => t.title + ' → ' + coverageSummary(_signupsByTrip[t.id] || [], t).uncovered
  + '/' + coverageSummary(_signupsByTrip[t.id] || [], t).total).join('\n');
```

Erwartet: Für jede Reise, die in beiden Listen vorkommt, stehen dieselben Zahlen. Weicht etwas ab, liegt es an der Gruppierung der Anmeldungen — der Kalender nimmt nur `status === 'confirmed'`, `admin-reisen.html` alles außer `cancelled`. Für die Abdeckung ist das gleichwertig, weil `LPR.tripDayGaps` selbst auf `confirmed` filtert. Ist es trotzdem verschieden, ist es ein echter Fehler.

- [ ] **Schritt 4: Commit**

```bash
git add README.md
git commit -m "docs: Jahreskalender in der Seitenuebersicht"
```

- [ ] **Schritt 5: Übergabe**

Zusammenfassen und **nicht** von selbst pushen oder nach `main` mergen — das entscheidet Eric. Im Bericht nennen:

- welche Browser-Checks bestanden haben und welche nicht
- ob es Reisen mit unplausiblen Daten gab, die der Kalender ausblendet
- ob es Doppelverplanungen in den Echtdaten gibt
- alles, was auffiel, aber nicht zum Auftrag gehörte

---

## Was dieser Plan bewusst nicht enthält

- **Kein Bearbeiten im Kalender.** Kein Drag & Drop, kein Formular. `admin-reisen.html` kann das bereits.
- **Keine Sitzwachen in den Monatszeilen.** Nur in der Personen-Ansicht.
- **Keine tagesgenaue Einfärbung innerhalb eines Balkens.** Welche Tage offen sind, steht im Panel.
- **Keine Druckansicht.** Kommt, wenn sich zeigt, dass der Kalender auf Papier gebraucht wird.
- **Keine Testinfrastruktur.** Siehe den Hinweis ganz oben.
