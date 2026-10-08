/**
 * Sammelrechnung — Abrechnungswochen (Montag bis Sonntag) und die Summe der
 * Vorschau.
 *
 * Ohne DOM und ohne Supabase, damit die Kanten ohne Login pruefbar sind:
 *   node scripts/pruefe-sammelrechnung.mjs
 *
 * Gerechnet wird auf Kalendertagen als 'JJJJ-MM-TT' in UTC-Mitte des Tages —
 * nie mit toISOString() auf lokaler Uhrzeit: In Berlin liefert das zwischen
 * 0 und 2 Uhr noch den Vortag, und die Woche verrutschte um einen Tag.
 * WAS abrechenbar ist, entscheidet die Datenbank (sammelrechnung_dienste).
 */
(function () {
  'use strict';

  function tag(iso) { return new Date(String(iso).slice(0, 10) + 'T12:00:00Z'); }
  function iso(d) { return d.toISOString().slice(0, 10); }
  function plus(isoDatum, tage) { var d = tag(isoDatum); d.setUTCDate(d.getUTCDate() + tage); return iso(d); }

  /** ISO-Kalenderwoche: die Woche mit dem ersten Donnerstag ist KW 1. */
  function kalenderwoche(isoDatum) {
    var d = tag(isoDatum);
    var wt = (d.getUTCDay() + 6) % 7;            // Montag = 0
    d.setUTCDate(d.getUTCDate() - wt + 3);       // Donnerstag derselben Woche
    var jan4 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4, 12));
    var wtJan4 = (jan4.getUTCDay() + 6) % 7;
    return 1 + Math.round((d - jan4) / 86400000 / 7 + (wtJan4 - 3) / 7);
  }

  function wocheVon(isoDatum) {
    var wt = (tag(isoDatum).getUTCDay() + 6) % 7;
    var von = plus(isoDatum, -wt);
    return { von: von, bis: plus(von, 6), kw: kalenderwoche(von) };
  }

  /** Die zuletzt abgeschlossene Woche — das, was montags abgerechnet wird. */
  function vorwoche(heuteIso) { return wocheVon(plus(wocheVon(heuteIso).von, -7)); }

  function verschiebe(woche, tage) { return wocheVon(plus(woche.von, tage)); }

  /** Summe der Vorschau. Bereits abgerechnete Dienste zaehlen nicht mit. */
  function zusammenfassung(dienste) {
    var z = { anzahl: 0, t1: 0, t2: 0, summe_cents: 0 };
    (dienste || []).forEach(function (d) {
      if (d.abgerechnet_auf) return;
      z.anzahl++;
      if (d.stufe === 'T1') z.t1++; else z.t2++;
      z.summe_cents += Number(d.preis_cents || 0);
    });
    return z;
  }

  var Sammelrechnung = { wocheVon: wocheVon, vorwoche: vorwoche, verschiebe: verschiebe,
                         kalenderwoche: kalenderwoche, zusammenfassung: zusammenfassung };

  if (typeof module !== 'undefined' && module.exports) module.exports = Sammelrechnung;
  else if (typeof window !== 'undefined') window.Sammelrechnung = Sammelrechnung;
})();
