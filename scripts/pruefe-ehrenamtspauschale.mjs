#!/usr/bin/env node
/**
 * Prueft die Freibetragsrechnung (ehrenamtspauschale.js) an erfundenen
 * Personen. Dieselben Faelle prueft die Datenbank im Test zu Migration BX.
 *
 * Aufruf:  node scripts/pruefe-ehrenamtspauschale.mjs
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const EP = require(join(dirname(fileURLToPath(import.meta.url)), '..', 'ehrenamtspauschale.js'));

const fehler = [];
const pruefe = (name, bedingung, hinweis) => { if (!bedingung) fehler.push(`${name}\n    ${hinweis}`); };

const WERTE = [
  { vorschrift: '26',  ab_jahr: 2021, betrag_cents: 300000, freigabe_sonja_am: '2026-11-18T10:00:00Z' },
  { vorschrift: '26',  ab_jahr: 2026, betrag_cents: 330000, freigabe_sonja_am: '2026-11-18T10:00:00Z' },
  { vorschrift: '26a', ab_jahr: 2021, betrag_cents:  84000, freigabe_sonja_am: '2026-11-18T10:00:00Z' },
  { vorschrift: '26a', ab_jahr: 2026, betrag_cents:  96000, freigabe_sonja_am: null }
];
const t = (o) => Object.assign({ kind: 'pauschale', pauschale_art: '26a', source_type: 'taetigkeit',
  status: 'approved', submitted_at: '2026-11-01T09:00:00Z' }, o);

// Erika Beispiel: 150 + 810 = genau 960
const erika = [
  t({ id: 'e1', user_id: 'erika', amount: 150, auszahlung_am: '2026-11-20' }),
  t({ id: 'e2', user_id: 'erika', amount: 810, auszahlung_am: '2026-11-21', status: 'paid', paid_at: '2026-11-21T10:00:00Z' })
];

let v = EP.vorschau({ user_id: 'erika', amount: 150, auszahlung_am: '2026-11-20' }, [], WERTE);
pruefe('Unter dem Freibetrag', v && v.diese === 15000 && v.ueber === 0 && v.verbleibend === 81000 && v.limit === 96000,
  JSON.stringify(v));
pruefe('Freigabe fehlt wird gemeldet', v && v.freigegeben === false, JSON.stringify(v));

v = EP.vorschau({ id: 'e2', user_id: 'erika', amount: 810, auszahlung_am: '2026-11-21' }, erika, WERTE);
pruefe('Genau am Freibetrag', v && v.bisher === 15000 && v.ueber === 0 && v.verbleibend === 0, JSON.stringify(v));

v = EP.vorschau({ user_id: 'erika', amount: 100, auszahlung_am: '2026-11-22' }, erika, WERTE);
pruefe('Darueber: 100 nicht steuerfrei', v && v.bisher === 96000 && v.ueber === 10000 && v.verbleibend === 0,
  JSON.stringify(v));

v = EP.vorschau({ user_id: 'max', amount: 100, auszahlung_am: '2026-11-20', anderweitig_cents: 90000 }, [], WERTE);
pruefe('Anderweitig genutzt: 40 drueber', v && v.anderweitig === 90000 && v.ueber === 4000, JSON.stringify(v));

v = EP.vorschau({ user_id: 'max', amount: 300, auszahlung_am: '2026-11-20', anderweitig_cents: 100000 }, [], WERTE);
pruefe('Anderswo schon ueber dem Freibetrag: ganzer Betrag nicht frei', v && v.ueber === 30000, JSON.stringify(v));

// Jahreswechsel
const jahr = [t({ id: 'j1', user_id: 'jo', amount: 800, auszahlung_am: '2025-12-31' })];
v = EP.vorschau({ user_id: 'jo', amount: 900, auszahlung_am: '2026-01-02' }, jahr, WERTE);
pruefe('Neues Jahr, neuer Topf', v && v.jahr === 2026 && v.bisher === 0 && v.ueber === 0, JSON.stringify(v));
v = EP.vorschau({ user_id: 'jo', amount: 100, auszahlung_am: '2025-12-30' }, jahr, WERTE);
pruefe('2025 gilt 840: 60 drueber', v && v.limit === 84000 && v.ueber === 6000, JSON.stringify(v));

pruefe('Silvester 23:30 UTC ist in Berlin schon 2027',
  EP.freibetragJahr({ paid_at: '2026-12-31T23:30:00Z', auszahlung_am: '2026-12-30' }) === 2027, '');
pruefe('Ausgezahlt schlaegt geplant',
  EP.freibetragJahr({ paid_at: '2027-01-04T09:00:00Z', auszahlung_am: '2026-12-30' }) === 2027, '');
pruefe('Ohne Auszahlung zaehlt das geplante Datum',
  EP.freibetragJahr({ auszahlung_am: '2026-12-30', submitted_at: '2027-01-02T09:00:00Z' }) === 2026, '');

// Getrennte Toepfe
const gemischt = [
  t({ id: 'g1', user_id: 'gabi', amount: 3000, pauschale_art: '26', source_type: 'trip', status: 'paid', paid_at: '2026-06-01T10:00:00Z' }),
  t({ id: 'g2', user_id: 'gabi', amount: 150, status: 'paid', paid_at: '2026-11-21T10:00:00Z' }),
  t({ id: 'g3', user_id: 'gabi', amount: 40, kind: 'auslage', pauschale_art: null, status: 'paid', paid_at: '2026-11-21T10:00:00Z' }),
  t({ id: 'g4', user_id: 'gabi', amount: 500, status: 'rejected' }),
  t({ id: 'g5', user_id: 'gabi', amount: 200, pauschale_art: '26', source_type: 'sitzwache', status: 'submitted' })
];
v = EP.vorschau({ user_id: 'gabi', amount: 100, auszahlung_am: '2026-11-25' }, gemischt, WERTE);
pruefe('26 und Auslagen zaehlen nicht gegen 26a, abgelehnte nicht', v && v.verein === 15000, JSON.stringify(v));

const stand = EP.jahresStand(gemischt, 2026, WERTE);
pruefe('Jahresstand 26 getrennt', stand['26'].paid === 300000 && stand['26'].pending === 20000 && stand['26'].limit === 330000,
  JSON.stringify(stand['26']));
pruefe('Jahresstand 26a getrennt', stand['26a'].paid === 15000 && stand['26a'].pending === 0 && stand['26a'].limit === 96000,
  JSON.stringify(stand['26a']));
pruefe('2025 hat 3.000 / 840', EP.jahresStand([], 2025, WERTE)['26'].limit === 300000
  && EP.jahresStand([], 2025, WERTE)['26a'].limit === 84000, '');

pruefe('Kein Freibetrag hinterlegt -> null',
  EP.vorschau({ user_id: 'x', amount: 10, auszahlung_am: '2019-05-01' }, [], WERTE) === null, '');

// Vorbelegung der Erklaerung
const erkl = [
  t({ id: 'k1', user_id: 'kim', amount: 50, auszahlung_am: '2026-03-01', anderweitig_cents: 20000, submitted_at: '2026-03-01T09:00:00Z' }),
  t({ id: 'k2', user_id: 'kim', amount: 50, auszahlung_am: '2026-06-01', anderweitig_cents: 30000, submitted_at: '2026-06-01T09:00:00Z' }),
  t({ id: 'k3', user_id: 'kim', amount: 50, auszahlung_am: '2025-06-01', anderweitig_cents: 99900, submitted_at: '2025-06-01T09:00:00Z' })
];
pruefe('Vorbelegung: letzte Erklaerung desselben Jahres', EP.letzteErklaerung(erkl, 'kim', 2026) === 30000, '');
pruefe('Vorbelegung: neues Jahr ohne Erklaerung', EP.letzteErklaerung(erkl, 'kim', 2027) === null, '');

if (fehler.length) { console.error('FEHLER:\n- ' + fehler.join('\n- ')); process.exit(1); }
console.log('Ehrenamtspauschale: alle Pruefungen bestanden.');
