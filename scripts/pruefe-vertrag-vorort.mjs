#!/usr/bin/env node
/**
 * Prueft die Vorlage "Vertrag vor Ort" (vertrag-vorort-vorlage.js).
 *
 * Abnahmekriterien aus dem Briefing vom 24.11.2026, soweit ohne Browser
 * pruefbar: Summe = Naechte × Pauschale, Preise nur aus den Werten, kein
 * Kaestchen vorbelegt, Absatz "Ihr Auftrag wirkt weiter" woertlich, ENTWURF
 * ohne Freigabe, Pflichtfelder. Nur Fantasiedaten.
 *
 * Aufruf:  node scripts/pruefe-vertrag-vorort.mjs
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const wurzel = join(dirname(fileURLToPath(import.meta.url)), '..');
const VV = require(join(wurzel, 'vertrag-vorort-vorlage.js'));
const quelle = readFileSync(join(wurzel, 'vertrag-vorort-vorlage.js'), 'utf8');

const fehler = [];
const pruefe = (name, bedingung, hinweis = '') => { if (!bedingung) fehler.push(`${name}\n    ${hinweis}`); };

const VEREIN = { name: 'Leben Pflegen Reisen e.V.', strasse: 'Stephanstr. 46', ort: '10559 Berlin',
  register: 'Amtsgericht Charlottenburg, VR 42682 B', email: 'info@lebenpflegenreisen.de', telefon: '0174 3409116' };
// Absichtlich KRUMME Werte: taucht im Dokument trotzdem 300,00 auf, stammt es aus dem Template.
const WERTE_KRUMM = { modelle: { A: { stunden: 11, pauschale_cents: 31111 } },
  zusatzstunde_cents: 3999, steuerhinweis: 'STEUERHINWEIS-AUS-KONFIG',
  freigabe: { werte: false, vertrag: false, kv: false, datenschutz: false } };
const WERTE = { modelle: { A: { stunden: 12, pauschale_cents: 30000 } },
  zusatzstunde_cents: 2500, steuerhinweis: 'Umsatzsteuerfrei nach § 19 UStG (Kleinunternehmerregelung).',
  freigabe: { werte: true, vertrag: true, kv: true, datenschutz: true } };

const FALL = {
  modell: 'A', von: '19:00', bis: '07:00', ersteNacht: '2026-12-01', naechte: 10,
  kundin: { anrede: 'Frau', vorname: 'Erika', nachname: 'Musterfrau', strasse: 'Musterweg 1', plzOrt: '10115 Berlin',
    telefon: '030 1234567', email: 'erika.musterfrau@example.org' },
  handlung: 'eigen', person: { vorname: 'Gertrud', nachname: 'Musterfrau' },
  einrichtung: { name: 'Seniorenresidenz Am Beispielpark', anschrift: 'Beispielallee 5, 14195 Berlin', wohnbereich: 'WB 2, App. 214',
    ansprech: { name: 'Petra Probe', funktion: 'Wohnbereichsleitung', telefon: '030 7654321' },
    zustimmungAm: '2026-11-20', zustimmungDurch: 'Petra Probe' },
  erkl: { widerrufErhalten: true, leistungsbeginn: true, emailPdf: true, datenschutzErhalten: true },
  ort: 'Berlin', datum: '2026-11-24', nameDruck: 'Erika Musterfrau', kvGueltigBis: '2026-12-08',
  nummern: { vertrag: 'LPR-V-2026-001', kv: 'LPR-KV-2026-001', fall: 'LPR-F-2026-001' }
};

// 1 — Rechnung
pruefe('A: 10 × 300 = 3.000', VV.berechne(FALL, WERTE).summe_cents === 300000, JSON.stringify(VV.berechne(FALL, WERTE)));
pruefe('7 Nächte = 2.100', VV.berechne({ ...FALL, naechte: 7 }, WERTE).summe_cents === 210000, '');
pruefe('ein Modell: Feld modell egal', VV.berechne({ ...FALL, modell: '' }, WERTE).summe_cents === 300000, '');
pruefe('ohne Nächte keine Summe', VV.berechne({ ...FALL, naechte: 0 }, WERTE).summe_cents === null, '');
pruefe('Dauer 19–07 = 12', VV.dauer('19:00', '07:00') === 12, '');
pruefe('Nächte 01.–10.12. = 10', VV.naechteZwischen('2026-12-01', '2026-12-10') === 10, '');
pruefe('Nächte über Zeitumstellung (24.–31.03.2027) = 8', VV.naechteZwischen('2027-03-24', '2027-03-31') === 8,
  VV.naechteZwischen('2027-03-24', '2027-03-31'));
pruefe('letzte Nacht über Monatsende', VV.plusTage('2026-12-28', 9) === '2027-01-06', VV.plusTage('2026-12-28', 9));
pruefe('22:00 + 8 h = 06:00', VV.uhrPlus('22:00', 8) === '06:00', VV.uhrPlus('22:00', 8));
pruefe('21:00 + 10 h = 07:00', VV.uhrPlus('21:00', 10) === '07:00', VV.uhrPlus('21:00', 10));
pruefe('Dauer 22–06 = 8', VV.dauer('22:00', '06:00') === 8, '');
pruefe('Eurobetrag deutsch', VV.eur(375000) === '3.750,00 €', VV.eur(375000));

// 2 — Preise nur aus den Werten
const paketKrumm = VV.paketHtml(FALL, WERTE_KRUMM, VEREIN);
const kvKrumm = VV.kvHtml(FALL, WERTE_KRUMM, VEREIN);
for (const [name, html] of [['Paket', paketKrumm], ['KV', kvKrumm]]) {
  for (const fest of ['300,00', '25,00', '3.000,00', '12 Stunden', '§ 19']) {
    pruefe(`${name}: kein fester Wert "${fest}"`, !html.includes(fest), 'Wert steht im Template statt in der Konfiguration');
  }
  pruefe(`${name}: Steuerhinweis aus der Konfiguration`, html.includes('STEUERHINWEIS-AUS-KONFIG'), '');
}
pruefe('Paket: Pauschale A aus Werten', paketKrumm.includes('311,11'), '');
pruefe('Paket: Zusatzstunde aus Werten', paketKrumm.includes('39,99') && kvKrumm.includes('39,99'), '');
pruefe('Paket: Stunden aus Werten', paketKrumm.includes('11 Stunden je Nacht') && kvKrumm.includes('11 Stunden'), '');
// Fassung 2026-11-24-3: kein Ausfall, kein Storno, kein zweites Modell
for (const [name, html] of [['Paket', VV.paketHtml(FALL, WERTE, VEREIN)], ['KV', VV.kvHtml(FALL, WERTE, VEREIN)]]) {
  for (const weg of ['Ausfall', 'Storno', 'stornier', 'abgesagt', 'Modell B', 'Modell A', '24 Stunden vor']) {
    pruefe(`${name}: kein "${weg}"`, !html.includes(weg), '');
  }
}
pruefe('Fassung 2026-11-24-3', VV.FASSUNG === '2026-11-24-3', VV.FASSUNG);
// Quelltext selbst: kein Eurobetrag
const ohneKommentare = quelle.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
pruefe('Quelltext ohne Eurobetrag', !/\d+,\d{2}\s*(€|EUR)/.test(ohneKommentare), (ohneKommentare.match(/\d+,\d{2}\s*(€|EUR)/) || [''])[0]);

// 3 — Kein Kaestchen vorbelegt
const leerFall = { kundin: {}, person: {}, einrichtung: {}, erkl: {} };
const leerPaket = VV.paketHtml(leerFall, WERTE, VEREIN);
pruefe('leeres Formular: kein Kästchen angekreuzt', !/vv-cb[^"]*\ban\b/.test(leerPaket), '');
pruefe('leeres Formular: Ausfülllinien statt Werte', (leerPaket.match(/vv-linie/g) || []).length > 20, '');
const voll = VV.paketHtml(FALL, WERTE, VEREIN);
const angekreuzt = (voll.match(/class="vv-cb[^"]*\ban\b/g) || []).length;
// eigen + Leistungsbeginn + E-Mail + Widerruf erhalten + Datenschutz erhalten = 5
pruefe('volles Formular: genau 5 Kreuze', angekreuzt === 5, String(angekreuzt));

// 4 — Fester Wortlaut
const WIRKT = 'Leben Pflegen Reisen ist ein gemeinnütziger Verein. Niemand verdient hier an Gewinnen. Was nach Deckung unserer Kosten bleibt, fließt vollständig in unsere Arbeit: in Sitzwachen für Menschen, die nachts im Krankenhaus nicht allein sein sollen, in die Schulung unserer Ehrenamtlichen und in begleitete Reisen für Menschen mit Pflegebedarf und ihre Angehörigen. Mit Ihrer Rechnung ermöglichen Sie uns, mehr Gutes zu tun. Dafür danken wir Ihnen.';
pruefe('KV: "Ihr Auftrag wirkt weiter" wörtlich', kvKrumm.includes('Ihr Auftrag wirkt weiter') && kvKrumm.includes(WIRKT), '');
pruefe('Paket: KV als Anlage 3 enthält den Absatz', voll.includes(WIRKT), '');
pruefe('Widerruf: "Vertragsabschlusses"', voll.includes('ab dem Tag des Vertragsabschlusses.'), '');
pruefe('Widerruf: Telefon in der Belehrung', voll.includes('Telefon 0174 3409116, E-Mail info@lebenpflegenreisen.de) mittels'), '');
pruefe('Formular: "Bestellt am (*)/erhalten am (*)"', voll.includes('Bestellt am (*)/erhalten am (*)'), '');
pruefe('Paket: alle Teile', ['Dienstleistungsvertrag', 'Anlage 1 – Widerrufsbelehrung', 'Anlage 2 – Muster-Widerrufsformular',
  'Kostenvoranschlag – Nachtbegleitung', 'Datenschutzinformation'].every((t) => voll.includes(t)), '');
pruefe('Paket: drei Seitenumbrüche + einer', (voll.match(/class="vv-umbruch"/g) || []).length === 4, '');

// 4b — Datenschutzinformation fertig (seit 24.11.2026, Fassung 2026-11-24-2)
pruefe('Datenschutz: keine Pruefvermerke', !voll.includes('[prüfen') && !voll.includes('vv-pruef') && !/Frist festlegen/.test(voll), '');
pruefe('Datenschutz: eigene Fassung', VV.FASSUNG_DATENSCHUTZ === '2026-11-24-2', VV.FASSUNG_DATENSCHUTZ);
pruefe('Datenschutz: Notfall-Grundlage', voll.includes('Art. 9 Abs. 2 Buchst. c DSGVO'), '');
pruefe('Datenschutz: USA-Grundlage', voll.includes('Data Privacy Framework') && voll.includes('Art. 46 Abs. 2 Buchst. c DSGVO'), '');
pruefe('Datenschutz: Löschfrist drei Monate', voll.includes('spätestens drei Monate nach dem Ende des Einsatzes'), '');

// 5 — Gate
pruefe('ohne Freigabe: Banner', paketKrumm.includes('ENTWURF – FREIGABE AUSSTEHEND') && kvKrumm.includes('ENTWURF – FREIGABE AUSSTEHEND'), '');
pruefe('mit Freigabe: kein Banner', !voll.includes('ENTWURF') && !VV.kvHtml(FALL, WERTE, VEREIN).includes('ENTWURF'), '');
pruefe('Gate: eine fehlende Freigabe genügt', !VV.gate({ ...WERTE, freigabe: { ...WERTE.freigabe, datenschutz: false } }, 'vertrag').freigegeben, '');
pruefe('Gate: KV braucht keine Vertragsfreigabe', VV.gate({ ...WERTE, freigabe: { werte: true, kv: true } }, 'kv').freigegeben, '');
pruefe('Gate: ohne Freigabeobjekt zu', !VV.gate({ modelle: WERTE.modelle }, 'kv').freigegeben, '');

// 6 — Pflichtfelder
pruefe('voller Fall: nichts fehlt', VV.pflichtfehlt(FALL, 'vertrag').length === 0, VV.pflichtfehlt(FALL, 'vertrag').join(' | '));
pruefe('leerer Fall: vieles fehlt', VV.pflichtfehlt(leerFall, 'vertrag').length >= 15, String(VV.pflichtfehlt(leerFall, 'vertrag').length));
pruefe('ohne E-Mail-Einverständnis kein Versand', VV.pflichtfehlt({ ...FALL, erkl: { ...FALL.erkl, emailPdf: false } }, 'vertrag')
  .some((t) => /E-Mail/.test(t)), '');
pruefe('Leistungsbeginn ist freiwillig', VV.pflichtfehlt({ ...FALL, erkl: { ...FALL.erkl, leistungsbeginn: false } }, 'vertrag').length === 0, '');
pruefe('Vertretung ohne Grund fehlt', VV.pflichtfehlt({ ...FALL, handlung: 'vertretung' }, 'vertrag').length === 1, '');
pruefe('ungültige Mail erkannt', VV.pflichtfehlt({ ...FALL, kundin: { ...FALL.kundin, email: 'erika@' } }, 'kv').length === 1, '');

// 7 — Escaping und Mail
const boese = VV.paketHtml({ ...FALL, kundin: { ...FALL.kundin, nachname: '<img src=x onerror=alert(1)>"' } }, WERTE, VEREIN);
pruefe('Eingaben werden maskiert', !boese.includes('<img src=x') && boese.includes('&lt;img'), '');
const m = VV.vertragMail(FALL, VEREIN);
pruefe('Mail-Betreff nur mit Initialen', m.betreff === 'Ihr Vertrag mit Leben Pflegen Reisen e. V. – Nachtbegleitung G. M.', m.betreff);
pruefe('Mail-Anrede', m.text.startsWith('Guten Tag Frau Musterfrau,'), m.text.split('\n')[0]);
pruefe('Mail: kein Name der begleiteten Person', !m.text.includes('Gertrud') && !m.betreff.includes('Gertrud'), '');

// 8 — Muendlich geschlossen, Bestaetigung per Mail
const MU = { ...FALL, abschluss: 'muendlich', nameDruck: '', erkl: { emailPdf: true }, bestaetigtAm: '2026-11-26' };
pruefe('mündlich: nichts fehlt ohne Druckname und Empfangskreuze', VV.pflichtfehlt(MU, 'vertrag').length === 0, VV.pflichtfehlt(MU, 'vertrag').join(' | '));
pruefe('mündlich: E-Mail-Einverständnis Pflicht', VV.pflichtfehlt({ ...MU, erkl: {} }, 'vertrag').some((t) => /E-Mail/.test(t)), '');
const muPaket = VV.paketHtml(MU, WERTE, VEREIN);
pruefe('mündlich: Bestätigungstext', muPaket.includes('mündlich geschlossen') && muPaket.includes('§ 312f Abs. 1 BGB'), '');
pruefe('mündlich: keine Empfangskästchen', !muPaket.includes('Empfangsbestätigungen'), '');
pruefe('mündlich: Leistungsbeginn als Bitte um Textform', muPaket.includes('„Ich verlange ausdrücklich, dass der Verein vor Ablauf der Widerrufsfrist mit der Leistung beginnt.“'), '');
pruefe('mündlich: genau 2 Kreuze (eigen + E-Mail)', (muPaket.match(/class="vv-cb[^"]*\ban\b/g) || []).length === 2, '');
pruefe('mündlich: Unterschriftsfeld Kundin ohne Bild', (muPaket.match(/alt="Unterschrift"/g) || []).length === 0, '');
pruefe('mündlich: Ort, Datum = Bestätigungstag', muPaket.includes('26.11.2026') && muPaket.includes('am <span class="vv-wert">24.11.2026</span>'), '');
pruefe('vor Ort: kein Bestätigungstext', !voll.includes('§ 312f'), '');
const mm = VV.vertragMail(MU, VEREIN);
pruefe('mündlich: Betreff wie Vertrag (Edge-Muster)', mm.betreff === m.betreff, mm.betreff);
pruefe('mündlich: Mail bittet um beide Sätze', mm.text.includes('Ich verlange ausdrücklich') && mm.text.includes('habe ich erhalten'), '');
pruefe('mündlich: Mail ohne Namen der Person', !mm.text.includes('Gertrud'), '');
const BETREFF_RE = /^Ihr (Vertrag mit|Kostenvoranschlag von) Leben Pflegen Reisen e\. V\. – Nachtbegleitung [A-ZÄÖÜ. ]{0,20}$/;
pruefe('Betreff passt zum Muster der Edge Function', BETREFF_RE.test(mm.betreff) && BETREFF_RE.test(VV.kvMail(FALL, VEREIN).betreff), '');

if (fehler.length) {
  console.error(`✗ ${fehler.length} Prüfung(en) fehlgeschlagen:\n  - ` + fehler.join('\n  - '));
  process.exit(1);
}
console.log('✓ Vertrag vor Ort: alle Prüfungen bestanden.');
