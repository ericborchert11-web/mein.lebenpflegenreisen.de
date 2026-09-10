# Landingpage `/mitmachen/` — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine öffentliche, cookiefreie Landingpage unter `/mitmachen/`, die Bewerbungen von Ehrenamtlichen mit Pflege-Hintergrund über die bestehende Edge Function `ehrenamt-interesse` in `ehrenamt_interessenten` schreibt.

**Architecture:** Statisches HTML mit eingebettetem CSS und Vanilla JS, kein `supabase-js`, kein CDN. Ein `fetch` an `POST /functions/v1/ehrenamt-interesse` — dieselbe Bauart wie `submitClinicApplication()` in `app.js`. Die Function erbt Honigtopf, Dubletten-Sperre und beide Mails. Drei neue Spalten, vier vorhandene werden endlich befüllt.

**Tech Stack:** HTML/CSS/Vanilla JS, GitHub Pages, Supabase Edge Function (Deno), PostgreSQL. Prüfskript in Node (kein Test-Runner im Repo).

**Spec:** `docs/superpowers/specs/2026-09-10-mitmachen-landingpage-design.md`

---

## Kontext, den der Umsetzende kennen muss

**Das Repo ist öffentlich.** `sql/`, `functions/`, `supabase/` und `.superpowers/` sind in `.gitignore`. Änderungen dort werden **nicht** committet — sie werden Eric im Chat vorgelegt.

**Es gibt keinen Test-Runner.** Kein `package.json`, kein vitest, kein jest. Task 1 legt ein eigenständiges Node-Prüfskript an; das ist der Test-Ersatz für die harten Inhalts-Gates.

**Kein Deploy-Zugang.** Kein Supabase-Access-Token auf der Maschine (`~/.supabase/access-token` fehlt). Migration und Function-Deploy macht Eric.

**Diese vier Spalten existieren bereits** (`sql/2026-09-01-r-akquise.sql`, Zeilen 22–31) und werden von `admin-ehrenamt-interesse.html` bereits gerendert, aber von niemandem befüllt:
`bezirk text(≤80)`, `hintergrund text check in ('pflege','medizin','kein','unklar')`, `verfuegbarkeit text(≤300)`, `ref_code text(≤60)`.

**Farbregel (Abweichung vom Briefing, bewusst):** `#7AAA8A` erreicht auf `#F5F5F0` nur 2,4:1 und verfehlt WCAG AA. Es wird **nur auf dunklem Grund** verwendet (4,7:1 auf `#1A3A2A`). Subtext auf hellem Grund ist `#4F6B5C` (5,3:1).

**Inhaltliche Sperren, die das Prüfskript erzwingt:** keine Euro-Beträge, keine Kliniknamen, Pflichtsatz wörtlich vorhanden, keine externen URLs außer den Links auf `lebenpflegenreisen.de`.

---

## Dateien

| Datei | Verantwortung | Committet? |
|---|---|---|
| `scripts/pruefe-mitmachen.mjs` | erzwingt die Inhalts-Gates und die Requestfreiheit | ja |
| `mitmachen/index.html` | die gesamte Seite: Markup, CSS, JS | ja |
| `mitmachen/fonts/*.woff2` | vier self-gehostete Schriftschnitte | ja |
| `admin-ehrenamt-interesse.html` | zeigt die neuen Felder (nur Anzeige) | ja |
| `sql/2026-09-10-ae-mitmachen.sql` | drei Spalten, erweiterter Check | **nein** (gitignored) |
| `functions/ehrenamt-interesse/index.ts` | liest die neuen Felder, behält `?src=` | **nein** (gitignored) |

---

### Task 1: Prüfskript, das die Gates erzwingt

**Files:**
- Create: `scripts/pruefe-mitmachen.mjs`

- [ ] **Step 1: Prüfskript schreiben**

```javascript
#!/usr/bin/env node
/**
 * Prueft mitmachen/index.html gegen die harten Gates aus dem Briefing.
 *
 * WARUM ALS SKRIPT UND NICHT ALS SICHTPRUEFUNG: Die Gates sind genau die
 * Sorte Regel, die beim dritten Textdurchgang durchrutscht — eine Zahl zur
 * Aufwandsentschaedigung, ein Klinikname im OG-Tag, ein Font-Link, der beim
 * Kopieren aus einer anderen Seite mitkommt. Ein Skript vergisst nicht.
 *
 * Aufruf:  node scripts/pruefe-mitmachen.mjs
 * Beendet mit Code 1, sobald eine Pruefung faellt.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SEITE = 'mitmachen/index.html';
const html = readFileSync(SEITE, 'utf8');

const fehler = [];
const pruefe = (name, bedingung, hinweis) => {
  if (!bedingung) fehler.push(`${name}\n    ${hinweis}`);
};

// ── Gate 1: keine Euro-Betraege ────────────────────────────────────────────
// Die Freigabe des Finanzvorstands zur Aufwandsentschaedigung steht aus.
// Qualitativ ("steuerfrei") ist erlaubt, jede Zahl nicht — auch nicht in
// Meta-Tags oder Kommentaren, deshalb wird die ganze Datei geprueft.
const betrag = html.match(/\d[\d.,]*\s*(€|EUR\b|Euro\b)|(€|EUR\b)\s*\d/gi);
pruefe('Gate 1 — keine Euro-Betraege', betrag === null,
  `gefunden: ${betrag ? betrag.join(', ') : ''}`);

// ── Gate 2: keine Kliniknamen ──────────────────────────────────────────────
// Strenger als marketing/ehrenamt/README.md, wo Sana genannt werden darf.
// Auf dieser Seite gilt ausschliesslich "Berliner Partnerkliniken".
const kliniken = ['sana', 'charité', 'charite', 'hedwig', 'jvk',
                  'justizvollzugskrankenhaus', 'vivantes', 'lichtenberg'];
for (const k of kliniken) {
  pruefe(`Gate 2 — Klinikname "${k}"`, !html.toLowerCase().includes(k),
    'Nur "Berliner Partnerkliniken" ist zulaessig.');
}

// ── Gate 3: Abgrenzungssatz woertlich ──────────────────────────────────────
const PFLICHTSATZ =
  'Sitzwache ist Begleitung – keine pflegerischen oder medizinischen Tätigkeiten.';
pruefe('Gate 3 — Pflichtsatz woertlich', html.includes(PFLICHTSATZ),
  `Exakt dieser Satz fehlt (Gedankenstrich ist ein Halbgeviertstrich):\n    ${PFLICHTSATZ}`);

// ── Gate 4: keine externen Requests ────────────────────────────────────────
// Erlaubt sind nur Links (href) auf die Hauptdomain und der fetch-Aufruf an
// die Edge Function. Verboten ist alles, was der Browser VON SELBST laedt:
// Schriften, Skripte, Bilder, Stylesheets.
pruefe('Gate 4 — kein Google-Fonts-Link', !html.includes('fonts.googleapis.com'),
  'Schriften liegen self-gehostet unter mitmachen/fonts/.');
pruefe('Gate 4 — kein gstatic', !html.includes('fonts.gstatic.com'),
  'Schriften liegen self-gehostet unter mitmachen/fonts/.');
pruefe('Gate 4 — kein CDN-Skript', !/<script[^>]+src=["']https?:/i.test(html),
  'Kein supabase-js, kein jsdelivr. Ein fetch genuegt.');
pruefe('Gate 4 — kein externes Stylesheet',
  !/<link[^>]+rel=["']stylesheet["'][^>]+href=["']https?:/i.test(html),
  'CSS steht im <head> der Seite.');
pruefe('Gate 4 — keine externen Bilder', !/<img[^>]+src=["']https?:/i.test(html),
  'Bilder als inline-SVG oder data:-URI.');

// ── Barrierefreiheit und Grundgeruest ──────────────────────────────────────
pruefe('lang="de" gesetzt', /<html[^>]+lang=["']de["']/.test(html),
  'Ohne lang liest der Screenreader deutschen Text englisch vor.');
pruefe('Titel gesetzt',
  html.includes('<title>Ehrenamtliche Sitzwache werden – Leben Pflegen Reisen e.V.</title>'),
  'Titel exakt nach Briefing Abschnitt "Meta".');
pruefe('Description vorhanden',
  /<meta[^>]+name=["']description["'][^>]+content=["'][^"']{80,200}["']/.test(html),
  'Beschreibung mit rund 150 Zeichen fehlt oder ist zu kurz/lang.');
pruefe('viewport gesetzt', /<meta[^>]+name=["']viewport["']/.test(html),
  'Ohne viewport gibt es keine Handy-Ansicht.');
pruefe('prefers-reduced-motion beruecksichtigt',
  html.includes('prefers-reduced-motion'),
  'Bewegung muss abschaltbar sein.');
pruefe('sichtbarer Fokus', /:focus-visible/.test(html),
  'Tastaturbedienung braucht sichtbaren Fokus.');

// Jedes Eingabefeld braucht ein echtes Label — Placeholder-only ist keins.
const felder = [...html.matchAll(/<(input|select|textarea)\b[^>]*\bid=["']([^"']+)["'][^>]*>/gi)];
for (const [roh, , id] of felder) {
  if (/type=["'](hidden|submit|button)["']/i.test(roh)) continue;
  if (id === 'website') continue;                       // Honigtopf, absichtlich ohne Label
  pruefe(`Label fuer #${id}`, html.includes(`for="${id}"`),
    'Feld ohne <label for="…">.');
}

