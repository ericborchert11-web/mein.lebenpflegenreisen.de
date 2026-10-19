#!/usr/bin/env node
/**
 * Prueft Dateinamen und Unterordner der Drive-Ablage.
 *
 * Kanten: Woche ueber die Monatsgrenze (der Ordner richtet sich nach dem
 * Montag der Woche), Jahreswechsel, fehlender Leistungszeitraum, Zeichen, die
 * Drive oder ein spaeterer Download nicht moegen.
 *
 * Aufruf:  node scripts/pruefe-drive-ablage.mjs
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const DA = require(join(dirname(fileURLToPath(import.meta.url)), '..', 'drive-ablage.js'));

const fehler = [];
const pruefe = (name, bedingung, hinweis) => { if (!bedingung) fehler.push(`${name}\n    ${hinweis}`); };
const j = x => JSON.stringify(x);

// 1 — Dateinamen
let n = DA.dateiname({ art: 'rechnung', invoice_no: 'RE-2026-0024', empfaenger: 'Sana Kliniken Berlin-Brandenburg GmbH', pfad: 'x/rechnung-RE-2026-0024-1.pdf' });
pruefe('Rechnung', n === 'RE-2026-0024 Sana Kliniken Berlin-Brandenburg GmbH.pdf', n);
n = DA.dateiname({ art: 'rechnung', invoice_no: 'RE-2026-0030', empfaenger: 'Hella Sobotka / Jürgen Koitzsch', pfad: 'x/a.pdf' });
pruefe('Schraegstrich wird ersetzt', n === 'RE-2026-0030 Hella Sobotka - Jürgen Koitzsch.pdf', n);
n = DA.dateiname({ art: 'rechnung', invoice_no: 'RE-2026-0031', empfaenger: 'A:B*C?"D<E>F|G\\H', pfad: 'x/a.pdf' });
pruefe('Verbotene Zeichen', n === 'RE-2026-0031 A-B-C-D-E-F-G-H.pdf', n);
n = DA.dateiname({ art: 'rechnung', invoice_no: 'RE-2026-0032', empfaenger: '  ', pfad: 'x/a.pdf' });
pruefe('Ohne Empfaenger nur Nummer', n === 'RE-2026-0032.pdf', n);
n = DA.dateiname({ art: 'zeitnachweis', invoice_no: 'RE-2026-0024', empfaenger: 'Sana', pfad: 'x/zeitnachweis-RE-2026-0024-1.pdf' });
pruefe('Zeitnachweis digital', n === 'RE-2026-0024 Zeitnachweis.pdf', n);
n = DA.dateiname({ art: 'zeitnachweis', invoice_no: 'RE-2026-0021', empfaenger: 'JVK', pfad: 'x/nachweis-17.JPG' });
pruefe('Zeitnachweis Scan behaelt Endung', n === 'RE-2026-0021 Zeitnachweis.jpg', n);

// 2 — Unterordner
let u = DA.unterordner({ art: 'monat_kw', service_to: '2026-10-18', invoice_date: '2026-10-19' });
pruefe('KW 42', j(u) === j(['10/26', 'KW42']), j(u));
u = DA.unterordner({ art: 'monat_kw', service_from: '2026-10-08', service_to: '2026-10-18', invoice_date: '2026-10-19' });
pruefe('Nachtrag zieht service_from nicht mit', j(u) === j(['10/26', 'KW42']), j(u));
u = DA.unterordner({ art: 'monat_kw', service_to: '2026-11-01', invoice_date: '2026-11-02' });
pruefe('Woche ueber Monatsgrenze nach Montag', j(u) === j(['10/26', 'KW44']), j(u));
u = DA.unterordner({ art: 'monat_kw', service_to: '2027-01-03', invoice_date: '2027-01-04' });
pruefe('Jahreswechsel KW 53', j(u) === j(['12/26', 'KW53']), j(u));
u = DA.unterordner({ art: 'monat_kw', service_to: '2026-10-05', invoice_date: '2026-10-08' });
pruefe('Einzeltag Montag', j(u) === j(['10/26', 'KW41']), j(u));
u = DA.unterordner({ art: 'monat', service_to: '2026-09-30', invoice_date: '2026-10-11' });
pruefe('Monat', j(u) === j(['09/26']), j(u));
u = DA.unterordner({ art: 'jahr', service_to: '2025-12-31', invoice_date: '2026-01-05' });
pruefe('Jahr nach Rechnungsdatum', j(u) === j(['2026']), j(u));
u = DA.unterordner({ art: 'monat', service_to: null, invoice_date: '2026-08-15' });
pruefe('Ohne Zeitraum Rechnungsdatum', j(u) === j(['08/26']), j(u));
u = DA.unterordner({ art: null, service_to: '2026-10-18', invoice_date: '2026-10-19' });
pruefe('Unbekannte Art wie jahr', j(u) === j(['2026']), j(u));

if (fehler.length) {
  console.error('FEHLER (' + fehler.length + '):\n  ' + fehler.join('\n  '));
  process.exit(1);
}
console.log('alle Pruefungen bestanden');
