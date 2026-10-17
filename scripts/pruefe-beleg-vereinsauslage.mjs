#!/usr/bin/env node
/**
 * Prueft den Auszahlungsbeleg einer Vereinsauslage (source_type 'verein').
 *
 * Eine Vereinsauslage hat weder Reise-Anmeldung noch Buchung. Der Beleg muss
 * trotzdem sagen, wofuer erstattet wurde, und darf als Auslagenersatz
 * (§ 3 Nr. 50 EStG) keinen Freibetragsbalken zeigen.
 *
 * Aufruf:  node scripts/pruefe-beleg-vereinsauslage.mjs
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
// beleg-vorlage.js exportiert nichts, sondern haengt sich an globalThis.
require(join(dirname(fileURLToPath(import.meta.url)), '..', 'beleg-vorlage.js'));
const B = globalThis.LPRBeleg;

const fehler = [];
const pruefe = (name, bedingung, hinweis) => { if (!bedingung) fehler.push(`${name}\n    ${hinweis}`); };

const verein = { name: 'Leben Pflegen Reisen e.V.', adresse: 'Stephanstr. 46', register: 'VR 42682 B' };
const basis = {
  id: '11111111-2222-3333-4444-555555555555', status: 'paid', paid_at: '2026-10-20T10:00:00Z',
  amount: 194.44, kind: 'auslage', auslage_art: 'beleg', beleg_nr: 'LPR-AZB-2026-0099',
  period_start: '2026-10-04', period_end: '2026-10-13',
  amount_breakdown: [{ label: 'Flixbus-Tickets der Reisegruppe', amount: 194.44 }],
};
const bau = (claim, extra) => B.belegHtml({ claim, person: { full_name: 'Test Person' }, verein, jahresSumme: 0, ...(extra || {}) });

const mitReise = bau({ ...basis, source_type: 'verein' }, { reiseTitel: 'AWO Rerik' });
pruefe('Untertitel Vereinsauslage', mitReise.includes('Ausgabe für den Verein'), 'fehlt „Ausgabe für den Verein"');
pruefe('Reise genannt', mitReise.includes('Reise „AWO Rerik“'), 'fehlt „Reise „AWO Rerik““');
pruefe('Position steht drauf', mitReise.includes('Flixbus-Tickets der Reisegruppe'), 'Position fehlt');
pruefe('kein Freibetragsbalken', !mitReise.includes('ausgeschöpft'), 'Freibetragsbalken auf einer Auslage');
pruefe('Auslagen-Hinweis', mitReise.includes('§ 3 Nr. 50 EStG'), 'Hinweis § 3 Nr. 50 fehlt');

const ohneReise = bau({ ...basis, source_type: 'verein' });
pruefe('ohne Reise kein Reise-Zusatz', !ohneReise.includes('Reise „'), 'Reise-Zusatz ohne Reise');
pruefe('ohne Reise trotzdem Vereinsauslage', ohneReise.includes('Ausgabe für den Verein'), 'Untertitel fehlt');

const reiseAuslage = bau({ ...basis, source_type: 'trip', trip_signup_id: 'x' });
pruefe('Reise-Auslage unveraendert', !reiseAuslage.includes('Ausgabe für den Verein')
  && reiseAuslage.includes('Erstattung gegen eingereichten Nachweis'), 'Reise-Auslage hat sich veraendert');

if (fehler.length) {
  console.error(`FEHLER (${fehler.length}):\n  ` + fehler.join('\n  '));
  process.exit(1);
}
console.log('Beleg Vereinsauslage: alle Pruefungen bestanden.');
