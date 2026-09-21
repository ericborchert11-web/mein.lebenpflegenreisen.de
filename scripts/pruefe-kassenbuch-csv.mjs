#!/usr/bin/env node
/**
 * Prueft den CSV-Parser des Kassenbuchs gegen eine im Skript erzeugte Datei.
 *
 * WARUM DIE CSV HIER ENTSTEHT UND NICHT ALS DATEI DANEBENLIEGT: Ein echter
 * Kontoauszug enthaelt Namen und IBANs, und dieses Repo ist oeffentlich. Die
 * Struktur laesst sich nachbauen, die Daten nicht.
 *
 * Aufruf:  node scripts/pruefe-kassenbuch-csv.mjs
 * Beendet mit Code 1, sobald eine Pruefung faellt.
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const KB = require(join(dirname(fileURLToPath(import.meta.url)), '..', 'kassenbuch-csv.js'));

const fehler = [];
const pruefe = (name, bedingung, hinweis) => {
  if (!bedingung) fehler.push(`${name}\n    ${hinweis}`);
};

const KOPF = '"Auftragskonto";"Buchungstag";"Valutadatum";"Buchungstext";"Verwendungszweck";'
  + '"Glaeubiger ID";"Mandatsreferenz";"Kundenreferenz (End-to-End)";"Sammlerreferenz";'
  + '"Lastschrift Ursprungsbetrag";"Auslagenersatz Ruecklastschrift";"Beguenstigter/Zahlungspflichtiger";'
  + '"Kontonummer/IBAN";"BIC (SWIFT-Code)";"Betrag";"Waehrung";"Info";"Kategorie"';

const zeile = (tag, zweck, wer, betrag, info = 'Umsatz gebucht') =>
  `"DE00000000000000000000";"${tag}";"${tag}";"ONLINE-UEBERWEISUNG";"${zweck}";"";"";"";"";"";"";`
  + `"${wer}";"DE00000000000000000001";"TESTDEFFXXX";"${betrag}";"EUR";"${info}";""`;

const csv = [
  KOPF,
  zeile('21.09.26', 'Aufwandsentschaedigung; Teil 1', 'Enrico Schröder', '-1.234,56'),
  zeile('21.09.26', 'Aufwandsentschaedigung; Teil 2', 'Enrico Schröder', '-1.234,56'),
  zeile('16.09.26', 'Rechnung RE-2026-0006', 'AWO Sano gGmbH', '2.250,00'),
  zeile('20.09.26', 'Noch nicht gebucht', 'Testperson', '-10,00', 'Umsatz vorgemerkt'),
  ''
].join('\r\n');

// Der Browser liest die Datei mit ISO-8859-1 ein und reicht Text weiter; in
// Node entsteht derselbe Zustand ueber latin1 hin und zurueck.
const text = Buffer.from(csv, 'latin1').toString('latin1');
const zeilen = KB.parseSparkasseCsv(text);

pruefe('Vorgemerktes fliegt raus', zeilen.length === 3, `bekommen: ${zeilen.length} Zeilen`);
pruefe('Umlaut erhalten', zeilen[0] && zeilen[0].gegenpartei === 'Enrico Schröder',
  `bekommen: ${zeilen[0] && zeilen[0].gegenpartei}`);
pruefe('Betrag in Cent, Vorzeichen erhalten', zeilen[0] && zeilen[0].betrag_cents === -123456,
  `bekommen: ${zeilen[0] && zeilen[0].betrag_cents}`);
pruefe('Eingang bleibt positiv', zeilen[2] && zeilen[2].betrag_cents === 225000,
  `bekommen: ${zeilen[2] && zeilen[2].betrag_cents}`);
pruefe('Datum als ISO mit vierstelligem Jahr', zeilen[0] && zeilen[0].buchungstag === '2026-09-21',
  `bekommen: ${zeilen[0] && zeilen[0].buchungstag}`);
pruefe('Semikolon im Verwendungszweck zerreisst die Zeile nicht',
  zeilen[0] && zeilen[0].verwendungszweck === 'Aufwandsentschaedigung; Teil 1',
  `bekommen: ${zeilen[0] && zeilen[0].verwendungszweck}`);
pruefe('Gegenpartei-IBAN wird NICHT uebernommen',
  zeilen[0] && !JSON.stringify(zeilen[0]).includes('DE00000000000000000001'),
  'die IBAN der Gegenseite steht im Ergebnis');
pruefe('Fingerabdruecke unterscheiden gleiche Betraege am selben Tag',
  zeilen[0] && zeilen[1] && zeilen[0].fingerabdruck !== zeilen[1].fingerabdruck,
  'beide Zeilen haben denselben Abdruck');
pruefe('Fingerabdruck ist stabil',
  KB.parseSparkasseCsv(text)[0].fingerabdruck === zeilen[0].fingerabdruck,
  'zweiter Lauf liefert einen anderen Abdruck');

// Eine Datei ohne die erwarteten Spalten darf nicht stillschweigend leer
// durchlaufen — sonst meldet die Seite "0 neue Buchungen" und niemand sucht
// den Fehler in der Datei.
let geworfen = false;
try { KB.parseSparkasseCsv('Datum;Betrag\n01.01.26;1,00'); } catch { geworfen = true; }
pruefe('Fremde Datei wird abgelehnt', geworfen, 'parseSparkasseCsv hat keinen Fehler geworfen');

if (fehler.length) {
  console.error('FEHLER:\n- ' + fehler.join('\n- '));
  process.exit(1);
}
console.log(`Kassenbuch-CSV: alle Pruefungen bestanden (${zeilen.length} Zeilen gelesen).`);
