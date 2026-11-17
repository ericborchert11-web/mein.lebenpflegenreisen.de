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

  // Vereinsclaim, wie er auch über den Rechnungen steht (VEREIN.claim in
  // app.js). Hier als Vorgabewert hinterlegt, weil die Edge Function ihr
  // VEREIN-Objekt selbst mitbringt und app.js dort nicht existiert; wer den
  // Claim mitgibt, überschreibt ihn.
  var CLAIM = 'Menschen begleiten. Würde bewahren. Teilhabe ermöglichen.';

  // Eigene Escape-Funktion statt DOM-Trick: in Deno gibt es kein document.
  function escape(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function eur(n) {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Number(n) || 0);
  }

  // ── Datum: bewusst fest auf Europe/Berlin ───────────────────────────────────
  // Der Verein sitzt in Berlin und der Beleg ist ein deutsches Steuerdokument:
  // der Leistungszeitraum darauf muss deutsche Kalendertage nennen, egal wo die
  // Maschine steht, die ihn rendert (Browser des Mitglieds, Deno-Edge-Function
  // irgendwo auf der Welt, Node im Test). Bitte die Zeitzone nicht entfernen.
  //
  // Reine Datumsstrings ('2026-05-29') parst JS als UTC-Mitternacht. Jeder
  // negative Offset kippt die Anzeige dann einen Tag zurueck. Deshalb werden
  // sie auf 12:00 UTC gezogen — von dort aus liegt kein Offset der Welt ueber
  // der Datumsgrenze.
  function toDate(iso) {
    if (!iso) return null;
    var s = String(iso);
    var d = new Date(s.length <= 10 ? s + 'T12:00:00Z' : s);
    return isNaN(d.getTime()) ? null : d;
  }

  function datum(iso) {
    var d = toDate(iso);
    if (!d) return '—';
    return d.toLocaleDateString('de-DE', {
      day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin'
    });
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

  // Ebenfalls in Berliner Zeit — sonst rutscht der Freibetrags-Balken bei einer
  // Auszahlung dicht an Silvester ins falsche Kalenderjahr, und der Freibetrag
  // gilt pro Kalenderjahr.
  function jahr(iso) {
    var d = toDate(iso) || new Date();
    return Number(d.toLocaleDateString('de-DE', { year: 'numeric', timeZone: 'Europe/Berlin' }));
  }

  // ── Bezeichnung der Anreise-Position ────────────────────────────────────────
  // Bis zum 22.09.2026 hiess sie „Anreise mit dem eigenen Fahrzeug". Der Beleg
  // geht bei Ehrenamtlichen im Leistungsbezug ans Amt, und dieser Satz loest
  // dort eine Nachfrage nach den Fahrzeugpapieren aus — samt Meldepflicht fuer
  // ein Fahrzeug, mit dem die Erstattung gar nichts zu tun hat: gezahlt wird
  // der Preis der guenstigsten zumutbaren oeffentlichen Verbindung, kein
  // Kilometersatz. Der Beleg nennt deshalb nur noch die Fahrtkosten.
  //
  // Das ist ein Weglassen, keine Umdeutung: welches Verkehrsmittel es war,
  // steht unveraendert an claims.auslage_art und in der Vorstandsansicht.
  //
  // Alte Belege werden NICHT in der Datenbank umgeschrieben (GoBD: ein
  // gebuchter Satz bleibt stehen) — stattdessen traegt der Nachdruck die neue
  // Bezeichnung. Betrag, Beleg-Nr. und Rechenweg bleiben dieselben.
  function anreiseLabel(text) {
    return String(text === null || text === undefined ? '' : text)
      .replace(/^Anreise mit dem eigenen Fahrzeug/, 'Fahrtkosten Anreise');
  }

  // Stile des eingefrorenen Belegs (claims.beleg_html). Bis 17.11.2026 standen
  // sie nur als MAIL_CSS in der Edge Function claim-mails; jetzt hier, damit
  // die Vorschau im Vorstand genau das Blatt zeigt, das spaeter eingefroren
  // wird. Erklaerungen zu den Druckregeln (6-mm-Rand, eine Seite) stehen in
  // claim-mails bei MAIL_CSS.
  var BELEG_CSS = "body { font-family: -apple-system, Segoe UI, Helvetica, Arial, sans-serif; color: #1A1A18; line-height: 1.55; }\n  .beleg-wrap { max-width: 700px; margin: 0 auto; background: #fff; padding: 28px 30px; border: 1px solid #E4E2DC; border-radius: 12px; }\n  .beleg-claim { font-size: 13px; font-style: italic; color: #1A3A2A; border-top: 3px solid #C8F135; padding-top: 10px; margin-bottom: 18px; }\n  .beleg-head { border-bottom: 2px solid #2E7D46; padding-bottom: 14px; margin-bottom: 20px; }\n  .beleg-logo-name { font-weight: 800; font-size: 19px; color: #1A3A2A; }\n  .beleg-logo-sub { font-size: 11px; color: #6B6B65; letter-spacing: .1em; text-transform: uppercase; margin-top: 2px; }\n  .beleg-nr { font-family: monospace; font-size: 13px; color: #6B6B65; margin-top: 10px; }\n  .beleg-title { font-weight: 800; font-size: 25px; color: #1A3A2A; margin-bottom: 6px; }\n  .beleg-subtitle { color: #6B6B65; font-size: 14px; margin-bottom: 20px; }\n  .beleg-grid { margin: 20px 0; }\n  .beleg-block { margin-bottom: 16px; }\n  .beleg-block h4 { font-size: 11px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: #6B6B65; margin: 0 0 6px; }\n  .beleg-block p { margin: 0; font-size: 15px; line-height: 1.55; }\n  .beleg-table { width: 100%; border-collapse: collapse; margin: 18px 0; font-size: 14px; }\n  .beleg-table th, .beleg-table td { padding: 9px 10px; text-align: left; border-bottom: 1px solid #E4E2DC; }\n  .beleg-table th { color: #1A3A2A; font-weight: 700; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; }\n  .beleg-table td.num, .beleg-table th.num { text-align: right; font-family: monospace; }\n  .beleg-total-row { background: #F0F7DC; font-weight: 800; font-size: 16px; color: #1A3A2A; }\n  .beleg-declaration { background: #FAF8F3; border: 1.5px solid #E4E2DC; border-radius: 10px; padding: 16px 20px; margin-top: 20px; font-size: 13px; line-height: 1.65; }\n  .beleg-declaration h4 { font-size: 11px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: #2E7D46; margin: 0 0 8px; }\n  .beleg-declaration ul { margin: 0 0 0 18px; padding: 0; }\n  .beleg-declaration li { margin-bottom: 5px; }\n  .beleg-foot, .beleg-footer { margin-top: 20px; padding-top: 12px; border-top: 1px solid #E4E2DC; font-size: 12px; color: #6B6B65; }\n  .muted { color: #6B6B65; }\n  @media screen and (min-width: 520px) {\n    .beleg-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px 28px; }\n    .beleg-grid .beleg-block { margin-bottom: 0; }\n  }\n  @media print {\n    .beleg-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px 28px; }\n    .beleg-grid .beleg-block { margin-bottom: 0; }\n    @page { size: A4; margin: 6mm 0; }\n    body { background: #fff; margin: 0; }\n    .beleg-wrap { max-width: none; border: none; border-radius: 0; margin: 0; padding: 8mm 14mm; }\n    .beleg-claim { font-size: 11px; padding-top: 8px; margin-bottom: 10px; }\n    .beleg-head { padding-bottom: 9px; margin-bottom: 12px; }\n    .beleg-logo-name { font-size: 17px; }\n    .beleg-nr { font-size: 11px; margin-top: 6px; }\n    .beleg-title { font-size: 21px; margin-bottom: 3px; }\n    .beleg-subtitle { font-size: 11.5px; margin-bottom: 10px; }\n    .beleg-grid { gap: 10px 28px; margin: 10px 0; }\n    .beleg-block h4 { margin-bottom: 3px; }\n    .beleg-block p { font-size: 12px !important; line-height: 1.4; }\n    .beleg-block p.muted { font-size: 10.5px !important; }\n    .beleg-table { margin: 10px 0; font-size: 11.5px; }\n    .beleg-table th, .beleg-table td { padding: 4.5px 10px; }\n    .beleg-total-row { font-size: 13.5px; }\n    .beleg-declaration { font-size: 10px; line-height: 1.4; padding: 10px 14px; margin-top: 10px; }\n    .beleg-declaration li { margin-bottom: 1px; }\n    .beleg-foot, .beleg-footer { margin-top: 9px; padding-top: 6px; font-size: 9.5px; }\n    .beleg-declaration { page-break-inside: avoid; }\n    .beleg-table { page-break-inside: auto; }\n    .beleg-table tr { page-break-inside: avoid; }\n  }";

  // ── Ehrenamtspauschale (§ 3 Nr. 26a EStG), seit 17.11.2026 ──────────────────
  // Auszahlung fuer eine unterstuetzende Taetigkeit ohne Einsatz
  // (claims.source_type 'taetigkeit'), vom Vorstand erfasst. Der Beleg ist
  // derselbe wie bei der Uebungsleiterpauschale (Entscheidung Eric 17.11.2026),
  // nur mit Taetigkeit/Zweck statt Reise bzw. Sitzwache und der Rechtsgrundlage
  // § 3 Nr. 26a. Aendert sich sein Text, muss BELEG_26A_FASSUNG hochgezaehlt
  // und die neue Fassung von Sonja freigegeben werden (Tabelle
  // beleg_freigaben); bis dahin traegt das Blatt den Vermerk ENTWURF.
  var BELEG_26A_FASSUNG = '2026-11-17';

  function belegHtml(d) {
    d = d || {};
    var c = d.claim || {};
    var person = d.person || {};
    var verein = d.verein || {};
    var jahresSumme = Number(d.jahresSumme) || 0;

    var isSitz = c.source_type === 'sitzwache';
    // Dritte Herkunft seit Oktober 2026: der Einarbeitungstag aus dem
    // Onboarding. Er wird automatisch angelegt, hat weder Buchung noch Reise
    // und wird mit der halben Sitzwachen-Pauschale verguetet. Er ist KEINE
    // Reise — ohne diese Unterscheidung stuende "Reisebegleitung" auf dem Beleg.
    var isEinarbeitung = c.source_type === 'einarbeitung';
    // Auslagenersatz nach § 3 Nr. 50 EStG ist etwas anderes als eine
    // Aufwandsentschädigung: er ist steuerfrei und zählt NICHT gegen den
    // Übungsleiterfreibetrag. Deshalb bekommt er eine eigene Fassung des
    // Belegs — gleicher Rahmen, aber eigener Titel, eigener Hinweis und kein
    // Jahresbalken. Der Balken behauptete sonst eine Ausschöpfung, die es
    // nicht gibt, und der Beleg träfe eine falsche Aussage über die
    // Steuerpflicht. Antragsart und Unterart stehen an claims.kind bzw.
    // claims.auslage_art.
    var isAuslage = c.kind === 'auslage';
    var isTaetigkeit = c.source_type === 'taetigkeit';
    var breakdown = c.amount_breakdown || [];
    // Es gibt zwei amount_breakdown-Formate in der Datenbank, und alte Antraege
    // werden nicht migriert: ein Beleg muss zeigen, was zum Zeitpunkt der
    // Auszahlung galt. Das Altformat der ersten Portal-Fassung war eine einzige
    // Zusammenfassung ({ satz, ganze_tage } bzw. { schicht, datum, summe }), das
    // heutige Format eine Liste benannter Positionen. Unterschieden wird an
    // .label, weil nur das neue Format je Zeile einen Anzeigetext mitbringt.
    var isNewFormat = breakdown[0] && breakdown[0].label !== undefined;

    var positionsHtml = '';
    var i, row, b;

    // Zwei Spalten immer dann, wenn es weder Anzahl noch Satz zu zeigen gibt:
    // Sitzwachen rechnen mit Schichtpauschalen, und eine Nacherfassung durch
    // den Vorstand hat gar keine Positionen. Vorher standen in diesem Fall die
    // Kopfspalten „Anzahl“ und „Satz“ über leeren Zellen — im Ausdruck sieht
    // das aus, als fehle etwas am Beleg.
    var zweiSpaltig = isSitz || !breakdown.length;
    var totalColspan = zweiSpaltig ? 1 : 3;
    var columnsHeader = zweiSpaltig
      ? '<tr><th>Position</th><th class="num">Betrag</th></tr>'
      : '<tr><th>Position</th><th class="num">Anzahl</th><th class="num">Satz</th><th class="num">Betrag</th></tr>';

    if (!breakdown.length) {
      // Nacherfassung durch den Vorstand: es gibt keine Positionen, weil der
      // Antrag nicht über das Formular kam. Der Beleg braucht trotzdem eine
      // Zeile, sonst steht die Summe allein in der Tabelle.
      //
      // Bei einer Auslage darf dort NICHT „Aufwandsentschädigung" stehen: der
      // Hinweis zwei Absätze weiter sagt im ersten Punkt ausdrücklich, dass die
      // Zahlung keine ist (§ 3 Nr. 50 EStG statt § 3 Nr. 26 EStG). Bis zum
      // 22.09.2026 widersprachen sich Tabelle und Hinweis auf demselben Blatt.
      var nacherfasst = isAuslage
        ? (c.auslage_art === 'anreise' ? 'Fahrtkosten Anreise' : 'Erstattete Auslagen')
        : 'Aufwandsentschädigung';
      // Die Ehrenamtspauschale erfasst immer der Vorstand — dort ist das der
      // regulaere Weg, keine Nacherfassung.
      positionsHtml = '<tr><td colspan="' + totalColspan + '">'
        + (isTaetigkeit ? 'Aufwandsentschädigung (Ehrenamtspauschale)' : nacherfasst + ' (Nacherfassung durch den Vorstand)')
        + '</td><td class="num">' + eur(c.amount) + '</td></tr>';
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
          // Deutsches Komma: aus 0.5 wird 0,5 (bis 17.11.2026 stand "0.5" da).
          anzahl = String(anzahl).replace('.', ',');
          // Einarbeitungstag: Satz ist die volle Sitzwachen-Pauschale, gezahlt
          // wird die Haelfte — "1 × Satz = halber Betrag" saehe nach Rechenfehler
          // aus, deshalb steht hier der Faktor 0,5.
          if (isEinarbeitung && row.factor != null) anzahl = String(row.factor).replace('.', ',');
          var satz = row.base != null ? eur(row.base) : '';
          var posLabel = isAuslage ? anreiseLabel(row.label) : row.label;
          positionsHtml += '<tr><td>' + escape(posLabel) + '</td><td class="num">' + escape(anzahl)
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

    // Bei einer Auslage steht in diesem Block nicht die Tätigkeit, sondern die
    // Herkunft der Erstattung — die Überschrift wechselt deshalb mit (sonst
    // stünde dort "Tätigkeit: Erstattete Auslagen").
    //
    // Herkunft der Auslage — erstattet wird eine Ausgabe, nicht ein Einsatz.
    var aktivitaet, aktivitaetSub;
    if (isAuslage && c.source_type === 'verein') {
      // Vereinsauslage (seit 17.10.2026): eine Ausgabe, die jemand für den
      // Verein vorgestreckt hat, ohne an einer Reise angemeldet zu sein. Die
      // Reise steht nur als Anlass dabei, wenn eine angegeben ist — der
      // Titel kommt von außen (d.reiseTitel), weil der Antrag nur die id trägt.
      aktivitaet = 'Erstattete Auslagen';
      aktivitaetSub = 'Ausgabe für den Verein'
        + (d.reiseTitel ? ' · Reise „' + escape(d.reiseTitel) + '“' : '');
    } else if (isAuslage) {
      aktivitaet = 'Erstattete Auslagen';
      aktivitaetSub = c.auslage_art === 'anreise'
        ? 'Fahrtkosten der Anreise'
        : (c.auslage_art === 'beleg' ? 'Erstattung gegen eingereichten Nachweis' : '');
    } else if (isTaetigkeit) {
      aktivitaet = escape(c.taetigkeit || '');
      aktivitaetSub = (c.zweck ? 'Zweck: ' + escape(c.zweck) + '<br>' : '')
        + 'Ort: ' + escape(c.ort || 'Berlin') + ' · unterstützende Tätigkeit im ideellen Bereich des Vereins';
    } else {
      aktivitaet = isSitz ? 'Ehrenamtliche Sitzwache'
        : isEinarbeitung ? 'Einarbeitungstag (halbe Sitzwachen-Pauschale)'
        : 'Ehrenamtliche Reisebegleitung';
      aktivitaetSub = 'pflegerisch-betreuende Tätigkeit im ideellen Bereich des Vereins';
    }

    var isPaid = c.status === 'paid';
    var art = c.pauschale_art === '26a' ? '26a' : '26';
    // Ehrenamtspauschale: Freibetrag des Jahres aus steuer_freibetraege,
    // vom Aufrufer mitgegeben (d.freibetrag.cents). Die alten Belege rechnen
    // weiter mit FREIBETRAG.
    var limit = (isTaetigkeit && d.freibetrag && d.freibetrag.cents) ? Number(d.freibetrag.cents) / 100 : FREIBETRAG[art];
    var taetigkeitsArt = isTaetigkeit ? 'unterstützende' : 'pflegerisch-betreuende';
    var nichtFrei = isTaetigkeit ? (Number(c.nicht_steuerfrei_cents) || 0) / 100 : 0;
    var paragraf = art === '26a'
      ? '§ 3 Nr. 26a EStG (Ehrenamtspauschale)'
      : '§ 3 Nr. 26 EStG (Übungsleiterpauschale)';
    var anlage = art === '26a' ? 'Anlage N bzw. Anlage S' : 'Anlage N';

    // Der Auslagenbeleg heißt in beiden Zuständen gleich: er bestätigt eine
    // Erstattung, nicht die Ausschöpfung eines Freibetrags.
    var belegTitle = isAuslage
      ? 'Erstattung von Auslagen'
      : (isPaid ? 'Auszahlungsbeleg' : 'Antragsbestätigung');
    var untertitel = isAuslage
      ? 'Auslagenersatz · § 3 Nr. 50 EStG · steuerfrei'
      : 'Aufwandsentschädigung · ' + escape(paragraf)
        + ' · steuer- und sozialversicherungsfrei bis ' + eur(limit) + ' pro Jahr';
    // Punkt 1 des Hinweises sagt ausdrücklich, dass die Zahlung KEINE
    // Aufwandsentschädigung ist — dann darf die Summenzeile darüber nicht das
    // Gegenteil behaupten.
    var summenLabel = isAuslage ? 'Summe Auslagenersatz' : 'Summe Aufwandsentschädigung';
    var nrBlock = isPaid
      ? 'Beleg-Nr. <strong>' + escape(c.beleg_nr || '—') + '</strong><br>Auszahlung am ' + datum(c.paid_at)
      : 'Antrag-ID <strong>' + escape(String(c.id || '').substring(0, 8).toUpperCase()) + '</strong><br>Eingereicht am ' + datum(c.submitted_at);
    var ibanShown = isPaid ? maskIban(person.iban) : ibanLesbar(person.iban);

    // Jahressummen-Balken nur auf dem Auszahlungsbeleg. Die Summe rechnet der
    // Aufrufer aus — der Beleg kennt nur diesen einen Antrag.
    // Bei Auslagen bleibt der Balken weg (siehe isAuslage oben) — die
    // Jahressumme kommt weiterhin von außen, sie wird hier nur nicht gezeigt.
    var yearBar = '';
    if (isPaid && !isAuslage) {
      var yr = jahr(c.paid_at);
      var pct = Math.min(100, limit ? (jahresSumme / limit) * 100 : 0);
      var over = jahresSumme > limit;
      yearBar = '<div class="beleg-block" style="grid-column:1/-1;margin-top:4px"><h4>Freibetrag ' + yr + ' bei ' + escape(verein.name) + '</h4>'
        + '<div style="background:#EDE8DB;border-radius:6px;height:14px;overflow:hidden;margin:6px 0"><div style="height:100%;width:' + pct.toFixed(0) + '%;background:' + (over ? '#C0392B' : '#2E7D46') + '"></div></div>'
        + '<p style="font-size:14px">' + eur(jahresSumme) + ' von ' + eur(limit) + ' ausgeschöpft' + (over ? ' <strong style="color:#C0392B">— Freibetrag überschritten</strong>' : '') + '</p>'
        + '<p class="muted" style="font-size:13px">Diese Übersicht zählt nur Zahlungen von ' + escape(String(verein.name || '').replace(/\.$/, '')) + '. Gleichartige Zahlungen anderer Vereine oder Einrichtungen musst du selbst hinzurechnen.</p></div>';
    }

    var declBlock;
    if (isAuslage) {
      // Wortlaut aus der Spec (Abschnitt „Der Beleg für Auslagen"),
      // unverändert übernommen. Vier Punkte statt der fünf des
      // Steuerhinweises, und in beiden Zuständen derselbe Text: die
      // Erklärungen der Pauschale (nebenberufliche Tätigkeit,
      // Jahresfreibetrag) haben mit einer Auslage nichts zu tun.
      //
      // Punkt 3 nur bei der Autoanreise — bei einer Erstattung gegen Beleg
      // stünde die Vergleichspreis-Begründung sinnlos da. Das Wort
      // „Übungsleiterpauschale" kommt genau einmal vor, nämlich in Punkt 2,
      // wo es den Freibetrag benennt, gegen den NICHT gezählt wird.
      declBlock = '<div class="beleg-declaration"><h4>Hinweis</h4><ul>'
        + '<li>Diese Zahlung ist <strong>Ersatz tatsächlich entstandener Auslagen</strong> nach '
        + '§ 3 Nr. 50 EStG. Sie ist <strong>kein Arbeitslohn, kein Honorar und keine '
        + 'Aufwandsentschädigung</strong>.</li>'
        + '<li>Sie ist <strong>steuerfrei</strong> und <strong>zählt nicht gegen den '
        + 'Jahresfreibetrag</strong> der Übungsleiterpauschale (§ 3 Nr. 26 EStG). In der '
        + 'Einkommensteuererklärung ist sie nicht anzugeben.</li>'
        // Punkt 3 nur, wenn oben wirklich ein Rechenweg steht. Bei einer
        // Nacherfassung ohne Positionen verweist „die Berechnung steht oben"
        // ins Leere, und der Vergleichspreis war dort gar nicht die Grundlage —
        // erstattet wurde, was tatsächlich angefallen ist.
        + (c.auslage_art === 'anreise' && breakdown.length
          ? '<li>Die Fahrtkosten der Anreise erstattet der Verein pauschal in Höhe der '
            + 'günstigsten zumutbaren Verbindung des öffentlichen Verkehrs; die Berechnung steht '
            + 'oben. Ein zusätzlicher Abzug als Werbungskosten für dieselbe Fahrt ist damit nicht '
            + 'möglich.</li>'
          : '')
        + '<li>Die Nachweise verbleiben beim Verein und werden zehn Jahre aufbewahrt '
        + '(§ 147 AO, Art. 6 Abs. 1 lit. c DSGVO).'
        + (c.auslage_art === 'beleg' ? ' Der eingereichte Nachweis liegt dem Verein vor.' : '')
        + '</li>'
        + '</ul>'
        + (c.notes ? '<p class="muted"><strong>Anmerkung:</strong> ' + escape(c.notes) + '</p>' : '')
        + '</div>';
    } else if (isPaid) {
      // Wortlaut vom Vorstand am 19.08.2026 freigegeben — kein Entwurf mehr.
      declBlock = '<div class="beleg-declaration"><h4>Steuerlicher Hinweis</h4><ul>'
        + '<li>Diese Zahlung ist eine Aufwandsentschädigung nach <strong>' + escape(paragraf)
        + '</strong> für eine nebenberufliche, ' + taetigkeitsArt + ' Tätigkeit im ideellen '
        + 'Bereich eines gemeinnützigen Vereins. Sie ist <strong>kein Arbeitslohn und kein '
        + 'Honorar</strong>.</li>'
        + '<li>Sie ist <strong>bis ' + eur(limit) + ' im Kalenderjahr steuer- und '
        + 'sozialversicherungsfrei</strong>. Der Freibetrag gilt <strong>einmal pro Person '
        + 'und Jahr über alle Vereine und Einrichtungen hinweg</strong> — ' + escape(verein.name)
        + ' kennt nur die hier gezahlten Beträge (in diesem Jahr: ' + eur(jahresSumme)
        + ' von ' + eur(limit) + ').'
        + (nichtFrei > 0 ? ' <strong>Von dieser Zahlung übersteigen ' + eur(nichtFrei) + ' den Freibetrag.</strong>' : '')
        + '</li>'
        + '<li><strong>Gib diese Zahlung in deiner Einkommensteuererklärung an.</strong> '
        + 'Steuerfreie Aufwandsentschädigungen nach ' + escape(paragraf) + ' werden in der '
        + '<strong>' + anlage + '</strong> eingetragen. Steuer fällt nur auf den Teil an, der '
        + 'den Jahresfreibetrag übersteigt. <strong>Bewahre diesen Beleg auf</strong> und lege '
        + 'ihn auf Nachfrage des Finanzamts vor.</li>'
        + '<li>Beträge über dem Freibetrag sind von dir zu versteuern und können '
        + 'sozialversicherungspflichtig sein. Die Auszahlung erfolgt auf Grundlage deiner '
        + (isTaetigkeit ? 'Angaben gegenüber dem Verein' : 'Selbstauskunft im Antrag') + '; für Richtigkeit und Vollständigkeit bist du selbst '
        + 'verantwortlich.</li>'
        + '<li>Dieser Beleg ersetzt keine Steuerberatung. Der Verein übernimmt keine Haftung '
        + 'für die individuelle steuerliche oder sozialversicherungsrechtliche Behandlung; bei '
        + 'Fragen wende dich an dein Finanzamt oder eine Steuerberatung. Die Antragsunterlagen '
        + 'werden beim Verein zehn Jahre aufbewahrt (§ 147 AO, Art. 6 Abs. 1 lit. c DSGVO).</li>'
        + '</ul>'
        + (c.notes ? '<p class="muted"><strong>Anmerkung:</strong> ' + escape(c.notes) + '</p>' : '')
        + '</div>';
    } else {
      declBlock = '<div class="beleg-declaration"><h4>Erklärungen der/des Ehrenamtlichen</h4><ul><li>Die angegebenen Zeiten und Tätigkeiten wurden tatsächlich und in der genannten Form erbracht.</li><li>Die Tätigkeit wird nebenberuflich ausgeübt (nicht mehr als ein Drittel einer vergleichbaren Vollzeittätigkeit).</li><li>Die ' + escape(paragraf.replace(/^(§ 3 Nr\. 26a? EStG) \((.*)\)$/, '$2 nach $1')) + ' wurde im laufenden Kalenderjahr nicht anderweitig so in Anspruch genommen, dass der Jahresfreibetrag von ' + eur(limit).replace(',00', '') + ' überschritten wird.</li><li>Der/die Ehrenamtliche wurde über die Verarbeitung und zehnjährige Aufbewahrung der Angaben gemäß § 147 AO informiert (Art. 6 Abs. 1 lit. c DSGVO).</li></ul>' + (c.notes ? '<p class="muted"><strong>Anmerkung:</strong> ' + escape(c.notes) + '</p>' : '') + '</div>';
    }

    var footInfo = isPaid
      ? 'Status: ausgezahlt · Auszahlung am ' + datum(c.paid_at) + (c.approved_at ? ' · Freigegeben am ' + datum(c.approved_at) : '')
      : 'Status: ' + escape(c.status) + (c.submitted_to_payroll_at ? ' · Zahlungsanweisung an die Finanzen am ' + datum(c.submitted_to_payroll_at) : '');

    // Akzentlinie in Limette plus Vereinsclaim ueber dem Kopf — dasselbe Muster
    // wie auf den Rechnungen (.beleg-claim in rechnung.html). Der Beleg verlaesst
    // das Portal und wird ausgedruckt weitergereicht; ohne diese Zeile ist ihm
    // auf Papier nicht anzusehen, von wem er kommt.
    var entwurf = isTaetigkeit && !d.fassungFreigegeben
      ? '<div style="border:2px solid #C0392B;color:#C0392B;font-weight:700;text-align:center;padding:4px;margin-bottom:10px;letter-spacing:.1em">ENTWURF · Belegtext noch nicht freigegeben</div>'
      : '';
    return entwurf + '<div class="beleg-claim">' + escape(verein.claim || CLAIM) + '</div>'
      + '<div class="beleg-head"><div><div class="beleg-logo-name">' + escape(verein.name) + '</div><div class="beleg-logo-sub">' + escape(verein.adresse) + '</div></div><div class="beleg-nr">' + nrBlock + '</div></div>'
      + '<div class="beleg-title">' + belegTitle + '</div>'
      + '<div class="beleg-subtitle">' + untertitel + '</div>'
      + '<div class="beleg-grid"><div class="beleg-block"><h4>Empfänger:in</h4><p><strong>' + escape(person.full_name || '') + '</strong><br>' + escape(person.email || '') + '<br>IBAN: ' + escape(ibanShown) + '</p></div><div class="beleg-block"><h4>Auszahlender Verein</h4><p><strong>' + escape(verein.name) + '</strong><br>' + escape(verein.adresse) + '<br>' + escape(verein.register) + '<br>Vertreten durch den Vorstand<br>(Gemeinnütziger Verein i.S.d. § 52 AO)</p></div><div class="beleg-block"><h4>' + (isAuslage ? 'Grund der Erstattung' : 'Tätigkeit') + '</h4><p>' + aktivitaet + (aktivitaetSub ? '<br><span class="muted">' + aktivitaetSub + '</span>' : '') + '</p></div><div class="beleg-block"><h4>Zeitraum</h4><p><strong>' + zeitraum(c.period_start, c.period_end) + '</strong></p></div>' + yearBar + '</div>'
      + '<table class="beleg-table"><thead>' + columnsHeader + '</thead><tbody>' + positionsHtml + '<tr class="beleg-total-row"><td colspan="' + totalColspan + '">' + summenLabel + '</td><td class="num">' + eur(c.amount) + '</td></tr></tbody></table>'
      + declBlock
      + '<div class="beleg-foot"><p class="muted">' + footInfo + ' · Vereinsbeschluss vom ' + datum(d.beschlussDatum) + '</p></div>';
  }

  global.LPRBeleg = { belegHtml: belegHtml, FREIBETRAG: FREIBETRAG, BELEG_26A_FASSUNG: BELEG_26A_FASSUNG, CSS: BELEG_CSS };
})(typeof globalThis !== 'undefined' ? globalThis : window);
