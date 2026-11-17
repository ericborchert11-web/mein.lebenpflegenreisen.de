#!/usr/bin/env node
/**
 * Prueft den Auszahlungsbeleg der Ehrenamtspauschale (§ 3 Nr. 26a EStG,
 * source_type 'taetigkeit') an einer erfundenen Person.
 *
 * Aufruf:  node scripts/pruefe-beleg-ehrenamtspauschale.mjs
 *          node scripts/pruefe-beleg-ehrenamtspauschale.mjs --html > beleg.html
 *          (gibt den Beleg als HTML-Fragment aus, fuer den Testdruck)
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
require(join(dirname(fileURLToPath(import.meta.url)), '..', 'beleg-vorlage.js'));
const B = globalThis.LPRBeleg;

const fehler = [];
const pruefe = (name, bedingung, hinweis) => { if (!bedingung) fehler.push(`${name}\n    ${hinweis || ''}`); };

const verein = { name: 'Leben Pflegen Reisen e. V.', adresse: 'Stephanstraße 46, 10559 Berlin',
  register: 'Amtsgericht Charlottenburg, VR 42682 B' };
const claim = {
  id: '11111111-2222-3333-4444-555555555555', source_type: 'taetigkeit', kind: 'pauschale', pauschale_art: '26a',
  status: 'paid', paid_at: '2026-11-20T10:00:00Z', beleg_nr: 'LPR-AZB-2026-0999', amount: 150,
  period_start: '2026-11-02', period_end: '2026-11-08', auszahlung_am: '2026-11-20', freibetrag_jahr: 2026,
  taetigkeit: 'Verteilung und Aushang von Flyern zur Gewinnung neuer Ehrenamtlicher',
  zweck: 'Gewinnung neuer Ehrenamtlicher für die Sitzwachen', ort: 'Berlin', zahlweg: 'ueberweisung',
  nicht_steuerfrei_cents: 0
};
const basis = {
  claim, verein, jahresSumme: 150,
  person: { full_name: 'Erika Beispiel', email: 'erika@example.org', iban: 'DE02120300000000202051' },
  anschrift: { strasse: 'Musterweg 1', plz: '10115', ort: 'Berlin' }, geburtsdatum: '1990-04-01',
  freibetrag: { cents: 96000, freigegeben: true }, unterzeichner: 'Max Vorstand', fassungFreigegeben: true
};
const bau = (extra) => B.belegHtml(Object.assign({}, basis, extra || {}));

if (process.argv.includes('--html')) {
  const extra = {};
  if (process.argv.includes('--entwurf')) extra.fassungFreigegeben = false;
  // --lang: Belastungsprobe mit langen Texten und Ueberschreitung
  if (process.argv.includes('--lang')) {
    extra.claim = Object.assign({}, claim, {
      taetigkeit: 'Verteilung und Aushang von Flyern in Moabit, Wedding und Tiergarten sowie Betreuung des Infostands beim Kiezfest',
      zweck: 'Gewinnung neuer Ehrenamtlicher für die Sitzwachen in den Kliniken und für die Gruppenreisen des Vereins im kommenden Jahr',
      amount: 1234.56, nicht_steuerfrei_cents: 27456 });
    extra.person = { full_name: 'Anna-Lena Beispiel-Mustermann' };
    extra.anschrift = { strasse: 'Lange Beispielstraße 123, Hinterhaus, 3. OG links', plz: '10115', ort: 'Berlin' };
    extra.jahresSumme = 1234.56;
  }
  process.stdout.write(bau(extra));
  process.exit(0);
}

const h = bau();
const text = h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
pruefe('Titel', text.includes('Auszahlungsbeleg'));
pruefe('Rechtsgrundlage im Untertitel', text.includes('Ehrenamtspauschale nach § 3 Nr. 26a EStG'));
pruefe('Rechtsgrundlage in der Einordnung', text.includes('steuerfrei nach § 3 Nr. 26a EStG'));
pruefe('Freibetrag aus den Jahreswerten', text.includes('2026 bis 960 € im Kalenderjahr'), text.match(/Ehrenamtspauschale, [^)]*/)?.[0]);
pruefe('Betrag in Worten', text.includes('in Worten: einhundertfünfzig Euro'));
pruefe('Beleg-Nr.', text.includes('LPR-AZB-2026-0999'));
pruefe('Taetigkeit und Zweck', text.includes('Verteilung und Aushang von Flyern') && text.includes('Zweck: Gewinnung neuer Ehrenamtlicher'));
pruefe('Anschrift und Geburtsdatum', text.includes('Musterweg 1, 10115 Berlin') && text.includes('01.04.1990'));
pruefe('Vier Erklaerungspunkte', (h.match(/<li>/g) || []).length === 4, (h.match(/<li>/g) || []).length + ' Punkte');
pruefe('Kein ENTWURF bei freigegebener Fassung', !text.includes('ENTWURF'));
pruefe('Keine IBAN', !/DE02|IBAN/.test(text), 'IBAN steht auf dem Blatt');
pruefe('Unterzeichner', text.includes('Unterschrift Max Vorstand') && text.includes('für den Vorstand'));
pruefe('Kein Vorsitz behauptet', !/vorsitz/i.test(text));
const verboten = ['Lohn', 'Gehalt', 'Honorar', 'Rechnung', 'Quittung', 'Arbeitnehmer', 'Mitarbeiter', 'Beschäftigung', 'Arbeitszeit', 'Auftrag', 'LPR '];
verboten.forEach(w => pruefe('Verbotenes Wort ' + w, !new RegExp('\\b' + w, 'i').test(text.replace('LPR-AZB', '')), text.match(new RegExp('.{30}' + w + '.{30}', 'i'))?.[0]));
pruefe('Kein "Herr/Frau" (Geschlecht unbekannt)', !/\b(Herr|Frau)\b/.test(text));

