#!/usr/bin/env node
/**
 * Prueft die Regel "welche Pflichtunterlagen fehlen" an erfundenen Daten.
 * Kernfall: Eine gueltige BZR-Abfrage ersetzt das Fuehrungszeugnis.
 *
 * Aufruf:  node scripts/pruefe-unterlagen-regel.mjs
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const UR = require(join(dirname(fileURLToPath(import.meta.url)), '..', 'unterlagen-regel.js'));

const fehler = [];
const pruefe = (name, bedingung, hinweis) => { if (!bedingung) fehler.push(`${name}\n    ${hinweis}`); };

const heute = new Date('2026-10-07T12:00:00');
const ok = (t, bis) => ({ document_type: t, status: 'approved', valid_until: bis || null });
const rest = [ok('ifsg43'), ok('erste_hilfe'), ok('dsgvo'), ok('schweigepflicht')];

let f = UR.fehlendeUnterlagen([...rest, ok('fuehrungszeugnis', '2028-01-01')], heute);
pruefe('FZ allein', f.length === 0, `erwartet [], bekam ${JSON.stringify(f)}`);

f = UR.fehlendeUnterlagen([...rest, ok('bzr', '2028-01-01')], heute);
pruefe('BZR statt FZ', f.length === 0, `erwartet [], bekam ${JSON.stringify(f)}`);

f = UR.fehlendeUnterlagen([...rest, ok('bzr', '2026-10-06')], heute);
pruefe('BZR abgelaufen', f.join() === 'fuehrungszeugnis', `erwartet [fuehrungszeugnis], bekam ${JSON.stringify(f)}`);

f = UR.fehlendeUnterlagen([...rest, ok('bzr', '2026-10-07')], heute);
pruefe('BZR laeuft heute ab = noch gueltig', f.length === 0, `bekam ${JSON.stringify(f)}`);

f = UR.fehlendeUnterlagen([...rest, { document_type: 'bzr', status: 'submitted', valid_until: null }], heute);
pruefe('BZR nur eingereicht', f.join() === 'fuehrungszeugnis', `bekam ${JSON.stringify(f)}`);

f = UR.fehlendeUnterlagen([], heute);
pruefe('nichts da', f.length === 5, `erwartet 5 fehlend, bekam ${JSON.stringify(f)}`);

pruefe('fzErsetzt bei gueltiger BZR', UR.fzErsetzt([ok('bzr', '2028-01-01')], heute) === true, 'erwartet true');
pruefe('fzErsetzt ohne BZR', UR.fzErsetzt([ok('fuehrungszeugnis')], heute) === false, 'erwartet false');

if (fehler.length) { console.error(`✗ ${fehler.length} Fehler:\n  ` + fehler.join('\n  ')); process.exit(1); }
console.log('✓ Unterlagen-Regel: alle Faelle bestanden');
