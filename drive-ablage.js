/**
 * Drive-Ablage — Dateiname und Unterordner einer abgelegten Rechnung.
 *
 * Ohne DOM, ohne Supabase und ohne Google-Dienste, damit dieselbe Datei im
 * Portal, im Pruefskript (node scripts/pruefe-drive-ablage.mjs) und im
 * Google-Apps-Skript laeuft. Im Apps-Skript wird sie als eigene Datei
 * eingefuegt und haengt sich an globalThis.
 *
 * Gerechnet wird auf Kalendertagen 'JJJJ-MM-TT' in UTC-Mitte des Tages, wie in
 * sammelrechnung.js — nie mit lokaler Uhrzeit.
 */
(function (root) {
  'use strict';

  function tag(iso) { return new Date(String(iso).slice(0, 10) + 'T12:00:00Z'); }
  function zwei(n) { return (n < 10 ? '0' : '') + n; }

  /** ISO-Kalenderwoche: die Woche mit dem ersten Donnerstag ist KW 1. */
  function kalenderwoche(d) {
    var t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    var wt = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - wt);
    var jahresanfang = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil(((t - jahresanfang) / 86400000 + 1) / 7);
  }

  function montag(d) {
    var m = new Date(d.getTime());
    m.setUTCDate(m.getUTCDate() - ((m.getUTCDay() || 7) - 1));
    return m;
  }

  function monatOrdner(d) { return zwei(d.getUTCMonth() + 1) + '/' + zwei(d.getUTCFullYear() % 100); }

  /** Zeichen, die in Dateinamen Aerger machen, werden zu '-'; Leerraum zusammengefasst. */
  function sauber(s) {
    return String(s == null ? '' : s).replace(/[\/\\:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
  }

  function endung(pfad) {
    var m = /\.([A-Za-z0-9]+)$/.exec(String(pfad || ''));
    return m ? m[1].toLowerCase() : 'pdf';
  }

  /**
   * z = { art: 'rechnung'|'zeitnachweis', invoice_no, empfaenger, pfad }
   * 'RE-2026-0024 Sana Kliniken Berlin-Brandenburg GmbH.pdf' / 'RE-2026-0024 Zeitnachweis.pdf'
   */
  function dateiname(z) {
    var nr = sauber(z.invoice_no);
    if (z.art === 'zeitnachweis') return nr + ' Zeitnachweis.' + endung(z.pfad);
    var e = sauber(z.empfaenger);
    return (e ? nr + ' ' + e : nr) + '.pdf';
  }

  /**
   * z = { art: 'monat_kw'|'monat'|'jahr', service_to, invoice_date }
   * Liefert die Unterordner von oben nach unten, z. B. ['10/26', 'KW42'].
   * monat_kw: Montag der Woche von service_to (Nachtraege ziehen nur
   * service_from nach vorn). monat: service_to. jahr: Rechnungsdatum.
   */
  function unterordner(z) {
    var bezug = tag(z.service_to || z.invoice_date);
    if (z.art === 'monat_kw') {
      var mo = montag(bezug);
      return [monatOrdner(mo), 'KW' + zwei(kalenderwoche(mo))];
    }
    if (z.art === 'monat') return [monatOrdner(bezug)];
    return [String(tag(z.invoice_date || z.service_to).getUTCFullYear())];
  }

  var DriveAblage = { dateiname: dateiname, unterordner: unterordner };

  if (typeof module !== 'undefined' && module.exports) module.exports = DriveAblage;
  else root.DriveAblage = DriveAblage;
})(typeof globalThis !== 'undefined' ? globalThis : this);
