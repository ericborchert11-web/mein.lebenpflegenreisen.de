/**
 * Vertrag vor Ort — PDF im Browser, ohne Netz.
 *
 * html2pdf liegt im Repo (vendor/, gleiche Datei wie das CDN-Original,
 * SHA-512 = HTML2PDF_SRI in app.js), die Schriften unter fonts/. Beides
 * muss geladen sein, BEVOR das Netz weg ist — die Seite ruft vorbereiten()
 * beim Oeffnen auf.
 *
 * Kopf- und Fusszeile (Pflichtangaben, "Seite x von y") setzt jsPDF nach dem
 * Rastern auf jede Seite; html2pdf kennt keine Randboxen. Solange das Gate
 * zu ist, steht auf JEDER Seite zusaetzlich "ENTWURF".
 */
(function (global) {
  'use strict';

  var H2P_SRC = 'vendor/html2pdf-0.14.0.bundle.min.js';
  var _laden = null;

  function ladeSkript() {
    if (global.html2pdf) return Promise.resolve(global.html2pdf);
    if (_laden) return _laden;
    _laden = new Promise(function (ok, nein) {
      var s = document.createElement('script');
      s.src = H2P_SRC;
      s.onload = function () { global.html2pdf ? ok(global.html2pdf) : nein(new Error('html2pdf fehlt nach dem Laden.')); };
      s.onerror = function () { _laden = null; nein(new Error('Die PDF-Bibliothek konnte nicht geladen werden.')); };
      document.head.appendChild(s);
    });
    return _laden;
  }

  /** Alle Schnitte laden, die das Dokument braucht — sonst rastert html2canvas Ersatzschrift. */
  function ladeSchriften() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    var schnitte = ['800 10pt "VV Bricolage"', '700 10pt "VV Bricolage"',
      '400 10pt "VV Instrument"', '500 10pt "VV Instrument"', '600 10pt "VV Instrument"', '700 10pt "VV Instrument"'];
    return Promise.all(schnitte.map(function (s) { return document.fonts.load(s); }));
  }

  function vorbereiten() { return Promise.all([ladeSkript(), ladeSchriften()]); }

  /**
   * html: Ergebnis von VertragVorort.paketHtml/kvHtml.
   * opt: { verein, entwurf: bool, kennung: 'Vertrags-Nr. …' }
   * Liefert ein Blob (application/pdf).
   */
  async function erzeugen(html, opt) {
    var h2p = (await vorbereiten())[0];
    var v = opt.verein;
    var wirt = document.createElement('div');
    wirt.innerHTML = html;
    var el = wirt.firstElementChild;

    var arbeiter = h2p().set({
      // Innenmass in GANZEN CSS-Pixeln (660 × 975 px = 174,625 × 257,969 mm).
      // Bei krummen Pixeln (176 mm = 665,2 px) verschiebt html2pdf den Schnitt
      // von Seite zu Seite, und unten wird eine Zeile halbiert (gesehen 24.11.2026).
      margin: [17, 17.6875, 22.03125, 17.6875],
      image: { type: 'jpeg', quality: 0.92 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css'], avoid: ['.vv-opt', '.vv-optin', '.vv-sig', '.vv-block', '.vv-wirkt',
        '.vv-feld', '.vv-entwurf', '.vv-titel', '.vv-schluss', 'li', 'tr', 'p', 'h2'] }
    }).from(el).toPdf();

    var pdf = await arbeiter.get('pdf');
    var n = pdf.internal.getNumberOfPages();
    var fuss = v.name.replace('e.V.', 'e. V.') + ' · ' + v.strasse + ' · ' + v.ort + ' · '
      + v.register + ' · ' + v.email;
    for (var i = 1; i <= n; i++) {
      pdf.setPage(i);
      pdf.setFont('helvetica', 'normal');
      pdf.setDrawColor(232, 228, 220);
      pdf.setLineWidth(0.2);
      pdf.line(17, 283, 193, 283);
      pdf.setFontSize(6.6);
      pdf.setTextColor(139, 137, 127);
      pdf.text(fuss, 17, 287);
      pdf.text((opt.kennung ? opt.kennung + ' · ' : '') + 'Seite ' + i + ' von ' + n, 193, 291, { align: 'right' });
      if (i > 1) {
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(8);
        pdf.setTextColor(26, 58, 42);
        pdf.text('»  Leben Pflegen Reisen e. V.', 17, 11);
        pdf.line(17, 13, 193, 13);
      }
      if (opt.entwurf) {
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(9);
        pdf.setTextColor(179, 38, 30);
        pdf.text('ENTWURF – nicht freigegeben', 193, 11, { align: 'right' });
      }
    }
    return pdf.output('blob');
  }

  global.VertragVorortPdf = { vorbereiten: vorbereiten, erzeugen: erzeugen };
})(typeof window !== 'undefined' ? window : this);
