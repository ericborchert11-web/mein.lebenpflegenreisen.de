# Familienzugang zum Einsatzbericht — Design

**Stand 27.11.2026.** Anlass: neues Angebot „Eingewöhnung im Pflegeheim – die ersten Nächte
begleitet“ (Website, Seite `/eingewoehnung-pflegeheim/`). Die Familie, die gebucht hat, soll
nach jedem Dienst sehen können, wie die Nacht war. Eric: „Cooler USP von uns.“

## Entscheidungen (Eric, 27.11.2026)

1. **Sichtbar ist nur die nicht-medizinische Einsatzdoku.** Keine Diagnosen, keine Angaben zu
   Pflege, Medikamenten oder Trinkmenge.
2. **Erst nach dem Dienst.** Kein Live-Blick; der Bericht erscheint, wenn der Einsatz
   abgeschlossen ist (`einsaetze.status = 'abgeschlossen'`).
3. **Zugang hat die Person, die gebucht hat** — meist auch die gesetzliche Vertretung.

## Verhältnis zu früheren Entscheidungen

Beim Privatauftrag (21.08.2026) galt „Bericht statt Doku-Zugang“: kein Live-Blick in die
Laufkarte, keine Pflegeanamnese, keine Parallel-Doku zur Kurve der Klinik. Dieser Entwurf
bleibt dabei: Die Familie sieht einen **abgeleiteten Bericht nach Dienstende**, nie die
laufende Erfassung und nie Freitext. Die Pflegedokumentation führt weiter allein das
Heim bzw. die Klinik.

Privat bezahlte Einsätze laufen heute über **Kunden** (Kunde → Buchung, Design 26.08.2026),
nicht über `auftraege`. Der Zugang hängt deshalb am Kunden. Der alte Familienlink in
`auftraege` bleibt unangetastet.

## Was die Familie sieht

Je abgeschlossenem Einsatz der letzten 60 Tage, neuester zuerst:

| Feld | Quelle | Anzeige |
|---|---|---|
| Datum und Dienstzeit | `einsaetze.beginn_ts`, `ende_ts` | „Nacht vom 27. auf 28.11. · 20:02 – 07:55 Uhr“ |
| Was die Begleitung getan hat | `einsatz_abschluss`-Tätigkeiten (Positivliste) | „Gespräche geführt · Vorgelesen · Beruhigt“ |
| Pflegepersonal hinzugezogen | `einsatz_ereignisse` mit `typ = 'uebergabe_pflege'` | Uhrzeit, Grund **nur** aus der Freigabeliste |

**Freigabeliste für Gründe** (nicht-medizinisch, wird angezeigt):
`unruhe` → „war unruhig“ · `aufstehen_sturzgefahr` → „wollte aufstehen“ ·
`patientenwunsch` → „hatte einen Wunsch“.
**Alle anderen Gründe** (`schmerzaeusserung`, `uebelkeit`, `geraet_alarm`, `sonstiges`)
erscheinen nur als „Pflegepersonal hinzugezogen“ ohne Grund. Wer mehr wissen will, fragt
das Heim — dort liegt die Pflegedokumentation.

**Nie sichtbar:** `stichwort` (Freitext), Unterschrift, Name der Pflegekraft, Pausen,
Station/Fallnummer, Abrechnungsdaten, Nachname der Begleitperson (Vorname wird angezeigt, siehe unten).

## Zugang

- Am Kunden: `familie_token_hash` (sha256), `familie_link_gueltig_bis`,
  `familie_ansprechperson` (wer gebucht hat), `familie_link_erstellt_am`.
- Vorstand erzeugt den Link in `admin-kunden.html` → RPC `kunde_familienlink_neu(kunde_id)`
  gibt den Schlüssel **genau einmal** zurück (wie `auftrag_link_neu`), Gültigkeit 90 Tage,
  verlängerbar. `kunde_familienlink_sperren(kunde_id)` macht ihn sofort ungültig.
- Neue Seite `familie.html`: Schlüssel steht im **Fragment** (`familie.html#k=…`), wird also
  nie an einen Server, in Logs oder als Referrer übertragen. Die Seite ruft
  `familie_bericht(schluessel)` (anon, SECURITY DEFINER) und zeigt nur, was die Funktion
  liefert. `noindex`, kein Tracking, keine Zählung.
- `familie_bericht` prüft Hash und Ablauf, liefert nur Einsätze dieses Kunden mit
  `status = 'abgeschlossen'`, und filtert die Gründe serverseitig — die Freigabeliste steht
  in der Datenbank, nicht nur im Browser.
- Rechte: `execute` für anon nur auf `familie_bericht`; die beiden Link-RPCs nur für den
  Vorstand (`is_board()`). Gegenprobe von außen: anon auf `kunden` → 42501.

## Etappen

1. **Datenbank** — Spalten, drei RPCs, Rechte, Prüfskript (SQL für Eric, `sql/`, gitignored).
2. **Oberfläche** — `familie.html` (Handy zuerst, große Schrift) + Knopf „Familienlink“ in
   `admin-kunden.html` (Link einmal anzeigen, kopieren, sperren).
3. **Rechtliches und Website** — Satz in der Datenschutzinformation zum Vertrag vor Ort,
   Hinweis in der Datenschutzerklärung, danach erst auf der Website bewerben.

Später, nicht Teil dieser Etappen: Mail an die Familie, sobald ein Bericht fertig ist.

## Offen

- ~~Name der Begleitperson~~ — **entschieden 27.11.2026 (Eric): Vorname ja** (Migration CO,
  erster Teil von `profiles.full_name`, nie der Nachname). Hinweis für Mitwirkende in der
  Datenschutzerklärung.
- Steuerliche Einordnung privat bezahlter Einsätze (§ 4 Nr. 18 UStG / § 66 AO) bleibt wie
  im Design 26.08.2026 vermerkt; der Familienzugang ändert daran nichts.