// ── Spam-Bremsen ───────────────────────────────────────────────────────────
pruefe('Honigtopf vorhanden', /id=["']website["']/.test(html),
  'Verstecktes Feld "website" fehlt — die Function wertet es aus.');
pruefe('Zeitsperre vorhanden', /GEOEFFNET|zeitsperre/i.test(html),
  'Submit erst ab 3 s nach Seitenaufruf.');

// ── Schriften wirklich vorhanden ───────────────────────────────────────────
const fontDir = 'mitmachen/fonts';
let dateien = [];
try { dateien = readdirSync(fontDir).filter(f => f.endsWith('.woff2')); } catch { /* leer */ }
pruefe('vier woff2-Dateien', dateien.length === 4,
  `gefunden: ${dateien.length} in ${fontDir}`);
for (const f of dateien) {
  const groesse = statSync(join(fontDir, f)).size;
  pruefe(`Schrift ${f} nicht leer`, groesse > 5000, `nur ${groesse} Byte`);
  pruefe(`Schrift ${f} verlinkt`, html.includes(f), 'liegt im Ordner, wird aber nicht geladen');
}

// ── Ergebnis ───────────────────────────────────────────────────────────────
if (fehler.length) {
  console.error(`\n✖ ${fehler.length} Pruefung(en) gefallen:\n`);
  for (const f of fehler) console.error('  • ' + f);
  console.error('');
  process.exit(1);
}
console.log('✔ Alle Pruefungen bestanden.');
```

- [ ] **Step 2: Skript laufen lassen — es MUSS fallen**

Run: `node scripts/pruefe-mitmachen.mjs`
Expected: Abbruch mit `Error: ENOENT: no such file or directory, open 'mitmachen/index.html'`

Das ist der gewünschte rote Zustand: die Seite gibt es noch nicht.

- [ ] **Step 3: Commit**

```bash
git add scripts/pruefe-mitmachen.mjs
git commit -m "Pruefskript fuer die Gates der Mitmachen-Seite"
```

---

### Task 2: Schriften self-hosten

**Files:**
- Create: `mitmachen/fonts/bricolage-grotesque-latin.woff2`
- Create: `mitmachen/fonts/bricolage-grotesque-latin-ext.woff2`
- Create: `mitmachen/fonts/instrument-sans-latin.woff2`
- Create: `mitmachen/fonts/instrument-sans-latin-ext.woff2`

- [ ] **Step 1: Verzeichnis anlegen und die vier Dateien holen**

Beide Familien stehen unter der SIL Open Font License; das Mitliefern im Repo ist zulässig. Es sind Variable Fonts, je eine Datei deckt den ganzen Gewichtsbereich ab.

```bash
mkdir -p mitmachen/fonts
B=https://fonts.gstatic.com/s/bricolagegrotesque/v9/3y9H6as8bTXq_nANBjzKo3IeZx8z6up5BeSl9D4dj_x9PpZBMnuECoAsyJBOm_OJ2iCw
I=https://fonts.gstatic.com/s/instrumentsans/v4/pxiTypc9vsFDm051Uf6KVwgkfoSxQ0GsQv8ToedPibnr0S

curl -sfo mitmachen/fonts/bricolage-grotesque-latin.woff2     "${B}A1XphjhQYg.woff2"
curl -sfo mitmachen/fonts/bricolage-grotesque-latin-ext.woff2 "${B}DVXphjhQYrcK.woff2"
curl -sfo mitmachen/fonts/instrument-sans-latin.woff2         "${I}Ze1ZuWi3g.woff2"
curl -sfo mitmachen/fonts/instrument-sans-latin-ext.woff2     "${I}he1ZuWi3hKpA.woff2"
```

- [ ] **Step 2: Größen prüfen**

Run: `ls -l mitmachen/fonts/`
Expected: vier Dateien, ungefähr 38.884 / 17.460 / 29.904 / 11.092 Byte. Jede Datei unter 5 KB bedeutet, dass eine Fehlerseite statt der Schrift heruntergeladen wurde — dann URL prüfen.

- [ ] **Step 3: Als woff2 verifizieren**

Run: `file mitmachen/fonts/*.woff2`
Expected: jede Zeile enthält `Web Open Font Format (Version 2)`

- [ ] **Step 4: Commit**

```bash
git add mitmachen/fonts
git commit -m "Schriften fuer die Mitmachen-Seite ins Repo (OFL, self-gehostet)"
```

---

### Task 3: Seitengerüst, Kopf, Hero

**Files:**
- Create: `mitmachen/index.html`

- [ ] **Step 1: Datei anlegen — Kopf, Farben, Schriften, Hero**

Das ist der Anfang der Datei. Die folgenden Tasks hängen Abschnitte an, bevor `</body>` geschlossen wird.

```html
<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ehrenamtliche Sitzwache werden – Leben Pflegen Reisen e.V.</title>
<meta name="description" content="Werde ehrenamtliche Sitzwache in Berliner Kliniken: schwerkranke Menschen begleiten, Schichten selbst wählen, Schulung und Versicherung inklusive. Ab einem Jahr Pflegeausbildung.">
<meta property="og:title" content="Ehrenamtliche Sitzwache werden">
<meta property="og:description" content="Da sein, wenn es zählt. Werde ehrenamtliche Sitzwache in Berliner Kliniken – dein Pflege-Know-how ohne Stationsstress.">
<meta property="og:type" content="website">
<meta property="og:locale" content="de_DE">
<meta property="og:url" content="https://mein.lebenpflegenreisen.de/mitmachen/">

<!-- Favicon: dieselben zwei Chevrons auf dunkelgruenem Quadrat, inline als
     data-URI. Eine eigene Datei waere ein zweiter Request fuer 400 Byte. -->
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Crect width='48' height='48' rx='6' fill='%231A3A2A'/%3E%3Cg fill='none' stroke='%23C8F135' stroke-width='4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='11,12 25,24 11,36'/%3E%3Cpolyline points='24,12 38,24 24,36' opacity='.42'/%3E%3C/g%3E%3C/svg%3E">

<!-- Die beiden latin-Schnitte werden sicher gebraucht und deshalb vorgeladen.
     latin-ext bleibt ungepreloadet: es greift nur bei Zeichen, die auf dieser
     Seite nicht vorkommen. -->
<link rel="preload" href="fonts/bricolage-grotesque-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="fonts/instrument-sans-latin.woff2" as="font" type="font/woff2" crossorigin>

<style>
/* ── Schriften ────────────────────────────────────────────────────────────
   Self-gehostet, nicht von fonts.googleapis.com. Der Rest des Repos laedt
   sie remote; diese Seite wird oeffentlich beworben und soll ohne
   Cookie-Banner und ohne Drittanbieter-Request auskommen. Beide unter OFL. */
@font-face {
  font-family: 'Bricolage Grotesque';
  font-style: normal; font-weight: 400 800; font-display: swap;
  src: url('fonts/bricolage-grotesque-latin.woff2') format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA,
                 U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122,
                 U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
@font-face {
  font-family: 'Bricolage Grotesque';
  font-style: normal; font-weight: 400 800; font-display: swap;
  src: url('fonts/bricolage-grotesque-latin-ext.woff2') format('woff2');
  unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7,
                 U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F,
                 U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F,
                 U+A720-A7FF;
}
@font-face {
  font-family: 'Instrument Sans';
  font-style: normal; font-weight: 400 700; font-display: swap;
  src: url('fonts/instrument-sans-latin.woff2') format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA,
                 U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122,
                 U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
@font-face {
  font-family: 'Instrument Sans';
  font-style: normal; font-weight: 400 700; font-display: swap;
  src: url('fonts/instrument-sans-latin-ext.woff2') format('woff2');
  unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7,
                 U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F,
                 U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F,
                 U+A720-A7FF;
}

/* ── Farben ───────────────────────────────────────────────────────────────
   CI-Gruen, nicht die Portal-Token aus shared.css (--green:#2D4A3A). Diese
   Seite ist Marketing und traegt kein Portal-Chrome.

   --mute ist die einzige bewusste Abweichung vom Briefing: das dort fuer
   Subtext auf hell vorgesehene #7AAA8A erreicht auf #F5F5F0 nur 2,4:1 und
   verfehlt damit die im selben Briefing geforderte AA-Schwelle. #7AAA8A
   steht deshalb nur auf dunklem Grund (4,7:1), --mute traegt hellen
   Subtext mit 5,3:1. */
:root {
  --gruen:#1A3A2A;
  --gruen-tief:#0D1C13;
  --lime:#C8F135;
  --offweiss:#F5F5F0;
  --sand:#E8E4DC;
  --mute:#4F6B5C;         /* Subtext auf hell  — 5,3:1 */
  --mute-dunkel:#7AAA8A;  /* Subtext auf gruen — 4,7:1 */
  --rand:#D8D4CC;
  --fehler:#A03216;
  --max:820px;
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html { scroll-behavior: smooth; }
body {
  background: var(--offweiss);
  color: var(--gruen-tief);
  font-family: 'Instrument Sans', system-ui, -apple-system, 'Segoe UI', sans-serif;
  font-size: 17px; line-height: 1.65;
  -webkit-font-smoothing: antialiased;
}

h1, h2, h3 {
  font-family: 'Bricolage Grotesque', 'Instrument Sans', system-ui, sans-serif;
  font-weight: 800; line-height: 1.12; letter-spacing: -.015em;
}

a { color: var(--gruen); }

/* Sichtbarer Fokus ueberall — Tastaturbedienung darf nicht raten muessen. */
:focus-visible {
  outline: 3px solid var(--lime);
  outline-offset: 3px;
  border-radius: 4px;
}
.hero :focus-visible { outline-color: var(--lime); }

.sr-only {
  position: absolute; width: 1px; height: 1px;
  margin: -1px; overflow: hidden; clip: rect(0,0,0,0); border: 0;
}

.wrap { max-width: var(--max); margin: 0 auto; padding: 0 20px; }

/* Sprungmarke fuer die Tastatur, sichtbar erst bei Fokus. */
.skip {
  position: absolute; left: 20px; top: -60px; z-index: 10;
  background: var(--lime); color: var(--gruen-tief);
  padding: 12px 18px; border-radius: 0 0 10px 10px;
  font-weight: 600; text-decoration: none;
  transition: top .15s;
}
.skip:focus { top: 0; }

/* ── Hero ─────────────────────────────────────────────────────────────── */
.hero {
  background: var(--gruen); color: #fff;
  padding: clamp(56px, 11vw, 104px) 0 clamp(48px, 9vw, 88px);
}
.hero-chevrons { width: 44px; height: 52px; margin-bottom: 26px; display: block; }
.hero h1 {
  font-size: clamp(38px, 8.5vw, 68px);
  margin: 0 0 20px; max-width: 12ch;
}
.hero p {
  font-size: clamp(18px, 2.4vw, 21px);
  line-height: 1.55; max-width: 44ch;
  color: rgba(255,255,255,.92);
  margin: 0 0 34px;
}
.knoepfe { display: flex; flex-wrap: wrap; gap: 14px; }
.knopf {
  display: inline-flex; align-items: center; justify-content: center;
  min-height: 52px; padding: 14px 30px;
  border-radius: 10px; border: 2px solid transparent;
  font-family: inherit; font-size: 17px; font-weight: 700;
  text-decoration: none; cursor: pointer;
  transition: background .15s, border-color .15s, color .15s;
}
.knopf-haupt { background: var(--lime); color: var(--gruen-tief); }
.knopf-haupt:hover { background: #d7f65e; }
.knopf-zweit { background: transparent; color: #fff; border-color: rgba(255,255,255,.42); }
.knopf-zweit:hover { border-color: var(--lime); color: var(--lime); }

/* ── Bewegung nur, wenn erwuenscht ────────────────────────────────────── */
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  *, *::before, *::after {
    animation-duration: .001ms !important;
    transition-duration: .001ms !important;
  }
}
</style>
</head>
<body>

<a class="skip" href="#inhalt">Zum Inhalt springen</a>

<header class="hero">
  <div class="wrap">
    <svg class="hero-chevrons" viewBox="0 0 48 56" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <g fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="5">
        <polyline points="6,8 24,28 6,48"  stroke="#C8F135"/>
        <polyline points="22,8 40,28 22,48" stroke="#C8F135" opacity="0.42"/>
      </g>
    </svg>
    <h1>Da sein, wenn es zählt.</h1>
    <p>Werde ehrenamtliche Sitzwache in Berliner Kliniken. Dein Pflege-Know-how – ohne Stationsstress.</p>
    <div class="knoepfe">
      <a class="knopf knopf-haupt" href="#bewerben">Jetzt bewerben</a>
      <a class="knopf knopf-zweit" href="#ablauf">So läuft&rsquo;s ab</a>
    </div>
  </div>
</header>

<main id="inhalt">
</main>

</body>
</html>
```

- [ ] **Step 2: Prüfskript laufen lassen — es fällt noch, aber anders**

Run: `node scripts/pruefe-mitmachen.mjs`
Expected: Exit-Code 1, gemeldet werden unter anderem `Gate 3 — Pflichtsatz woertlich`, `Honigtopf vorhanden`, `Zeitsperre vorhanden`. **Nicht** mehr gemeldet werden dürfen: `lang="de"`, `Titel gesetzt`, `Description vorhanden`, `viewport`, `prefers-reduced-motion`, `sichtbarer Fokus`, alle vier `Gate 4`-Zeilen und alle `Schrift …`-Zeilen.

Wenn eine `Schrift …`-Zeile fällt, wurde Task 2 nicht ausgeführt oder die Dateinamen weichen ab.

- [ ] **Step 3: Im Browser ansehen**

```bash
python3 -m http.server 8765 >/dev/null 2>&1 &
echo $! > /tmp/mitmachen-server.pid
open http://localhost:8765/mitmachen/
```

Expected: dunkelgrüner Hero, Chevrons in Limette, große Headline in Bricolage Grotesque. Wirkt die Schrift wie Arial, greifen die `@font-face`-Pfade nicht — dann Netzwerk-Tab prüfen.

- [ ] **Step 4: Commit**

```bash
git add mitmachen/index.html
git commit -m "Mitmachen-Seite: Geruest, Farben, self-gehostete Schriften, Hero"
```

---

### Task 4: Inhaltsabschnitte — Sitzwache, Voraussetzungen, Nutzen, Ablauf

**Files:**
- Modify: `mitmachen/index.html` (CSS in den `<style>`-Block ergänzen, Markup in `<main id="inhalt">` einsetzen)

Die Texte sind wörtlich aus dem Briefing zu übernehmen. Sie sind unten vollständig ausgeschrieben — nicht umformulieren, nicht „verbessern".

- [ ] **Step 1: CSS für die Inhaltsabschnitte ergänzen**

Direkt vor `@media (prefers-reduced-motion: reduce)` einfügen:

```css
/* ── Abschnitte ───────────────────────────────────────────────────────── */
section { padding: clamp(48px, 8vw, 80px) 0; }
section.sand { background: var(--sand); }

section h2 {
  font-size: clamp(27px, 4.4vw, 38px);
  color: var(--gruen); margin: 0 0 18px; max-width: 20ch;
}
section h3 { font-size: 19px; color: var(--gruen); margin: 0 0 6px; }
section p { margin: 0 0 16px; max-width: 62ch; }
section p.sub { color: var(--mute); }

/* Der Abgrenzungssatz. Kein Kasten unter vielen: er steht allein, gross,
   mit dem Limetten-Balken, weil genau dieses Missverstaendnis die Bewerbung
   kostet oder — schlimmer — spaeter am Krankenbett auffliegt. */
.pflichtsatz {
  border-left: 5px solid var(--lime);
  padding: 4px 0 4px 20px; margin: 26px 0 0;
  font-family: 'Bricolage Grotesque', sans-serif;
  font-weight: 800; font-size: clamp(20px, 3vw, 26px);
  line-height: 1.3; color: var(--gruen); max-width: 30ch;
}

/* Aufzaehlungen mit Chevron statt Punkt — greift die Wortmarke auf, ohne
   dass jeder Abschnitt zur Kachel wird. */
ul.chev { list-style: none; margin: 0 0 8px; }
ul.chev li {
  position: relative; padding-left: 30px; margin-bottom: 13px; max-width: 62ch;
}
ul.chev li::before {
  content: ''; position: absolute; left: 4px; top: .52em;
  width: 9px; height: 9px; margin-top: -5px;
  border-right: 2.5px solid var(--gruen); border-top: 2.5px solid var(--gruen);
  transform: rotate(45deg);
}

/* Zielgruppen: die einzige Stelle mit Karten. Vier kurze Ansprachen, die
   nebeneinander gelesen werden — hier traegt das Raster etwas bei. */
.zielgruppen {
  display: grid; gap: 16px; margin-top: 30px;
  grid-template-columns: repeat(auto-fit, minmax(248px, 1fr));
}
.zielgruppe {
  background: var(--offweiss);
  border: 1px solid var(--rand); border-left: 4px solid var(--lime);
  border-radius: 12px; padding: 20px 22px;
}
section.sand .zielgruppe { background: #fff; }
.zielgruppe p { font-size: 15.5px; line-height: 1.55; margin: 0; color: var(--mute); }

/* Ablauf: nummeriert, weil es wirklich eine Reihenfolge ist. */
ol.ablauf { list-style: none; counter-reset: schritt; margin-top: 28px; }
ol.ablauf li {
  counter-increment: schritt; position: relative;
  padding: 0 0 26px 58px; max-width: 58ch;
}
ol.ablauf li::before {
  content: counter(schritt);
  position: absolute; left: 0; top: -2px;
  width: 38px; height: 38px; border-radius: 50%;
  background: var(--gruen); color: var(--lime);
  font-family: 'Bricolage Grotesque', sans-serif; font-weight: 800; font-size: 17px;
  display: flex; align-items: center; justify-content: center;
}
/* Verbindungslinie zwischen den Schritten, letzter ohne. */
ol.ablauf li::after {
  content: ''; position: absolute; left: 18.5px; top: 42px; bottom: 8px;
  width: 2px; background: var(--rand);
}
ol.ablauf li:last-child { padding-bottom: 0; }
ol.ablauf li:last-child::after { display: none; }
ol.ablauf p { margin: 4px 0 0; font-size: 15.5px; color: var(--mute); }
```

- [ ] **Step 2: Markup in `<main id="inhalt">` einsetzen**

```html
<section>
  <div class="wrap">
    <h2>Was ist eine Sitzwache?</h2>
    <p>Sitzwachen begleiten schwerkranke und sterbende Menschen am Krankenbett: da sein, zuhören, Ruhe geben – und Angehörige wie Pflegekräfte entlasten.</p>
    <p class="pflichtsatz">Sitzwache ist Begleitung – keine pflegerischen oder medizinischen Tätigkeiten.</p>
  </div>
</section>

<section class="sand">
  <div class="wrap">
    <h2>Für wen?</h2>
    <ul class="chev">
      <li>Mindestens ein abgeschlossenes Jahr Pflegeausbildung – oder eine 1-jährige Pflegehilfe-Ausbildung – oder vergleichbare Pflegeerfahrung</li>
      <li>Mindestens 18 Jahre, empathisch und verlässlich</li>
      <li>Zeit für etwa eine Schicht pro Woche – du wählst deine Schichten selbst</li>
    </ul>

    <div class="zielgruppen">
      <div class="zielgruppe">
        <h3>In der Pflegeausbildung (ab 2. Jahr)</h3>
        <p>Sammle Erfahrung in der Begleitung schwerkranker Menschen – planbar neben der Ausbildung.</p>
      </div>
      <div class="zielgruppe">
        <h3>Ausbildung beendet, bevor sie fertig war?</h3>
        <p>Viele verlassen die Pflege wegen Zeitdruck, nicht wegen der Menschen. Als Sitzwache bekommst du zurück, was gefehlt hat: Zeit.</p>
      </div>
      <div class="zielgruppe">
        <h3>Pflegehilfe-Abschluss</h3>
        <p>Dein Jahr Ausbildung ist hier genau richtig.</p>
      </div>
      <div class="zielgruppe">
        <h3>Wiedereinstieg oder Ruhestand</h3>
        <p>Deine Erfahrung, dein Tempo, deine Zeiten.</p>
      </div>
    </div>
  </div>
</section>

<section>
  <div class="wrap">
    <h2>Was du bekommst</h2>
    <ul class="chev">
      <li>Eine Aufgabe, die trägt – und Menschen, denen deine Zeit alles bedeutet</li>
      <li>Selbst gewählte, planbare Schichten</li>
      <li>Kompaktschulung an einem Abend plus begleitete Hospitationsschichten</li>
      <li>Versicherungsschutz während deiner Einsätze über den Verein</li>
      <li>Eine steuerfreie Aufwandsentschädigung (Übungsleiterpauschale)</li>
      <li>Ehrenamtsbescheinigung – wertvoll für Bewerbungen und Ausbildung</li>
    </ul>
  </div>
</section>

<section class="sand" id="ablauf">
  <div class="wrap">
    <h2>So schnell geht&rsquo;s</h2>
    <ol class="ablauf">
      <li><h3>Bewerben</h3><p>2 Minuten, Formular unten</p></li>
      <li><h3>Rückmeldung</h3><p>von uns innerhalb von 48 Stunden</p></li>
      <li><h3>Erstgespräch</h3><p>20 Minuten, telefonisch</p></li>
      <li><h3>Unterlagen &amp; Kompaktschulung</h3><p>ein Abend; erweitertes Führungszeugnis (für Ehrenamtliche gebührenfrei, die Bescheinigung stellen wir) und Masernschutznachweis</p></li>
      <li><h3>Hospitation &amp; Ersteinsatz</h3><p>in der Regel bist du nach 3–4 Wochen im Einsatz</p></li>
    </ol>
  </div>
</section>
```

- [ ] **Step 3: Prüfskript laufen lassen**

Run: `node scripts/pruefe-mitmachen.mjs`
Expected: Exit-Code 1, aber `Gate 3 — Pflichtsatz woertlich` ist **weg**. Übrig bleiben nur noch `Honigtopf vorhanden` und `Zeitsperre vorhanden`.

Fällt Gate 3 weiterhin, steht im HTML ein Bindestrich statt des Halbgeviertstrichs `–` (U+2013).

- [ ] **Step 4: Im Browser prüfen**

Expected: Der Abgrenzungssatz steht groß mit Limetten-Balken. Die Ablauf-Liste zeigt fünf grüne Kreise mit Ziffern, verbunden durch eine Linie, beim letzten Schritt endet die Linie.

- [ ] **Step 5: Commit**

```bash
git add mitmachen/index.html
git commit -m "Mitmachen-Seite: Sitzwache, Voraussetzungen, Nutzen, Ablauf"
```

---

### Task 5: Formular — Markup, Labels, Honigtopf

**Files:**
- Modify: `mitmachen/index.html`

- [ ] **Step 1: CSS für das Formular ergänzen**

Vor den `prefers-reduced-motion`-Block einfügen:

```css
/* ── Formular ─────────────────────────────────────────────────────────── */
.form-karte {
  background: #fff; border: 1px solid var(--rand);
  border-radius: 16px; padding: clamp(22px, 4vw, 36px);
  margin-top: 26px;
}
.feld { margin-bottom: 20px; }
.feld label, .gruppe legend {
  display: block; font-weight: 600; font-size: 15.5px;
  color: var(--gruen); margin-bottom: 7px;
}
.feld .hinweis { font-size: 14px; color: var(--mute); margin: 0 0 7px; font-weight: 400; }

input[type=text], input[type=email], input[type=tel], input[type=date],
select, textarea {
  width: 100%; padding: 13px 14px;
  border: 1.5px solid var(--rand); border-radius: 10px;
  font-family: inherit; font-size: 16px;   /* 16px verhindert Zoom auf iOS */
  color: var(--gruen-tief); background: #fff;
}
input:focus, select:focus, textarea:focus { border-color: var(--gruen); }
textarea { min-height: 118px; resize: vertical; }

/* Feldfehler: neben dem Feld und im Klartext, nicht als Browser-Blase, die
   nach drei Sekunden verschwindet. */
.feld-fehler { display: block; color: var(--fehler); font-size: 14.5px; margin-top: 6px; }
[aria-invalid="true"] { border-color: var(--fehler); }

.gruppe { border: 0; margin-bottom: 20px; }
.kaesten { display: grid; gap: 9px; grid-template-columns: repeat(auto-fit, minmax(158px, 1fr)); }
.kasten {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 14px; border: 1.5px solid var(--rand); border-radius: 10px;
  cursor: pointer; font-size: 15.5px; min-height: 48px;
}
.kasten:has(input:checked) { border-color: var(--gruen); background: #F4F8F1; }
.kasten input { width: 20px; height: 20px; accent-color: var(--gruen); flex: none; }

.dsgvo { display: flex; align-items: flex-start; gap: 12px; margin: 22px 0 8px; }
.dsgvo input { width: 22px; height: 22px; margin-top: 2px; accent-color: var(--gruen); flex: none; }
.dsgvo label { font-weight: 400; font-size: 15.5px; color: var(--gruen-tief); }

/* Honigtopf. Nicht display:none — manche Bots ueberspringen genau das.
   Ausserdem aus der Tabreihenfolge und vom Screenreader ausgenommen. */
.honig {
  position: absolute; left: -9999px; width: 1px; height: 1px;
  overflow: hidden; opacity: 0;
}

.absenden { width: 100%; margin-top: 8px; }
.absenden[disabled] { opacity: .6; cursor: not-allowed; }

.form-fehler {
  background: #FBEDE9; border: 1.5px solid var(--fehler);
  border-radius: 10px; padding: 15px 17px; margin-bottom: 20px;
  color: #6E200E; font-size: 15.5px;
}
.form-fehler a { color: #6E200E; }

.geschafft { text-align: left; padding: 8px 0; }
.geschafft h2 { margin-bottom: 14px; }
```

Achtung: Der Schnipsel endet **ohne** `</style>`. Das Tag steht bereits in der Datei und bleibt dort, wo es ist — der neue CSS-Block wird davor eingesetzt, direkt vor `@media (prefers-reduced-motion: reduce)`.

- [ ] **Step 2: Formular-Abschnitt vor `</main>` einsetzen**

Die sechs `background`-Werte müssen exakt so heißen, sonst weist die Datenbank sie nach Task 7 ab.

```html
<section id="bewerben">
  <div class="wrap">
    <h2>Jetzt bewerben</h2>
    <p class="sub">Zwei Minuten. Du legst kein Konto an und verpflichtest dich zu nichts.</p>

    <div class="form-karte">
      <div id="fehlerkasten" class="form-fehler" hidden></div>

      <form id="bewerbung" novalidate>
        <div class="feld">
          <label for="name">Name <span aria-hidden="true">*</span><span class="sr-only">(Pflichtfeld)</span></label>
          <input type="text" id="name" name="name" autocomplete="name" required maxlength="120">
        </div>

        <div class="feld">
          <label for="email">E-Mail <span aria-hidden="true">*</span><span class="sr-only">(Pflichtfeld)</span></label>
          <input type="email" id="email" name="email" autocomplete="email" required maxlength="200">
        </div>

        <div class="feld">
          <label for="phone">Telefon</label>
          <p class="hinweis">Der nächste Schritt ist ein Anruf – mit Nummer geht es schneller.</p>
          <input type="tel" id="phone" name="phone" autocomplete="tel" maxlength="40">
        </div>

        <div class="feld">
          <label for="hintergrund">Dein Pflege-Hintergrund <span aria-hidden="true">*</span><span class="sr-only">(Pflichtfeld)</span></label>
          <select id="hintergrund" name="hintergrund" required>
            <option value="">Bitte auswählen</option>
            <option value="azubi_ab_j2">In der Pflegeausbildung, ab dem 2. Jahr</option>
            <option value="pflegehilfe_1j">1-jährige Pflegehilfe-Ausbildung abgeschlossen</option>
            <option value="ausbildung_beendet">Pflegeausbildung begonnen, aber nicht beendet</option>
            <option value="fachkraft">Examinierte Pflegefachkraft</option>
            <option value="wiedereinstieg">Wiedereinstieg oder Ruhestand</option>
            <option value="sonstiges">Etwas anderes</option>
          </select>
        </div>

        <div class="feld">
          <label for="hintergrund_detail">Erzähl kurz mehr dazu</label>
          <input type="text" id="hintergrund_detail" name="hintergrund_detail" maxlength="300">
        </div>

        <fieldset class="gruppe">
          <legend>Wann kannst du?</legend>
          <div class="kaesten">
            <label class="kasten"><input type="checkbox" name="verfuegbarkeit" value="vormittags"> vormittags</label>
            <label class="kasten"><input type="checkbox" name="verfuegbarkeit" value="nachmittags"> nachmittags</label>
            <label class="kasten"><input type="checkbox" name="verfuegbarkeit" value="abends"> abends</label>
            <label class="kasten"><input type="checkbox" name="verfuegbarkeit" value="nachts"> nachts</label>
            <label class="kasten"><input type="checkbox" name="verfuegbarkeit" value="Wochenende"> Wochenende</label>
          </div>
        </fieldset>

        <div class="feld">
          <label for="start_ab">Frühester Start</label>
          <input type="date" id="start_ab" name="start_ab">
        </div>

        <div class="feld">
          <label for="motivation">Warum möchtest du Sitzwache werden?</label>
          <textarea id="motivation" name="motivation" maxlength="1000"></textarea>
        </div>

        <!-- Honigtopf. Menschen sehen dieses Feld nicht; die Edge Function
             verwirft jede Einsendung, in der es gefuellt ist. -->
        <div class="honig" aria-hidden="true">
          <label for="website">Website (bitte frei lassen)</label>
          <input type="text" id="website" name="website" tabindex="-1" autocomplete="off">
        </div>

        <div class="dsgvo">
          <input type="checkbox" id="dsgvo" name="dsgvo" required>
          <label for="dsgvo">
            Ich habe die <a href="https://lebenpflegenreisen.de/datenschutz/" target="_blank" rel="noopener">Datenschutzerklärung</a>
            gelesen und bin einverstanden, dass meine Angaben zur Bearbeitung meiner Bewerbung gespeichert werden.
            <span aria-hidden="true">*</span><span class="sr-only">(Pflichtfeld)</span>
          </label>
        </div>
        <span class="feld-fehler" id="fehler-dsgvo" hidden></span>

        <button type="submit" class="knopf knopf-haupt absenden" id="absenden">Bewerbung absenden</button>
      </form>

      <div id="geschafft" class="geschafft" hidden>
        <h2>Danke! Deine Bewerbung ist da.</h2>
        <p>Wir melden uns innerhalb von 48 Stunden bei dir.</p>
        <p class="sub">Noch eine Frage vorab? Schreib an
          <a href="mailto:ehrenamt@lebenpflegenreisen.de">ehrenamt@lebenpflegenreisen.de</a>.</p>
      </div>
    </div>
  </div>
</section>
```

- [ ] **Step 3: Prüfskript laufen lassen**

Run: `node scripts/pruefe-mitmachen.mjs`
Expected: Exit-Code 1, nur noch `Zeitsperre vorhanden` wird gemeldet. `Honigtopf vorhanden` und alle `Label fuer #…`-Prüfungen sind bestanden.

- [ ] **Step 4: Sichtprüfung Tastatur**

Im Browser mit der Tabulatortaste durch das Formular gehen.
Expected: Jedes Feld bekommt einen limettefarbenen Fokusrahmen. Das Honigtopf-Feld wird **übersprungen** (`tabindex="-1"`).

- [ ] **Step 5: Commit**

```bash
git add mitmachen/index.html
git commit -m "Mitmachen-Seite: Bewerbungsformular mit Labels und Honigtopf"
```

---

### Task 6: Absenden — Zeitsperre, Validierung, Erfolg, Fehler

**Files:**
- Modify: `mitmachen/index.html`

- [ ] **Step 1: Skriptblock direkt vor `</body>` einsetzen**

```html
<script>
(function () {
  'use strict';

  // Publishable Key — oeffentlich by design, steht ebenso in app.js.
  var SUPABASE_URL = 'https://makvwfznbwpjdzmuegoq.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_xF5YO04FE3Xjtl-133cLKw_C9fVs3Y3';
  var ZIEL = SUPABASE_URL + '/functions/v1/ehrenamt-interesse';

  // Zeitsperre: wer in unter drei Sekunden ein achtfeldriges Formular
  // ausfuellt, ist kein Mensch. Zweite Bremse neben dem Honigtopf; die
  // dritte (Dubletten-Sperre) sitzt in der Edge Function.
  var GEOEFFNET = Date.now();
  var MINDESTZEIT_MS = 3000;

  var form      = document.getElementById('bewerbung');
  var knopf     = document.getElementById('absenden');
  var kasten    = document.getElementById('fehlerkasten');
  var geschafft = document.getElementById('geschafft');

  function zeigeFormFehler(html) {
    kasten.innerHTML = html;
    kasten.hidden = false;
    kasten.scrollIntoView({ block: 'center' });
  }

  function feldFehler(id, text) {
    var feld = document.getElementById(id);
    feld.setAttribute('aria-invalid', 'true');
    var span = document.getElementById('fehler-' + id);
    if (!span) {
      span = document.createElement('span');
      span.className = 'feld-fehler';
      span.id = 'fehler-' + id;
      feld.parentNode.appendChild(span);
    }
    span.textContent = text;
    span.hidden = false;
    feld.setAttribute('aria-describedby', 'fehler-' + id);
  }

  function fehlerZuruecksetzen() {
    kasten.hidden = true;
    var offene = form.querySelectorAll('.feld-fehler');
    for (var i = 0; i < offene.length; i++) offene[i].hidden = true;
    var markiert = form.querySelectorAll('[aria-invalid="true"]');
    for (var j = 0; j < markiert.length; j++) markiert[j].removeAttribute('aria-invalid');
  }

  // Der Kanal aus ?src=. Auf dieselbe Positivliste gefiltert wie in der
  // Edge Function, damit hier nichts ankommt, was dort ohnehin faellt.
  function kanal() {
    var roh = new URLSearchParams(window.location.search).get('src') || '';
    var sauber = roh.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);
    return sauber ? '/mitmachen/?src=' + sauber : '/mitmachen/';
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    fehlerZuruecksetzen();

    var d = new FormData(form);
    var name  = (d.get('name')  || '').trim();
    var email = (d.get('email') || '').trim();
    var hg    = d.get('hintergrund') || '';

    var erstesFeld = null;
    if (name.length < 2) { feldFehler('name', 'Bitte trag deinen Namen ein.'); erstesFeld = erstesFeld || 'name'; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      feldFehler('email', 'Diese E-Mail-Adresse sieht nicht vollständig aus.');
      erstesFeld = erstesFeld || 'email';
    }
    if (!hg) { feldFehler('hintergrund', 'Bitte wähl deinen Pflege-Hintergrund aus.'); erstesFeld = erstesFeld || 'hintergrund'; }
    if (!d.get('dsgvo')) {
      var sp = document.getElementById('fehler-dsgvo');
      sp.textContent = 'Ohne dein Einverständnis dürfen wir die Bewerbung nicht speichern.';
      sp.hidden = false;
      document.getElementById('dsgvo').setAttribute('aria-invalid', 'true');
      erstesFeld = erstesFeld || 'dsgvo';
    }
    if (erstesFeld) { document.getElementById(erstesFeld).focus(); return; }

    // Zeitsperre. Kein Fehler nach aussen: wer hier haengen bleibt, soll es
    // nicht merken und keinen zweiten Weg suchen — genau wie beim Honigtopf.
    if (Date.now() - GEOEFFNET < MINDESTZEIT_MS) {
      form.hidden = true;
      geschafft.hidden = false;
      return;
    }

    knopf.disabled = true;
    knopf.textContent = 'Wird gesendet …';

    var verfuegbar = d.getAll('verfuegbarkeit').join(', ');

    fetch(ZIEL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY },
      body: JSON.stringify({
        name:               name,
        email:              email,
        phone:              (d.get('phone') || '').trim(),
        interesse:          'sitzwache',
        hintergrund:        hg,
        hintergrund_detail: (d.get('hintergrund_detail') || '').trim(),
        verfuegbarkeit:     verfuegbar,
        start_ab:           d.get('start_ab') || '',
        nachricht:          (d.get('motivation') || '').trim(),
        datenschutz_ok:     true,
        website:            d.get('website') || '',
        quelle:             kanal()
      })
    })
    .then(function (r) {
      return r.json().catch(function () { return { ok: r.ok }; });
    })
    .then(function (a) {
      if (!a || a.ok === false) {
        throw new Error((a && a.fehler) || 'Die Bewerbung konnte nicht gespeichert werden.');
      }
      form.hidden = true;
      kasten.hidden = true;
      geschafft.hidden = false;
      geschafft.scrollIntoView({ block: 'center' });
      document.title = 'Bewerbung abgeschickt – Leben Pflegen Reisen e.V.';
    })
    .catch(function (err) {
      knopf.disabled = false;
      knopf.textContent = 'Bewerbung absenden';
      // Konkret sagen, was schiefging, und einen zweiten Weg anbieten. Eine
      // Bewerbung, die an einem Netzwerkfehler scheitert, kommt sonst nie
      // wieder — der Mailweg ist der Rettungsanker.
      var betreff = encodeURIComponent('Bewerbung Sitzwache');
      zeigeFormFehler(
        '<strong>Das hat nicht geklappt.</strong><br>' +
        String(err.message || err) +
        '<br><br>Versuch es gleich noch einmal – oder schick uns deine Bewerbung direkt an ' +
        '<a href="mailto:ehrenamt@lebenpflegenreisen.de?subject=' + betreff + '">' +
        'ehrenamt@lebenpflegenreisen.de</a>.'
      );
    });
  });
})();
</script>
```

- [ ] **Step 2: Prüfskript laufen lassen — jetzt grün**

Run: `node scripts/pruefe-mitmachen.mjs`
Expected: `✔ Alle Pruefungen bestanden.` und Exit-Code 0.

- [ ] **Step 3: Fehlerpfad im Browser prüfen**

Im Browser Formular unvollständig absenden (nur Name eintragen, Rest leer).
Expected: E-Mail-Feld bekommt roten Rahmen und den Text „Diese E-Mail-Adresse sieht nicht vollständig aus.", der Fokus springt dorthin. Kein Netzwerk-Request.

- [ ] **Step 4: Zeitsperre prüfen**

Seite neu laden, Formular in unter drei Sekunden vollständig ausfüllen und absenden (Werte vorher in die Zwischenablage legen).
Expected: Dankeschön-Zustand erscheint, aber **kein** Request im Netzwerk-Tab.

- [ ] **Step 5: Netzwerk-Tab auf Drittanbieter prüfen**

Seite mit leerem Cache neu laden, Netzwerk-Tab nach Domain sortieren.
Expected: ausschließlich `localhost`. Kein `fonts.googleapis.com`, kein `fonts.gstatic.com`, kein `cdn.jsdelivr.net`.

- [ ] **Step 6: Commit**

```bash
git add mitmachen/index.html
git commit -m "Mitmachen-Seite: Absenden mit Zeitsperre, Klartextfehlern und Mail-Rueckfallweg"
```

---

### Task 7: FAQ und Fußzeile

**Files:**
- Modify: `mitmachen/index.html`

- [ ] **Step 1: CSS ergänzen** (vor `prefers-reduced-motion`)

```css
/* ── FAQ ──────────────────────────────────────────────────────────────── */
details {
  border-bottom: 1px solid var(--rand);
  padding: 4px 0;
}
details summary {
  cursor: pointer; list-style: none;
  padding: 17px 34px 17px 0; position: relative;
  font-weight: 600; font-size: 17px; color: var(--gruen);
  min-height: 48px; display: flex; align-items: center;
}
details summary::-webkit-details-marker { display: none; }
details summary::after {
  content: ''; position: absolute; right: 8px; top: 50%;
  width: 10px; height: 10px; margin-top: -7px;
  border-right: 2.5px solid var(--gruen); border-bottom: 2.5px solid var(--gruen);
  transform: rotate(45deg); transition: transform .18s;
}
details[open] summary::after { transform: rotate(-135deg); margin-top: -3px; }
details p { padding: 0 0 18px; color: var(--mute); max-width: 62ch; }

/* ── Fusszeile ────────────────────────────────────────────────────────── */
footer.seite {
  background: var(--gruen); color: rgba(255,255,255,.86);
  padding: 44px 0; font-size: 15px;
}
footer.seite a { color: var(--mute-dunkel); }
footer.seite a:hover { color: var(--lime); }
footer.seite .zeile { margin-bottom: 8px; }
footer.seite nav { margin-top: 14px; display: flex; gap: 20px; flex-wrap: wrap; }
```

- [ ] **Step 2: FAQ vor `</main>` einsetzen**

```html
<section class="sand">
  <div class="wrap">
    <h2>Häufige Fragen</h2>

    <details>
      <summary>Brauche ich eine abgeschlossene Pflegeausbildung?</summary>
      <p>Nein. Ein Jahr Ausbildung oder vergleichbare Erfahrung reicht.</p>
    </details>
    <details>
      <summary>Übernehme ich pflegerische Aufgaben?</summary>
      <p>Nein – Sitzwache ist ausschließlich Begleitung, keine Pflege- oder medizinische Tätigkeit.</p>
    </details>
    <details>
      <summary>Wie viel Zeit muss ich mitbringen?</summary>
      <p>Ab etwa einer Schicht pro Woche; du wählst selbst, wann.</p>
    </details>
    <details>
      <summary>Bin ich versichert?</summary>
      <p>Ja, während deiner Einsätze bist du über den Verein versichert.</p>
    </details>
    <details>
      <summary>Kostet mich das etwas?</summary>
      <p>Nein. Schulung und Führungszeugnis sind für dich kostenfrei.</p>
    </details>
    <details>
      <summary>Wo finden die Einsätze statt?</summary>
      <p>In Berliner Partnerkliniken – Details besprechen wir im Erstgespräch.</p>
    </details>
    <details>
      <summary>Ich beziehe ALG I oder Bürgergeld – geht das?</summary>
      <p>Ehrenamt ist grundsätzlich damit vereinbar; die Details klären wir gemeinsam im Gespräch.</p>
    </details>
  </div>
</section>
```

- [ ] **Step 3: Fußzeile nach `</main>` einsetzen**

Beide Rechts-URLs wurden am 10.09.2026 per `curl` geprüft und liefern HTTP 200 ohne Weiterleitung.

```html
<footer class="seite">
  <div class="wrap">
    <div class="zeile"><strong>Leben Pflegen Reisen e.V.</strong></div>
    <div class="zeile">Stephanstraße 46, 10559 Berlin · VR 42682 B (AG Charlottenburg)</div>
    <div class="zeile"><a href="mailto:ehrenamt@lebenpflegenreisen.de">ehrenamt@lebenpflegenreisen.de</a></div>
    <nav aria-label="Rechtliches">
      <a href="https://lebenpflegenreisen.de/impressum/">Impressum</a>
      <a href="https://lebenpflegenreisen.de/datenschutz/">Datenschutz</a>
    </nav>
  </div>
</footer>
```

- [ ] **Step 4: Prüfskript und Sichtprüfung**

Run: `node scripts/pruefe-mitmachen.mjs`
Expected: `✔ Alle Pruefungen bestanden.`

Im Browser: FAQ-Einträge öffnen und schließen sich per Klick und per Leertaste, der Chevron dreht sich.

- [ ] **Step 5: Rechts-Links erneut verifizieren**

```bash
for u in https://lebenpflegenreisen.de/impressum/ https://lebenpflegenreisen.de/datenschutz/; do
  printf "%-52s " "$u"; curl -s -o /dev/null -w "%{http_code}\n" -L --max-time 15 "$u"
done
```

Expected: beide Zeilen enden mit `200`.

- [ ] **Step 6: Commit**

```bash
git add mitmachen/index.html
git commit -m "Mitmachen-Seite: FAQ als details-Akkordeon und Fusszeile"
```

---

### Task 8: Migration — drei Spalten, erweiterter Check

**Files:**
- Create: `sql/2026-09-10-ae-mitmachen.sql` (**gitignored, nicht committen**)

- [ ] **Step 1: Migrationsdatei schreiben**

```sql
-- Migration AE: Bewerbungsfelder der Landingpage /mitmachen/.
-- Ohne begin/rollback ausfuehren.
--
-- WAS HIER NICHT PASSIERT: eine neue Tabelle. Der Eingang ist
-- ehrenamt_interessenten (Migration M), geschrieben ausschliesslich von der
-- Edge Function ehrenamt-interesse. Eine zweite Tabelle mit anon-Schreibrecht
-- waere ein offenes Schreibrecht auf Klarnamen und Telefonnummern und ein
-- zweiter Posteingang, den jemand zusaetzlich im Blick behalten muesste.
--
-- VIER FELDER GAB ES SCHON. Migration R hat bezirk, hintergrund,
-- verfuegbarkeit und ref_code am 01.09.2026 angelegt, und
-- admin-ehrenamt-interesse.html rendert sie seitdem. Gefuellt hat sie nie
-- jemand: weder die Edge Function noch die Formulare auf der Website senden
-- diese Felder. Das aendert sich mit dem Function-Update, das zu dieser
-- Migration gehoert.

alter table public.ehrenamt_interessenten
  -- Freitext zur Qualifikation. Die Auswahlliste kann nicht jeden Lebenslauf
  -- abbilden, und wer "Etwas anderes" waehlt, soll es sagen duerfen.
  add column if not exists hintergrund_detail text
        check (length(hintergrund_detail) <= 300),

  -- Frueheste Verfuegbarkeit. Datum statt Freitext, weil die Vorstandsansicht
  -- danach sortieren koennen soll, sobald es mehr als eine Handvoll gibt.
  add column if not exists start_ab date,

  -- Einwilligung. Kein Default true: eine Zeile ohne ausdrueckliche
  -- Einwilligung soll als solche erkennbar bleiben, auch rueckwirkend fuer
  -- die Zeilen aus dem alten Website-Formular, die kein Haekchen kannten.
  add column if not exists datenschutz_ok boolean;

comment on column public.ehrenamt_interessenten.hintergrund_detail is
  'Freitext zur Qualifikation, ergaenzt hintergrund.';
comment on column public.ehrenamt_interessenten.datenschutz_ok is
  'Ausdrueckliche Einwilligung. NULL heisst: aus einem Formular ohne Haekchen (vor 10.09.2026).';

-- ── hintergrund: sechs feinere Werte dazu ──────────────────────────────────
--
-- Bisher: pflege/medizin/kein/unklar — die grobe Frage des allgemeinen
-- Website-Funnels ("hat die Person ueberhaupt Pflegebezug?"). Die Landingpage
-- fragt feiner, weil sie nur Menschen mit Pflege-Hintergrund sucht und die
-- Stufe darueber entscheidet, wie schnell jemand einsatzbereit ist.
--
-- BEIDE VOKABULARE IN EINER SPALTE, nicht zwei Spalten: die Frage ist
-- dieselbe ("welcher Pflege-Hintergrund"), nur die Aufloesung unterscheidet
-- sich. Zwei Spalten haetten die Vorstandsansicht gezwungen, beide zu
-- pruefen und bei jeder Zeile zu raten, welche gilt.
alter table public.ehrenamt_interessenten
  drop constraint if exists ehrenamt_interessenten_hintergrund_check;

alter table public.ehrenamt_interessenten
  add constraint ehrenamt_interessenten_hintergrund_check
  check (hintergrund in (
    -- Migration R, allgemeiner Website-Funnel
    'pflege', 'medizin', 'kein', 'unklar',
    -- Landingpage /mitmachen/
    'azubi_ab_j2', 'pflegehilfe_1j', 'ausbildung_beendet',
    'fachkraft', 'wiedereinstieg', 'sonstiges'
  ));

comment on column public.ehrenamt_interessenten.quelle is
  'Pfad der Seite, von der das Formular abgeschickt wurde. Query nur mit dem '
  'Kanal-Parameter src, auf [a-z0-9-] gefiltert — sonst nichts.';

-- KEINE Aenderung an RLS. Die einzige Policy bleibt der Vorstand; anon hat
-- weiterhin kein Schreibrecht, geschrieben wird ausschliesslich von der Edge
-- Function mit dem Service-Role-Key.
```

- [ ] **Step 2: Testabfrage schreiben**

Create `sql/2026-09-10-test-ae.sql` (ebenfalls gitignored):

```sql
-- Test AE. Nach der Migration ausfuehren. Jede Zeile muss 'BESTANDEN' zeigen.
-- Kein temp table als Protokoll — union all select, wie in diesem Repo ueblich.

select 'Fall 1: hintergrund_detail existiert' as fall,
       case when exists (
         select 1 from information_schema.columns
          where table_name = 'ehrenamt_interessenten' and column_name = 'hintergrund_detail'
       ) then 'BESTANDEN' else 'GEFALLEN' end as ergebnis
union all
select 'Fall 2: start_ab ist ein date',
       case when exists (
         select 1 from information_schema.columns
          where table_name = 'ehrenamt_interessenten'
            and column_name = 'start_ab' and data_type = 'date'
       ) then 'BESTANDEN' else 'GEFALLEN' end
union all
select 'Fall 3: datenschutz_ok existiert und ist nullable',
       case when exists (
         select 1 from information_schema.columns
          where table_name = 'ehrenamt_interessenten'
            and column_name = 'datenschutz_ok' and is_nullable = 'YES'
       ) then 'BESTANDEN' else 'GEFALLEN' end
union all
select 'Fall 4: verfuegbarkeit ist text, kein Array (unveraendert)',
       case when exists (
         select 1 from information_schema.columns
          where table_name = 'ehrenamt_interessenten'
            and column_name = 'verfuegbarkeit' and data_type = 'text'
       ) then 'BESTANDEN' else 'GEFALLEN' end
union all
select 'Fall 5: anon hat weiterhin kein Schreibrecht',
       case when not exists (
         select 1 from information_schema.role_table_grants
          where table_name = 'ehrenamt_interessenten'
            and grantee = 'anon' and privilege_type in ('INSERT','UPDATE','DELETE')
       ) then 'BESTANDEN' else 'GEFALLEN' end;

-- Fall 6: der erweiterte Check nimmt die neuen Werte an und weist Unsinn ab.
-- Absichtliche Ausnahme als Erfolgsmeldung — so ist bewiesen, dass der Block
-- wirklich bis zum Ende gelaufen ist.
do $$
declare
  v_id uuid;
begin
  insert into public.ehrenamt_interessenten (full_name, email, hintergrund)
  values ('TEST Migration AE', 'test-ae@example.invalid', 'pflegehilfe_1j')
  returning id into v_id;

  begin
    update public.ehrenamt_interessenten set hintergrund = 'quatschwert' where id = v_id;
    delete from public.ehrenamt_interessenten where id = v_id;
    raise exception 'TEST GEFALLEN: der Check liess einen unerlaubten Wert durch.';
  exception when check_violation then
    delete from public.ehrenamt_interessenten where id = v_id;
    raise exception 'TEST BESTANDEN: neue Werte erlaubt, unerlaubte abgewiesen.';
  end;
end;
$$;
```

- [ ] **Step 3: Prüfen, dass nichts davon committet wird**

Run: `git status --short sql/`
Expected: **keine Ausgabe.** `sql/` ist in `.gitignore`. Erscheint hier etwas, wurde die Ignore-Regel verletzt — dann nicht committen und nachsehen.

- [ ] **Step 4: Beide Dateien vollständig im Chat vorlegen**

Eric spielt Migrationen selbst im Supabase-Dashboard ein und will vorher lesen, was er ausführt. Den **vollständigen Inhalt beider Dateien in den Chat schreiben**, nicht den Pfad nennen und nicht `pbcopy` anbieten.

Dazu der Hinweis: erst `2026-09-10-ae-mitmachen.sql`, dann `2026-09-10-test-ae.sql`; der Test endet erwartungsgemäß mit `TEST BESTANDEN` als Fehlermeldung — das ist der Erfolgsfall, kein Problem.

---

### Task 9: Edge Function — neue Felder lesen, `?src=` behalten

**Files:**
- Modify: `functions/ehrenamt-interesse/index.ts` (**gitignored, nicht committen**)

- [ ] **Step 1: `pfad()` ersetzen**

Die bisherige Fassung wirft die Query weg, wodurch jeder `?src=`-Wert seit jeher still verfällt — obwohl `marketing/ehrenamt/PLAN.md` neun Kanäle darüber messen will.

Alt (ersetzen):

```typescript
/** Nur der Pfad, ohne Query — es soll nicht versehentlich ein Tracking-Parameter mitgespeichert werden. */
function pfad(roh: unknown): string | null {
  const s = String(roh ?? '').trim();
  if (!s) return null;
  try {
    const u = new URL(s, WEBSITE);
    return u.pathname.slice(0, 200);
  } catch {
    return s.startsWith('/') ? s.slice(0, 200) : null;
  }
}
```

Neu:

```typescript
/**
 * Pfad plus — als einziger Parameter — der Kanal aus `src`.
 *
 * WARUM NICHT MEHR NUR DER PFAD: PLAN.md verteilt neun ?src=-Werte ueber acht
 * Wochen und will danach entscheiden, welcher Kanal wiederholt wird. Bis
 * heute hat diese Funktion die Query abgeschnitten, und jeder dieser Werte
 * ist stillschweigend verfallen. ehrenamt_quellen() gruppiert nach quelle —
 * steht der Kanal darin, greift die Auswertung ohne weitere Aenderung.
 *
 * WARUM TROTZDEM EINE POSITIVLISTE: alles ausser `src` faellt weiterhin weg.
 * Ein utm_-Schwanz oder eine fremde ID hat in einer Tabelle mit Klarnamen
 * nichts verloren. Der Wert selbst wird auf [a-z0-9-] und 40 Zeichen
 * gestutzt, damit ueber diesen Weg nichts Beliebiges in die Spalte kommt.
 */
function pfad(roh: unknown): string | null {
  const s = String(roh ?? '').trim();
  if (!s) return null;

  let pfadteil: string;
  let src = '';
  try {
    const u = new URL(s, WEBSITE);
    pfadteil = u.pathname;
    src = (u.searchParams.get('src') ?? '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);
  } catch {
    if (!s.startsWith('/')) return null;
    pfadteil = s.split('?')[0];
    const treffer = /[?&]src=([^&]*)/i.exec(s);
    src = (treffer?.[1] ?? '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);
  }

  const ganz = src ? `${pfadteil}?src=${src}` : pfadteil;
  return ganz.slice(0, 200);
}
```

- [ ] **Step 2: Erlaubte Werte für `hintergrund` ergänzen**

Direkt unter `const INTERESSE_ERLAUBT = ...` einfügen:

```typescript
/**
 * Muss deckungsgleich mit dem Check in der Datenbank sein (Migration R für
 * die ersten vier, Migration AE für die sechs der Landingpage). Ein Wert, den
 * die Datenbank ablehnt, wuerde hier erst beim insert auffallen — und die
 * Bewerbung waere weg.
 */
const HINTERGRUND_ERLAUBT = new Set([
  'pflege', 'medizin', 'kein', 'unklar',
  'azubi_ab_j2', 'pflegehilfe_1j', 'ausbildung_beendet',
  'fachkraft', 'wiedereinstieg', 'sonstiges',
]);

const HINTERGRUND_TEXT: Record<string, string> = {
  pflege:             'Pflegebezug',
  medizin:            'Medizinbezug',
  kein:               'kein Pflege-/Medizinbezug',
  unklar:             'noch offen',
  azubi_ab_j2:        'In der Pflegeausbildung, ab dem 2. Jahr',
  pflegehilfe_1j:     '1-jährige Pflegehilfe-Ausbildung abgeschlossen',
  ausbildung_beendet: 'Pflegeausbildung begonnen, nicht beendet',
  fachkraft:          'Examinierte Pflegefachkraft',
  wiedereinstieg:     'Wiedereinstieg oder Ruhestand',
  sonstiges:          'Etwas anderes',
};
```

- [ ] **Step 3: Felder einlesen**

Im `Deno.serve`-Block direkt nach der Zeile `let interesse = ...` samt ihrer `if`-Zeile einfügen:

```typescript
  // Felder der Landingpage /mitmachen/. Die Formulare auf der Website senden
  // sie nicht — dann bleiben sie null, wie bisher.
  let hintergrund: string | null = String(roh.hintergrund ?? '').trim() || null;
  if (hintergrund && !HINTERGRUND_ERLAUBT.has(hintergrund)) hintergrund = null;

  const hintergrundDetail = String(roh.hintergrund_detail ?? '').trim().slice(0, 300) || null;
  const verfuegbarkeit    = String(roh.verfuegbarkeit ?? '').trim().slice(0, 300) || null;

  // Datum nur uebernehmen, wenn es wirklich eines ist: ein kaputter Wert
  // liesse den insert scheitern und die Bewerbung waere verloren.
  const startRoh = String(roh.start_ab ?? '').trim();
  const startAb  = /^\d{4}-\d{2}-\d{2}$/.test(startRoh) ? startRoh : null;

  // Ausdrueckliche Einwilligung. Die Landingpage schickt true; das aeltere
  // Website-Formular schickt gar nichts und bekommt null — das bleibt
  // unterscheidbar von einem aktiven Nein.
  const datenschutzOk = roh.datenschutz_ok === true ? true
                      : roh.datenschutz_ok === false ? false : null;
```

Und direkt nach der E-Mail-Prüfung, vor `const client = db();`:

```typescript
  // Wer das Haekchen ausdruecklich abwaehlt, wird nicht gespeichert. Fehlt das
  // Feld ganz (altes Website-Formular), bleibt es beim bisherigen Verhalten.
  if (datenschutzOk === false) {
    return new Response(
      JSON.stringify({ ok: false, fehler: 'Ohne dein Einverständnis dürfen wir die Bewerbung nicht speichern.' }),
      { status: 400, headers: JSON_KOPF },
    );
  }
```

- [ ] **Step 4: Insert erweitern**

Alt:

```typescript
    .insert({ full_name: name, email, phone, interesse, nachricht, quelle })
```

Neu:

```typescript
    .insert({
      full_name: name, email, phone, interesse, nachricht, quelle,
      hintergrund,
      hintergrund_detail: hintergrundDetail,
      verfuegbarkeit,
      start_ab: startAb,
      datenschutz_ok: datenschutzOk,
    })
```

- [ ] **Step 5: Vereins-Mail um die neuen Angaben ergänzen**

In `mailAnVerein` die Signatur und den Rumpf erweitern. Der Vorstand ruft nach dieser Mail an — Qualifikation und Verfügbarkeit sind genau das, was im Gespräch als Erstes gebraucht wird.

Signatur alt:

```typescript
function mailAnVerein(d: {
  name: string; email: string; phone: string | null;
  interesse: string; nachricht: string | null; quelle: string | null;
}) {
```

Signatur neu:

```typescript
function mailAnVerein(d: {
  name: string; email: string; phone: string | null;
  interesse: string; nachricht: string | null; quelle: string | null;
  hintergrund: string | null; hintergrundDetail: string | null;
  verfuegbarkeit: string | null; startAb: string | null;
}) {
```

Im HTML-Rumpf nach der Zeile `${zeile('Interesse', …)}` einfügen:

```typescript
    ${d.hintergrund ? zeile('Hintergrund', HINTERGRUND_TEXT[d.hintergrund] ?? d.hintergrund) : ''}
    ${d.hintergrundDetail ? zeile('Dazu', d.hintergrundDetail) : ''}
    ${d.verfuegbarkeit ? zeile('Kann', d.verfuegbarkeit) : ''}
    ${d.startAb ? zeile('Ab', d.startAb) : ''}
```

Im Text-Rumpf nach der `Interesse:`-Zeile einfügen:

```typescript
    d.hintergrund ? `Hintergrund: ${HINTERGRUND_TEXT[d.hintergrund] ?? d.hintergrund}` : null,
    d.hintergrundDetail ? `Dazu:      ${d.hintergrundDetail}` : null,
    d.verfuegbarkeit ? `Kann:      ${d.verfuegbarkeit}` : null,
    d.startAb ? `Ab:        ${d.startAb}` : null,
```

Und am Aufruf (`const anVerein = mailAnVerein({...})`) die vier Werte durchreichen:

```typescript
  const anVerein = mailAnVerein({
    name, email, phone, interesse, nachricht, quelle,
    hintergrund,
    hintergrundDetail,
    verfuegbarkeit,
    startAb,
  });
```

- [ ] **Step 5b: Syntax prüfen**

Run: `npx --yes deno@2 check functions/ehrenamt-interesse/index.ts`
Expected: `Check file:///…/index.ts` ohne Fehlerausgabe. Meldet Deno fehlende Typen für `jsr:@supabase/supabase-js@2`, ist das unkritisch; jede Meldung zu `HINTERGRUND_TEXT`, `startAb` oder `hintergrundDetail` ist es nicht.

- [ ] **Step 6: Prüfen, dass nichts committet wird**

Run: `git status --short functions/`
Expected: keine Ausgabe.

- [ ] **Step 7: Deploy Eric übergeben**

Der Deploy braucht ein Supabase-Zugriffstoken, das auf dieser Maschine nicht liegt. Eric bekommt den Befehl (Dashboard-Editor nicht verwenden, er schneidet lange Einfügungen ab):

```bash
export SUPABASE_ACCESS_TOKEN=<Token>
npx supabase functions deploy ehrenamt-interesse \
  --project-ref makvwfznbwpjdzmuegoq --no-verify-jwt
```

`--no-verify-jwt` ist zwingend: ohne das weist die Plattform den Aufruf von der Seite ab, bevor eine Zeile der Function läuft.

---

### Task 10: Vorstandsansicht zeigt die neuen Felder

**Files:**
- Modify: `admin-ehrenamt-interesse.html:110-131` (Textkarten) und die Kartenausgabe ab Zeile 196

- [ ] **Step 1: `HINTERGRUND_TEXT` um die sechs Werte ergänzen**

Alt (Zeilen 125–130):

```javascript
const HINTERGRUND_TEXT = {
  pflege:  'Pflegebezug',
  medizin: 'Medizinbezug',
  kein:    'kein Pflege-/Medizinbezug',
  unklar:  'noch offen'
};
```

Neu:

```javascript
// Die ersten vier kommen aus dem allgemeinen Website-Funnel (Migration R),
// die sechs darunter von der Landingpage /mitmachen/ (Migration AE). Eine
// Spalte, zwei Aufloesungen — deshalb stehen sie hier zusammen.
const HINTERGRUND_TEXT = {
  pflege:  'Pflegebezug',
  medizin: 'Medizinbezug',
  kein:    'kein Pflege-/Medizinbezug',
  unklar:  'noch offen',
  azubi_ab_j2:        'In der Pflegeausbildung, ab dem 2. Jahr',
  pflegehilfe_1j:     '1-jährige Pflegehilfe abgeschlossen',
  ausbildung_beendet: 'Pflegeausbildung begonnen, nicht beendet',
  fachkraft:          'Examinierte Pflegefachkraft',
  wiedereinstieg:     'Wiedereinstieg oder Ruhestand',
  sonstiges:          'Etwas anderes'
};
```

- [ ] **Step 2: Kartenzeilen um Detail, Startdatum und Einwilligung ergänzen**

Die vorhandene Zeile für `hintergrund` steht bereits da und bleibt. Alt:

```javascript
        ${z.verfuegbarkeit ? `<br>🕑 ${LPR.escape(z.verfuegbarkeit)}` : ''}
```

Neu:

```javascript
        ${z.hintergrund_detail ? `<br>📝 ${LPR.escape(z.hintergrund_detail)}` : ''}
        ${z.verfuegbarkeit ? `<br>🕑 ${LPR.escape(z.verfuegbarkeit)}` : ''}
        ${z.start_ab ? `<br>📅 frühester Start ${LPR.escape(
            new Date(z.start_ab).toLocaleDateString('de-DE')
          )}` : ''}
        ${z.datenschutz_ok === false
            ? '<br><span class="warnung">⚠ Keine Einwilligung erteilt</span>' : ''}
```

`datenschutz_ok === null` erzeugt bewusst keine Ausgabe: die Zeilen aus dem älteren Website-Formular kannten kein Häkchen, und eine Warnung an jeder alten Zeile wäre nur Rauschen.

- [ ] **Step 3: Kein Select anpassen**

Die Abfrage in Zeile 143–144 lautet `.select('*')` und liefert die neuen Spalten ohne Änderung mit. Nichts zu tun — nur nachsehen, dass dort wirklich `*` steht.

Run: `sed -n '141,146p' admin-ehrenamt-interesse.html`
Expected: enthält `.select('*')`

- [ ] **Step 4: Im Browser prüfen**

Portal öffnen, als Vorstand anmelden, „Ehrenamt-Interesse" aufrufen.
Expected: Die Seite lädt fehlerfrei, bestehende Meldungen sehen unverändert aus. Ohne neue Bewerbung ist nichts Zusätzliches zu sehen — das ist richtig; die Gegenprobe folgt in Task 11 mit dem Test-Datensatz.

- [ ] **Step 5: Commit**

```bash
git add admin-ehrenamt-interesse.html
git commit -m "Ehrenamt-Interesse: Qualifikation, Start und Einwilligung anzeigen"
```

---

### Task 11: Abnahme — Test-Insert, Responsivität, Lighthouse

**Voraussetzung:** Eric hat Migration AE eingespielt und die Function deployed. Vorher liefert dieser Task falsche Ergebnisse.

- [ ] **Step 1: Echten Test-Insert absetzen**

Auf `http://localhost:8765/mitmachen/?src=testlauf` das Formular ausfüllen:
Name `TEST – bitte löschen`, E-Mail `test-mitmachen@example.invalid`, Hintergrund `Examinierte Pflegefachkraft`, zwei Häkchen bei der Verfügbarkeit, Datenschutz-Haken. Vor dem Absenden mindestens drei Sekunden warten.

Expected: Der Dankeschön-Zustand ersetzt das Formular. Im Netzwerk-Tab steht **ein** Request an `makvwfznbwpjdzmuegoq.supabase.co` mit Status 200 und Antwort `{"ok":true,"id":"…"}`.

Der Name ist bewusst so gewählt: anon darf nicht löschen, die Zeile muss der Vorstand entfernen und soll dafür sofort erkennbar sein.

- [ ] **Step 2: Ankunft in der Vorstandsansicht prüfen**

Portal → „Ehrenamt-Interesse".
Expected: Die Karte `TEST – bitte löschen` zeigt die Mailadresse, `🎓 Examinierte Pflegefachkraft`, `🕑` mit den beiden gewählten Zeiten und `🔗 kam über /mitmachen/?src=testlauf`. Eine Telefonzeile fehlt, weil das Feld leer blieb — das ist richtig so.

Fehlt `?src=testlauf` und steht dort nur `/mitmachen/`, wurde die Function nicht neu deployed.

- [ ] **Step 3: Beide Mails prüfen**

Expected: In `ehrenamt@lebenpflegenreisen.de` liegt „Ehrenamt-Interesse: TEST – bitte löschen" mit Hintergrund, Verfügbarkeit und Startdatum in der Tabelle.

- [ ] **Step 4: Responsivität auf drei Breiten**

Browser-Gerätesimulation auf 360 px, 768 px und 1440 px.
Expected: Bei 360 px kein horizontales Scrollen, die Zielgruppen-Karten stehen einspaltig, die Ablauf-Ziffern verrutschen nicht, alle Knöpfe sind mindestens 48 px hoch.

Prüfen lässt sich das Überlaufen so — die Ausgabe muss `true` lauten:

```javascript
document.documentElement.scrollWidth <= document.documentElement.clientWidth
```

- [ ] **Step 5: Lighthouse messen**

```bash
npx --yes lighthouse http://localhost:8765/mitmachen/ \
  --only-categories=accessibility,best-practices,performance,seo \
  --preset=desktop --quiet --chrome-flags="--headless" \
  --output=json --output-path=/tmp/mitmachen-lh.json
node -e "const r=require('/tmp/mitmachen-lh.json').categories;for(const k in r)console.log(k, Math.round(r[k].score*100))"
```

Expected: `accessibility` ≥ 95, `best-practices` ≥ 95, `performance` ≥ 90.

Bleibt Accessibility darunter, nennt der Bericht den Grund — meist ein Kontrast oder ein fehlendes Label. Nicht die Schwelle senken, sondern die Ursache beheben.

**Diese Messung läuft lokal.** Auf GitHub Pages können die Zahlen abweichen; das Ergebnis wird als lokale Messung ausgewiesen, nicht als Abnahme.

- [ ] **Step 6: Prüfskript zum letzten Mal**

Run: `node scripts/pruefe-mitmachen.mjs`
Expected: `✔ Alle Pruefungen bestanden.`

- [ ] **Step 7: Testserver beenden**

```bash
kill "$(cat /tmp/mitmachen-server.pid)" && rm /tmp/mitmachen-server.pid
```

- [ ] **Step 8: Sauberkeit des Baums prüfen**

Run: `git status --short`
Expected: leer. Erscheinen `sql/` oder `functions/`, stimmt etwas mit `.gitignore` nicht.

- [ ] **Step 9: Push**

```bash
git push origin main
```

Danach `https://mein.lebenpflegenreisen.de/mitmachen/` aufrufen und Step 4 dort wiederholen. GitHub Pages braucht meist ein bis zwei Minuten.

- [ ] **Step 10: Test-Datensatz zum Löschen melden**

Im Abschluss-Summary ausdrücklich festhalten: Die Zeile `TEST – bitte löschen` steht in `ehrenamt_interessenten` und muss vom Vorstand über den Löschen-Knopf in „Ehrenamt-Interesse" entfernt werden.

---

## Abschluss-Summary

Am Ende zusammenfassen:

1. **Gebaut:** `/mitmachen/`, Prüfskript, vier Schriftdateien, erweiterte Vorstandsansicht — mit Commit-Hashes und ob gepusht.
2. **Von Eric auszuführen:** Migration AE (ja/nein), Function-Deploy (ja/nein).
3. **Test-Datensatz:** `TEST – bitte löschen` steht noch drin.
4. **Ausstehende Freigaben:** Beträge zur Aufwandsentschädigung (Finanzvorstand), Kampagnenstart.
5. **Lighthouse:** die vier Zahlen, ausdrücklich als lokale Messung.
6. **Bekannte Lücken außerhalb des Auftrags:** `bezirk` und `ref_code` bleiben leer, obwohl `PLAN.md` Empfehlungen über `?ref=` vorsieht; die Website-Formulare in `lpr-geo` senden weiterhin keinen `?src=`-Wert und müssten dafür angefasst werden.
7. **Abweichungen vom Briefing:** `#7AAA8A` nur auf dunklem Grund (AA), keine neue Tabelle und keine anon-Policy, `verfuegbarkeit` als Text statt Array, Motivation in `nachricht`, Vorstandsansicht angefasst (von Eric freigegeben).
