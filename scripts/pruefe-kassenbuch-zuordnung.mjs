#!/usr/bin/env node
/**
 * Prueft die Erkennungsregeln des Kassenbuchs an erfundenen Daten.
 *
 * Die Regeln entscheiden, ob eine Kontobewegung stillschweigend als erledigt
 * gilt. Ein falscher Treffer ist schlimmer als gar keiner — deshalb wird hier
 * vor allem geprueft, WANN nicht zugeordnet wird.
 *
 * Aufruf:  node scripts/pruefe-kassenbuch-zuordnung.mjs
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const KZ = require(join(dirname(fileURLToPath(import.meta.url)), '..', 'kassenbuch-zuordnung.js'));

const fehler = [];
const pruefe = (name, bedingung, hinweis) => { if (!bedingung) fehler.push(`${name}\n    ${hinweis}`); };

const rechnungen = [
  { id: 'r-14', invoice_no: 'RE-2026-0014', total_cents: 431250, recipient_name: 'Heilpraxis' },
  { id: 'r-07', invoice_no: 'RE-2026-0007', total_cents:  84919, recipient_name: 'Koitzsch' }
];
const antraege = [
  { id: '96a9d0d7-1111-2222-3333-444455556666', beleg_nr: 'LPR-AZB-2026-0027', amount: 150,  user_name: 'Gabriele' },
  { id: 'aaaa1111-2222-3333-4444-555566667777', beleg_nr: 'LPR-AZB-2026-0015', amount: 200,  user_name: 'Dieter'   },
  { id: 'bbbb2222-3333-4444-5555-666677778888', beleg_nr: 'LPR-AZB-2026-0020', amount: 1050, user_name: 'Dieter'   }
];
const welt = { rechnungen, antraege };
const buchung = (betrag_cents, verwendungszweck) => ({ betrag_cents, verwendungszweck });

// 1 — Rechnungsnummer und Betrag passen
let v = KZ.vorschlagFuer(buchung(431250, 'RE-2026-0014 Oberhof'), welt);
pruefe('Rechnung wird erkannt', v && v.art === 'invoice' && v.id === 'r-14', JSON.stringify(v));

// 2 — Nummer da, Betrag weicht ab: KEIN Treffer, aber ein Hinweis
v = KZ.vorschlagFuer(buchung(81919, 'RE-2026-0007 vom 19.08.2026'), welt);
pruefe('Betragsabweichung verhindert die Zuordnung', v && v.art === null, JSON.stringify(v));
pruefe('Betragsabweichung wird benannt', v && /Betrag/i.test(v.hinweis || ''), JSON.stringify(v));

// 3 — Antrag ueber die ersten acht Zeichen der ID, Auszahlung also negativ
v = KZ.vorschlagFuer(buchung(-15000, 'Aufwandsentschaedigung 02.09.2026 Antrag 96A9D0D7DATUM 21.09.2026'), welt);
pruefe('Antrag ueber ID-Praefix erkannt', v && v.art === 'claim' && v.id === antraege[0].id, JSON.stringify(v));

// 4 — Antrag ueber die Belegnummer
v = KZ.vorschlagFuer(buchung(-105000, 'LPR-AZB-2026-0020 DATUM 21.09.2026'), welt);
pruefe('Antrag ueber Belegnummer erkannt', v && v.art === 'claim' && v.id === antraege[2].id, JSON.stringify(v));

// 5 — Euro gegen Cent: 200,00 EUR Antrag gegen -20000 Cent Buchung
v = KZ.vorschlagFuer(buchung(-20000, 'LPR-AZB-2026-0015'), welt);
pruefe('Euro und Cent werden richtig verglichen', v && v.art === 'claim' && v.id === antraege[1].id, JSON.stringify(v));

// 6 — nichts erkannt: null, keine Ausnahme
v = KZ.vorschlagFuer(buchung(-53402, 'Auslagenerstattung Betriebshaftpflicht Allianz'), welt);
pruefe('Ohne Treffer kein Vorschlag', v && v.art === null && !v.hinweis, JSON.stringify(v));

// 7 — mehrdeutig: zwei Antraege mit demselben Praefix duerfen nicht geraten werden
const doppelt = { rechnungen, antraege: antraege.concat([
  { id: '96a9d0d7-9999-8888-7777-666655554444', beleg_nr: 'LPR-AZB-2026-0099', amount: 150, user_name: 'Zwilling' }
]) };
v = KZ.vorschlagFuer(buchung(-15000, 'Antrag 96A9D0D7'), doppelt);
pruefe('Mehrdeutiges wird nicht geraten', v && v.art === null && /mehrdeutig|eindeutig/i.test(v.hinweis || ''),
  JSON.stringify(v));

// 8 — nackte Nummer ohne "RE-": Kunden tippen im Verwendungszweck oft nur
//     "2026-0004". Erlaubt, weil der Betrag zusaetzlich passen muss.
v = KZ.vorschlagFuer(buchung(431250, '2026-0014 Ueberweisung'), welt);
pruefe('Nackte Rechnungsnummer wird erkannt', v && v.art === 'invoice' && v.id === 'r-14', JSON.stringify(v));

// 9 — dieselbe nackte Nummer bei falschem Betrag bleibt liegen
v = KZ.vorschlagFuer(buchung(999, '2026-0014'), welt);
pruefe('Nackte Nummer ohne Betragsgleichheit ordnet nicht zu', v && v.art === null, JSON.stringify(v));

// 10 — eine Belegnummer darf NICHT als Rechnungsnummer missverstanden werden:
//      "LPR-AZB-2026-0020" enthaelt die Zeichenfolge "2026-0020".
v = KZ.vorschlagFuer(buchung(-105000, 'LPR-AZB-2026-0020 DATUM'), welt);
pruefe('Belegnummer wird nicht als Rechnungsnummer gelesen',
  v && v.art === 'claim' && v.id === antraege[2].id, JSON.stringify(v));

// 8 — Kostenarten bringen einen Sphaerenvorschlag mit
pruefe('Kostenarten vorhanden', Array.isArray(KZ.KOSTENARTEN) && KZ.KOSTENARTEN.length >= 8,
  `bekommen: ${KZ.KOSTENARTEN && KZ.KOSTENARTEN.length}`);
pruefe('Jede Kostenart hat eine Sphaere',
  KZ.KOSTENARTEN.every(k => ['ideell','zweckbetrieb','wirtschaftlich','vermoegensverwaltung'].indexOf(k.sphaere) >= 0),
  'mindestens eine Kostenart hat keine gueltige Sphaere');

if (fehler.length) { console.error('FEHLER:\n- ' + fehler.join('\n- ')); process.exit(1); }
console.log('Kassenbuch-Zuordnung: alle Pruefungen bestanden.');
