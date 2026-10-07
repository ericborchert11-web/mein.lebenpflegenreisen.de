#!/usr/bin/env node
/**
 * Prueft die Kleinunternehmer-Ampel an erfundenen Sichtzeilen.
 *
 * Die Ampel entscheidet, ob der Vorstand die Steuerberaterin anruft. Geprueft
 * wird vor allem an den Kanten: genau 80 %, genau 100 %, und ein Vorjahr ueber
 * der Grenze, das auch ein ruhiges laufendes Jahr rot macht.
 *
 * Aufruf:  node scripts/pruefe-ust-ampel.mjs
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const UA = require(join(dirname(fileURLToPath(import.meta.url)), '..', 'ust-ampel.js'));

const fehler = [];
const pruefe = (name, bedingung, hinweis) => { if (!bedingung) fehler.push(`${name}\n    ${hinweis}`); };

const zeile = (ueber) => Object.assign({
  jahr: 2026, steuerpflichtig_cents: 0, ausgenommen_cents: 0,
  erloes_45a_cents: 0, erloes_klinik_cents: 0, erloes_reisen_cents: 0, sonstige_cents: 0,
  eingaenge_ohne_konto: 0, rechnungen_ohne_konto: 0, rechnungen_offen: 0,
  rechnungen_bezahlt_ohne_kontozeile: 0,
  grenze_laufend_cents: 2500000, grenze_vorjahr_cents: 2500000, vorjahr_steuerpflichtig_cents: null
}, ueber);

// 1 — Stand vom 07.10.2026
let s = UA.stand(zeile({ steuerpflichtig_cents: 2129194 }));
pruefe('85 % ist gelb', s.prozent === 85 && s.farbe === 'gelb' && !s.ueberschritten, JSON.stringify(s));

// 2 — Kanten
pruefe('76 % ist gruen', UA.stand(zeile({ steuerpflichtig_cents: 1900000 })).farbe === 'gruen', '');
pruefe('genau 80 % ist gelb', UA.stand(zeile({ steuerpflichtig_cents: 2000000 })).farbe === 'gelb', '');
s = UA.stand(zeile({ steuerpflichtig_cents: 2500000 }));
pruefe('genau 100 % ist rot', s.farbe === 'rot' && s.ueberschritten === true, JSON.stringify(s));

// 3 — Vorjahr
s = UA.stand(zeile({}));
pruefe('ohne Vorjahr kein Vorjahresblock', s.vorjahr === null, JSON.stringify(s.vorjahr));
s = UA.stand(zeile({ jahr: 2027, grenze_laufend_cents: 10000000, steuerpflichtig_cents: 100000,
                     vorjahr_steuerpflichtig_cents: 2600000 }));
pruefe('Vorjahr ueber der Grenze macht rot', s.farbe === 'rot' && s.vorjahr && s.vorjahr.prozent === 104,
  JSON.stringify(s));
pruefe('laufendes Jahr bleibt dabei gruen', s.farbeLaufend === 'gruen', JSON.stringify(s));

// 4 — Warnungen
s = UA.stand(zeile({ eingaenge_ohne_konto: 1, rechnungen_offen: 2 }));
pruefe('Eingang ohne Konto wird gewarnt', s.warnungen.some(w => /1 Eingang ohne Erlöskonto/.test(w)),
  JSON.stringify(s.warnungen));
pruefe('offene Rechnungen werden gewarnt',
  s.warnungen.some(w => w === '2 Rechnungen ohne Zahlungseingang – nicht in der Summe'),
  JSON.stringify(s.warnungen));
pruefe('ohne Luecken keine Warnung', UA.stand(zeile({})).warnungen.length === 0, '');

// 5 — Summen je Konto werden durchgereicht
s = UA.stand(zeile({ erloes_reisen_cents: 2114194, erloes_klinik_cents: 15000, sonstige_cents: 26150 }));
const reisen = s.jeKonto.find(k => k.wert === 'erloes_reisen');
pruefe('Summe je Konto', reisen && reisen.cents === 2114194 && s.jeKonto.length === 4, JSON.stringify(s.jeKonto));

// 6 — keine Zeile
pruefe('ohne Zeile leer', UA.stand(null).leer === true, '');

// 7 — Konten und Namen
pruefe('vier Konten', UA.KONTEN.map(k => k.wert).join() === 'erloes_45a,erloes_klinik,erloes_reisen,sonstige',
  UA.KONTEN.map(k => k.wert).join());
pruefe('Name 45a', UA.kontoName('erloes_45a') === 'Erlöse 45a (steuerfrei)', UA.kontoName('erloes_45a'));
pruefe('Name ohne Konto', UA.kontoName(null) === 'ohne Konto', UA.kontoName(null));

if (fehler.length) { console.error('FEHLER:\n- ' + fehler.join('\n- ')); process.exit(1); }
console.log('USt-Ampel: alle Pruefungen bestanden.');
