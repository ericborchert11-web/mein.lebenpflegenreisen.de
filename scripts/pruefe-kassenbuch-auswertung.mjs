#!/usr/bin/env node
/**
 * Prueft Auswertung, Saldo-Reihe und CSV-Export des Kassenbuchs.
 *
 * Aufruf:  node scripts/pruefe-kassenbuch-auswertung.mjs
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const KA = require(join(dirname(fileURLToPath(import.meta.url)), '..', 'kassenbuch-auswertung.js'));

const fehler = [];
const pruefe = (name, bedingung, hinweis) => { if (!bedingung) fehler.push(`${name}\n    ${hinweis}`); };

const buchungen = [
  { buchungstag: '2026-08-19', betrag_cents:  1056900, invoice_id: 'r1', gegenpartei: 'Frommholz',  verwendungszweck: '2026-0004' },
  { buchungstag: '2026-08-20', betrag_cents:  -105000, claim_id:   'c1', gegenpartei: 'Lothar',     verwendungszweck: 'Antrag 92589B04' },
  { buchungstag: '2026-09-02', betrag_cents:   -53402, kostenart: 'Versicherung',     sphaere: 'ideell',               beleg_url: 'https://drive/x', gegenpartei: 'Eric', verwendungszweck: 'Allianz' },
  { buchungstag: '2026-09-02', betrag_cents:    -8096, kostenart: 'Recht & Notar',    sphaere: 'ideell',               beleg_url: '',                gegenpartei: 'Eric', verwendungszweck: 'Notar; mit Semikolon' },
  { buchungstag: '2026-09-16', betrag_cents:   225000, invoice_id: 'r2', gegenpartei: 'AWO',        verwendungszweck: 'RE-2026-0006' },
  { buchungstag: '2026-09-18', betrag_cents:    -1199, kostenart: 'Büro & Material',  sphaere: 'zweckbetrieb',         beleg_url: '',                gegenpartei: 'Enrico', verwendungszweck: 'Kabel' }
];

const a = KA.auswertung(buchungen);
pruefe('Einnahmen aus Rechnungen', a.einnahmenRechnungen === 1281900, `bekommen: ${a.einnahmenRechnungen}`);
pruefe('Auszahlungen an Antraege', a.auszahlungenAntraege === -105000, `bekommen: ${a.auszahlungenAntraege}`);
pruefe('Kosten je Kostenart summiert', a.jeKostenart.length === 3, `bekommen: ${a.jeKostenart.length}`);
pruefe('Versicherung richtig summiert',
  (a.jeKostenart.find(k => k.kostenart === 'Versicherung') || {}).betrag_cents === -53402,
  JSON.stringify(a.jeKostenart));
pruefe('Sphaere ideell summiert beide Posten',
  (a.jeSphaere.find(s => s.sphaere === 'ideell') || {}).betrag_cents === -61498, JSON.stringify(a.jeSphaere));
pruefe('Belege fehlen werden gezaehlt', a.ohneBeleg === 2, `bekommen: ${a.ohneBeleg}`);
pruefe('Ohne Zuordnung gezaehlt', a.ohneZuordnung === 0, `bekommen: ${a.ohneZuordnung}`);

// Saldo-Reihe: Anker ist der frueheste erfasste Stand.
const staende = [
  { id: 's0', stichtag: '2026-08-18', stand_cents: 0 },
  { id: 's1', stichtag: '2026-09-21', stand_cents: 1114203 }
];
const reihe = KA.saldoReihe(buchungen, staende);
pruefe('Anker hat Differenz 0', reihe[0].differenz_cents === 0, JSON.stringify(reihe[0]));
pruefe('Berechneter Stand am Stichtag',
  reihe[1].berechnet_cents === 1114203, JSON.stringify(reihe[1]));
pruefe('Differenz 0 bei passendem Kontostand', reihe[1].differenz_cents === 0, JSON.stringify(reihe[1]));

const schief = KA.saldoReihe(buchungen, [staende[0], { id: 's2', stichtag: '2026-09-21', stand_cents: 1104203 }]);
pruefe('Abweichung wird ausgewiesen', schief[1].differenz_cents === -10000, JSON.stringify(schief[1]));

// Ohne erfassten Stand gibt es nichts zu vergleichen — und keinen Absturz.
pruefe('Ohne Kontostand leere Reihe', KA.saldoReihe(buchungen, []).length === 0, 'Reihe war nicht leer');

// Rechnerischer Kontostand: Anker plus alle Buchungen bis zum Stichtag.
const stand = KA.aktuellerStand(buchungen, staende, '2026-09-30');
pruefe('Kontostand ab Anker gerechnet', stand.cents === 1114203, JSON.stringify(stand));
pruefe('Kontostand kennt seinen Anker', stand.anker === '2026-08-18', JSON.stringify(stand));

// Ein frueheres Stichdatum schneidet spaetere Buchungen ab.
pruefe('Stichtag schneidet ab',
  KA.aktuellerStand(buchungen, staende, '2026-08-19').cents === 1056900,
  JSON.stringify(KA.aktuellerStand(buchungen, staende, '2026-08-19')));

// Ohne Anker ist kein Kontostand berechenbar — und es wird auch keiner
// behauptet: eine Summe ohne Anfangsbestand waere schlicht falsch.
pruefe('Ohne Anker kein Kontostand', KA.aktuellerStand(buchungen, [], '2026-09-30').cents === null,
  JSON.stringify(KA.aktuellerStand(buchungen, [], '2026-09-30')));

const csv = KA.alsCsv(buchungen);
const zeilen = csv.trim().split('\n');
pruefe('CSV hat Kopf und je Buchung eine Zeile', zeilen.length === 7, `bekommen: ${zeilen.length}`);
pruefe('CSV trennt mit Semikolon', zeilen[0].split(';').length >= 8, zeilen[0]);
pruefe('Semikolon im Text wird eingepackt', /"Notar; mit Semikolon"/.test(csv),
  'Der Zweck mit Semikolon steht ohne Anfuehrungszeichen in der Datei');
pruefe('Betrag deutsch formatiert', /-534,02/.test(csv), 'Betrag steht nicht als -534,02');

if (fehler.length) { console.error('FEHLER:\n- ' + fehler.join('\n- ')); process.exit(1); }
console.log('Kassenbuch-Auswertung: alle Pruefungen bestanden.');
