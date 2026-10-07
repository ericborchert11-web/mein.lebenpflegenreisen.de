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

st = { schritt: 2, kennenlernen_am: '2026-10-10', bzr_beantragt_am: '2026-10-10', bzr_ok: false };
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

if (fehler.length) { console.error(`✗ ${fehler.length} Fehler:\n  ` + fehler.join('\n  ')); process.exit(1); }
console.log('✓ Onboarding-Schritte: alle Faelle bestanden');
