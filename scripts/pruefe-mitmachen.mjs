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

// ── Gate 1: nur freigegebene Euro-Betraege ─────────────────────────────────
// Am 09.10.2026 von Eric freigegeben: 100 € je Dienst, 150 € mit
// abgeschlossener dreijaehriger Pflegeausbildung, dazu die gesetzliche
// Uebungsleiterpauschale von 3.300 €. Jede andere Zahl faellt durch — auch
// in Meta-Tags oder Kommentaren, deshalb wird die ganze Datei geprueft.
const FREIGEGEBEN = ['100 €', '150 €', '3.300 €'];
const betrag = (html.match(/\d[\d.,]*\s*(€|EUR\b|Euro\b)|(€|EUR\b)\s*\d/gi) || [])
  .filter(b => !FREIGEGEBEN.includes(b.replace(/\s+/g, ' ')));
pruefe('Gate 1 — nur freigegebene Euro-Betraege', betrag.length === 0,
  `nicht freigegeben: ${betrag.join(', ')}`);

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
// Geprueft wird der LADEPFAD, nicht das blosse Vorkommen: href="…",
// src="…", url(…) und @import. Sonst schlaegt die Pruefung auf einen
// Kommentar an, der erklaert, warum die Schriften NICHT von dort kommen —
// beim ersten Lauf am 10.09.2026 genau so passiert.
const laedtVon = (domain) =>
  new RegExp(`(?:href|src)\\s*=\\s*["'][^"']*${domain}|url\\(\\s*["']?[^"')]*${domain}|@import[^;]*${domain}`, 'i')
    .test(html);

pruefe('Gate 4 — kein Google-Fonts-Link', !laedtVon('fonts\\.googleapis\\.com'),
  'Schriften liegen self-gehostet unter mitmachen/fonts/.');
pruefe('Gate 4 — kein gstatic', !laedtVon('fonts\\.gstatic\\.com'),
  'Schriften liegen self-gehostet unter mitmachen/fonts/.');
pruefe('Gate 4 — kein CDN-Skript', !/<script[^>]+src=["']https?:/i.test(html),
  'Kein supabase-js, kein jsdelivr. Ein fetch genuegt.');
pruefe('Gate 4 — kein externes Stylesheet',
  !/<link[^>]+rel=["']stylesheet["'][^>]+href=["']https?:/i.test(html),
  'CSS steht im <head> der Seite.');
pruefe('Gate 4 — keine externen Bilder', !/<img[^>]+src=["']https?:/i.test(html),
  'Bilder als inline-SVG oder data:-URI.');

// ── Gate 5: Google-Tag nur nach Einwilligung ───────────────────────────────
// Einzige Ausnahme von Gate 4 (seit 20.10.2026). Der Tag darf nur an EINER
// Stelle stehen — in ladeGoogleTag() —, und die darf nur aufgerufen werden,
// wenn die Wahl "ja" lautet. Kein <script src> im Markup, sonst laedt der
// Browser ihn vor jeder Einwilligung.
const gtmStellen = html.match(/googletagmanager\.com/g) || [];
pruefe('Gate 5 — Google-Tag an genau einer Stelle', gtmStellen.length === 1,
  `gefunden: ${gtmStellen.length}. Nur ladeGoogleTag() darf googletagmanager.com nennen.`);
pruefe('Gate 5 — Google-Tag nicht im Markup', !/<script[^>]+googletagmanager/i.test(html),
  'Ein statisches <script src> laedt vor der Einwilligung.');
const tagFn = html.match(/function ladeGoogleTag\(\)\s*\{[\s\S]*?\n {2}\}/);
pruefe('Gate 5 — Tag steckt in ladeGoogleTag()',
  !!tagFn && tagFn[0].includes('googletagmanager.com'),
  'googletagmanager.com muss innerhalb von ladeGoogleTag() stehen.');
const aufrufe = [...html.matchAll(/^.*\bladeGoogleTag\(\).*$/gm)].map(m => m[0])
  .filter(z => !/function ladeGoogleTag/.test(z));
pruefe('Gate 5 — Tag nur nach "ja"',
  aufrufe.length === 1 && /wahl === 'ja'/.test(aufrufe[0]),
  `Aufrufe: ${JSON.stringify(aufrufe)}. Erlaubt ist nur: if (wahl === 'ja') ladeGoogleTag();`);
pruefe('Gate 5 — keine Personalisierung', /ad_personalization:\s*'denied'/.test(html),
  'Der Tag misst nur; ad_personalization bleibt denied.');

// ── Gate 6: Einwilligungsleiste ────────────────────────────────────────────
// Ablehnen muss so leicht sein wie Zustimmen: gleiche Klasse, gleiche Ebene.
const wahlKnoepfe = [...html.matchAll(/<button[^>]*data-wahl=["'](ja|nein)["'][^>]*>/g)];
pruefe('Gate 6 — Ablehnen und Zustimmen vorhanden',
  wahlKnoepfe.map(m => m[1]).sort().join() === 'ja,nein',
  'Genau zwei Knoepfe mit data-wahl="ja" und data-wahl="nein".');
pruefe('Gate 6 — beide Knoepfe gleich gestaltet',
  wahlKnoepfe.length === 2 &&
  wahlKnoepfe[0][0].match(/class=["']([^"']+)/)?.[1] === wahlKnoepfe[1][0].match(/class=["']([^"']+)/)?.[1],
  'Ablehnen darf nicht unscheinbarer sein als Zustimmen.');
pruefe('Gate 6 — Leiste startet verborgen', /id=["']einwilligung["'][^>]*\bhidden\b/.test(html),
  'Ohne JavaScript gibt es keinen Tag, also auch keine Leiste.');
pruefe('Gate 6 — Wahl jederzeit aenderbar', html.includes('id="einwilligung-aendern"'),
  'Knopf "Cookie-Einstellungen" in der Fusszeile fehlt.');
pruefe('Gate 6 — Hinweis auf Datenschutzerklaerung',
  /id=["']einwilligung["'][\s\S]*?lebenpflegenreisen\.de\/datenschutz\//.test(html),
  'Die Leiste muss auf die Datenschutzerklaerung verweisen.');

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
