/**
 * Freibetraege nach § 3 Nr. 26 und Nr. 26a EStG — wie viel ist bei einer
 * Person in einem Jahr schon ausgeschoepft, und was bliebe nach einer
 * weiteren Auszahlung?
 *
 * Ohne DOM und ohne Supabase, damit die Regeln ohne Login pruefbar sind:
 *   node scripts/pruefe-ehrenamtspauschale.mjs
 *
 * Die Datenbank rechnet beim Speichern dasselbe noch einmal
 * (Trigger claims_taetigkeit_pruefen) und hat das letzte Wort. Hier geht es
 * um die Anzeige im Formular, BEVOR gespeichert wird.
 *
 * Regeln:
 *  - Zwei getrennte Toepfe: '26' (Uebungsleiter) und '26a' (Ehrenamt).
 *  - Massgeblich ist das Jahr der Auszahlung (paid_at in Berliner Zeit,
 *    sonst das geplante Auszahlungsdatum), nicht das Jahr der Taetigkeit.
 *  - Es zaehlen freigegebene und ausgezahlte Pauschalen, keine Auslagen.
 *  - Die Freibetraege kommen aus steuer_freibetraege, nie aus dem Code.
 */
(function () {
  'use strict';

  /** Jahr eines Zeitpunkts in Berliner Zeit (Silvester-Zahlungen!). */
  function berlinJahr(iso) {
    if (!iso) return null;
    var d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', year: 'numeric' }).format(d));
  }

  /** Jahr, gegen dessen Freibetrag ein Antrag zaehlt. */
  function freibetragJahr(c) {
    if (c.freibetrag_jahr) return Number(c.freibetrag_jahr);
    var j = berlinJahr(c.paid_at);
    if (j) return j;
    if (c.auszahlung_am) return Number(String(c.auszahlung_am).slice(0, 4));
    return berlinJahr(c.submitted_at);
  }

  /**
   * Freibetrag fuer Vorschrift und Jahr aus den Zeilen von
   * steuer_freibetraege. Rueckgabe { cents, freigegeben } oder null.
   */
  function freibetrag(werte, vorschrift, jahr) {
    var passend = (werte || [])
      .filter(function (w) { return w.vorschrift === vorschrift && Number(w.ab_jahr) <= Number(jahr); })
      .sort(function (a, b) { return b.ab_jahr - a.ab_jahr; });
    if (!passend.length) return null;
    return { cents: Number(passend[0].betrag_cents), freigegeben: !!passend[0].freigabe_sonja_am };
  }

  function art(c) { return c.pauschale_art === '26a' ? '26a' : '26'; }
  function cents(euro) { return Math.round(Number(euro || 0) * 100); }

  /** Summe beim Verein in Cent: Person, Vorschrift, Jahr; ohne Antrag ausserId. */
  function vereinsSumme(claims, userId, vorschrift, jahr, ausserId) {
    return (claims || []).reduce(function (s, c) {
      if (!c || c.user_id !== userId || c.id === ausserId) return s;
      if (c.kind === 'auslage' || art(c) !== vorschrift) return s;
      if (c.status !== 'approved' && c.status !== 'paid') return s;
      if (freibetragJahr(c) !== Number(jahr)) return s;
      return s + cents(c.amount);
    }, 0);
  }

  /**
   * Vorschau fuer eine neue Auszahlung 26a.
   * neu: { user_id, id?, amount (Euro), auszahlung_am, anderweitig_cents }
   * Rueckgabe { jahr, limit, freigegeben, verein, anderweitig, bisher,
   *             diese, verbleibend, ueber } — alles in Cent.
   * null, wenn fuer das Jahr kein Freibetrag hinterlegt ist.
   */
  function vorschau(neu, claims, werte) {
    var jahr = freibetragJahr(neu);
    var fb = freibetrag(werte, '26a', jahr);
    if (!fb) return null;
    var verein = vereinsSumme(claims, neu.user_id, '26a', jahr, neu.id);
    var anderweitig = Math.max(0, Math.round(Number(neu.anderweitig_cents) || 0));
    var bisher = verein + anderweitig;
    var diese = cents(neu.amount);
    var ueber = Math.max(0, Math.min(diese, bisher + diese - fb.cents));
    return {
      jahr: jahr, limit: fb.cents, freigegeben: fb.freigegeben,
      verein: verein, anderweitig: anderweitig, bisher: bisher, diese: diese,
      verbleibend: Math.max(0, fb.cents - bisher - diese), ueber: ueber
    };
  }

  /**
   * Letzte Erklaerung zum anderweitig genutzten Freibetrag im selben Jahr,
   * als Vorbelegung fuer die naechste Auszahlung. null, wenn es keine gibt.
   */
  function letzteErklaerung(claims, userId, jahr) {
    var treffer = (claims || [])
      .filter(function (c) {
        return c.user_id === userId && c.source_type === 'taetigkeit' && c.status !== 'rejected'
          && c.anderweitig_cents != null && freibetragJahr(c) === Number(jahr);
      })
      .sort(function (a, b) { return String(b.submitted_at).localeCompare(String(a.submitted_at)); });
    return treffer.length ? Number(treffer[0].anderweitig_cents) : null;
  }

  /**
   * Jahresstand der eigenen Antraege je Topf, fuer die Ansicht der
   * Ehrenamtlichen. Wie LPR.claimTotals: ausgezahlt = paid, offen =
   * eingereicht oder freigegeben.
   * Rueckgabe { '26': {paid, pending, limit}, '26a': {...} } in Cent;
   * ein Topf ohne Antraege hat paid = pending = 0.
   */
  function jahresStand(claims, jahr, werte) {
    var out = {};
    ['26', '26a'].forEach(function (v) {
      var fb = freibetrag(werte, v, jahr);
      out[v] = { paid: 0, pending: 0, limit: fb ? fb.cents : null };
    });
    (claims || []).forEach(function (c) {
      if (!c || c.kind === 'auslage') return;
      var t = out[art(c)];
      if (c.status === 'paid') {
        if (freibetragJahr(c) === Number(jahr)) t.paid += cents(c.amount);
      } else if (c.status === 'submitted' || c.status === 'approved') {
        if (freibetragJahr(c) === Number(jahr)) t.pending += cents(c.amount);
      }
    });
    return out;
  }

  var Ehrenamtspauschale = {
    berlinJahr: berlinJahr,
    freibetragJahr: freibetragJahr,
    freibetrag: freibetrag,
    vereinsSumme: vereinsSumme,
    vorschau: vorschau,
    letzteErklaerung: letzteErklaerung,
    jahresStand: jahresStand
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Ehrenamtspauschale;
  else if (typeof window !== 'undefined') window.Ehrenamtspauschale = Ehrenamtspauschale;
})();
