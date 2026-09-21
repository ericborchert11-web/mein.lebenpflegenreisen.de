/**
 * Kassenbuch — Leser fuer den CSV-Export des Vereinskontos (Sparkasse).
 *
 * Diese Datei kennt weder Supabase noch das DOM. Sie laeuft im Browser und in
 * Node, damit der Leser ohne Login und ohne Datenbank pruefbar ist:
 *   node scripts/pruefe-kassenbuch-csv.mjs
 *
 * ZEICHENSATZ: Die Datei der Sparkasse ist ISO-8859-1, nicht UTF-8. Das
 * Umwandeln passiert beim Einlesen (FileReader.readAsText(datei,
 * 'ISO-8859-1')), nicht hier — hier kommt fertiger Text an. Mit UTF-8 gelesen
 * wird aus "Schroeder" mit oe-Umlaut ein "Schrder", und das faellt erst auf,
 * wenn die Namen schon in der Datenbank stehen.
 */
(function () {
  'use strict';

  // Spalten, auf die wir uns verlassen. Fehlt eine davon, ist es nicht der
  // erwartete Export — dann lieber abbrechen als still 0 Zeilen liefern.
  var PFLICHTSPALTEN = ['Buchungstag', 'Betrag', 'Verwendungszweck',
                        'Beguenstigter/Zahlungspflichtiger'];

  /**
   * Zerlegt CSV-Text in ein Feld-Raster. Zeichen fuer Zeichen, weil der
   * Verwendungszweck Semikolons enthaelt ("Aufwandsentschaedigung; Teil 1")
   * und ein split(';') die Zeile dort zerreissen wuerde.
   */
  function zerlege(text, trenner) {
    var zeilen = [], feld = '', zeile = [], inAnfuehrung = false, i;
    for (i = 0; i < text.length; i++) {
      var z = text[i];
      if (inAnfuehrung) {
        if (z === '"') {
          if (text[i + 1] === '"') { feld += '"'; i++; }   // "" ist ein echtes "
          else inAnfuehrung = false;
        } else feld += z;
        continue;
      }
      if (z === '"') { inAnfuehrung = true; continue; }
      if (z === trenner) { zeile.push(feld); feld = ''; continue; }
      if (z === '\n' || z === '\r') {
        if (z === '\r' && text[i + 1] === '\n') i++;
        zeile.push(feld); feld = '';
        if (zeile.length > 1 || zeile[0] !== '') zeilen.push(zeile);
        zeile = [];
        continue;
      }
      feld += z;
    }
    zeile.push(feld);
    if (zeile.length > 1 || zeile[0] !== '') zeilen.push(zeile);
    return zeilen;
  }

  /** "-1.234,56" → -123456. Punkte sind Tausender, Komma ist das Komma. */
  function centsAusText(s) {
    var roh = String(s || '').trim().replace(/\./g, '').replace(',', '.');
    if (!roh || isNaN(Number(roh))) return null;
    return Math.round(Number(roh) * 100);
  }

  /** "21.09.26" → "2026-09-21". Zweistellige Jahre sind 20xx. */
  function isoDatum(s) {
    var m = String(s || '').trim().match(/^(\d{2})\.(\d{2})\.(\d{2}|\d{4})$/);
    if (!m) return null;
    var jahr = m[3].length === 2 ? '20' + m[3] : m[3];
    return jahr + '-' + m[2] + '-' + m[1];
  }

  /**
   * Der Fingerabdruck schuetzt gegen doppelten Import derselben Datei.
   *
   * Bewusst KEIN Hash: crypto.subtle gibt es nur asynchron und nur in
   * sicheren Kontexten, und ein Textschluessel laesst sich in der Datenbank
   * lesen und von Hand vergleichen. Der Verwendungszweck gehoert hinein, weil
   * an einem Tag mehrere gleich hohe Betraege an dieselbe Person gehen
   * koennen — am 21.09.2026 viermal 150,00 EUR an dieselbe Ehrenamtliche.
   */
  function fingerabdruck(z) {
    return [z.konto_iban, z.buchungstag, z.betrag_cents,
            (z.verwendungszweck || '').replace(/\s+/g, ' ').trim(),
            (z.gegenpartei || '').trim()].join('|');
  }

  /**
   * Liest den Export und gibt die gebuchten Umsaetze zurueck.
   *
   * Vorgemerkte Umsaetze bleiben draussen: sie aendern sich noch (Betrag,
   * Verwendungszweck) und kaemen nach dem Buchen als zweite Zeile mit anderem
   * Fingerabdruck wieder — also als Dublette, die niemand als solche erkennt.
   *
   * Die IBAN der Gegenseite wird NICHT uebernommen. Sie steht in jeder Zeile,
   * fuer die Kassenpruefung braucht sie niemand, und sie wuerde die
   * Kontonummern aller Ehrenamtlichen in eine weitere Tabelle tragen.
   */
  function parseSparkasseCsv(text) {
    var raster = zerlege(String(text || ''), ';');
    if (!raster.length) throw new Error('Die Datei ist leer.');

    var kopf = raster[0].map(function (s) { return String(s).trim(); });
    var fehlend = PFLICHTSPALTEN.filter(function (s) { return kopf.indexOf(s) < 0; });
    if (fehlend.length) {
      throw new Error('Das sieht nicht nach dem Kontoauszug aus — es fehlen die Spalten: '
        + fehlend.join(', ') + '.');
    }
    var spalte = {};
    kopf.forEach(function (name, i) { spalte[name] = i; });
    var hol = function (zeile, name) {
      return spalte[name] === undefined ? '' : String(zeile[spalte[name]] || '').trim();
    };

    var ergebnis = [];
    for (var r = 1; r < raster.length; r++) {
      var zl = raster[r];
      if (!zl.length || zl.every(function (f) { return String(f).trim() === ''; })) continue;

      var info = hol(zl, 'Info');
      if (info && !/gebucht/i.test(info)) continue;

      var cents = centsAusText(hol(zl, 'Betrag'));
      var tag   = isoDatum(hol(zl, 'Buchungstag'));
      if (cents === null || !tag) continue;

      var eintrag = {
        konto_iban:        hol(zl, 'Auftragskonto'),
        buchungstag:       tag,
        valuta:            isoDatum(hol(zl, 'Valutadatum')) || tag,
        buchungstext:      hol(zl, 'Buchungstext'),
        // Mehrzeilige Zwecke kommen als ein Feld mit Umbruechen an.
        verwendungszweck:  hol(zl, 'Verwendungszweck').replace(/\s+/g, ' ').trim(),
        gegenpartei:       hol(zl, 'Beguenstigter/Zahlungspflichtiger'),
        betrag_cents:      cents
      };
      eintrag.fingerabdruck = fingerabdruck(eintrag);
      ergebnis.push(eintrag);
    }
    return ergebnis;
  }

  var KassenbuchCSV = {
    parseSparkasseCsv: parseSparkasseCsv,
    fingerabdruck: fingerabdruck,
    centsAusText: centsAusText,
    isoDatum: isoDatum
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = KassenbuchCSV;
  else if (typeof window !== 'undefined') window.KassenbuchCSV = KassenbuchCSV;
})();
