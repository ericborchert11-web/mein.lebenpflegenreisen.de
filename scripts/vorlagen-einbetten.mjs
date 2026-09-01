/**
 * Baut functions/notify/templates.ts aus den HTML-Dateien daneben.
 *
 * WARUM EIN GENERATOR UND KEIN DATEIZUGRIFF ZUR LAUFZEIT
 * -----------------------------------------------------
 * Dieselbe Falle wie bei der Beleg-Vorlage (scripts/vorlage-einbetten.mjs):
 * ein Laufzeit-Import scheitert an der Supabase-Laufzeit, ein fester Import am
 * Bundler beim Deploy. Deshalb wandern die Vorlagen als Zeichenketten in eine
 * .ts-Datei.
 *
 * Die HTML-Dateien bleiben trotzdem die Quelle: Eric soll Texte aendern
 * koennen, ohne TypeScript zu lesen.
 *
 *     node scripts/vorlagen-einbetten.mjs
 *
 * Nach jeder Aenderung an einer Vorlage ausfuehren UND neu deployen — sonst
 * verschickt die Funktion die alte Fassung.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const hier = dirname(fileURLToPath(import.meta.url));
const ordner = join(hier, '..', 'functions', 'notify', 'templates');

const rahmen = readFileSync(join(ordner, '_rahmen.html'), 'utf8');

// GENAU EIN VORKOMMEN. Beim ersten Bau stand der Platzhalter zusaetzlich im
// Kommentarkopf der Datei — replace() traf den Kommentar, der Rumpf landete
// unsichtbar darin und die Mails waren leer. Zwei Vorkommen sind deshalb ein
// Abbruch und keine Warnung.
const treffer = (rahmen.match(/\{\{inhalt\}\}/g) || []).length;
if (treffer !== 1) {
  console.error(`FEHLER: _rahmen.html enthaelt den Platzhalter ${treffer}-mal, erwartet ist genau einmal.`);
  process.exit(1);
}

const dateien = readdirSync(ordner)
  .filter((f) => f.endsWith('.html') && !f.startsWith('_'))
  .sort();

if (!dateien.length) {
  console.error('FEHLER: keine Vorlagen gefunden.');
  process.exit(1);
}

const eintraege = dateien.map((f) => {
  const name = f.replace(/\.html$/, '');
  const rumpf = readFileSync(join(ordner, f), 'utf8').trim();
  // Der Rumpf wird in den Rahmen gesetzt; alle uebrigen {{platzhalter}}
  // bleiben stehen und fuellt die Function zur Laufzeit.
  const ganz = rahmen.replace('{{inhalt}}', rumpf);
  // Backticks und ${ muessen escaped werden, sonst entsteht in der .ts-Datei
  // ein Template-Literal mit Ausdruecken darin.
  const sicher = ganz.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
  return `  '${name}': \`${sicher}\`,`;
}).join('\n');

const kopf = `/**
 * ERZEUGT — NICHT VON HAND AENDERN.
 *
 * Quelle sind die HTML-Dateien in functions/notify/templates/.
 * Neu bauen mit:  node scripts/vorlagen-einbetten.mjs
 */

export const VORLAGEN: Record<string, string> = {
${eintraege}
};
`;

writeFileSync(join(ordner, '..', 'templates.ts'), kopf, 'utf8');
console.log(`templates.ts gebaut — ${dateien.length} Vorlagen:`);
dateien.forEach((f) => console.log('  ' + f.replace(/\.html$/, '')));
