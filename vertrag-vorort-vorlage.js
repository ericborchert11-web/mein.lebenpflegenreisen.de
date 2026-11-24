/**
 * Vertrag vor Ort — Kostenvoranschlag und Dienstleistungsvertrag
 * "Nachtbegleitung in einer Pflege- oder Wohneinrichtung – Privatauftrag".
 *
 * Ohne DOM und ohne Supabase, damit Wortlaut und Rechnung ohne Login
 * pruefbar sind:   node scripts/pruefe-vertrag-vorort.mjs
 *
 * WORTLAUT IST FEST (Briefing 24.11.2026, Anlagen A und B). Hier wird Layout
 * geaendert, nie Text. Einzige bewusste Abweichung: Widerrufsbelehrung und
 * Muster-Widerrufsformular folgen dem gesetzlichen Muster (Anlagen 1 und 2
 * zu Art. 246a § 1 Abs. 2 EGBGB), wo Anlage B davon abwich (Checkpoint 1).
 * Wer hier Text aendert, muss FASSUNG anheben — die Freigabe haengt an der
 * Fassung (vertrag_werte, schluessel fassung_*), eine neue Fassung ist wieder Entwurf.
 *
 * KEINE BETRAEGE IM TEXT. Nachtpauschale, Stundensatz und
 * Steuerhinweis kommen als Parameter `werte` (Tabelle vertrag_werte), die
 * Vereinsdaten als `verein` (LPR.VEREIN). Das Pruefskript sucht nach
 * Eurobetraegen in dieser Datei und schlaegt an, wenn eine auftaucht.
 *
 * Personendaten (Namen, Anschriften, Unterschriften) kommen nur als `d` herein
 * und verlassen diese Funktionen nur als HTML fuer das PDF auf dem Tablet.
 */
