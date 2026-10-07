#!/usr/bin/env node
/**
 * Prueft die Schrittlogik des Onboardings an erfundenen Zustaenden.
 * Aufruf:  node scripts/pruefe-onboarding-schritte.mjs
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const OS = require(join(dirname(fileURLToPath(import.meta.url)), '..', 'onboarding-schritte.js'));

const fehler = [];
const pruefe = (name, bed, hinweis) => { if (!bed) fehler.push(`${name}\n    ${hinweis}`); };
const zustaende = (st) => OS.schritte(st).map(s => s.zustand).join(',');

let st = { schritt: 2 };
pruefe('frisch', zustaende(st) === 'erledigt,aktuell,offen,offen,offen,offen', zustaende(st));
pruefe('frisch: Verein am Zug', OS.aktueller(st).wartetAuf === 'verein', JSON.stringify(OS.aktueller(st)));
pruefe('frisch: Ausweis mitbringen', OS.aktueller(st).bringMit.includes('Personalausweis'), JSON.stringify(OS.aktueller(st).bringMit));

st = { schritt: 2, kennenlernen_am: '2026-10-10', bzr_beantragt_am: '2026-10-10', bzr_ok: false, heute: '2026-10-12' };
pruefe('BZR laeuft: Verein am Zug', OS.aktueller(st).wartetAuf === 'verein', OS.aktueller(st).text);
pruefe('BZR laeuft: Text nennt BZR', /BZR/.test(OS.aktueller(st).text), OS.aktueller(st).text);

st = { schritt: 3, antrag_status: null };
pruefe('Antrag offen: du bist dran', OS.aktueller(st).wartetAuf === 'dich' && OS.aktueller(st).aktion === 'antrag', JSON.stringify(OS.aktueller(st)));
st = { schritt: 3, antrag_status: 'eingereicht' };
pruefe('Antrag eingereicht: Verein', OS.aktueller(st).wartetAuf === 'verein' && !OS.aktueller(st).aktion, JSON.stringify(OS.aktueller(st)));
st = { schritt: 3, antrag_status: 'abgelehnt' };
pruefe('Antrag abgelehnt: neu einreichen', OS.aktueller(st).aktion === 'antrag', JSON.stringify(OS.aktueller(st)));

st = { schritt: 4 };
const b4 = OS.aktueller(st).bringMit.join('|');
pruefe('Schritt 4 bring mit', /Lebensmittelpass/.test(b4) && /Impfausweis/.test(b4) && /Erste-Hilfe/.test(b4), b4);

st = { schritt: 5 };
pruefe('Schritt 5 nennt halbe Pauschale', /halbe/.test(OS.aktueller(st).text), OS.aktueller(st).text);

st = { schritt: 6, abgeschlossen_am: null };
pruefe('alles da, Freischaltung offen', zustaende(st) === 'erledigt,erledigt,erledigt,erledigt,erledigt,aktuell' && OS.aktueller(st).wartetAuf === 'verein', zustaende(st));
st = { schritt: 6, abgeschlossen_am: '2026-11-01T10:00:00Z' };
pruefe('abgeschlossen', zustaende(st) === 'erledigt,erledigt,erledigt,erledigt,erledigt,erledigt' && OS.fertig(st), zustaende(st));

st = { schritt: null, bestand: true };
pruefe('Bestand gilt als fertig', OS.fertig(st), 'fertig() sollte true sein');

pruefe('Unterlagen frueh zeigen bis Schritt 4', OS.zeigeUnterlagen({ schritt: 2 }) && OS.zeigeUnterlagen({ schritt: 4 }) && !OS.zeigeUnterlagen({ schritt: 5 }), 'zeigeUnterlagen');

// Geplante Termine: Datum nach heute heisst "geplant", nicht erledigt.
const H = '2026-10-07';
st = { schritt: 2, kennenlernen_am: '2026-10-14', heute: H };
let a = OS.aktueller(st);
pruefe('Kennenlernen geplant: Datum mit Wochentag', a.text.includes('Dein Kennenlernen ist am Mittwoch, 14.10.2026.'), a.text);
pruefe('Kennenlernen geplant: du bist dran, Ausweis, termine', a.wartetAuf === 'dich' && a.bringMit.join() === 'Personalausweis' && a.aktion === 'termine', JSON.stringify(a));
pruefe('Kennenlernen geplant: BZR-Antrag erwaehnt', /BZR-Abfrage aus\./.test(a.text), a.text);
st = { schritt: 2, kennenlernen_am: '2026-10-07', heute: H };
pruefe('Kennenlernen heute: gilt als gewesen', /Danke fürs Kennenlernen/.test(OS.aktueller(st).text), OS.aktueller(st).text);
st = { schritt: 2, kennenlernen_am: '2026-10-01', heute: H };
pruefe('Kennenlernen vorbei: BZR laeuft', /Danke fürs Kennenlernen/.test(OS.aktueller(st).text) && OS.aktueller(st).wartetAuf === 'verein', OS.aktueller(st).text);
st = { schritt: 2, kennenlernen_am: '2099-01-01' };
pruefe('heute faellt auf das lokale Datum zurueck', /Dein Kennenlernen ist am Donnerstag, 01\.01\.2099\./.test(OS.aktueller(st).text), OS.aktueller(st).text);

st = { schritt: 4, einfuehrung_am: '2026-11-02', heute: H };
a = OS.aktueller(st);
pruefe('Einfuehrung geplant: Datum vorn', a.text.startsWith('Deine Einführungsveranstaltung ist am Montag, 02.11.2026. Melde dich'), a.text);
pruefe('Einfuehrung geplant: bring mit bleibt', a.bringMit.length === 3, JSON.stringify(a.bringMit));
st = { schritt: 4, einfuehrung_am: '2026-10-01', heute: H };
pruefe('Einfuehrung vorbei: Standardtext', OS.aktueller(st).text.startsWith('Melde dich'), OS.aktueller(st).text);

st = { schritt: 5, einarbeitung_am: '2026-12-31', heute: H };
a = OS.aktueller(st);
pruefe('Einarbeitung geplant', a.text === 'Dein Einarbeitungstag ist am Donnerstag, 31.12.2026. Für den Tag bekommst du die halbe Sitzwachen-Pauschale.' && a.wartetAuf === 'dich', JSON.stringify(a));
st = { schritt: 5, einarbeitung_am: '2026-02-28', heute: H };
pruefe('Einarbeitung vorbei: Standardtext', /^Fast geschafft/.test(OS.aktueller(st).text), OS.aktueller(st).text);
pruefe('Sonntag', OS.aktueller({ schritt: 5, einarbeitung_am: '2027-01-03', heute: H }).text.includes('Sonntag, 03.01.2027'), 'Wochentag Sonntag');
pruefe('Schaltjahr', OS.aktueller({ schritt: 5, einarbeitung_am: '2028-02-29', heute: H }).text.includes('Dienstag, 29.02.2028'), 'Wochentag Schaltjahr');

if (fehler.length) { console.error(`✗ ${fehler.length} Fehler:\n  ` + fehler.join('\n  ')); process.exit(1); }
console.log('✓ Onboarding-Schritte: alle Faelle bestanden');
