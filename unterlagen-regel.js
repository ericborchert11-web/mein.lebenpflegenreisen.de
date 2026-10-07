/**
 * Unterlagen-Regel: welche Pflichtunterlagen fehlen einer Person?
 *
 * Ohne DOM und ohne Supabase, damit die Regel ohne Login pruefbar ist:
 *   node scripts/pruefe-unterlagen-regel.mjs
 *
 * Seit 07.10.2026 (Onboarding): Eine gueltige BZR-Abfrage ersetzt das
 * Fuehrungszeugnis — sie ist die hoeherwertige Auskunft (Eric). Fuer den
 * Bestand aendert das nichts: Wer ein FZ hat, bleibt vollstaendig.
 * Die BZR-Abfrage selbst bleibt optional; Pflicht ist nur "FZ ODER BZR".
 *
 * Der Masernnachweis steht nicht hier (Spalte an profiles, kein Datensatz).
 */
(function () {
  'use strict';

  var PFLICHT = ['fuehrungszeugnis', 'ifsg43', 'erste_hilfe', 'dsgvo', 'schweigepflicht'];

  // valid_until gilt einschliesslich: am Ablauftag noch gueltig.
  function gueltig(rec, heute) {
    if (!rec || rec.status !== 'approved') return false;
    if (!rec.valid_until) return true;
    var t = new Date(heute); t.setHours(0, 0, 0, 0);
    var bis = new Date(rec.valid_until); bis.setHours(0, 0, 0, 0);
    return bis >= t;
  }

  function finde(records, typ) {
    return (records || []).find(function (r) { return r.document_type === typ; });
  }

  function fzErsetzt(records, heute) {
    return gueltig(finde(records, 'bzr'), heute || new Date());
  }

  function fehlendeUnterlagen(records, heute) {
    heute = heute || new Date();
    return PFLICHT.filter(function (typ) {
      if (gueltig(finde(records, typ), heute)) return false;
      if (typ === 'fuehrungszeugnis' && fzErsetzt(records, heute)) return false;
      return true;
    });
  }

  var UnterlagenRegel = { PFLICHT: PFLICHT, gueltig: gueltig, fzErsetzt: fzErsetzt, fehlendeUnterlagen: fehlendeUnterlagen };

  if (typeof module !== 'undefined' && module.exports) module.exports = UnterlagenRegel;
  else if (typeof window !== 'undefined') window.UnterlagenRegel = UnterlagenRegel;
})();
