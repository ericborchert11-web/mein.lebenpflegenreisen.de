#!/usr/bin/env node
/**
 * Prueft die Beitragserkennung an erfundenen Daten. Wie beim Kassenbuch geht
 * es vor allem darum, WANN nicht automatisch zugeordnet wird.
 *
 * Aufruf:  node scripts/pruefe-mitgliedsbeitrag.mjs
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const MB = require(join(dirname(fileURLToPath(import.meta.url)), '..', 'mitgliedsbeitrag.js'));

const fehler = [];
const pruefe = (name, bedingung, hinweis) => { if (!bedingung) fehler.push(`${name}\n    ${hinweis}`); };

const mitglieder = [
  { id: 'm1', full_name: 'Erika Mustermann' },
  { id: 'm2', full_name: 'Jürgen Schröder' },
  { id: 'm3', full_name: 'Max Mustermann' },
  { id: 'm4', full_name: 'Anna-Lena Beispiel' }
];
const b = (zweck, gegen, cents, tag) =>
  ({ verwendungszweck: zweck, gegenpartei: gegen, betrag_cents: cents, buchungstag: tag || '2026-11-06' });

let v = MB.vorschlagFuer(b('Mitgliedsbeitrag 2026 – Erika Mustermann', 'ERIKA MUSTERMANN', 900), mitglieder);
pruefe('Normalfall sicher', v && v.sicher && v.mitglied_id === 'm1' && v.jahr === 2026, JSON.stringify(v));

v = MB.vorschlagFuer(b('Mitgliedsbeitrag 2026', 'Schroeder, Juergen', 1200), mitglieder);
pruefe('Umlaut ausgeschrieben, Name nur beim Kontoinhaber', v && v.sicher && v.mitglied_id === 'm2', JSON.stringify(v));

v = MB.vorschlagFuer(b('Beitrag 2026 Jurgen Schroder', 'X', 900), mitglieder);
pruefe('Umlaut weggelassen', v && v.sicher && v.mitglied_id === 'm2', JSON.stringify(v));

v = MB.vorschlagFuer(b('Mitgliedsbeitrag 2026 Mustermann', 'Sparkasse', 900), mitglieder);
pruefe('Nur Nachname, zwei Mustermanns -> nicht sicher, kein Vorschlag',
  v && !v.sicher && v.mitglied_id === null, JSON.stringify(v));

v = MB.vorschlagFuer(b('Mitgliedsbeitrag 2026', 'Peter Beispiel', 900), mitglieder);
pruefe('Partner zahlt, nur Nachname eindeutig -> Vorschlag, nicht sicher',
  v && !v.sicher && v.mitglied_id === 'm4', JSON.stringify(v));

v = MB.vorschlagFuer(b('Mitgliedsbeitrag 2026 Erika und Max Mustermann', 'Mustermann', 1800), mitglieder);
pruefe('Zwei Mitglieder in einer Zahlung -> nicht sicher', v && !v.sicher && v.mitglied_id === null, JSON.stringify(v));

v = MB.vorschlagFuer(b('Spende Weihnachtsfeier', 'Erika Mustermann', 5000), mitglieder);
pruefe('Spende eines Mitglieds -> nur unsicherer Vorschlag', v && !v.sicher && v.mitglied_id === 'm1', JSON.stringify(v));

v = MB.vorschlagFuer(b('Spende', 'Erika Mustermann', 50000), mitglieder);
pruefe('Grosse Spende -> gar kein Vorschlag', v === null, JSON.stringify(v));

v = MB.vorschlagFuer(b('Mitgliedsbeitrag Erika Mustermann', 'X', -900), mitglieder);
pruefe('Ausgang ist nie ein Beitrag', v === null, JSON.stringify(v));

v = MB.vorschlagFuer(b('Mitgliedsbeitrag Erika Mustermann', 'X', 1200, '2027-01-03'), mitglieder);
pruefe('Ohne Jahr im Zweck gilt das Buchungsjahr', v && v.jahr === 2027, JSON.stringify(v));

const stand = MB.standJeMitglied([
  { mitglied_id: 'm1', beitrag_jahr: 2026, betrag_cents: 500, buchungstag: '2026-11-04' },
  { mitglied_id: 'm1', beitrag_jahr: 2026, betrag_cents: 400, buchungstag: '2026-11-09' },
  { mitglied_id: 'm2', beitrag_jahr: 2026, betrag_cents: 500, buchungstag: '2026-11-05' },
  { mitglied_id: 'm3', beitrag_jahr: 2027, betrag_cents: 1200, buchungstag: '2026-12-30' },
  { mitglied_id: null, beitrag_jahr: null, betrag_cents: 900, buchungstag: '2026-11-05' }
], 2026);
pruefe('Zwei Teilzahlungen ergeben bezahlt', stand.m1 && stand.m1.status === 'bezahlt' && stand.m1.letzte === '2026-11-09',
  JSON.stringify(stand.m1));
pruefe('5 € von 9 € ist teilweise', stand.m2 && stand.m2.status === 'teilweise', JSON.stringify(stand.m2));
pruefe('Beitrag 2027 zaehlt nicht fuer 2026', !stand.m3, JSON.stringify(stand.m3));
pruefe('Soll 2026 = 9 €, danach 12 €', MB.sollCents(2026) === 900 && MB.sollCents(2027) === 1200, '');

if (fehler.length) { console.error('FEHLER:\n- ' + fehler.join('\n- ')); process.exit(1); }
console.log('Mitgliedsbeitrag: alle Pruefungen bestanden.');
