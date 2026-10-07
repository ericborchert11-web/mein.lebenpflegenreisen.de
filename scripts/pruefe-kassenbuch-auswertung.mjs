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

// ── Erloeskonten ─────────────────────────────────────────────────────────
// Das Konto einer Buchung mit Rechnung kommt aus der Rechnung, sonst aus der
// Buchung selbst. Ausgaenge ohne Rechnung und Rueckfluesse von Antraegen
// gehoeren gar nicht zu den Erloesen — undefined, nicht 'ohne Konto'.
const rech = { 'r-19': { id: 'r-19', erloeskonto: 'erloes_reisen', ust_pflichtig: true },
               'r-12': { id: 'r-12', erloeskonto: null, ust_pflichtig: null } };
const kb = [
  { id: 'k1', betrag_cents: 1056900, invoice_id: 'r-19' },
  { id: 'k2', betrag_cents:   26150, erloeskonto: 'sonstige', ust_pflichtig: false },
  { id: 'k3', betrag_cents:   -5000 },
  { id: 'k4', betrag_cents:   15000, claim_id: 'c-1' },
  { id: 'k5', betrag_cents:   40000 },
  { id: 'k6', betrag_cents:  -10000, invoice_id: 'r-19' },
  { id: 'k7', betrag_cents:  130000, invoice_id: 'r-12' }
];
pruefe('Konto aus der Rechnung', KA.kontoVon(kb[0], rech) === 'erloes_reisen', KA.kontoVon(kb[0], rech));
pruefe('Konto der Buchung selbst', KA.kontoVon(kb[1], rech) === 'sonstige', KA.kontoVon(kb[1], rech));
pruefe('Ausgang ohne Rechnung gehoert nicht dazu', KA.kontoVon(kb[2], rech) === undefined, KA.kontoVon(kb[2], rech));
pruefe('Rueckfluss eines Antrags gehoert nicht dazu', KA.kontoVon(kb[3], rech) === undefined, KA.kontoVon(kb[3], rech));
pruefe('Eingang ohne alles ist ohne Konto', KA.kontoVon(kb[4], rech) === null, KA.kontoVon(kb[4], rech));
pruefe('Rechnung ohne Konto ist ohne Konto', KA.kontoVon(kb[6], rech) === null, KA.kontoVon(kb[6], rech));

const jk = KA.jeKonto(kb, rech);
pruefe('Reisen mit Rueckzahlung gemindert', jk.erloes_reisen === 1046900, JSON.stringify(jk));
pruefe('Sonstige', jk.sonstige === 26150, JSON.stringify(jk));
pruefe('ohne Konto zaehlt Eingang und Rechnung ohne Konto', jk.ohne === 170000, JSON.stringify(jk));
pruefe('Klinik leer', jk.erloes_klinik === 0 && jk.erloes_45a === 0, JSON.stringify(jk));

const csvK = KA.alsCsv(kb, {}, rech);
const kopfK = csvK.split('\r\n')[0];
pruefe('CSV kennt Erloeskonto und USt', /Erlöskonto;USt-pflichtig$/.test(kopfK), kopfK);
pruefe('CSV schreibt Konto aus der Rechnung', /;erloes_reisen;ja\r\n/.test(csvK), csvK.split('\r\n')[1]);

// ── Export fuer die Steuerberaterin ─────────────────────────────────────
// Erloese nach Zahlungseingang, dazu festgeschriebene Rechnungen ohne
// Zahlung (Zahlungseingang leer). Storno-Paare und Ausgaben fehlen.
const rechE = {
  'r-19': { id: 'r-19', invoice_no: 'RE-2026-0019', invoice_date: '2026-10-07', status: 'paid', total_cents: 1056900,
            erloeskonto: 'erloes_reisen', ust_pflichtig: true, betreff: 'Betreute Reise Rerik', recipient_name: 'Heilpraxis' },
  'r-12': { id: 'r-12', invoice_no: 'RE-2026-0012', invoice_date: '2026-09-09', status: 'issued', total_cents: 130000,
            erloeskonto: 'erloes_klinik', ust_pflichtig: true, betreff: null, recipient_name: 'Unger' },
  'r-03': { id: 'r-03', invoice_no: 'RE-2026-0003', invoice_date: '2026-08-17', status: 'cancelled', total_cents: 1056900,
            erloeskonto: null, cancelled_by_invoice_id: 'r-04', recipient_name: 'Heilpraxis' },
  'r-04': { id: 'r-04', invoice_no: 'RE-2026-0004', invoice_date: '2026-08-17', status: 'issued', total_cents: -1056900,
            erloeskonto: 'erloes_reisen', cancels_invoice_id: 'r-03', recipient_name: 'Heilpraxis' },
  'r-25': { id: 'r-25', invoice_no: 'RE-2025-0001', invoice_date: '2025-12-30', status: 'issued', total_cents: 100,
            erloeskonto: 'erloes_klinik', recipient_name: 'Alt' }
};
const kbE = [
  { id: 'e1', buchungstag: '2026-08-19', betrag_cents: 1056900, invoice_id: 'r-19', gegenpartei: 'Frommholz Simeon', verwendungszweck: '2026-0004' },
  { id: 'e2', buchungstag: '2026-09-25', betrag_cents: 26150, erloeskonto: 'sonstige', ust_pflichtig: false, gegenpartei: 'Steglich', verwendungszweck: 'SPENDE; RERIK' },
  { id: 'e3', buchungstag: '2026-09-01', betrag_cents: -53402, kostenart: 'Versicherung', gegenpartei: 'Allianz' },
  { id: 'e4', buchungstag: '2025-12-31', betrag_cents: 5000, erloeskonto: 'sonstige', ust_pflichtig: false, gegenpartei: 'Vorjahr' }
];
const ex = KA.erloeseCsv(kbE, rechE, 2026).split('\r\n').filter(Boolean);
pruefe('Export-Kopf', ex[0] === 'Datum;Zahlungseingang;Belegnr.;Beschreibung;Erlöskonto;USt-pflichtig;Betrag;Zahler', ex[0]);
pruefe('Export: 2 Zahlungen + 1 offene Rechnung', ex.length === 4, ex.join(' | '));
pruefe('Rechnung mit Rechnungsdatum und Zahlungseingang',
  ex.some(z => z === '2026-10-07;2026-08-19;RE-2026-0019;Betreute Reise Rerik;erloes_reisen;ja;10569,00;Frommholz Simeon'),
  ex.join(' | '));
pruefe('Einnahme ohne Rechnung',
  ex.some(z => z === '2026-09-25;2026-09-25;;"SPENDE; RERIK";sonstige;nein;261,50;Steglich'), ex.join(' | '));
pruefe('Offene Rechnung ohne Zahlungseingang',
  ex.some(z => z === '2026-09-09;;RE-2026-0012;Rechnung an Unger;erloes_klinik;ja;1300,00;Unger'), ex.join(' | '));
pruefe('Storno-Paar, Ausgabe und Vorjahr fehlen',
  !/RE-2026-000[34]|Allianz|Vorjahr|RE-2025/.test(ex.join('\n')), ex.join(' | '));

if (fehler.length) { console.error('FEHLER:\n- ' + fehler.join('\n- ')); process.exit(1); }
console.log('Kassenbuch-Auswertung: alle Pruefungen bestanden.');
