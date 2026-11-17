#!/usr/bin/env node
/**
 * Prueft den Auszahlungsbeleg der Ehrenamtspauschale (§ 3 Nr. 26a EStG,
 * source_type 'taetigkeit') an einer erfundenen Person. Seit 17.11.2026 ist es
 * derselbe Beleg wie bei der Uebungsleiterpauschale, nur mit Taetigkeit und
 * § 3 Nr. 26a.
 *
 * Aufruf:  node scripts/pruefe-beleg-ehrenamtspauschale.mjs
 *          node scripts/pruefe-beleg-ehrenamtspauschale.mjs --html [--entwurf] [--lang]
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

const verein = { name: 'Leben Pflegen Reisen e.V.', adresse: 'Stephanstraße 46, 10559 Berlin',
  register: 'Amtsgericht Charlottenburg, VR 42682 B' };
const claim = {
  id: '11111111-2222-3333-4444-555555555555', source_type: 'taetigkeit', kind: 'pauschale', pauschale_art: '26a',
  status: 'paid', paid_at: '2026-11-20T10:00:00Z', approved_at: '2026-11-17T10:00:00Z', beleg_nr: 'LPR-AZB-2026-0999', amount: 150,
  period_start: '2026-11-02', period_end: '2026-11-08', auszahlung_am: '2026-11-20', freibetrag_jahr: 2026,
  amount_breakdown: [],
  taetigkeit: 'Verteilung und Aushang von Flyern zur Gewinnung neuer Ehrenamtlicher',
  zweck: 'Gewinnung neuer Ehrenamtlicher für die Sitzwachen', ort: 'Berlin', zahlweg: 'ueberweisung',
  nicht_steuerfrei_cents: 0
};
const basis = {
  claim, verein, jahresSumme: 150, beschlussDatum: '2026-01-15',
  person: { full_name: 'Erika Beispiel', email: 'erika@example.org', iban: 'DE02120300000000202051' },
  freibetrag: { cents: 96000, freigegeben: true }, fassungFreigegeben: true
};
const bau = (extra) => B.belegHtml(Object.assign({}, basis, extra || {}));
const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

if (process.argv.includes('--html')) {
  const extra = {};
  if (process.argv.includes('--entwurf')) extra.fassungFreigegeben = false;
  // --lang: Belastungsprobe mit langen Texten und Ueberschreitung
  if (process.argv.includes('--lang')) {
    extra.claim = Object.assign({}, claim, {
      taetigkeit: 'Verteilung und Aushang von Flyern in Moabit, Wedding und Tiergarten sowie Betreuung des Infostands beim Kiezfest',
      zweck: 'Gewinnung neuer Ehrenamtlicher für die Sitzwachen in den Kliniken und für die Gruppenreisen des Vereins im kommenden Jahr',
      amount: 1234.56, nicht_steuerfrei_cents: 27456, notes: 'Aktion zusammen mit dem Kiezfest-Team, Material vom Verein gestellt.' });
    extra.person = Object.assign({}, basis.person, { full_name: 'Anna-Lena Beispiel-Mustermann' });
    extra.jahresSumme = 1234.56;
  }
  process.stdout.write(bau(extra));
  process.exit(0);
}

const t = text(bau());
pruefe('Titel', t.includes('Auszahlungsbeleg'));
pruefe('Rechtsgrundlage', t.includes('§ 3 Nr. 26a EStG (Ehrenamtspauschale)'));
pruefe('Freibetrag aus den Jahreswerten', t.includes('steuer- und sozialversicherungsfrei bis 960,00 € pro Jahr') && t.includes('150,00 € von 960,00 € ausgeschöpft'));
pruefe('Anlage N bzw. S', t.includes('Anlage N bzw. Anlage S'));
pruefe('Beleg-Nr.', t.includes('LPR-AZB-2026-0999'));
pruefe('Taetigkeit, Zweck, Ort', t.includes('Verteilung und Aushang von Flyern') && t.includes('Zweck: Gewinnung neuer Ehrenamtlicher') && t.includes('Ort: Berlin'));
pruefe('unterstuetzende statt pflegerisch-betreuende Taetigkeit', t.includes('nebenberufliche, unterstützende Tätigkeit') && !t.includes('pflegerisch'));
pruefe('Position ohne "Nacherfassung"', t.includes('Aufwandsentschädigung (Ehrenamtspauschale)') && !t.includes('Nacherfassung'));
pruefe('IBAN gekuerzt wie beim Ue-Beleg', t.includes('DE02 •••• •••• 2051') && !t.includes('DE02120300000000202051'));
pruefe('Kein Geburtsdatum, keine Unterschriften', !/Geburtsdatum|Unterschrift|Stempel/.test(t));
pruefe('Kein ENTWURF bei freigegebener Fassung', !t.includes('ENTWURF'));
pruefe('Kein "Auftraggeber", kein "e.V.."', !t.includes('Auftraggeber') && !t.includes('e.V..'));
pruefe('Keine Uebungsleiterpauschale', !t.includes('Übungsleiter'), t.match(/.{40}Übungsleiter.{40}/)?.[0]);
pruefe('Kein "Selbstauskunft im Antrag"', !t.includes('Selbstauskunft im Antrag') && t.includes('Angaben gegenüber dem Verein'));

pruefe('ENTWURF ohne freigegebene Fassung', text(bau({ fassungFreigegeben: false })).includes('ENTWURF'));

const offen = text(bau({ claim: Object.assign({}, claim, { status: 'approved', paid_at: null, beleg_nr: null }) }));
pruefe('Vor der Auszahlung: Antragsbestaetigung mit 26a-Erklaerung',
  offen.includes('Antragsbestätigung') && offen.includes('Die Ehrenamtspauschale nach § 3 Nr. 26a EStG wurde') && offen.includes('960 €'),
  offen.slice(0, 300));

const ueber = text(bau({ claim: Object.assign({}, claim, { amount: 300, nicht_steuerfrei_cents: 10000 }), jahresSumme: 1060 }));
pruefe('Nicht steuerfreier Teil genannt', ueber.includes('Von dieser Zahlung übersteigen 100,00 € den Freibetrag'));
pruefe('Ueberschritten im Balken', ueber.includes('Freibetrag überschritten'));

// Uebungsleiter-Beleg: Inhalt unveraendert, nur Komma, "Einrichtungen" und kein doppelter Punkt
const ul = text(B.belegHtml({ verein, person: basis.person, jahresSumme: 1050, claim: {
  source_type: 'trip', kind: 'pauschale', pauschale_art: '26', status: 'paid', amount: 1050,
  paid_at: '2026-10-20T10:00:00Z', period_start: '2026-10-04', period_end: '2026-10-11',
  amount_breakdown: [{ label: 'Anreisetag (halber Tag)', factor: 0.5, count: 0.5, base: 150, amount: 75 }] } }));
pruefe('Ue-Beleg: Uebungsleiterpauschale und pflegerisch', ul.includes('§ 3 Nr. 26 EStG (Übungsleiterpauschale)') && ul.includes('pflegerisch-betreuende'));
pruefe('Ue-Beleg: 0,5 mit Komma', ul.includes(' 0,5 ') && !ul.includes('0.5'));
pruefe('Ue-Beleg: Einrichtungen statt Auftraggeber', !ul.includes('Auftraggeber') && ul.includes('Vereine und Einrichtungen'));
pruefe('Ue-Beleg: kein doppelter Punkt', !ul.includes('e.V..'));
pruefe('Ue-Beleg: kein ENTWURF', !ul.includes('ENTWURF'));

if (fehler.length) { console.error('FEHLER:\n- ' + fehler.join('\n- ')); process.exit(1); }
console.log('Beleg Ehrenamtspauschale: alle Pruefungen bestanden.');