const e = bau({ fassungFreigegeben: false }).replace(/<[^>]+>/g, ' ');
pruefe('ENTWURF ohne freigegebene Fassung', e.includes('ENTWURF'));

const offen = bau({ claim: Object.assign({}, claim, { status: 'approved', paid_at: null, beleg_nr: null }) }).replace(/<[^>]+>/g, ' ');
pruefe('Vor der Auszahlung keine Nummer behauptet', offen.includes('wird bei der Auszahlung vergeben') && !offen.includes('LPR-AZB'));

const ohne = bau({ anschrift: null, geburtsdatum: null, unterzeichner: null }).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
pruefe('Ohne Anschrift: Feld zum Ausfuellen statt Platzhalter', ohne.includes('Anschrift: Geburtsdatum:') && !ohne.includes('['), ohne.slice(0, 400));

const ueber = bau({ claim: Object.assign({}, claim, { amount: 300, nicht_steuerfrei_cents: 10000 }), jahresSumme: 1060 }).replace(/<[^>]+>/g, ' ');
pruefe('Nicht steuerfreier Teil genannt', ueber.includes('Davon übersteigen') && ueber.includes('100,00'));
pruefe('Ueberschritten im Balken', ueber.includes('Freibetrag überschritten'));

const w = B.inWorten;
[[150, 'einhundertfünfzig Euro'], [1, 'ein Euro'], [101, 'einhunderteins Euro'], [21, 'einundzwanzig Euro'], [960, 'neunhundertsechzig Euro'],
 [1001, 'eintausendeins Euro'], [12.5, 'zwölf Euro und fünfzig Cent'], [3300, 'dreitausenddreihundert Euro'],
 [99.01, 'neunundneunzig Euro und ein Cent'], [2016, 'zweitausendsechzehn Euro']]
  .forEach(([n, soll]) => pruefe('In Worten ' + n, w(n) === soll, w(n)));

// Die anderen Belegarten bleiben unberuehrt
const alt = B.belegHtml({ claim: { source_type: 'sitzwache', kind: 'pauschale', pauschale_art: '26', status: 'paid', amount: 100,
  paid_at: '2026-11-20T10:00:00Z', period_start: '2026-11-01', period_end: '2026-11-01', amount_breakdown: [] },
  person: { full_name: 'X' }, verein, jahresSumme: 100 });
pruefe('Sitzwachen-Beleg unveraendert', alt.includes('Steuerlicher Hinweis') && alt.includes('Übungsleiterpauschale') && !alt.includes('Erklärung des Empfängers'));

if (fehler.length) { console.error('FEHLER:\n- ' + fehler.join('\n- ')); process.exit(1); }
console.log('Beleg Ehrenamtspauschale: alle Pruefungen bestanden.');
