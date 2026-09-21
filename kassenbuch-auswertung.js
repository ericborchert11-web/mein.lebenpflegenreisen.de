/**
 * Kassenbuch — Auswertung, Saldo-Abgleich und CSV-Export.
 *
 * Reine Rechnung auf den geladenen Buchungen: kein DOM, kein Supabase, keine
 * eigene Datenbanksicht. Pruefbar mit
 *   node scripts/pruefe-kassenbuch-auswertung.mjs
 */
(function () {
  'use strict';

  function cents(b) { return Number((b && b.betrag_cents) || 0); }

  /**
   * Summen fuer die Kassenpruefung.
   *
   * SPHAEREN WERDEN NICHT GERATEN: Nur Buchungen mit eigenem Kostenbeleg
   * tragen eine. Was an einer Rechnung oder einem Antrag haengt, erscheint als
   * eigener Block — in welche Sphaere diese Bloecke gehoeren, ist eine
   * Steuerfrage und gehoert in die Erklaerung, nicht in dieses Portal.
   */
  function auswertung(buchungen) {
    var liste = buchungen || [];
    var jeKostenart = {}, jeSphaere = {};
    var einnahmenRechnungen = 0, auszahlungenAntraege = 0;
    var ohneZuordnung = 0, ohneBeleg = 0, sonstige = 0;

    liste.forEach(function (b) {
      var betrag = cents(b);
      if (b.invoice_id)      einnahmenRechnungen  += betrag;
      else if (b.claim_id)   auszahlungenAntraege += betrag;
      else if (b.kostenart) {
        jeKostenart[b.kostenart] = (jeKostenart[b.kostenart] || 0) + betrag;
        var sp = b.sphaere || 'ohne';
        jeSphaere[sp] = (jeSphaere[sp] || 0) + betrag;
        if (!b.beleg_url) ohneBeleg++;
      } else { ohneZuordnung++; sonstige += betrag; }
    });

    var alsListe = function (obj, schluessel) {
      return Object.keys(obj).sort().map(function (k) {
        var z = { betrag_cents: obj[k] }; z[schluessel] = k; return z;
      });
    };

    return {
      einnahmenRechnungen: einnahmenRechnungen,
      auszahlungenAntraege: auszahlungenAntraege,
      jeKostenart: alsListe(jeKostenart, 'kostenart'),
      jeSphaere:   alsListe(jeSphaere, 'sphaere'),
      ohneZuordnung: ohneZuordnung,
      ohneBeleg: ohneBeleg,
      sonstige: sonstige,
      summe: liste.reduce(function (s, b) { return s + cents(b); }, 0)
    };
  }

  /**
   * Stellt den abgetippten Kontostand dem gerechneten gegenueber.
   *
   * Gerechnet wird ab dem FRUEHESTEN erfassten Stand, nicht ab Null: Wer erst
   * mitten im Jahr anfaengt, haette sonst dauerhaft eine Differenz in Hoehe des
   * Anfangsbestands. Der Anker hat damit immer die Differenz 0 — das ist seine
   * Definition, kein Fehler.
   */
  function saldoReihe(buchungen, staende) {
    var liste = (staende || []).slice().sort(function (a, b) {
      return String(a.stichtag).localeCompare(String(b.stichtag));
    });
    if (!liste.length) return [];
    var anker = liste[0];

    return liste.map(function (s, i) {
      var bewegung = 0;
      if (i > 0) {
        (buchungen || []).forEach(function (b) {
          var tag = String(b.buchungstag || '');
          if (tag > String(anker.stichtag) && tag <= String(s.stichtag)) bewegung += cents(b);
        });
      }
      var berechnet = Number(anker.stand_cents || 0) + bewegung;
      return {
        id: s.id,
        stichtag: s.stichtag,
        stand_cents: Number(s.stand_cents || 0),
        berechnet_cents: berechnet,
        differenz_cents: Number(s.stand_cents || 0) - berechnet,
        anker: i === 0,
        notiz: s.notiz || ''
      };
    });
  }

  /**
   * Der rechnerische Kontostand zu einem Stichtag.
   *
   * Ohne erfassten Anfangsbestand gibt es KEINEN Kontostand: Die blosse Summe
   * der Buchungen waere nur dann der Stand, wenn das Konto vorher leer war —
   * das behauptet hier niemand. Deshalb `cents: null` statt einer Zahl, die
   * plausibel aussieht und falsch ist.
   */
  function aktuellerStand(buchungen, staende, bisDatum) {
    var liste = (staende || []).slice().sort(function (a, b) {
      return String(a.stichtag).localeCompare(String(b.stichtag));
    });
    if (!liste.length) return { cents: null, anker: null, ankerStand: null };
    var anker = liste[0];
    var bis = String(bisDatum || '9999-12-31');
    var bewegung = 0;
    (buchungen || []).forEach(function (b) {
      var tag = String(b.buchungstag || '');
      if (tag > String(anker.stichtag) && tag <= bis) bewegung += cents(b);
    });
    return {
      cents: Number(anker.stand_cents || 0) + bewegung,
      anker: anker.stichtag,
      ankerStand: Number(anker.stand_cents || 0)
    };
  }

  function deBetrag(c) { return (Number(c || 0) / 100).toFixed(2).replace('.', ','); }

  function feld(wert) {
    var s = String(wert === null || wert === undefined ? '' : wert);
    return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  /** Export fuer den Kassenpruefer: dieselben Spalten wie die Ansicht. */
  function alsCsv(buchungen, namen) {
    var n = namen || {};
    var kopf = ['Datum', 'Art', 'Gegenpartei', 'Verwendungszweck', 'Betrag',
                'Zuordnung', 'Kostenart', 'Sphäre', 'Beleg', 'Notiz'];
    var zeilen = (buchungen || []).map(function (b) {
      var zuordnung = b.invoice_id ? (n[b.invoice_id] || 'Rechnung')
                    : b.claim_id   ? (n[b.claim_id]   || 'Antrag')
                    : b.kostenart  ? 'Kostenbeleg' : 'offen';
      return [
        b.buchungstag, b.buchungstext, b.gegenpartei, b.verwendungszweck,
        deBetrag(b.betrag_cents), zuordnung, b.kostenart, b.sphaere, b.beleg_url, b.notiz
      ].map(feld).join(';');
    });
    return [kopf.join(';')].concat(zeilen).join('\r\n') + '\r\n';
  }

  var KassenbuchAuswertung = {
    auswertung: auswertung,
    saldoReihe: saldoReihe,
    aktuellerStand: aktuellerStand,
    alsCsv: alsCsv,
    deBetrag: deBetrag
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = KassenbuchAuswertung;
  else if (typeof window !== 'undefined') window.KassenbuchAuswertung = KassenbuchAuswertung;
})();
