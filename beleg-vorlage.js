// Einzige Wahrheitsquelle für den Antrags-/Auszahlungsbeleg.
// Wird an drei Stellen geladen: von abrechnung.html im Browser, von der Edge
// Function claim-mails über die öffentliche URL und von den Prüfskripten in
// Node. Deshalb ohne Modulsyntax, ohne DOM-Zugriff und ohne Abhängigkeit auf
// app.js — alles, was der Beleg braucht, kommt als Argument herein.
//
// WARUM überhaupt eine eigene Datei: die gemailte Fassung landet beim
// Finanzamt. Zwei Fassungen, die auseinanderdriften, wären ein Beleg-Problem,
// kein Schönheitsfehler. Deshalb baut nur noch diese Funktion den Beleg.
(function (global) {
  'use strict';

  // Jahresfreibeträge nach EStG, Stand 2026.
  var FREIBETRAG = { '26': 3300, '26a': 960 };

  // Eigene Escape-Funktion statt DOM-Trick: in Deno gibt es kein document.
  function escape(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function eur(n) {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Number(n) || 0);
  }

  function datum(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function zeitraum(start, end) {
    var s = datum(start);
    var e = datum(end);
    return start === end ? s : (s + ' – ' + e);
  }

  // IBAN in Vierergruppen, ungekürzt — nur für die Antragsbestätigung.
  function ibanLesbar(iban) {
    var s = String(iban || '').replace(/\s+/g, '').toUpperCase();
    if (!s) return '—';
    return s.replace(/(.{4})/g, '$1 ').trim();
  }

  // Auf dem Auszahlungsbeleg reicht die Prüfziffer vorn und die letzten vier
  // Stellen — der Beleg wird per Mail verschickt und ausgedruckt weitergereicht.
  function maskIban(iban) {
    var s = String(iban || '').replace(/\s+/g, '').toUpperCase();
    if (s.length < 8) return '—';
    return s.slice(0, 4) + ' •••• •••• ' + s.slice(-4);
  }

  function jahr(iso) {
    var d = iso ? new Date(iso) : new Date();
    if (isNaN(d.getTime())) d = new Date();
    return d.getFullYear();
  }

  function belegHtml(d) {
    d = d || {};
    var c = d.claim || {};
    var person = d.person || {};
    var verein = d.verein || {};
    var jahresSumme = Number(d.jahresSumme) || 0;

    var isSitz = c.source_type === 'sitzwache';
    var breakdown = c.amount_breakdown || [];
    var isNewFormat = breakdown[0] && breakdown[0].label !== undefined;

    var positionsHtml = '';
    var columnsHeader = '';
    var totalColspan = isSitz ? 1 : 3;
    var i, row, b;

    if (isSitz) {
      columnsHeader = '<tr><th>Position</th><th class="num">Betrag</th></tr>';
    } else {
      columnsHeader = '<tr><th>Position</th><th class="num">Anzahl</th><th class="num">Satz</th><th class="num">Betrag</th></tr>';
    }

    if (!breakdown.length) {
      // Nacherfassung durch den Vorstand: es gibt keine Positionen, weil der
      // Antrag nicht über das Formular kam. Der Beleg braucht trotzdem eine
      // Zeile, sonst steht die Summe allein in der Tabelle.
      positionsHtml = '<tr><td colspan="' + totalColspan + '">Aufwandsentschädigung (Nacherfassung durch den Vorstand)</td>'
        + '<td class="num">' + eur(c.amount) + '</td></tr>';
    } else if (isSitz) {
      if (isNewFormat) {
        for (i = 0; i < breakdown.length; i++) {
          row = breakdown[i];
          var dateStr = row.date ? datum(row.date) : '';
          var positionLabel = row.label + (dateStr ? ' (' + dateStr + ')' : '');
          positionsHtml += '<tr><td>' + escape(positionLabel) + '</td><td class="num">' + eur(row.amount) + '</td></tr>';
        }
      } else {
        b = breakdown[0];
        var shiftLabel = ({ morning: 'Frühdienst', afternoon: 'Spätdienst', night: 'Nachtdienst' })[b.schicht] || b.schicht || '';
        var sitzDate = b.datum ? datum(b.datum) : '';
        positionsHtml = '<tr><td>Sitzwache ' + escape(shiftLabel) + (sitzDate ? ' (' + sitzDate + ')' : '')
          + '</td><td class="num">' + eur(b.summe || c.amount) + '</td></tr>';
      }
    } else {
      if (isNewFormat) {
        for (i = 0; i < breakdown.length; i++) {
          row = breakdown[i];
          var anzahl = row.factor != null ? (row.count != null ? row.count : row.factor) : '–';
          var satz = row.base != null ? eur(row.base) : '';
          positionsHtml += '<tr><td>' + escape(row.label) + '</td><td class="num">' + escape(anzahl)
            + '</td><td class="num">' + satz + '</td><td class="num">' + eur(row.amount) + '</td></tr>';
        }
      } else {
        // Altformat aus der ersten Portal-Fassung: nur Tagessatz und Tageszahl.
        b = breakdown[0] || {};
        var perDay = Number(b.satz || 0);
        var ganze = Number(b.ganze_tage || 0);
        positionsHtml = '<tr><td>Anreisetag (halber Tag)</td><td class="num">0,5</td><td class="num">' + eur(perDay) + '</td><td class="num">' + eur(perDay / 2) + '</td></tr>'
          + (ganze > 2 ? '<tr><td>Volltage</td><td class="num">' + (ganze - 2) + '</td><td class="num">' + eur(perDay) + '</td><td class="num">' + eur((ganze - 2) * perDay) + '</td></tr>' : '')
          + '<tr><td>Abreisetag (halber Tag)</td><td class="num">0,5</td><td class="num">' + eur(perDay) + '</td><td class="num">' + eur(perDay / 2) + '</td></tr>';
      }
    }

    var aktivitaet = isSitz ? 'Ehrenamtliche Sitzwache' : 'Ehrenamtliche Reisebegleitung';

    var isPaid = c.status === 'paid';
    var art = c.pauschale_art === '26a' ? '26a' : '26';
    var limit = FREIBETRAG[art];
    var paragraf = art === '26a'
      ? '§ 3 Nr. 26a EStG (Ehrenamtspauschale)'
      : '§ 3 Nr. 26 EStG (Übungsleiterpauschale)';
    var anlage = art === '26a' ? 'Anlage N bzw. Anlage S' : 'Anlage N';

    var belegTitle = isPaid ? 'Auszahlungsbeleg' : 'Antragsbestätigung';
    var nrBlock = isPaid
      ? 'Beleg-Nr. <strong>' + escape(c.beleg_nr || '—') + '</strong><br>Auszahlung am ' + datum(c.paid_at)
      : 'Antrag-ID <strong>' + escape(String(c.id || '').substring(0, 8).toUpperCase()) + '</strong><br>Eingereicht am ' + datum(c.submitted_at);
    var ibanShown = isPaid ? maskIban(person.iban) : ibanLesbar(person.iban);

    // Jahressummen-Balken nur auf dem Auszahlungsbeleg. Die Summe rechnet der
    // Aufrufer aus — der Beleg kennt nur diesen einen Antrag.
    var yearBar = '';
    if (isPaid) {
      var yr = jahr(c.paid_at);
      var pct = Math.min(100, limit ? (jahresSumme / limit) * 100 : 0);
      var over = jahresSumme > limit;
      yearBar = '<div class="beleg-block" style="grid-column:1/-1;margin-top:4px"><h4>Freibetrag ' + yr + ' bei ' + escape(verein.name) + '</h4>'
        + '<div style="background:#EDE8DB;border-radius:6px;height:14px;overflow:hidden;margin:6px 0"><div style="height:100%;width:' + pct.toFixed(0) + '%;background:' + (over ? '#C0392B' : '#2E7D46') + '"></div></div>'
        + '<p style="font-size:14px">' + eur(jahresSumme) + ' von ' + eur(limit) + ' ausgeschöpft' + (over ? ' <strong style="color:#C0392B">— Freibetrag überschritten</strong>' : '') + '</p>'
        + '<p class="muted" style="font-size:13px">Diese Übersicht zählt nur Zahlungen von ' + escape(verein.name) + '. Gleichartige Vergütungen anderer Vereine oder Auftraggeber musst du selbst hinzurechnen.</p></div>';
    }

    var declBlock;
    if (isPaid) {
      // Wortlaut vom Vorstand am 19.08.2026 freigegeben — kein Entwurf mehr.
      declBlock = '<div class="beleg-declaration"><h4>Steuerlicher Hinweis</h4><ul>'
        + '<li>Diese Zahlung ist eine Aufwandsentschädigung nach <strong>' + escape(paragraf)
        + '</strong> für eine nebenberufliche, pflegerisch-betreuende Tätigkeit im ideellen '
        + 'Bereich eines gemeinnützigen Vereins. Sie ist <strong>kein Arbeitslohn und kein '
        + 'Honorar</strong>.</li>'
        + '<li>Sie ist <strong>bis ' + eur(limit) + ' im Kalenderjahr steuer- und '
        + 'sozialversicherungsfrei</strong>. Der Freibetrag gilt <strong>einmal pro Person '
        + 'und Jahr über alle Vereine und Auftraggeber hinweg</strong> — ' + escape(verein.name)
        + ' kennt nur die hier gezahlten Beträge (in diesem Jahr: ' + eur(jahresSumme)
        + ' von ' + eur(limit) + ').</li>'
        + '<li><strong>Gib diese Zahlung in deiner Einkommensteuererklärung an.</strong> '
        + 'Steuerfreie Aufwandsentschädigungen nach ' + escape(paragraf) + ' werden in der '
        + '<strong>' + anlage + '</strong> eingetragen. Steuer fällt nur auf den Teil an, der '
        + 'den Jahresfreibetrag übersteigt. <strong>Bewahre diesen Beleg auf</strong> und lege '
        + 'ihn auf Nachfrage des Finanzamts vor.</li>'
        + '<li>Beträge über dem Freibetrag sind von dir zu versteuern und können '
        + 'sozialversicherungspflichtig sein. Die Auszahlung erfolgt auf Grundlage deiner '
        + 'Selbstauskunft im Antrag; für Richtigkeit und Vollständigkeit bist du selbst '
        + 'verantwortlich.</li>'
        + '<li>Dieser Beleg ersetzt keine Steuerberatung. Der Verein übernimmt keine Haftung '
        + 'für die individuelle steuerliche oder sozialversicherungsrechtliche Behandlung; bei '
        + 'Fragen wende dich an dein Finanzamt oder eine Steuerberatung. Die Antragsunterlagen '
        + 'werden beim Verein zehn Jahre aufbewahrt (§ 147 AO, Art. 6 Abs. 1 lit. c DSGVO).</li>'
        + '</ul>'
        + (c.notes ? '<p class="muted"><strong>Anmerkung:</strong> ' + escape(c.notes) + '</p>' : '')
        + '</div>';
    } else {
      declBlock = '<div class="beleg-declaration"><h4>Erklärungen der/des Ehrenamtlichen</h4><ul><li>Die angegebenen Zeiten und Tätigkeiten wurden tatsächlich und in der genannten Form erbracht.</li><li>Die Tätigkeit wird nebenberuflich ausgeübt (nicht mehr als ein Drittel einer vergleichbaren Vollzeittätigkeit).</li><li>Die Übungsleiterpauschale nach § 3 Nr. 26 EStG wurde im laufenden Kalenderjahr nicht anderweitig so in Anspruch genommen, dass der Jahresfreibetrag von 3.300 € überschritten wird.</li><li>Der/die Ehrenamtliche wurde über die Verarbeitung und zehnjährige Aufbewahrung der Angaben gemäß § 147 AO informiert (Art. 6 Abs. 1 lit. c DSGVO).</li></ul>' + (c.notes ? '<p class="muted"><strong>Anmerkung:</strong> ' + escape(c.notes) + '</p>' : '') + '</div>';
    }

    var footInfo = isPaid
      ? 'Status: ausgezahlt · Auszahlung am ' + datum(c.paid_at) + (c.approved_at ? ' · Freigegeben am ' + datum(c.approved_at) : '')
      : 'Status: ' + escape(c.status) + (c.submitted_to_payroll_at ? ' · An Buchhaltung gesendet am ' + datum(c.submitted_to_payroll_at) : '');

    return '<div class="beleg-head"><div><div class="beleg-logo-name">' + escape(verein.name) + '</div><div class="beleg-logo-sub">' + escape(verein.adresse) + '</div></div><div class="beleg-nr">' + nrBlock + '</div></div>'
      + '<div class="beleg-title">' + belegTitle + '</div>'
      + '<div class="beleg-subtitle">Aufwandsentschädigung · ' + escape(paragraf) + ' · steuer- und sozialversicherungsfrei bis ' + eur(limit) + ' pro Jahr</div>'
      + '<div class="beleg-grid"><div class="beleg-block"><h4>Empfänger:in</h4><p><strong>' + escape(person.full_name || '') + '</strong><br>' + escape(person.email || '') + '<br>IBAN: ' + escape(ibanShown) + '</p></div><div class="beleg-block"><h4>Auszahlender Verein</h4><p><strong>' + escape(verein.name) + '</strong><br>' + escape(verein.adresse) + '<br>' + escape(verein.register) + '<br>Vertreten durch den Vorstand<br>(Gemeinnütziger Verein i.S.d. § 52 AO)</p></div><div class="beleg-block"><h4>Tätigkeit</h4><p>' + aktivitaet + '<br><span class="muted">pflegerisch-betreuende Tätigkeit im ideellen Bereich des Vereins</span></p></div><div class="beleg-block"><h4>Zeitraum</h4><p><strong>' + zeitraum(c.period_start, c.period_end) + '</strong></p></div>' + yearBar + '</div>'
      + '<table class="beleg-table"><thead>' + columnsHeader + '</thead><tbody>' + positionsHtml + '<tr class="beleg-total-row"><td colspan="' + totalColspan + '">Summe Aufwandsentschädigung</td><td class="num">' + eur(c.amount) + '</td></tr></tbody></table>'
      + declBlock
      + '<div class="beleg-foot"><p class="muted">' + footInfo + ' · Vereinsbeschluss vom ' + datum(d.beschlussDatum) + '</p></div>';
  }

  global.LPRBeleg = { belegHtml: belegHtml, FREIBETRAG: FREIBETRAG };
})(typeof globalThis !== 'undefined' ? globalThis : window);
