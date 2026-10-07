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

  /**
   * Das Erloeskonto einer Buchung — dieselbe Regel wie in v_ust_umsatz.
   *
   * Mit Rechnung: das Konto der Rechnung (auch fuer Rueckzahlungen, die
   * mindern). Eingang ohne Vorgang: das eigene Konto, sonst null = "fehlt".
   * Ausgang ohne Rechnung und Rueckfluss eines Antrags: undefined — die
   * gehoeren gar nicht zu den Erloesen und sollen nie als Luecke zaehlen.
   */
  function kontoVon(b, rechnungenNachId) {
    if (b.invoice_id) {
      var r = (rechnungenNachId || {})[b.invoice_id];
      return (r && r.erloeskonto) || null;
    }
    if (b.claim_id || cents(b) <= 0) return undefined;
    return b.erloeskonto || null;
  }

  function ustVon(b, rechnungenNachId) {
    if (b.invoice_id) {
      var r = (rechnungenNachId || {})[b.invoice_id];
      return r ? r.ust_pflichtig : null;
    }
    return b.ust_pflichtig;
  }

  /** Summen je Konto; `ohne` sammelt Erloese, denen das Konto noch fehlt. */
  function jeKonto(buchungen, rechnungenNachId) {
    var summe = { erloes_45a: 0, erloes_klinik: 0, erloes_reisen: 0, sonstige: 0, ohne: 0 };
    (buchungen || []).forEach(function (b) {
      var k = kontoVon(b, rechnungenNachId);
      if (k === undefined) return;
      summe[k || 'ohne'] += cents(b);
    });
    return summe;
  }

  function deBetrag(c) { return (Number(c || 0) / 100).toFixed(2).replace('.', ','); }

  function jaNein(w) { return w === true ? 'ja' : w === false ? 'nein' : ''; }

  function feld(wert) {
    var s = String(wert === null || wert === undefined ? '' : wert);
    return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  /** Export fuer den Kassenpruefer: dieselben Spalten wie die Ansicht. */
  function alsCsv(buchungen, namen, rechnungenNachId) {
    var n = namen || {};
    var kopf = ['Datum', 'Art', 'Gegenpartei', 'Verwendungszweck', 'Betrag',
                'Zuordnung', 'Kostenart', 'Sphäre', 'Beleg', 'Notiz',
                'Erlöskonto', 'USt-pflichtig'];
    var zeilen = (buchungen || []).map(function (b) {
      var zuordnung = b.invoice_id ? (n[b.invoice_id] || 'Rechnung')
                    : b.claim_id   ? (n[b.claim_id]   || 'Antrag')
                    : b.kostenart  ? 'Kostenbeleg' : 'offen';
      return [
        b.buchungstag, b.buchungstext, b.gegenpartei, b.verwendungszweck,
        deBetrag(b.betrag_cents), zuordnung, b.kostenart, b.sphaere, b.beleg_url, b.notiz,
        kontoVon(b, rechnungenNachId) || '', jaNein(ustVon(b, rechnungenNachId))
      ].map(feld).join(';');
    });
    return [kopf.join(';')].concat(zeilen).join('\r\n') + '\r\n';
  }

  /**
   * Erloese eines Jahres fuer die Steuerberaterin.
   *
   * Gezaehlt wird wie in der Ampel nach Zahlungseingang (Buchungstag). Dazu
   * kommen festgeschriebene Rechnungen des Jahres, zu denen noch kein Geld auf
   * dem Konto liegt — mit leerem Zahlungseingang, damit sie nicht verloren
   * gehen. Storno-Paare heben sich auf und fehlen; Ausgaben sowieso.
   */
  function erloeseCsv(buchungen, rechnungenNachId, jahr) {
    var rech = rechnungenNachId || {};
    var j = String(jahr);
    var zeilen = [];
    var bezahlt = {};

    (buchungen || []).forEach(function (b) {
      if (b.invoice_id) bezahlt[b.invoice_id] = true;
      if (String(b.buchungstag || '').slice(0, 4) !== j) return;
      var konto = kontoVon(b, rech);
      if (konto === undefined) return;
      var r = b.invoice_id ? rech[b.invoice_id] : null;
      zeilen.push({
        datum: r ? (r.invoice_date || b.buchungstag) : b.buchungstag,
        eingang: b.buchungstag,
        nr: r ? r.invoice_no : '',
        text: r ? (r.betreff || 'Rechnung an ' + (r.recipient_name || '—')) : (b.verwendungszweck || ''),
        konto: konto || '',
        ust: jaNein(ustVon(b, rech)),
        cents: cents(b),
        zahler: b.gegenpartei || (r && r.recipient_name) || ''
      });
    });

    Object.keys(rech).forEach(function (id) {
      var r = rech[id];
      if (bezahlt[id] || String(r.invoice_date || '').slice(0, 4) !== j) return;
      if (r.status !== 'issued' && r.status !== 'paid') return;
      if (r.cancels_invoice_id || r.cancelled_by_invoice_id) return;
      zeilen.push({
        datum: r.invoice_date, eingang: r.paid_on || '', nr: r.invoice_no,
        text: r.betreff || 'Rechnung an ' + (r.recipient_name || '—'),
        konto: r.erloeskonto || '', ust: jaNein(r.ust_pflichtig),
        cents: Number(r.total_cents || 0), zahler: r.recipient_name || ''
      });
    });

    zeilen.sort(function (a, b) {
      return String(a.eingang || a.datum).localeCompare(String(b.eingang || b.datum));
    });
    var kopf = ['Datum', 'Zahlungseingang', 'Belegnr.', 'Beschreibung', 'Erlöskonto', 'USt-pflichtig', 'Betrag', 'Zahler'];
    return [kopf.join(';')].concat(zeilen.map(function (z) {
      return [z.datum, z.eingang, z.nr, z.text, z.konto, z.ust, deBetrag(z.cents), z.zahler].map(feld).join(';');
    })).join('\r\n') + '\r\n';
  }

  var KassenbuchAuswertung = {
    auswertung: auswertung,
    saldoReihe: saldoReihe,
    aktuellerStand: aktuellerStand,
    alsCsv: alsCsv,
    kontoVon: kontoVon,
    jeKonto: jeKonto,
    erloeseCsv: erloeseCsv,
    deBetrag: deBetrag
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = KassenbuchAuswertung;
  else if (typeof window !== 'undefined') window.KassenbuchAuswertung = KassenbuchAuswertung;
})();
