/**
 * Kassenbuch — Erkennungsregeln: welcher Vorgang steckt hinter einer
 * Kontobewegung?
 *
 * Ohne DOM und ohne Supabase, damit die Regeln ohne Login pruefbar sind:
 *   node scripts/pruefe-kassenbuch-zuordnung.mjs
 *
 * LEITSATZ: Ein falscher Treffer ist schlimmer als gar keiner. Eine Buchung,
 * die offen bleibt, faellt im Arbeitsvorrat auf; eine falsch zugeordnete gilt
 * als erledigt und wird nie wieder angesehen. Deshalb wird nur zugeordnet, wenn
 * Nummer UND Betrag passen und der Treffer eindeutig ist.
 */
(function () {
  'use strict';

  // Sphaeren eines gemeinnuetzigen Vereins. Die Zuordnung entscheidet, in
  // welche Spalte der Anlage Gem der Betrag spaeter faellt — der Vorschlag ist
  // deshalb nur ein Vorschlag und im Dialog aenderbar.
  var KOSTENARTEN = [
    { name: 'Versicherung',            sphaere: 'ideell' },
    { name: 'Recht & Notar',           sphaere: 'ideell' },
    { name: 'Porto & Versand',         sphaere: 'ideell' },
    { name: 'Büro & Material',         sphaere: 'ideell' },
    { name: 'Software & IT',           sphaere: 'ideell' },
    { name: 'Bankgebühren',            sphaere: 'vermoegensverwaltung' },
    { name: 'Fahrt- und Reisekosten',  sphaere: 'zweckbetrieb' },
    { name: 'Aufwandsentschädigung',   sphaere: 'zweckbetrieb' },
    { name: 'Spenden & Weiterleitung', sphaere: 'ideell' },
    { name: 'Sonstiges',               sphaere: 'ideell' }
  ];

  var SPHAEREN = [
    { wert: 'ideell',               name: 'Ideeller Bereich' },
    { wert: 'zweckbetrieb',         name: 'Zweckbetrieb' },
    { wert: 'wirtschaftlich',       name: 'Wirtschaftlicher Geschäftsbetrieb' },
    { wert: 'vermoegensverwaltung', name: 'Vermögensverwaltung' }
  ];

  function sphaereZu(kostenart) {
    for (var i = 0; i < KOSTENARTEN.length; i++) {
      if (KOSTENARTEN[i].name === kostenart) return KOSTENARTEN[i].sphaere;
    }
    return 'ideell';
  }

  /** Betraege vergleichen: Konto in Cent mit Vorzeichen, Antraege in Euro. */
  function gleicherBetrag(centsAufDemKonto, centsImVorgang) {
    return Math.abs(centsAufDemKonto) === Math.abs(centsImVorgang);
  }

  function euroZuCents(betrag) { return Math.round(Number(betrag || 0) * 100); }

  /**
   * Sucht den Vorgang zu einer Buchung.
   *
   * Rueckgabe immer ein Objekt: { art: 'invoice'|'claim'|null, id, bezeichnung,
   * hinweis }. `art: null` mit Hinweis heisst "etwas gefunden, aber nicht
   * belastbar" — das gehoert in die Oberflaeche, damit der Vorstand sieht,
   * warum die Zeile offen bleibt.
   */
  function vorschlagFuer(buchung, welt) {
    var zweck = String((buchung && buchung.verwendungszweck) || '').toUpperCase();
    var cents = Number((buchung && buchung.betrag_cents) || 0);
    var rechnungen = (welt && welt.rechnungen) || [];
    var antraege   = (welt && welt.antraege) || [];
    var leer = { art: null, id: null, bezeichnung: '', hinweis: '' };

    // 1 — Rechnungsnummer
    var mRe = zweck.match(/RE-(\d{4})-(\d{4})/);
    if (mRe) {
      var nummer = 'RE-' + mRe[1] + '-' + mRe[2];
      var treffer = rechnungen.filter(function (r) { return r.invoice_no === nummer; });
      if (treffer.length === 1) {
        if (gleicherBetrag(cents, treffer[0].total_cents)) {
          return { art: 'invoice', id: treffer[0].id, bezeichnung: nummer, hinweis: '' };
        }
        return { art: null, id: null, bezeichnung: nummer,
                 hinweis: 'Rechnung ' + nummer + ' gefunden, aber der Betrag weicht ab.' };
      }
      if (treffer.length > 1) {
        return { art: null, id: null, bezeichnung: nummer,
                 hinweis: 'Mehrere Rechnungen mit der Nummer ' + nummer + ' — nicht eindeutig.' };
      }
    }

    // 2 — Belegnummer eines Antrags
    var mAzb = zweck.match(/LPR-AZB-\d{4}-\d{4}/);
    if (mAzb) {
      var beleg = mAzb[0];
      var tAzb = antraege.filter(function (a) { return String(a.beleg_nr || '').toUpperCase() === beleg; });
      if (tAzb.length === 1) {
        if (gleicherBetrag(cents, euroZuCents(tAzb[0].amount))) {
          return { art: 'claim', id: tAzb[0].id, bezeichnung: beleg, hinweis: '' };
        }
        return { art: null, id: null, bezeichnung: beleg,
                 hinweis: 'Antrag ' + beleg + ' gefunden, aber der Betrag weicht ab.' };
      }
    }

    // 3 — die ersten acht Zeichen der Antrags-ID, so schreibt es die
    //     Zahlungsanweisung ("Antrag 96A9D0D7"). Ohne Trennzeichen dahinter:
    //     im Auszug klebt oft "DATUM 21.09.2026" direkt daran.
    var mId = zweck.match(/ANTRAG\s*([0-9A-F]{8})/);
    if (mId) {
      var praefix = mId[1];
      var tId = antraege.filter(function (a) {
        return String(a.id || '').slice(0, 8).toUpperCase() === praefix;
      });
      if (tId.length > 1) {
        return { art: null, id: null, bezeichnung: praefix,
                 hinweis: 'Mehrere Anträge beginnen mit ' + praefix + ' — nicht eindeutig.' };
      }
      if (tId.length === 1) {
        if (gleicherBetrag(cents, euroZuCents(tId[0].amount))) {
          return { art: 'claim', id: tId[0].id, bezeichnung: tId[0].beleg_nr || praefix, hinweis: '' };
        }
        return { art: null, id: null, bezeichnung: praefix,
                 hinweis: 'Antrag ' + praefix + ' gefunden, aber der Betrag weicht ab.' };
      }
    }

    return leer;
  }

  var KassenbuchZuordnung = {
    vorschlagFuer: vorschlagFuer,
    sphaereZu: sphaereZu,
    KOSTENARTEN: KOSTENARTEN,
    SPHAEREN: SPHAEREN
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = KassenbuchZuordnung;
  else if (typeof window !== 'undefined') window.KassenbuchZuordnung = KassenbuchZuordnung;
})();
