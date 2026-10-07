/**
 * Kleinunternehmer-Ampel (§ 19 UStG) — der Stand eines Jahres aus einer Zeile
 * der Sicht v_ust_umsatz.
 *
 * Ohne DOM und ohne Supabase, damit die Schwellen ohne Login pruefbar sind:
 *   node scripts/pruefe-ust-ampel.mjs
 *
 * Gerechnet wird hier NICHT, welcher Umsatz zaehlt — das entscheidet die
 * Datenbank (Ist-Prinzip, Konto je Buchung). Hier wird nur bewertet und
 * beschriftet. Grenzen kommen aus der Zeile (app_settings), nie aus dem Code.
 */
(function () {
  'use strict';

  var KONTEN = [
    { wert: 'erloes_45a',    name: 'Erlöse 45a (steuerfrei)',          spalte: 'erloes_45a_cents' },
    { wert: 'erloes_klinik', name: 'Erlöse Klinik (steuerpflichtig)',  spalte: 'erloes_klinik_cents' },
    { wert: 'erloes_reisen', name: 'Erlöse Reisen',                    spalte: 'erloes_reisen_cents' },
    { wert: 'sonstige',      name: 'Sonstige Einnahmen',               spalte: 'sonstige_cents' }
  ];

  function kontoName(wert) {
    if (!wert) return 'ohne Konto';
    for (var i = 0; i < KONTEN.length; i++) if (KONTEN[i].wert === wert) return KONTEN[i].name;
    return String(wert);
  }

  // Briefing: gruen unter 80 %, gelb 80 bis unter 100 %, rot ab 100 %.
  function farbeFuer(anteil) { return anteil >= 1 ? 'rot' : anteil >= 0.8 ? 'gelb' : 'gruen'; }

  var RANG = { gruen: 0, gelb: 1, rot: 2 };
  function schlimmere(a, b) { return RANG[a] >= RANG[b] ? a : b; }

  function n(x) { return Number(x || 0); }

  function mehrzahl(anzahl, eins, viele) { return anzahl + ' ' + (anzahl === 1 ? eins : viele); }

  function stand(zeile) {
    if (!zeile) return { leer: true };
    var umsatz = n(zeile.steuerpflichtig_cents);
    var grenze = n(zeile.grenze_laufend_cents);
    var anteil = grenze ? umsatz / grenze : 0;
    var farbeLaufend = farbeFuer(anteil);

    // Das Vorjahr gibt es erst ab dem zweiten Jahr. Liegt es ueber der Grenze,
    // ist der Verein im laufenden Jahr gar kein Kleinunternehmer mehr — dann
    // ist die Ampel rot, egal wie ruhig das laufende Jahr aussieht.
    var vorjahr = null, farbe = farbeLaufend;
    if (zeile.vorjahr_steuerpflichtig_cents !== null && zeile.vorjahr_steuerpflichtig_cents !== undefined) {
      var vUmsatz = n(zeile.vorjahr_steuerpflichtig_cents);
      var vGrenze = n(zeile.grenze_vorjahr_cents);
      var vAnteil = vGrenze ? vUmsatz / vGrenze : 0;
      vorjahr = { jahr: n(zeile.jahr) - 1, umsatz_cents: vUmsatz, grenze_cents: vGrenze,
                  prozent: Math.floor(vAnteil * 100), farbe: farbeFuer(vAnteil) };
      farbe = schlimmere(farbeLaufend, vorjahr.farbe);
    }

    var warnungen = [];
    if (n(zeile.eingaenge_ohne_konto)) {
      warnungen.push(mehrzahl(n(zeile.eingaenge_ohne_konto), 'Eingang', 'Eingänge')
        + ' ohne Erlöskonto – nicht in der Summe');
    }
    if (n(zeile.rechnungen_ohne_konto)) {
      warnungen.push(mehrzahl(n(zeile.rechnungen_ohne_konto), 'Rechnung', 'Rechnungen')
        + ' ohne Erlöskonto');
    }
    if (n(zeile.rechnungen_offen)) {
      warnungen.push(mehrzahl(n(zeile.rechnungen_offen), 'Rechnung', 'Rechnungen')
        + ' ohne Zahlungseingang – nicht in der Summe');
    }
    if (n(zeile.rechnungen_bezahlt_ohne_kontozeile)) {
      warnungen.push(mehrzahl(n(zeile.rechnungen_bezahlt_ohne_kontozeile), 'Rechnung', 'Rechnungen')
        + ' als bezahlt markiert, aber ohne Kontozeile – nicht in der Summe');
    }

    return {
      leer: false,
      jahr: n(zeile.jahr),
      umsatz_cents: umsatz,
      grenze_cents: grenze,
      prozent: Math.floor(anteil * 100),
      farbeLaufend: farbeLaufend,
      farbe: farbe,
      ueberschritten: farbe === 'rot',
      ausgenommen_cents: n(zeile.ausgenommen_cents),
      vorjahr: vorjahr,
      jeKonto: KONTEN.map(function (k) { return { wert: k.wert, name: k.name, cents: n(zeile[k.spalte]) }; }),
      warnungen: warnungen
    };
  }

  var UstAmpel = { KONTEN: KONTEN, kontoName: kontoName, stand: stand };

  if (typeof module !== 'undefined' && module.exports) module.exports = UstAmpel;
  else if (typeof window !== 'undefined') window.UstAmpel = UstAmpel;
})();
