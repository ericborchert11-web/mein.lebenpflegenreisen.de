#!/usr/bin/env node
/**
 * Prueft die Wochenrechnung der Sammelrechnung.
 *
 * Sana rechnet Montag bis Sonntag ab. Eine um einen Tag verrutschte Woche
 * rechnet einen Dienst doppelt oder gar nicht ab — deshalb die Kanten:
 * Montag, Sonntag, Jahreswechsel.
 *
 * Aufruf:  node scripts/pruefe-sammelrechnung.mjs
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const SR = require(join(dirname(fileURLToPath(import.meta.url)), '..', 'sammelrechnung.js'));

const fehler = [];
const pruefe = (name, bedingung, hinweis) => { if (!bedingung) fehler.push(`${name}\n    ${hinweis}`); };
const j = x => JSON.stringify(x);

// 1 — Vorwoche
let w = SR.vorwoche('2026-10-08');            // Donnerstag
pruefe('Vorwoche ab Donnerstag', w.von === '2026-09-28' && w.bis === '2026-10-04' && w.kw === 40, j(w));
w = SR.vorwoche('2026-10-12');                // Montag
pruefe('Vorwoche ab Montag', w.von === '2026-10-05' && w.bis === '2026-10-11' && w.kw === 41, j(w));
w = SR.vorwoche('2026-10-11');                // Sonntag
pruefe('Vorwoche ab Sonntag', w.von === '2026-09-28' && w.bis === '2026-10-04', j(w));

// 2 — Woche eines Datums
w = SR.wocheVon('2026-10-05');
pruefe('Woche ab Montag', w.von === '2026-10-05' && w.bis === '2026-10-11' && w.kw === 41, j(w));
w = SR.wocheVon('2026-10-11');
pruefe('Sonntag gehoert zur selben Woche', w.von === '2026-10-05', j(w));

// 3 — Jahreswechsel: 31.12.2026 ist ein Donnerstag, KW 53
w = SR.wocheVon('2026-12-31');
pruefe('KW 53 ueber den Jahreswechsel', w.von === '2026-12-28' && w.bis === '2027-01-03' && w.kw === 53, j(w));
w = SR.wocheVon('2027-01-04');
pruefe('KW 1 2027', w.von === '2027-01-04' && w.kw === 1, j(w));

// 4 — Verschieben
w = SR.verschiebe({ von: '2026-12-28', bis: '2027-01-03' }, 7);
pruefe('Woche vor', w.von === '2027-01-04' && w.bis === '2027-01-10' && w.kw === 1, j(w));
w = SR.verschiebe({ von: '2026-10-05', bis: '2026-10-11' }, -7);
pruefe('Woche zurueck', w.von === '2026-09-28' && w.bis === '2026-10-04', j(w));

// 5 — Zusammenfassung zaehlt nur, was noch nicht abgerechnet ist
const z = SR.zusammenfassung([
  { stufe: 'T1', preis_cents: 20000, abgerechnet_auf: null },
  { stufe: 'T2', preis_cents: 20000, abgerechnet_auf: null },
  { stufe: 'T2', preis_cents: 20000, abgerechnet_auf: null },
  { stufe: 'T1', preis_cents: 20000, abgerechnet_auf: 'RE-2026-0020' }
]);
pruefe('Zusammenfassung', z.anzahl === 3 && z.t1 === 1 && z.t2 === 2 && z.summe_cents === 60000, j(z));
pruefe('leere Zusammenfassung', SR.zusammenfassung([]).anzahl === 0, '');

if (fehler.length) { console.error('FEHLER:\n- ' + fehler.join('\n- ')); process.exit(1); }
console.log('Sammelrechnung: alle Pruefungen bestanden.');
