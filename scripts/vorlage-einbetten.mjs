/**
 * Bettet beleg-vorlage.js in functions/claim-mails/index.ts ein.
 *
 * WARUM: Die Supabase-Laufzeit laedt keine Module nach (Laufzeit-Import:
 * "Module not found"), und der Bundler beim Deploy darf nicht auf
 * mein.lebenpflegenreisen.de zugreifen ("Cannot import from ...:443").
 * Beide Wege sind am 20.08.2026 belegt gescheitert. Also muss die Vorlage
 * mit in die Datei — aber NICHT von Hand kopiert: Quelle bleibt
 * beleg-vorlage.js, dieses Skript erzeugt die Kopie.
 *
 * Nach jeder Aenderung an beleg-vorlage.js ausfuehren und die Function neu
 * deployen:  node scripts/vorlage-einbetten.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// fileURLToPath statt .pathname: der Pfad laeuft ueber einen Dropbox-Ordner
// mit Leerzeichen, und die bleiben in einer URL als %20 stehen.
const WURZEL = fileURLToPath(new URL('..', import.meta.url));
const VORLAGE = WURZEL + 'beleg-vorlage.js';
const ZIEL = WURZEL + 'functions/claim-mails/index.ts';

const START = '// ==== BELEG-VORLAGE: erzeugt aus beleg-vorlage.js, nicht von Hand aendern ====';
const ENDE = '// ==== ENDE BELEG-VORLAGE ====';

const vorlage = readFileSync(VORLAGE, 'utf8').trimEnd();
const ziel = readFileSync(ZIEL, 'utf8');

const i = ziel.indexOf(START);
const j = ziel.indexOf(ENDE);
if (i < 0 || j < 0) {
  console.error('Markierungen fehlen in ' + ZIEL + ' — bitte START/ENDE einsetzen.');
  process.exit(1);
}

const neu = ziel.slice(0, i) + START + '\n// @ts-nocheck\n' + vorlage + '\n' + ziel.slice(j);
writeFileSync(ZIEL, neu);

const zeilen = vorlage.split('\n').length;
console.log(`Vorlage eingebettet: ${zeilen} Zeilen aus beleg-vorlage.js`);
console.log('Nicht vergessen: Function im Dashboard neu deployen.');