(function () {
  'use strict';

  // 2026-11-24-3: ein Modell (12 h), Ausfallpauschale und Storno raus, Variante
  // "muendlich geschlossen, Bestaetigung per Mail" (Eric, 24.11.2026 nach dem Termin).
  var FASSUNG = '2026-11-24-3';
  // Eigene Fassung, seit die Datenschutzinformation am 24.11.2026 fertig
  // geschrieben wurde (Pruefvermerke aufgeloest). Muss zu vertrag_werte
  // (fassung_datenschutz) und vertrag_vorort_gate() passen.
  var FASSUNG_DATENSCHUTZ = '2026-11-24-2';
  var VARIANTEN = {
    vertrag:     'vertrag-nachtbegleitung',
    kv:          'kv-nachtbegleitung',
    datenschutz: 'datenschutz-privatauftrag'
  };

  // ── Kleinteile ──────────────────────────────────────────────────────────

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function leer(v) { return v == null || String(v).trim() === ''; }

  /** Cent -> '3.000,00 €' */
  function eur(cents) {
    var n = Number(cents);
    if (!isFinite(n)) return '';
    return new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      .format(n / 100) + ' €';
  }

  /** '2026-12-01' -> '01.12.2026' (ohne Zeitzone). */
  function datum(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    return m ? m[3] + '.' + m[2] + '.' + m[1] : '';
  }

  /** Kalendertag + n Tage, als 'JJJJ-MM-TT' — in UTC-Mitte, nie lokale Zeit (DST-Falle). */
  function plusTage(iso, n) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    if (!m) return '';
    var t = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12));
    t.setUTCDate(t.getUTCDate() + n);
    return t.toISOString().slice(0, 10);
  }
  /** Nächte von erster bis letzter Nacht einschliesslich. */
  function naechteZwischen(erste, letzte) {
    var a = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(erste || ''));
    var b = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(letzte || ''));
    if (!a || !b) return 0;
    var ta = Date.UTC(+a[1], +a[2] - 1, +a[3]), tb = Date.UTC(+b[1], +b[2] - 1, +b[3]);
    var n = Math.round((tb - ta) / 86400000) + 1;
    return n > 0 ? n : 0;
  }

  /** 'HH:MM' + Stunden -> 'HH:MM' (über Mitternacht). */
  function uhrPlus(hhmm, stunden) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
    if (!m) return '';
    var min = ((+m[1] * 60 + +m[2] + stunden * 60) % 1440 + 1440) % 1440;
    return (min < 600 ? '0' : '') + Math.floor(min / 60) + ':' + (min % 60 < 10 ? '0' : '') + (min % 60);
  }
  /** Dauer von 'HH:MM' bis 'HH:MM' in Stunden (über Mitternacht). */
  function dauer(von, bis) {
    var a = /^(\d{1,2}):(\d{2})$/.exec(String(von || '').trim());
    var b = /^(\d{1,2}):(\d{2})$/.exec(String(bis || '').trim());
    if (!a || !b) return null;
    var d = ((+b[1] * 60 + +b[2]) - (+a[1] * 60 + +a[2]) + 1440) % 1440;
    return d / 60;
  }

  /** Eingetragener Wert, sonst Ausfuellinie. */
  function feld(v, klasse) {
    return leer(v)
      ? '<span class="vv-linie' + (klasse ? ' ' + klasse : '') + '"></span>'
      : '<span class="vv-wert">' + esc(v) + '</span>';
  }
  /** Kaestchen; angekreuzt nur, wenn true — nie vorbelegt. */
  function cb(an, klein) {
    return '<span class="vv-cb' + (klein ? ' klein' : '') + (an === true ? ' an' : '') + '"'
      + ' role="img" aria-label="' + (an === true ? 'angekreuzt' : 'nicht angekreuzt') + '"></span>';
  }

  // ── Werte und Gate ──────────────────────────────────────────────────────

  /**
   * Die Nachtpauschale des Modells und alles, was daraus folgt.
   * Seit Fassung 2026-11-24-3 gibt es nur EIN Modell (A).
   * werte: { modelle: { A: {stunden, pauschale_cents} },
   *          zusatzstunde_cents, steuerhinweis, freigabe: {...} }
   */
  function berechne(d, werte) {
    var m = werte && werte.modelle && werte.modelle.A;
    var naechte = Number(d && d.naechte) || 0;
    if (!m) return { pauschale_cents: null, naechte: naechte, summe_cents: null };
    var p = Number(m.pauschale_cents);
    return { pauschale_cents: p, naechte: naechte, summe_cents: naechte > 0 ? naechte * p : null, stunden: m.stunden };
  }

  /**
   * Ist das Dokument freigegeben? Nur wenn ALLE Werte und die Fassung des
   * Wortlauts eine Freigabe des Vorstands tragen (seit Migration CC jedes
   * Vorstandsmitglied, einzelvertretungsberechtigt). Der Server prueft dasselbe
   * noch einmal vor dem Versand — diese Funktion steuert nur Banner und Knopf.
   */
  function gate(werte, art) {
    var f = (werte && werte.freigabe) || {};
    var fehlt = [];
    if (f.werte !== true) fehlt.push('Nachtpauschale, Zusatzstunde und Steuerhinweis');
    if (art !== 'kv' && f.vertrag !== true) fehlt.push('Wortlaut Dienstleistungsvertrag (Fassung ' + FASSUNG + ')');
    if (f.kv !== true) fehlt.push('Wortlaut Kostenvoranschlag (Fassung ' + FASSUNG + ')');
    if (art !== 'kv' && f.datenschutz !== true) fehlt.push('Datenschutzinformation (Fassung ' + FASSUNG_DATENSCHUTZ + ')');
    return { freigegeben: fehlt.length === 0, fehlt: fehlt };
  }

  /**
   * Pflichtfelder — erst vor den Unterschriften geprueft (Briefing 3.).
   * Liefert eine Liste lesbarer Hinweise, leer = vollstaendig.
   */
  /** Vertrag muendlich geschlossen, Bestaetigung per Mail (§ 312f Abs. 1 BGB) statt Unterschrift der Kundin. */
  function muendlich(d) { return !!d && d.abschluss === 'muendlich'; }

  var MAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
  function pflichtfehlt(d, art) {
    var f = [];
    var k = (d && d.kundin) || {}, p = (d && d.person) || {}, e = (d && d.einrichtung) || {};
    if (leer(d.von) || leer(d.bis)) f.push('Uhrzeit von/bis');
    if (leer(d.ersteNacht)) f.push('Erste Nacht');
    if (!(Number(d.naechte) > 0)) f.push('Anzahl Nächte bzw. letzte Nacht');
    if (leer(k.vorname) || leer(k.nachname)) f.push('Name der Auftraggeberin / des Auftraggebers');
    if (leer(k.strasse) || leer(k.plzOrt)) f.push('Anschrift der Auftraggeberin / des Auftraggebers');
    if (leer(k.email)) f.push('E-Mail-Adresse');
    else if (!MAIL_RE.test(String(k.email).trim())) f.push('E-Mail-Adresse ist ungültig');
    if (leer(p.vorname) || leer(p.nachname)) f.push('Name der begleiteten Person');
    if (leer(e.name)) f.push('Einrichtung');
    if (art === 'kv') return f;
    if (leer(k.telefon)) f.push('Telefon der Auftraggeberin / des Auftraggebers');
    if (d.handlung !== 'eigen' && d.handlung !== 'vertretung') f.push('Handlungsform ankreuzen');
    if (d.handlung === 'vertretung' && d.vertretungsgrund !== 'vollmacht' && d.vertretungsgrund !== 'betreuung') {
      f.push('Vertretung: Vorsorgevollmacht oder Betreuung ankreuzen');
    }
    if (leer(e.anschrift)) f.push('Anschrift der Einrichtung');
    if (leer(e.zustimmungAm) || leer(e.zustimmungDurch)) f.push('Zustimmung der Einrichtung (Datum und Name)');
    var er = d.erkl || {};
    if (muendlich(d)) {
      // Muendlich geschlossen: Empfang und Leistungsbeginn bestaetigt die Kundin per Antwortmail.
      if (er.emailPdf !== true) f.push('Erklärung: Einverständnis mit Versand per E-Mail (ohne sie kann das Portal nicht senden)');
      if (leer(d.ort) || leer(d.datum)) f.push('Ort und Datum');
      return f;
    }
    if (er.widerrufErhalten !== true) f.push('Erklärung: Widerrufsbelehrung und Muster-Widerrufsformular erhalten');
    if (er.emailPdf !== true) f.push('Erklärung: Einverständnis mit Versand per E-Mail (ohne sie kann das Portal nicht senden)');
    if (er.datenschutzErhalten !== true) f.push('Erklärung: Datenschutzinformation erhalten');
    if (leer(d.ort) || leer(d.datum)) f.push('Ort und Datum');
    if (leer(d.nameDruck)) f.push('Name in Druckschrift');
    return f;
  }

  // ── Bausteine ───────────────────────────────────────────────────────────

  var LOGO = '<svg class="vv-logo-zeichen" viewBox="0 0 48 56" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">'
    + '<g fill="none" stroke-linecap="round" stroke-linejoin="round">'
    + '<polyline points="6,8 24,28 6,48" stroke="#1A3A2A" stroke-width="5"/>'
    + '<polyline points="22,8 40,28 22,48" stroke="#1A3A2A" stroke-width="5" opacity="0.35"/>'
    + '</g></svg>';

  function kopf() {
    return '<div class="vv-logo">' + LOGO
      + '<div class="vv-wm"><div class="n">Leben Pflegen Reisen</div><div class="s">E.V. · BERLIN</div></div></div>';
  }

  function banner(g) {
    if (g.freigegeben) return '';
    return '<div class="vv-entwurf"><h3>ENTWURF – FREIGABE AUSSTEHEND</h3>'
      + '<p>Nicht zur Verwendung gegenüber Kundinnen und Kunden. Es fehlt die Freigabe durch den Vorstand für:</p>'
      + '<p>' + g.fehlt.map(esc).join(' · ') + '</p></div>';
  }

  function vereinAnschrift(v) { return esc(v.strasse) + ', ' + esc(v.ort); }
  function nameVoll(x) { return [x && x.vorname, x && x.nachname].filter(function (s) { return !leer(s); }).join(' '); }
  function anredeName(k) {
    var n = String((k && k.nachname) || '').trim();
    if (k && (k.anrede === 'Frau' || k.anrede === 'Herr')) return k.anrede + ' ' + n;
    return nameVoll(k);
  }
  function initialen(p) {
    return [p && p.vorname, p && p.nachname].filter(function (s) { return !leer(s); })
      .map(function (s) { return String(s).trim().charAt(0).toUpperCase() + '.'; }).join(' ');
  }


  function letzteNacht(d) {
    if (!leer(d.letzteNacht)) return d.letzteNacht;
    return Number(d.naechte) > 0 && !leer(d.ersteNacht) ? plusTage(d.ersteNacht, Number(d.naechte) - 1) : '';
  }

  // ── Anlage A: Kostenvoranschlag ─────────────────────────────────────────

  function kvBlatt(d, werte, v, alsAnlage) {
    var k = d.kundin || {}, p = d.person || {}, e = d.einrichtung || {};
    var r = berechne(d, werte);
    var mA = werte.modelle.A;
    var n = d.nummern || {};
    var h = [];
    if (alsAnlage) {
      h.push('<div class="vv-anlage-kopf">Anlage 3 zum Dienstleistungsvertrag Vertrags-Nr. ' + feld(n.vertrag) + '</div>');
    }
    h.push(kopf());
    if (!alsAnlage) h.push(banner(gate(werte, 'kv')));
    h.push('<div class="vv-titel"><div class="vv-akzent"></div>'
      + '<h1>Kostenvoranschlag – Nachtbegleitung in Ihrer Einrichtung</h1>'
      + '<div class="vv-meta">KV-Nr. ' + feld(n.kv) + ' · Datum ' + feld(datum(d.datum)) + ' · gültig bis '
      + feld(datum(d.kvGueltigBis)) + ' · Ansprechpartner: Eric Borchert</div></div>');

    h.push('<div class="vv-adresse">'
      + (leer(k.anrede) ? '' : esc(k.anrede) + '<br>')
      + feld(nameVoll(k)) + '<br>' + feld(k.strasse) + '<br>' + feld(k.plzOrt) + '</div>');

    h.push('<p>Guten Tag ' + feld(anredeName(k)) + ',</p>');
    h.push('<p>vielen Dank für Ihre Anfrage und das freundliche Gespräch. Gern begleiten wir '
      + feld(nameVoll(p)) + ' in den Nächten in ' + feld(e.name)
      + ', damit sie in der neuen Umgebung zur Ruhe kommt und nicht allein ist.</p>');

    h.push('<h2>Unsere Leistung je Nacht</h2>');
    h.push('<p>Eine geschulte Begleitperson des Vereins ist die vereinbarte Zeit durchgehend anwesend. Sie gibt Orientierung und Sicherheit, beruhigt, ist für Gespräche da und holt bei Bedarf das Pflegepersonal der Einrichtung. Pflegerische und medizinische Aufgaben bleiben bei der Einrichtung.</p>');

    h.push('<table class="vv-tab"><thead><tr><th>Pos.</th><th>Leistung</th><th>Dauer</th><th class="r">Preis je Nacht</th></tr></thead><tbody>'
      + '<tr><td>1</td><td>Nachtbegleitung, ' + esc(mA.stunden) + ' Stunden, ' + feld(d.von, 'kurz') + '–' + feld(d.bis, 'kurz') + ' Uhr</td>'
      + '<td>' + esc(mA.stunden) + ' Std.</td><td class="r">' + eur(mA.pauschale_cents) + '</td></tr></tbody></table>');

    h.push('<p class="vv-umfang"><b>Voraussichtlicher Umfang:</b> ' + feld(r.naechte > 0 ? String(r.naechte) : '', 'kurz')
      + ' Nächte vom ' + feld(datum(d.ersteNacht), 'kurz') + ' bis ' + feld(datum(letzteNacht(d)), 'kurz') + '<br>'
      + '<b>Voraussichtlicher Gesamtbetrag:</b> ' + (r.summe_cents != null ? '<b>' + eur(r.summe_cents) + '</b>' : feld('') + ' €') + '</p>');

    h.push('<div class="vv-block"><h2>Im Preis enthalten</h2><ul>'
      + '<li>Kennenlerntermin vor Ort und Aufnahmegespräch zu Gewohnheiten, Tagesablauf und nächtlichen Routinen</li>'
      + '<li>Einsatzplanung und Abstimmung mit der Einrichtung</li>'
      + '<li>feste Ansprechperson im Verein für Sie als Angehörige</li>'
      + '<li>kurze Rückmeldung nach jeder Nacht</li>'
      + '<li>Abschlussgespräch</li></ul></div>');

    h.push('<p>Zusätzliche Stunden nach Absprache: ' + eur(werte.zusatzstunde_cents) + ' je angefangene Stunde.</p>');
    h.push('<p>' + esc(werte.steuerhinweis) + '</p>');
    h.push('<p>Dieser Kostenvoranschlag ist unverbindlich. Abgerechnet werden die tatsächlich geleisteten Nächte auf Grundlage des Leistungsnachweises. Verbindlich wird die Zusammenarbeit mit dem Dienstleistungsvertrag.</p>');

    h.push('<div class="vv-wirkt"><h2 class="first">Ihr Auftrag wirkt weiter</h2>'
      + '<p>Leben Pflegen Reisen ist ein gemeinnütziger Verein. Niemand verdient hier an Gewinnen. Was nach Deckung unserer Kosten bleibt, fließt vollständig in unsere Arbeit: in Sitzwachen für Menschen, die nachts im Krankenhaus nicht allein sein sollen, in die Schulung unserer Ehrenamtlichen und in begleitete Reisen für Menschen mit Pflegebedarf und ihre Angehörigen. Mit Ihrer Rechnung ermöglichen Sie uns, mehr Gutes zu tun. Dafür danken wir Ihnen.</p></div>');

    h.push('<div class="vv-block"><p>Mit herzlichen Grüßen</p>'
      + '<p class="vv-gruss">Eric Borchert<br>Vorstandsvorsitzender, Leben Pflegen Reisen e. V.</p></div>');
    h.push('<p class="vv-klein"><i>Hinweis: Das Entgelt ist keine Spende; eine Zuwendungsbestätigung wird dafür nicht ausgestellt.</i></p>');
    return h.join('\n');
  }

  // ── Anlage B: Dienstleistungsvertrag ───────────────────────────────────

  function para(nr, html) { return '<p>(' + nr + ') ' + html + '</p>'; }

  function vertragBlatt(d, werte, v) {
    var k = d.kundin || {}, p = d.person || {}, e = d.einrichtung || {}, ap = e.ansprech || {};
    var n = d.nummern || {}, er = d.erkl || {}, u = d.unterschriften || {};
    var r = berechne(d, werte);
    var mA = werte.modelle.A;
    var mu = muendlich(d);
    var h = [];

    h.push(kopf());
    h.push(banner(gate(werte, 'vertrag')));
    h.push('<div class="vv-titel"><div class="vv-akzent"></div><h1>Dienstleistungsvertrag</h1>'
      + '<div class="vv-unter">Nachtbegleitung in einer Pflege- oder Wohneinrichtung – Privatauftrag</div>'
      + '<div class="vv-meta">Vertrags-Nr. ' + feld(n.vertrag) + (leer(n.fall) ? '' : ' · Fall-Nr. ' + esc(n.fall)) + '</div></div>');
    if (mu) {
      h.push('<div class="vv-block"><p><b>Vertragsbestätigung.</b> Die Parteien haben diesen Vertrag am ' + feld(datum(d.datum), 'kurz')
        + ' in ' + feld(d.ort, 'kurz') + ' mündlich geschlossen. Dieses Dokument bestätigt seinen Inhalt (§ 312f Abs. 1 BGB); einer Unterschrift der Auftraggeberin / des Auftraggebers bedarf es nicht.</p></div>');
    }

    h.push('<div class="vv-parteien"><p>zwischen</p>'
      + '<p><b>Leben Pflegen Reisen e. V.</b>, ' + vereinAnschrift(v) + ', ' + esc(v.register)
      + ', vertreten durch den Vorstand Eric Borchert<br>– nachfolgend „Verein" –</p><p>und</p>'
      + '<div class="vv-feld"><span class="lab">Name, Vorname:</span>' + feld(leer(k.nachname) ? '' : [k.nachname, k.vorname].filter(function (s) { return !leer(s); }).join(', ')) + '</div>'
      + '<div class="vv-feld"><span class="lab">Anschrift:</span>' + feld([k.strasse, k.plzOrt].filter(function (s) { return !leer(s); }).join(', ')) + '</div>'
      + '<div class="vv-feld"><span class="lab">Telefon / E-Mail:</span>' + feld([k.telefon, k.email].filter(function (s) { return !leer(s); }).join(' / ')) + '</div>'
      + '<p>– nachfolgend „Auftraggeberin / Auftraggeber" –</p></div>');

    h.push('<div class="vv-block"><h2>Handlungsform <span class="vv-klein">(Zutreffendes ankreuzen)</span></h2>'
      + '<div class="vv-opt">' + cb(d.handlung === 'eigen') + '<p>Die Auftraggeberin / der Auftraggeber handelt <b>im eigenen Namen</b>. Die Leistungen werden zugunsten der in § 1 genannten begleiteten Person erbracht (§ 328 BGB). Zahlungspflichtig ist die Auftraggeberin / der Auftraggeber.</p></div></div>');
    h.push('<div class="vv-opt">' + cb(d.handlung === 'vertretung') + '<div class="vv-optext"><p>Die Auftraggeberin / der Auftraggeber handelt <b>in Vertretung der begleiteten Person</b> aufgrund</p>'
      // Unterauswahl als eigene Zeile: Kaestchen mitten im Fliesstext rastert html2canvas ueber den Rand.
      + '<div class="vv-unteropt"><span>' + cb(d.handlung === 'vertretung' && d.vertretungsgrund === 'vollmacht', true) + 'Vorsorgevollmacht</span>'
      + '<span>' + cb(d.handlung === 'vertretung' && d.vertretungsgrund === 'betreuung', true) + 'gerichtlich angeordneter Betreuung.</span></div>'
      + '<p>Ein Nachweis wurde dem Verein gezeigt.</p></div></div>');

    h.push('<div class="vv-block"><h2>§ 1 Begleitete Person, Einsatzort</h2>'
      + para(1, 'Begleitete Person: ' + feld(leer(p.nachname) ? '' : [p.nachname, p.vorname].filter(function (s) { return !leer(s); }).join(', '))) + '</div>'
      + para(2, 'Einsatzort: ' + feld([e.name, e.anschrift].filter(function (s) { return !leer(s); }).join(', ')) + ', ' + feld(e.wohnbereich))
      + para(3, 'Ansprechperson der Einrichtung: ' + feld([ap.name, ap.funktion, ap.telefon].filter(function (s) { return !leer(s); }).join(', '))));

    h.push('<div class="vv-block"><h2>§ 2 Leistungen des Vereins</h2>'
      + para(1, 'Der Verein erbringt eine psychosoziale Nachtbegleitung in eigener Verantwortung. Sie umfasst:') + '</div>'
      + '<ol class="vv-abc">'
      + '<li><span>a)</span> durchgehende Anwesenheit einer Begleitperson bei der begleiteten Person in der vereinbarten Zeit,</li>'
      + '<li><span>b)</span> Zuwendung, Gespräch, Beruhigung und Hilfe bei der Orientierung in der neuen Umgebung,</li>'
      + '<li><span>c)</span> Begleitung auf Wegen innerhalb des Apartments oder Wohnbereichs, soweit die begleitete Person sie selbstständig gehen kann,</li>'
      + '<li><span>d)</span> Bereitstellen von Getränken und kleinen Handreichungen, soweit die Einrichtung keine Einschränkungen mitgeteilt hat,</li>'
      + '<li><span>e)</span> Hinzuziehen des Pflegepersonals der Einrichtung, sobald pflegerischer oder medizinischer Bedarf erkennbar wird,</li>'
      + '<li><span>f)</span> eine kurze Rückmeldung an die Auftraggeberin / den Auftraggeber nach jeder Nacht sowie eine Übergabe an das Personal der Einrichtung.</li>'
      + '</ol>'
      + para(2, 'Im Preis enthalten sind ein Kennenlerntermin mit Aufnahmegespräch, die Einsatzplanung, die Abstimmung mit der Einrichtung, eine feste Ansprechperson im Verein und ein Abschlussgespräch.')
      + para(3, 'Der Verein setzt geschulte, überwiegend ehrenamtlich tätige Begleitpersonen ein. Er wählt sie aus und teilt sie ein. Ein Wechsel der Begleitperson zwischen den Nächten ist möglich; der Verein bemüht sich um möglichst wenige Wechsel.'));

    h.push('<div class="vv-block"><h2>§ 3 Nicht geschuldete Leistungen</h2>'
      + para(1, 'Der Verein erbringt keine Pflegeleistungen und keine medizinischen Leistungen. Nicht geschuldet sind insbesondere:') + '</div>'
      + '<ol class="vv-abc">'
      + '<li><span>a)</span> Grundpflege (z. B. Körperpflege, Hilfe beim Toilettengang, Inkontinenzversorgung, An- und Auskleiden),</li>'
      + '<li><span>b)</span> Behandlungspflege und jede Gabe oder Bereitstellung von Medikamenten,</li>'
      + '<li><span>c)</span> Lagern, Heben, Transfer und Mobilisation,</li>'
      + '<li><span>d)</span> medizinische Überwachung, Bedienung von Geräten oder Hilfsmitteln,</li>'
      + '<li><span>e)</span> Anreichen von Nahrung und Flüssigkeit bei Schluckstörungen,</li>'
      + '<li><span>f)</span> freiheitsentziehende oder freiheitsbeschränkende Maßnahmen,</li>'
      + '<li><span>g)</span> hauswirtschaftliche Leistungen.</li>'
      + '</ol>'
      + para(2, 'Die pflegerische und medizinische Verantwortung für die begleitete Person bleibt vollständig bei der Einrichtung. Im Notfall verständigt die Begleitperson das Personal der Einrichtung und, falls erforderlich, den Rettungsdienst.'));

    h.push('<div class="vv-block"><h2>§ 4 Einsatzzeiten, Einrichtung</h2>'
      + para(1, 'Einsatzzeit: <b>' + esc(mA.stunden) + ' Stunden je Nacht</b>, von ' + feld(d.von, 'kurz') + ' Uhr bis ' + feld(d.bis, 'kurz') + ' Uhr.') + '</div>'
      + para(2, 'Zeitraum: erste Nacht ' + feld(datum(d.ersteNacht), 'kurz') + ', letzte Nacht ' + feld(datum(letzteNacht(d)), 'kurz')
        + ', insgesamt ' + feld(r.naechte > 0 ? String(r.naechte) : '', 'kurz') + ' Nächte.')
      + para(3, 'Änderungen von Terminen und Umfang sowie eine Verlängerung vereinbaren die Parteien in Textform (E-Mail genügt). Für eine Verlängerung gelten die Bedingungen dieses Vertrags.')
      + para(4, 'Voraussetzung jedes Einsatzes ist, dass die Einrichtung der Anwesenheit der Begleitperson zustimmt (Hausrecht). Haus-, Hygiene- und Besuchsregeln der Einrichtung sowie Anordnungen ihres Personals gehen diesem Vertrag vor. Die Einrichtung wurde informiert und hat zugestimmt am '
        + feld(datum(e.zustimmungAm), 'kurz') + ' durch ' + feld(e.zustimmungDurch) + '.')
      + para(5, 'Untersagt, unterbricht oder beendet die Einrichtung einen Einsatz, ist das keine Pflichtverletzung des Vereins.'));

    h.push('<div class="vv-block"><h2>§ 5 Vergütung, Abrechnung</h2>'
      + para(1, 'Die Vergütung beträgt je Nacht (' + esc(mA.stunden) + ' Stunden) pauschal <b>' + eur(mA.pauschale_cents) + '</b>. Eine begonnene Nacht gilt als vollständig erbracht.') + '</div>'
      + para(2, 'Voraussichtliche Gesamtvergütung: ' + feld(r.naechte > 0 ? String(r.naechte) : '', 'kurz') + ' Nächte × '
        + (r.pauschale_cents != null ? eur(r.pauschale_cents) : feld('', 'kurz') + ' €') + ' = <b>'
        + (r.summe_cents != null ? eur(r.summe_cents) : feld('', 'kurz') + ' €') + '</b>.')
      + para(3, 'Wünscht die Auftraggeberin / der Auftraggeber im Einzelfall eine längere Anwesenheit und kann der Verein sie leisten, werden je angefangene Zusatzstunde ' + eur(werte.zusatzstunde_cents) + ' berechnet.')
      + para(4, esc(werte.steuerhinweis))
      + para(5, 'Der Verein rechnet nach Abschluss des Einsatzes ab, bei Einsätzen von mehr als 14 Nächten zusätzlich nach der 14. Nacht, jeweils auf Grundlage des Leistungsnachweises. Rechnungen sind innerhalb von 14 Tagen ohne Abzug auf das in der Rechnung genannte Konto des Vereins zu zahlen.')
      + para(6, 'Entgelte nach diesem Vertrag sind keine Spenden. Zuwendungsbestätigungen werden dafür nicht ausgestellt.'));

    // Fassung 2026-11-24-3: keine Ausfallpauschale, keine Stornoregel (Absprache mit der Kundin).
    h.push('<div class="vv-block"><h2>§ 6 Nächte, die nicht stattfinden</h2>'
      + para(1, 'Berechnet werden nur Nächte, in denen die Begleitung tatsächlich stattgefunden hat.') + '</div>'
      + para(2, 'Kann der Verein eine Nacht nicht besetzen, informiert er unverzüglich und bemüht sich um Ersatz. Die Vergütung für diese Nacht entfällt. Weitergehende Ansprüche bestehen nur nach Maßgabe von § 8.'));

    h.push('<div class="vv-block"><h2>§ 7 Mitwirkung</h2>'
      + para(1, 'Die Auftraggeberin / der Auftraggeber informiert den Verein wahrheitsgemäß über die für die Begleitung wesentlichen Umstände (z. B. Gewohnheiten, Verhalten in der Nacht, Sturzgefahr, Vorgaben der Einrichtung) und teilt Änderungen unverzüglich mit.') + '</div>'
      + para(2, 'Die Auftraggeberin / der Auftraggeber stellt sicher, dass die Einrichtung mit der Anwesenheit der Begleitpersonen einverstanden ist, und unterstützt den Verein bei der Abstimmung mit der Einrichtung.'));

    h.push('<div class="vv-block"><h2>§ 8 Haftung</h2>'
      + para(1, 'Der Verein haftet unbeschränkt bei Vorsatz und grober Fahrlässigkeit sowie bei Verletzung von Leben, Körper oder Gesundheit.') + '</div>'
      + para(2, 'Bei leicht fahrlässiger Verletzung wesentlicher Vertragspflichten haftet der Verein begrenzt auf den vertragstypischen, vorhersehbaren Schaden. Im Übrigen ist die Haftung für leichte Fahrlässigkeit ausgeschlossen.')
      + para(3, 'Der Verein unterhält eine Betriebshaftpflichtversicherung.'));

    h.push('<div class="vv-block"><h2>§ 9 Laufzeit, Kündigung</h2>'
      + para(1, 'Der Vertrag beginnt mit der ersten und endet mit der letzten vereinbarten Nacht, ohne dass es einer Kündigung bedarf.') + '</div>'
      + para(2, 'Die Auftraggeberin / der Auftraggeber kann den Vertrag jederzeit in Textform kündigen.')
      + para(3, 'Der Verein kann mit einer Frist von drei Tagen in Textform kündigen. Das Recht beider Parteien zur fristlosen Kündigung aus wichtigem Grund bleibt unberührt.')
      + para(4, 'Der Vertrag endet ohne Kündigung, wenn die begleitete Person verstirbt oder dauerhaft aus der Einrichtung auszieht.'));

    h.push('<div class="vv-block"><h2>§ 10 Datenschutz</h2>'
      + para(1, 'Der Verein verarbeitet personenbezogene Daten der Vertragsparteien und der begleiteten Person ausschließlich zur Durchführung dieses Vertrags nach Maßgabe der DSGVO. Angaben zur Gesundheit werden nur erhoben, soweit sie für die Begleitung erforderlich sind.') + '</div>'
      + para(2, 'Die Einsatzdokumentation des Vereins wird unter einer Fallnummer geführt.')
      + para(3, mu ? 'Einzelheiten ergeben sich aus der Datenschutzinformation des Vereins, die dieser Vertragsbestätigung beiliegt.'
        : 'Einzelheiten ergeben sich aus der Datenschutzinformation des Vereins, die die Auftraggeberin / der Auftraggeber erhalten hat.'));

    h.push('<div class="vv-block"><h2>§ 11 Widerrufsrecht, Beginn der Leistung, Übermittlung</h2>'
      + para(1, 'Der Auftraggeberin / dem Auftraggeber steht als Verbraucher ein Widerrufsrecht nach Maßgabe der Widerrufsbelehrung in Anlage 1 zu. Das Muster-Widerrufsformular ist als Anlage 2 beigefügt.') + '</div>'
      + (mu
        ? para(2, 'Soll der Verein vor Ablauf der Widerrufsfrist mit der Leistung beginnen, bestätigt die Auftraggeberin / der Auftraggeber das bitte in Textform, zum Beispiel als Antwort auf die E-Mail mit dieser Vertragsbestätigung, mit dem Satz: „Ich verlange ausdrücklich, dass der Verein vor Ablauf der Widerrufsfrist mit der Leistung beginnt.“ Bei einem Widerruf ist für die bis dahin erbrachten Nächte die vereinbarte Vergütung anteilig zu zahlen.')
          + '<div class="vv-optin"><div class="vv-opt"><span class="vv-nr">(3)</span>' + cb(er.emailPdf) + '<p>Die Auftraggeberin / der Auftraggeber ist einverstanden, diese Vertragsbestätigung mit allen Anlagen als PDF per E-Mail an die oben genannte Adresse zu erhalten.</p></div></div>'
        : '<div class="vv-optin"><div class="vv-opt"><span class="vv-nr">(2)</span>' + cb(er.leistungsbeginn) + '<p>Ich verlange ausdrücklich, dass der Verein vor Ablauf der Widerrufsfrist mit der Leistung beginnt. Mir ist bekannt, dass ich bei einem Widerruf für die bis dahin erbrachten Nächte die vereinbarte Vergütung anteilig zu zahlen habe.</p></div></div>'
          + '<div class="vv-optin"><div class="vv-opt"><span class="vv-nr">(3)</span>' + cb(er.emailPdf) + '<p>Ich bin einverstanden, dass ich diesen Vertrag mit allen Anlagen als PDF per E-Mail an die oben genannte Adresse erhalte.</p></div></div>'));

    h.push('<div class="vv-block"><h2>§ 12 Schlussbestimmungen</h2>'
      + para(1, 'Änderungen und Ergänzungen dieses Vertrags bedürfen der Textform.') + '</div>'
      + para(2, 'Sollte eine Bestimmung unwirksam sein, bleibt der Vertrag im Übrigen wirksam.')
      + para(3, 'Der Verein ist nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.'));

    // Ab hier ein Block: Unterschriften nie allein auf einer Seite.
    h.push('<div class="vv-schluss">');
    h.push('<p><b>Anlagen:</b> 1 Widerrufsbelehrung · 2 Muster-Widerrufsformular · 3 Kostenvoranschlag</p>');

    // Empfangsbestaetigungen: Briefing Ablauf Schritt 5 verlangt sie einzeln und
    // im PDF sichtbar; Anlage B hat dafuer keinen eigenen Text (Checkpoint 2).
    if (!mu) {
      h.push('<div class="vv-bestaet"><h2>Empfangsbestätigungen der Auftraggeberin / des Auftraggebers</h2>'
        + '<div class="vv-opt">' + cb(er.widerrufErhalten) + '<p>Ich habe die Widerrufsbelehrung (Anlage 1) und das Muster-Widerrufsformular (Anlage 2) erhalten.</p></div>'
        + '<div class="vv-opt">' + cb(er.datenschutzErhalten) + '<p>Ich habe die Datenschutzinformation des Vereins erhalten.</p></div></div>');
    } else {
      h.push('<p>Dieser Vertragsbestätigung liegt außerdem die Datenschutzinformation des Vereins bei.</p>');
    }

    function unterschrift(bild, zeile2) {
      return '<div class="col"><div class="vv-sig-flaeche">'
        + (bild ? '<img src="' + esc(bild) + '" alt="Unterschrift">' : '') + '</div>'
        + '<div class="cap">' + zeile2 + '</div></div>';
    }
    function ohneUnterschrift(zeile2) {
      return '<div class="col"><div class="vv-sig-flaeche vv-sig-muendlich"><p>mündlich geschlossen am ' + feld(datum(d.datum), 'kurz') + '</p></div>'
        + '<div class="cap">' + zeile2 + '</div></div>';
    }
    h.push('<div class="vv-sig">'
      + '<p class="vv-ortdatum">' + feld(d.ort, 'kurz') + ', ' + feld(datum(mu && !leer(d.bestaetigtAm) ? d.bestaetigtAm : d.datum), 'kurz') + '</p>'
      + '<div class="vv-sig-reihe">'
      + (mu ? ohneUnterschrift('<b>Auftraggeberin / Auftraggeber</b> – ' + feld(nameVoll(k)))
        : unterschrift(u.kundin, '<b>Auftraggeberin / Auftraggeber</b> – ' + feld(d.nameDruck)))
      + unterschrift(u.verein, '<b>Für den Verein</b> – Eric Borchert, Vorstandsvorsitzender, Leben Pflegen Reisen e. V.')
      + '</div></div>');
    h.push('</div>');
    return h.join('\n');
  }

  // ── Anlage 1 und 2 (gesetzliches Muster) ───────────────────────────────

  function widerrufBlatt(d, v) {
    return '<div class="vv-akzent"></div><h1 class="vv-anlage">Anlage 1 – Widerrufsbelehrung</h1>'
      + '<h2 class="first">Widerrufsrecht</h2>'
      + '<p>Sie haben das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen Vertrag zu widerrufen. Die Widerrufsfrist beträgt vierzehn Tage ab dem Tag des Vertragsabschlusses.</p>'
      + '<p>Um Ihr Widerrufsrecht auszuüben, müssen Sie uns (Leben Pflegen Reisen e. V., ' + vereinAnschrift(v)
      + ', Telefon ' + esc(v.telefon) + ', E-Mail ' + esc(v.email) + ') mittels einer eindeutigen Erklärung (z. B. ein mit der Post versandter Brief oder eine E-Mail) über Ihren Entschluss, diesen Vertrag zu widerrufen, informieren. Sie können dafür das beigefügte Muster-Widerrufsformular verwenden, das jedoch nicht vorgeschrieben ist.</p>'
      + '<p>Zur Wahrung der Widerrufsfrist reicht es aus, dass Sie die Mitteilung über die Ausübung des Widerrufsrechts vor Ablauf der Widerrufsfrist absenden.</p>'
      + '<h2>Folgen des Widerrufs</h2>'
      // Halbsatz zu den Lieferkosten aus dem gesetzlichen Muster (fehlte in Anlage B).
      + '<p>Wenn Sie diesen Vertrag widerrufen, haben wir Ihnen alle Zahlungen, die wir von Ihnen erhalten haben, einschließlich der Lieferkosten (mit Ausnahme der zusätzlichen Kosten, die sich daraus ergeben, dass Sie eine andere Art der Lieferung als die von uns angebotene, günstigste Standardlieferung gewählt haben), unverzüglich und spätestens binnen vierzehn Tagen ab dem Tag zurückzuzahlen, an dem die Mitteilung über Ihren Widerruf dieses Vertrags bei uns eingegangen ist. Für diese Rückzahlung verwenden wir dasselbe Zahlungsmittel, das Sie bei der ursprünglichen Transaktion eingesetzt haben, es sei denn, mit Ihnen wurde ausdrücklich etwas anderes vereinbart; in keinem Fall werden Ihnen wegen dieser Rückzahlung Entgelte berechnet.</p>'
      + '<p>Haben Sie verlangt, dass die Dienstleistungen während der Widerrufsfrist beginnen sollen, so haben Sie uns einen angemessenen Betrag zu zahlen, der dem Anteil der bis zu dem Zeitpunkt, zu dem Sie uns von der Ausübung des Widerrufsrechts hinsichtlich dieses Vertrags unterrichten, bereits erbrachten Dienstleistungen im Vergleich zum Gesamtumfang der im Vertrag vorgesehenen Dienstleistungen entspricht.</p>';
  }

  function formularBlatt(d, v) {
    var n = d.nummern || {};
    var linie = '<span class="vv-linie lang"></span>';
    return '<div class="vv-akzent"></div><h1 class="vv-anlage">Anlage 2 – Muster-Widerrufsformular</h1>'
      + '<p>(Wenn Sie den Vertrag widerrufen wollen, füllen Sie bitte dieses Formular aus und senden Sie es zurück.)</p>'
      + '<p>An Leben Pflegen Reisen e. V., ' + vereinAnschrift(v) + ', E-Mail ' + esc(v.email) + '</p>'
      // Wahl Waren/Dienstleistung und "erhalten am" wie im gesetzlichen Muster.
      + '<p>Hiermit widerrufe(n) ich/wir (*) den von mir/uns (*) abgeschlossenen Vertrag über den Kauf der folgenden Waren (*)/die Erbringung der folgenden Dienstleistung (*): Nachtbegleitung, Vertrags-Nr. ' + feld(n.vertrag) + '</p>'
      + '<p class="vv-formzeile">Bestellt am (*)/erhalten am (*): ' + linie + '</p>'
      + '<p class="vv-formzeile">Name des/der Verbraucher(s): ' + linie + '</p>'
      + '<p class="vv-formzeile">Anschrift des/der Verbraucher(s): ' + linie + '</p>'
      + '<p class="vv-formzeile">Unterschrift des/der Verbraucher(s) (nur bei Mitteilung auf Papier): ' + linie + '</p>'
      + '<p class="vv-formzeile">Datum: ' + linie + '</p>'
      + '<p>(*) Unzutreffendes streichen.</p>';
  }

  // ── Datenschutzinformation (Fassung FASSUNG_DATENSCHUTZ) ───────────────
  // Neu geschrieben am 24.11.2026 (es gab keine) und am selben Tag fertig
  // gemacht: Rechtsgrundlagen, Anbieter und Fristen ohne offene Pruefvermerke.
  // Keine anwaltlich gepruefte Fassung.

  function datenschutzBlatt(d, v) {
    return '<div class="vv-akzent"></div><h1 class="vv-anlage">Datenschutzinformation</h1>'
      + '<div class="vv-unter">für Auftraggeberinnen und Auftraggeber einer Nachtbegleitung (Art. 13 und 14 DSGVO)</div>'
      + '<h2>1. Wer ist verantwortlich?</h2>'
      + '<p>Leben Pflegen Reisen e. V., ' + vereinAnschrift(v) + ', ' + esc(v.register) + ', vertreten durch den Vorstand. Telefon ' + esc(v.telefon)
      + '. Fragen zum Datenschutz richten Sie bitte an datenschutz@lebenpflegenreisen.de oder an die genannte Anschrift.</p>'
      + '<h2>2. Welche Daten wir verarbeiten</h2>'
      + '<ul class="vv-strich">'
      + '<li>Von Ihnen: Name, Anschrift, Telefon, E-Mail-Adresse, die Handlungsform (eigener Name oder Vertretung), Ihre Unterschrift und die Angaben aus der Abrechnung.</li>'
      + '<li>Von der begleiteten Person: Name, Einrichtung, Wohnbereich oder Apartment sowie Angaben zu Gewohnheiten und zum Verhalten in der Nacht, soweit Sie oder die Einrichtung sie uns für die Begleitung mitteilen. Darunter können Angaben zur Gesundheit sein, zum Beispiel eine Sturzgefahr.</li>'
      + '<li>Von der Einrichtung: Name, Funktion und Telefon der Ansprechperson.</li>'
      + '</ul>'
      + '<p>Die Angaben zur begleiteten Person und zur Ansprechperson der Einrichtung erhalten wir von Ihnen oder von der Einrichtung.</p>'
      + '<h2>3. Wofür und auf welcher Grundlage</h2>'
      + '<ul class="vv-strich">'
      + '<li>Abschluss und Durchführung des Vertrags, Einsatzplanung, Abstimmung mit der Einrichtung, Rückmeldungen und Abrechnung: Art. 6 Abs. 1 Buchst. b DSGVO.</li>'
      + '<li>Angaben zur Gesundheit der begleiteten Person verarbeiten wir nur, soweit sie für eine sichere Begleitung erforderlich sind: Art. 9 Abs. 2 Buchst. h und Abs. 3 DSGVO in Verbindung mit § 22 Abs. 1 Nr. 1 Buchst. b BDSG (Versorgung im Sozialbereich). Unsere Begleitpersonen sind schriftlich zur Verschwiegenheit verpflichtet. In einem Notfall geben wir die nötigen Angaben an das Personal der Einrichtung und den Rettungsdienst weiter: Art. 9 Abs. 2 Buchst. c DSGVO.</li>'
      + '<li>Name und Telefon der Ansprechperson der Einrichtung: Art. 6 Abs. 1 Buchst. f DSGVO; unser berechtigtes Interesse ist die Abstimmung des Einsatzes.</li>'
      + '<li>Aufbewahrung nach Steuerrecht: Art. 6 Abs. 1 Buchst. c DSGVO in Verbindung mit § 147 der Abgabenordnung.</li>'
      + '</ul>'
      + '<h2>4. Wie wir die Daten ablegen</h2>'
      + '<p>Vertrag, Kostenvoranschlag und Anlagen entstehen beim Termin auf einem Tablet des Vereins. Sie erhalten sie per E-Mail, eine Kopie geht an das Vorstandspostfach des Vereins und wird dort für die Dauer der Aufbewahrungspflicht aufbewahrt. In unserem Portal stehen nur Vertragsnummer, Fallnummer, Zeitraum, Anzahl der Nächte, Betrag und Bearbeitungsstand, keine Namen. Die Einsatzdokumentation führen wir unter der Fallnummer. Auf dem Tablet werden Ihre Eingaben nach dem Versand gelöscht.</p>'
      + '<h2>5. Wer die Daten erhält</h2>'
      + '<ul class="vv-strich">'
      + '<li>die eingesetzten Begleitpersonen, und nur das, was sie für die Nacht brauchen,</li>'
      + '<li>die Einrichtung, zur Abstimmung des Einsatzes und für die Übergabe,</li>'
      + '<li>Dienstleister, die in unserem Auftrag und nach unseren Weisungen arbeiten (Art. 28 DSGVO): E-Mail-Postfach (Google Workspace, Google Ireland Ltd., Dublin), E-Mail-Versand (Resend, Inc., USA) und Portal-Datenbank (Supabase, Inc., USA, Rechenzentrum in Frankfurt am Main),</li>'
      + '<li>Steuerberatung und Finanzbehörden, soweit das Gesetz es verlangt.</li>'
      + '</ul>'
      + '<p>Soweit dabei Daten in die USA gelangen, stützen wir uns auf den Angemessenheitsbeschluss der EU-Kommission zum EU-US Data Privacy Framework (Art. 45 DSGVO) oder, wo dieser nicht greift, auf die Standardvertragsklauseln der EU-Kommission (Art. 46 Abs. 2 Buchst. c DSGVO). Zu Werbezwecken geben wir keine Daten weiter.</p>'
      + '<h2>6. Wie lange wir die Daten speichern</h2>'
      + '<p>Rechnungen bewahren wir acht Jahre auf, Vertrag, Kostenvoranschlag und die übrigen steuerlich bedeutsamen Unterlagen sechs Jahre, jeweils ab Ende des Kalenderjahres (§ 147 Abgabenordnung). Angaben zur begleiteten Person, die nur für die Begleitung nötig waren, etwa zu Gewohnheiten oder zur Gesundheit, löschen wir spätestens drei Monate nach dem Ende des Einsatzes. Darüber hinaus speichern wir Daten nur, solange Ansprüche aus dem Vertrag geltend gemacht werden können.</p>'
      + '<h2>7. Ihre Rechte</h2>'
      + '<p>Sie haben das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18) und Datenübertragbarkeit (Art. 20). Einer Verarbeitung auf Grundlage unseres berechtigten Interesses können Sie widersprechen (Art. 21). Sie können sich bei einer Datenschutz-Aufsichtsbehörde beschweren, zum Beispiel bei der Berliner Beauftragten für Datenschutz und Informationsfreiheit.</p>'
      + '<h2>8. Müssen Sie die Daten angeben?</h2>'
      + '<p>Ohne die Angaben zu Ihrer Person, zur begleiteten Person und zur Einrichtung können wir den Vertrag nicht schließen. Angaben zur Gesundheit sind freiwillig; ohne sie kann die Begleitung weniger gut auf die Person eingehen. Eine automatisierte Entscheidung findet nicht statt.</p>';
  }

  // ── Pakete ─────────────────────────────────────────────────────────────

  /** Neue Seite: der Umbruch sitzt auf der Huelle selbst — ein leeres div davor greift bei html2pdf zu spaet. */
  function seite(html) { return '<section class="vv-umbruch">' + html + '</section>'; }

  /** Kostenvoranschlag allein (vor dem Vertrag). */
  function kvHtml(d, werte, verein) {
    return '<div class="vv-doc">' + kvBlatt(d || {}, werte, verein, false) + '</div>';
  }

  /** Vertrag + Anlage 1 + Anlage 2 + Anlage 3 (KV) + Datenschutzinformation. */
  function paketHtml(d, werte, verein) {
    d = d || {};
    return '<div class="vv-doc">'
      + vertragBlatt(d, werte, verein)
      + seite(widerrufBlatt(d, verein))
      + seite(formularBlatt(d, verein))
      + seite(kvBlatt(d, werte, verein, true))
      + seite(datenschutzBlatt(d, verein))
      + '</div>';
  }

  /** Datenschutzinformation allein (zum Aushaendigen, Ablage im Drive). */
  function datenschutzHtml(verein) {
    return '<div class="vv-doc">' + kopf() + datenschutzBlatt({}, verein) + '</div>';
  }

  /** Betreff und Text der Vertragsmail (Briefing 3., Wortlaut fest). */
  function vertragMail(d, verein) {
    var k = d.kundin || {}, p = d.person || {};
    if (muendlich(d)) {
      return {
        // Gleicher Betreff wie beim Vertrag vor Ort: die Edge Function prueft ihn gegen ein festes Muster.
        betreff: 'Ihr Vertrag mit Leben Pflegen Reisen e. V. – Nachtbegleitung ' + initialen(p),
        text: [
          'Guten Tag ' + anredeName(k) + ',',
          '',
          'vielen Dank für das Gespräch am ' + datum(d.datum) + '. Wie besprochen erhalten Sie im Anhang die schriftliche Bestätigung unseres Dienstleistungsvertrags über die Nachtbegleitung, mit Widerrufsbelehrung, Muster-Widerrufsformular, Kostenvoranschlag und Datenschutzinformation.',
          '',
          'Damit wir wie vereinbart schon vor Ablauf der Widerrufsfrist beginnen dürfen, antworten Sie bitte kurz auf diese E-Mail mit diesen beiden Sätzen:',
          '',
          '„Ich verlange ausdrücklich, dass der Verein vor Ablauf der Widerrufsfrist mit der Leistung beginnt. Die Widerrufsbelehrung, das Muster-Widerrufsformular und die Datenschutzinformation habe ich erhalten.“',
          '',
          'Bei Fragen erreichen Sie mich jederzeit unter ' + verein.telefon + '.',
          '',
          'Herzliche Grüße',
          'Eric Borchert',
          'Vorstandsvorsitzender, Leben Pflegen Reisen e. V.'
        ].join('\n')
      };
    }
    return {
      betreff: 'Ihr Vertrag mit Leben Pflegen Reisen e. V. – Nachtbegleitung ' + initialen(p),
      text: [
        'Guten Tag ' + anredeName(k) + ',',
        '',
        'vielen Dank für Ihr Vertrauen. Im Anhang finden Sie den heute unterschriebenen Dienstleistungsvertrag mit Kostenvoranschlag, Widerrufsbelehrung und Muster-Widerrufsformular.',
        '',
        'Bei Fragen erreichen Sie mich jederzeit unter ' + verein.telefon + '.',
        '',
        'Herzliche Grüße',
        'Eric Borchert',
        'Vorstandsvorsitzender, Leben Pflegen Reisen e. V.'
      ].join('\n')
    };
  }

  /** KV-Mail — ENTWURF von Claude (24.11.2026), braucht Erics Freigabe. */
  function kvMail(d, verein) {
    var k = d.kundin || {}, p = d.person || {};
    return {
      betreff: 'Ihr Kostenvoranschlag von Leben Pflegen Reisen e. V. – Nachtbegleitung ' + initialen(p),
      text: [
        'Guten Tag ' + anredeName(k) + ',',
        '',
        'vielen Dank für das Gespräch. Im Anhang finden Sie unseren Kostenvoranschlag für die Nachtbegleitung. Er ist unverbindlich und gilt bis ' + datum(d.kvGueltigBis) + '.',
        '',
        'Wenn Sie sich für die Begleitung entscheiden, schließen wir den Dienstleistungsvertrag gern bei einem Termin vor Ort. Bei Fragen erreichen Sie mich jederzeit unter ' + verein.telefon + '.',
        '',
        'Herzliche Grüße',
        'Eric Borchert',
        'Vorstandsvorsitzender, Leben Pflegen Reisen e. V.'
      ].join('\n')
    };
  }

  var VertragVorort = {
    FASSUNG: FASSUNG, FASSUNG_DATENSCHUTZ: FASSUNG_DATENSCHUTZ, VARIANTEN: VARIANTEN,
    berechne: berechne, gate: gate, pflichtfehlt: pflichtfehlt, muendlich: muendlich,
    naechteZwischen: naechteZwischen, plusTage: plusTage, uhrPlus: uhrPlus, dauer: dauer,
    eur: eur, datum: datum, initialen: initialen,
    kvHtml: kvHtml, paketHtml: paketHtml, datenschutzHtml: datenschutzHtml, vertragMail: vertragMail, kvMail: kvMail
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = VertragVorort;
  else if (typeof window !== 'undefined') window.VertragVorort = VertragVorort;
})();
