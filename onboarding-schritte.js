/**
 * Onboarding: welcher Schritt ist erledigt, welcher dran, was ist zu tun?
 *
 * Ohne DOM und ohne Supabase, pruefbar mit
 *   node scripts/pruefe-onboarding-schritte.mjs
 *
 * Eingabe ist das Ergebnis der RPC mein_onboarding(). Der Schritt selbst
 * wird in der Datenbank berechnet (onboarding_schritt) — hier wird nur
 * entschieden, WAS die Person dazu liest. Ehrenamtliche werden geduzt.
 *
 * Termine (kennenlernen_am, einfuehrung_am, einarbeitung_am) nach heute
 * gelten als geplant und werden mit Datum genannt. Optional st.heute
 * ('YYYY-MM-DD'), sonst das lokale Datum.
 */
(function () {
  'use strict';

  var TITEL = ['Registrieren', 'Kennenlernen', 'Mitgliedsantrag', 'Einführung & Unterlagen', 'Einarbeitungstag', 'Alles da'];

  var WOCHENTAGE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

  function zwei(n) { return (n < 10 ? '0' : '') + n; }

  // Heutiges Datum lokal als 'YYYY-MM-DD' (ohne Umweg ueber UTC).
  function heuteLokal() {
    var d = new Date();
    return d.getFullYear() + '-' + zwei(d.getMonth() + 1) + '-' + zwei(d.getDate());
  }

  // Nur der Tagesteil zaehlt; 'YYYY-MM-DD' laesst sich als Text vergleichen.
  function tag(wert) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(wert || ''));
    return m ? m[0] : null;
  }

  // Termin liegt nach heute = geplant (heute selbst gilt als gewesen).
  function geplant(wert, st) {
    var t = tag(wert);
    return !!t && t > (tag(st.heute) || heuteLokal());
  }

  // 'YYYY-MM-DD' -> 'Mittwoch, 14.10.2026'. Von Hand zerlegt, Wochentag ueber
  // Date.UTC: keine Zeitzonen-Verschiebung, keine Locale-Daten noetig.
  function datumLang(wert) {
    var t = tag(wert);
    if (!t) return '';
    var j = +t.slice(0, 4), m = +t.slice(5, 7), d = +t.slice(8, 10);
    var wt = WOCHENTAGE[new Date(Date.UTC(j, m - 1, d)).getUTCDay()];
    return wt + ', ' + zwei(d) + '.' + zwei(m) + '.' + j;
  }

  function fertig(st) {
    if (!st) return false;
    if (st.bestand) return true;
    return st.schritt === 6 && !!st.abgeschlossen_am;
  }

  function aktuellNr(st) {
    if (fertig(st)) return 7;
    return st && st.schritt ? st.schritt : 2;
  }

  function inhalt(nr, st) {
    switch (nr) {
      case 1:
        return { text: 'Dein Konto ist angelegt.', bringMit: [], wartetAuf: null, aktion: null };
      case 2:
        if (geplant(st.kennenlernen_am, st)) return {
          text: 'Dein Kennenlernen ist am ' + datumLang(st.kennenlernen_am) + '. Bring bitte deinen Personalausweis mit — dabei füllen wir zusammen den Antrag für die BZR-Abfrage aus.',
          bringMit: ['Personalausweis'], wartetAuf: 'dich', aktion: 'termine' };
        if (!st.kennenlernen_am) return {
          text: 'Wir melden uns innerhalb von zwei Werktagen und machen mit dir einen Termin zum Kennenlernen aus. Dabei füllen wir zusammen den Antrag für die BZR-Abfrage aus.',
          bringMit: ['Personalausweis'], wartetAuf: 'verein', aktion: 'termine' };
        return {
          text: 'Danke fürs Kennenlernen! Deine BZR-Abfrage läuft. Das dauert erfahrungsgemäß einige Wochen — du musst nichts tun. Sobald sie da ist, geht es hier weiter.',
          bringMit: [], wartetAuf: 'verein', aktion: null };
      case 3:
        if (st.antrag_status === 'eingereicht') return {
          text: 'Dein Mitgliedsantrag ist eingegangen. Der Vorstand prüft ihn und meldet sich.',
          bringMit: [], wartetAuf: 'verein', aktion: null };
        return {
          text: (st.antrag_status === 'abgelehnt' ? 'Dein Antrag konnte so nicht angenommen werden — bitte prüfe deine Angaben und reiche ihn neu ein. ' : '')
            + 'Deine BZR-Abfrage ist da. Jetzt fehlen noch dein Mitgliedsantrag und deine Bestätigung zu Datenschutz und Schweigepflicht. Das dauert etwa fünf Minuten.',
          bringMit: [], wartetAuf: 'dich', aktion: 'antrag' };
      case 4:
        return {
          text: (geplant(st.einfuehrung_am, st) ? 'Deine Einführungsveranstaltung ist am ' + datumLang(st.einfuehrung_am) + '. ' : '')
            + 'Melde dich zur Einführungsveranstaltung an. Dort gibt es auch die Belehrung nach dem Infektionsschutzgesetz, und wir schauen uns deine Unterlagen an.',
          bringMit: ['Lebensmittelpass (Bescheinigung nach § 43 IfSG)', 'Impfausweis oder Nachweis zum Masernschutz', 'Erste-Hilfe-Nachweis'],
          wartetAuf: 'dich', aktion: 'termine' };
      case 5:
        if (geplant(st.einarbeitung_am, st)) return {
          text: 'Dein Einarbeitungstag ist am ' + datumLang(st.einarbeitung_am) + '. Für den Tag bekommst du die halbe Sitzwachen-Pauschale.',
          bringMit: [], wartetAuf: 'dich', aktion: 'termine' };
        return {
          text: 'Fast geschafft: Melde dich zu deinem Einarbeitungstag an. Für den Tag bekommst du die halbe Sitzwachen-Pauschale.',
          bringMit: [], wartetAuf: 'dich', aktion: 'termine' };
      case 6:
        return {
          text: 'Alles da! Der Vorstand schaltet dich jetzt frei — danach kannst du dich für Sitzwachen und Reisen eintragen.',
          bringMit: [], wartetAuf: 'verein', aktion: null };
    }
  }

  function schritte(st) {
    st = st || {};
    var akt = aktuellNr(st);
    return TITEL.map(function (titel, i) {
      var nr = i + 1;
      var zustand = nr < akt ? 'erledigt' : (nr === akt ? 'aktuell' : 'offen');
      var s = { nr: nr, titel: titel, zustand: zustand };
      var c = inhalt(nr, st);
      s.text = c.text; s.bringMit = c.bringMit; s.wartetAuf = c.wartetAuf; s.aktion = c.aktion;
      return s;
    });
  }

  function aktueller(st) {
    return schritte(st).filter(function (s) { return s.zustand === 'aktuell'; })[0] || null;
  }

  // Unterlagen aus Schritt 4 duerfen frueh kommen — bis einschliesslich Schritt 4 zeigen.
  function zeigeUnterlagen(st) {
    return !fertig(st) && aktuellNr(st) <= 4;
  }

  var OnboardingSchritte = { TITEL: TITEL, schritte: schritte, aktueller: aktueller, fertig: fertig, zeigeUnterlagen: zeigeUnterlagen, datumLang: datumLang };
  if (typeof module !== 'undefined' && module.exports) module.exports = OnboardingSchritte;
  else if (typeof window !== 'undefined') window.OnboardingSchritte = OnboardingSchritte;
})();
