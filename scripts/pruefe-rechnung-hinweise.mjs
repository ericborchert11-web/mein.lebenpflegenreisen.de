#!/usr/bin/env node
/**
 * Prueft die Pflichthinweise auf Rechnungen je Erloeskonto.
 *
 * Ein falscher Steuerhinweis steht auf einem Dokument, das beim Kunden liegt
 * und nicht mehr zurueckgeholt wird. Geprueft wird deshalb jeder Fall der
 * Zuordnung und jede Sperre, nicht nur der Normalfall.
 *
 * Aufruf:  node scripts/pruefe-rechnung-hinweise.mjs
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const RH = require(join(dirname(fileURLToPath(import.meta.url)), '..', 'rechnung-hinweise.js'));

const fehler = [];
const pruefe = (name, bedingung, hinweis) => { if (!bedingung) fehler.push(`${name}\n    ${hinweis}`); };

// 1 — Texte woertlich wie im Briefing
pruefe('Text § 19', RH.TEXT_19 === 'Umsatzsteuerfrei nach § 19 UStG (Kleinunternehmerregelung).', RH.TEXT_19);
pruefe('Text 45a', RH.TEXT_45A === 'Umsatzsteuerfrei nach § 4 Nr. 16 Satz 1 Buchst. g UStG – nach § 45a SGB XI '
  + 'landesrechtlich anerkanntes Angebot zur Unterstützung im Alltag (Bescheid SenWGP vom 06.10.2026).', RH.TEXT_45A);

// 2 — Zuordnung
pruefe('Klinik → § 19', RH.hinweisFuer('erloes_klinik', true) === RH.TEXT_19, RH.hinweisFuer('erloes_klinik', true));
pruefe('45a → 45a', RH.hinweisFuer('erloes_45a', false) === RH.TEXT_45A, '');
pruefe('Reisen gedeckt → 45a', RH.hinweisFuer('erloes_reisen', false) === RH.TEXT_45A, '');
pruefe('Reisen steuerpflichtig → § 19', RH.hinweisFuer('erloes_reisen', true) === RH.TEXT_19, '');
pruefe('Reisen ohne Wahl → § 19 (vorsichtig)', RH.hinweisFuer('erloes_reisen', null) === RH.TEXT_19, '');
pruefe('sonstige → kein Hinweis', RH.hinweisFuer('sonstige', false) === '', JSON.stringify(RH.hinweisFuer('sonstige', false)));
pruefe('ohne Konto → null', RH.hinweisFuer(null, null) === null, '');

// 3 — Sperren vor dem Festschreiben
const gut = { erloeskonto: 'erloes_klinik', ust_pflichtig: true, tax_mode: 'exempt', tax_note: RH.TEXT_19 };
const pos = (d) => [{ description: d }];
let r = RH.pruefe(gut, pos('Betreuung des Patienten in der Nacht vom 01. auf den 02.10.2026'));
pruefe('saubere Klinik-Rechnung', r.fehler.length === 0 && r.warnungen.length === 0, JSON.stringify(r));

r = RH.pruefe(Object.assign({}, gut, { erloeskonto: null }), pos('x'));
pruefe('ohne Konto gesperrt', r.fehler.some(f => /Erlöskonto/.test(f)), JSON.stringify(r));

r = RH.pruefe(Object.assign({}, gut, { tax_mode: 'vat' }), pos('Betreuung der Patientin'));
pruefe('kein USt-Ausweis', r.fehler.some(f => /Umsatzsteuer/.test(f)), JSON.stringify(r));

r = RH.pruefe(Object.assign({}, gut, { tax_note: 'Diese Leistung ist umsatzsteuerfrei nach § 4 Nr. 18 UStG.' }), pos('Betreuung der Patientin'));
pruefe('§ 4 Nr. 18 gesperrt', r.fehler.some(f => /§ 4 Nr\. 18/.test(f)), JSON.stringify(r));

r = RH.pruefe(Object.assign({}, gut, { tax_note: RH.TEXT_45A }), pos('Betreuung der Patientin'));
pruefe('§ 4 Nr. 16 auf Klinik gesperrt', r.fehler.some(f => /Nr\. 16/.test(f)), JSON.stringify(r));

r = RH.pruefe(gut, pos('Personalgestellung Sitzwache Station 4'));
pruefe('Personalgestellung gesperrt', r.fehler.some(f => /Personal/.test(f)), JSON.stringify(r));

r = RH.pruefe(gut, pos('Sitzwache Station 4, Nacht 01./02.10.'));
pruefe('Klinik-Beschreibung ohne Betreuung warnt', r.fehler.length === 0 && r.warnungen.length === 1, JSON.stringify(r));

r = RH.pruefe({ erloeskonto: 'erloes_reisen', ust_pflichtig: true, tax_mode: 'exempt', tax_note: RH.TEXT_19 },
              pos('Stundenweise Betreuung pflegebedürftiger Reiseteilnehmer'));
pruefe('Reise ohne Klinik-Regel', r.fehler.length === 0 && r.warnungen.length === 0, JSON.stringify(r));

if (fehler.length) { console.error('FEHLER:\n- ' + fehler.join('\n- ')); process.exit(1); }
console.log('Rechnungshinweise: alle Pruefungen bestanden.');
