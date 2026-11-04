/**
 * Mitgliedsbeitraege — welcher Eingang auf dem Vereinskonto ist der Beitrag
 * welches Mitglieds, und wer hat fuer ein Jahr genug bezahlt?
 *
 * Ohne DOM und ohne Supabase, damit die Regeln ohne Login pruefbar sind:
 *   node scripts/pruefe-mitgliedsbeitrag.mjs
 *
 * LEITSATZ wie im Kassenbuch: Ein falscher Treffer ist schlimmer als gar
 * keiner. Automatisch zugeordnet wird nur, wenn "Beitrag" im Zweck steht UND
 * Vor- und Nachname genau EINES Mitglieds vorkommen. Alles andere bleibt offen
 * und landet mit Vorschlag in "Bitte zuordnen".
 */
(function () {
  'use strict';

  // Sollbetrag je Jahr in Cent. 2026 anteilig April bis Dezember (Anschreiben
  // vom 03.11.2026), danach der Mindestbeitrag 1 € x 12.
  var SOLL = { 2026: 900 };
  var SOLL_STANDARD = 1200;
  function sollCents(jahr) { return SOLL[jahr] != null ? SOLL[jahr] : SOLL_STANDARD; }

  // Aus "Schröder" wird "schroeder", aus "José" "jose": Bankexporte und
  // Verwendungszwecke schreiben Umlaute mal aus, mal nicht.
  function normal(s) {
    return String(s || '').toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, ' ').trim();
  }
  function woerter(s) { var n = normal(s); return n ? n.split(' ') : []; }

  // Auch ohne Umlaut-Ausschreibung: "Schroder" soll "Schröder" treffen.
  function varianten(wort) {
    var v = [wort];
    var kurz = wort.replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u');
    if (kurz !== wort) v.push(kurz);
    return v;
  }
  function enthaeltWort(menge, wort) {
    return varianten(wort).some(function (w) { return menge[w]; });
  }

  function istBeitragsZweck(zweck) {
    return /beitrag/.test(normal(zweck).replace(/ /g, ''));
  }

  /** Jahr aus dem Zweck ("Mitgliedsbeitrag 2026"), sonst das Buchungsjahr. */
  function beitragsJahr(buchung) {
    var m = String(buchung.verwendungszweck || '').match(/\b(20\d\d)\b/);
    return m ? Number(m[1]) : Number(String(buchung.buchungstag || '').slice(0, 4));
  }

  /** Name in Vor- und Nachnamen zerlegen. "Gold, Peppa" kommt nicht vor, Leerzeichen genuegen. */
  function namensteile(fullName) {
    var w = woerter(fullName).filter(function (x) { return x.length > 1; });
    if (!w.length) return null;
    return { vor: w[0], nach: w[w.length - 1], alle: w };
  }

  /**
   * Sucht das Mitglied zu einem Eingang.
   *
   * Rueckgabe { mitglied_id, jahr, sicher, hinweis }:
   *   sicher=true  -> darf ohne Rueckfrage zugeordnet werden
   *   sicher=false -> mitglied_id ist nur ein Vorschlag (oder null)
   * null, wenn die Buchung gar nicht nach Beitrag aussieht.
   */
  function vorschlagFuer(buchung, mitglieder) {
    if (!buchung || Number(buchung.betrag_cents) <= 0) return null;
    var zweck = buchung.verwendungszweck || '';
    var beitrag = istBeitragsZweck(zweck);
    var menge = {};
    woerter(zweck + ' ' + (buchung.gegenpartei || '')).forEach(function (w) { menge[w] = true; });

    var voll = [], nurNach = [];
    (mitglieder || []).forEach(function (m) {
      var t = namensteile(m.full_name);
      if (!t) return;
      var nach = enthaeltWort(menge, t.nach);
      if (nach && enthaeltWort(menge, t.vor)) voll.push(m);
      else if (nach) nurNach.push(m);
    });

    var jahr = beitragsJahr(buchung);
    if (!beitrag) {
      // Ohne "Beitrag" im Zweck nur dann ein Vorschlag, wenn der Name eindeutig
      // passt und der Betrag nach Beitrag aussieht — sonst waere jede
      // Ueberweisung eines Mitglieds (Spende, Reisekosten) ein Kandidat.
      if (voll.length === 1 && Number(buchung.betrag_cents) <= 12000) {
        return { mitglied_id: voll[0].id, jahr: jahr, sicher: false,
                 hinweis: 'Kein „Beitrag“ im Verwendungszweck — bitte prüfen.' };
      }
      return null;
    }
    if (voll.length === 1) return { mitglied_id: voll[0].id, jahr: jahr, sicher: true, hinweis: '' };
    if (voll.length > 1) {
      return { mitglied_id: null, jahr: jahr, sicher: false,
               hinweis: 'Mehrere Mitglieder passen zum Namen — bitte auswählen.' };
    }
    if (nurNach.length === 1) {
      return { mitglied_id: nurNach[0].id, jahr: jahr, sicher: false,
               hinweis: 'Nur der Nachname passt — bitte prüfen.' };
    }
    return { mitglied_id: null, jahr: jahr, sicher: false,
             hinweis: 'Kein Mitglied im Namen erkannt — bitte auswählen.' };
  }

  /**
   * Stand je Mitglied fuer ein Jahr aus den zugeordneten Buchungen.
   * Rueckgabe { [mitglied_id]: { cents, letzte, status } },
   * status: 'bezahlt' | 'teilweise' | 'offen'.
   */
  function standJeMitglied(buchungen, jahr) {
    var soll = sollCents(jahr), stand = {};
    (buchungen || []).forEach(function (b) {
      if (!b.mitglied_id || Number(b.beitrag_jahr) !== Number(jahr)) return;
      var s = stand[b.mitglied_id] || (stand[b.mitglied_id] = { cents: 0, letzte: null });
      s.cents += Number(b.betrag_cents) || 0;
      if (!s.letzte || b.buchungstag > s.letzte) s.letzte = b.buchungstag;
    });
    Object.keys(stand).forEach(function (id) {
      stand[id].status = stand[id].cents >= soll ? 'bezahlt' : stand[id].cents > 0 ? 'teilweise' : 'offen';
    });
    return stand;
  }

  var Mitgliedsbeitrag = {
    vorschlagFuer: vorschlagFuer,
    standJeMitglied: standJeMitglied,
    sollCents: sollCents,
    istBeitragsZweck: istBeitragsZweck,
    normal: normal
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Mitgliedsbeitrag;
  else if (typeof window !== 'undefined') window.Mitgliedsbeitrag = Mitgliedsbeitrag;
})();
