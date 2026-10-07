/**
 * Pflichthinweise auf Rechnungen — je Erloeskonto genau ein Text.
 *
 * Ohne DOM und ohne Supabase, damit die Regeln ohne Login pruefbar sind:
 *   node scripts/pruefe-rechnung-hinweise.mjs
 *
 * Die Texte stehen hier an EINER Stelle und woertlich so, wie sie mit der
 * Steuerberaterin abgestimmt sind. Wer sie aendert, aendert, was auf jeder
 * kuenftigen Rechnung beim Kunden liegt — vorher Freigabe einholen.
 *
 * Solange der Verein Kleinunternehmer ist, gibt es keinen USt-Ausweis. Der
 * Wechsel in die Regelbesteuerung ist ein eigener Vorstandsbeschluss und
 * aendert diese Datei.
 */
(function () {
  'use strict';

  var TEXT_19 = 'Umsatzsteuerfrei nach § 19 UStG (Kleinunternehmerregelung).';
  var TEXT_45A = 'Umsatzsteuerfrei nach § 4 Nr. 16 Satz 1 Buchst. g UStG – nach § 45a SGB XI '
    + 'landesrechtlich anerkanntes Angebot zur Unterstützung im Alltag (Bescheid SenWGP vom 06.10.2026).';

  /**
   * Der Hinweis zu Konto und USt-Kennzeichen.
   * '' = bewusst kein Hinweis (sonstige Einnahmen), null = Konto fehlt noch.
   */
  function hinweisFuer(konto, ustPflichtig) {
    if (!konto) return null;
    if (konto === 'erloes_klinik') return TEXT_19;
    if (konto === 'erloes_45a') return TEXT_45A;
    // Reisen: nur wenn der Vorstand die Reise ausdruecklich als 45a-gedeckt
    // markiert hat. Ohne Wahl die vorsichtige Seite.
    if (konto === 'erloes_reisen') return ustPflichtig === false ? TEXT_45A : TEXT_19;
    return '';
  }

  // Die Klinik kauft Betreuung von Patientinnen und Patienten, nicht Personal.
  // "Personalgestellung" auf der Rechnung waere umsatzsteuerlich eine andere
  // Leistung — und arbeitsrechtlich eine Arbeitnehmerueberlassung.
  var PERSONAL = /personal\s*-?\s*(gestellung|überlassung|ueberlassung)|arbeitnehmer\s*-?\s*(überlassung|ueberlassung)/i;
  var BETREUUNG = /^\s*Betreuung de[rs] Patient(in|en)\b/;

  function pruefe(inv, items) {
    var f = [], w = [];
    var i = inv || {};
    var note = String(i.tax_note || '');
    var posten = (items || []).filter(function (it) { return String(it.description || '').trim(); });

    if (!i.erloeskonto) f.push('Bitte ein Erlöskonto wählen — davon hängt der Hinweis auf der Rechnung ab.');
    if (i.tax_mode === 'vat') f.push('Kleinunternehmer weisen keine Umsatzsteuer aus — bitte „steuerfrei“ lassen.');
    if (/§\s*4\s*Nr\.?\s*18/.test(note)) f.push('Der Hinweis nennt § 4 Nr. 18 UStG — das steht auf keiner Rechnung mehr.');

    if (i.erloeskonto === 'erloes_klinik') {
      if (/§\s*4\s*Nr\.?\s*16/.test(note)) f.push('Klinik-Rechnungen sind nicht nach § 4 Nr. 16 UStG befreit.');
      posten.forEach(function (it) {
        if (PERSONAL.test(it.description)) {
          f.push('„' + String(it.description).trim().slice(0, 60) + '“ — Klinik-Rechnungen beschreiben die Betreuung, nie eine Personalgestellung.');
        } else if (!BETREUUNG.test(it.description)) {
          w.push('„' + String(it.description).trim().slice(0, 60) + '“ beginnt nicht mit „Betreuung des Patienten/der Patientin …“.');
        }
      });
    }
    return { fehler: f, warnungen: w };
  }

  var RechnungHinweise = { TEXT_19: TEXT_19, TEXT_45A: TEXT_45A, hinweisFuer: hinweisFuer, pruefe: pruefe };

  if (typeof module !== 'undefined' && module.exports) module.exports = RechnungHinweise;
  else if (typeof window !== 'undefined') window.RechnungHinweise = RechnungHinweise;
})();
