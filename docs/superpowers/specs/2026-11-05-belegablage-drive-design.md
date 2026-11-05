# Belegablage in Google Drive — Design

Stand 05.11.2026. Baut auf der Rechnungsablage auf
(`2026-10-19-rechnungen-drive-ablage-design.md`, live seit 26.10.2026).

## Ziel

Alle Unterlagen, die der Verein aufbewahren muss und die im Portal entstehen,
landen ohne Handarbeit als Datei in der bestehenden Drive-Ablage des Vorstands.
Drei Etappen, je mit eigenem Plan:

1. **Auszahlungen**: Zahlungsanweisung, Auszahlungsbeleg, Auslagen-Quittungen
2. **Kassenbuch**: Belege zu Ausgaben ohne Portal-Vorgang, Original-Bank-CSV,
   Monatsblatt
3. **Mitgliedsanträge**: Online-Anträge und eingescannte Papier-/Mail-Anträge

Nicht Teil: Eingangsrechnungen aus dem Postfach (später), Einsatzdokumentation
der Sitzwachen (bewusst nicht in Drive).

## Befund vor dem Bau (05.11.2026)

- Auszahlungsbeleg: nur als HTML in `claims.beleg_html`, eingefroren beim
  ersten Versand. Kein PDF.
- Zahlungsanweisung: nur als Mail an finanzen@, nirgends gespeichert.
- Auslagen-Quittungen: Dateien im Bucket `auslagen-belege`.
- Kassenbuch: 112 Buchungen, 95 Ausgaben, **keine einzige mit Beleg**
  (`beleg_url` ist ein freies Linkfeld). 84 Ausgaben sind Auszahlungen
  (Etappe 1 deckt sie ab), 11 laufen außerhalb des Portals (Notar,
  Bundeskasse, Büromaterial, Bankgebühren, Erstattungen ohne Antrag).
- Bank-CSV: wird beim Import gelesen und verworfen.
- Online-Mitgliedsantrag: Daten in `mitgliedsantraege`, Druckansicht im
  Browser. Mail-/Papieranträge: nur Feld `mitglied_unterlagen.scan_url`.

## Ablageorte (Drive des Vorstands, nur der Vorstand hat Zugriff)

```
08 Buchhaltung & Finanzen
  Belege › JJJJ › Auszahlungen › MM
    A-2026-0042 Zahlungsanweisung – Vorname Nachname 150,00 €.pdf
    A-2026-0042 Auszahlungsbeleg – Vorname Nachname 150,00 €.pdf
    A-2026-0043 Quittung 1 – Vorname Nachname.jpg
  Belege › JJJJ › Kassenbuch › MM
    2026-10-22 −290,00 € BUNDESKASSE – Recht & Notar.pdf
  Kontoauszüge › JJJJ
    2026-11-05 Bank-CSV 01.10.–02.11.2026.csv
  Kassenbuch › JJJJ
    Kassenbuch 2026-10.pdf
02 Mitglieder
  Aufnahmeanträge › JJJJ
    Nr. 037 Vorname Nachname – Aufnahmeantrag 03.11.2026.pdf
```

- Nummer vorn (`beleg_nr`, sonst die ersten 8 Zeichen der Antrags-ID), damit
  alles zu einer Auszahlung nebeneinander steht.
- Monat = Monat der Auszahlung (`paid_at`), bei Kassenbuch-Belegen der
  Buchungstag, bei Anträgen das Eingangsdatum.
- Unerlaubte Zeichen `/\:*?"<>|` werden zu `-`.
- Die Ordner-IDs der vier Wurzeln stehen als Skripteigenschaften im
  Apps-Skript, nicht im Repo.

## Architektur

Wie bei den Rechnungen: Das Portal meldet abzulegende Dokumente in einer
Tabelle an, das Apps-Skript „LPR“ in vorstand@ holt sie alle 15 Minuten über
die Edge Function `drive-ablage` ab, legt sie ab und meldet zurück.

**Neue Tabelle `beleg_ablage`** (statt `rechnung_ablage` aufzubohren, die
unverändert weiterläuft):

| Spalte | Bedeutung |
|---|---|
| `quelle` | `claim`, `kassenbuch`, `bank_import`, `kassenbuch_monat`, `mitgliedsantrag` |
| `quelle_id` | ID des Vorgangs (claim, bank_buchung, Import, Monat `2026-10`, Antrag) |
| `art` | `zahlungsanweisung`, `auszahlungsbeleg`, `quittung`, `beleg`, `csv`, `monatsblatt`, `antrag` |
| `bucket`, `pfad` | Datei im Storage — ODER leer, dann baut die Function HTML |
| `wurzel` | `belege`, `kontoauszuege`, `kassenbuch`, `mitglieder` |
| `unterordner` | z. B. `{2026,Auszahlungen,11}` |
| `dateiname` | fertiger Name, vom Portal gerechnet |
| `abgelegt_am`, `drive_datei_id`, `drive_link`, `versuche`, `fehler` | wie bei Rechnungen |

Unique (`quelle`, `quelle_id`, `art`, `dateiname`). RLS an, Lesen nur
`is_board()`, Schreiben nur über Funktionen bzw. Trigger.

**Dateiname und Ordner rechnet die Datenbank** (SQL-Funktion beim Anmelden),
nicht das Skript. Das Skript wird dadurch dumm und muss bei neuen
Dokumentarten nicht wieder getauscht werden.

**Edge Function `drive-ablage`** bekommt die Aktionen `belege_offen`,
`beleg_erledigt`, `beleg_fehler`. Für Zeilen mit Datei liefert sie einen
signierten Link (10 Min.), für HTML-Zeilen das fertige HTML.

**Apps-Skript** (eine neue Fassung, Eric tauscht sie einmal aus): arbeitet
nach den Rechnungen auch `belege_offen` ab. HTML wird im Skript zu PDF
(`Utilities.newBlob(html, 'text/html').getAs('application/pdf')`). Gibt es den
Namen im Zielordner schon, wird nichts überschrieben, sondern die Zeile als
erledigt mit der vorhandenen Datei gemeldet (Rückmeldung ging verloren).

**Risiko:** Die HTML→PDF-Wandlung von Google kennt nur einfaches CSS (kein
Flex/Grid). Die Vorlagen für Zahlungsanweisung, Beleg und Monatsblatt werden
für die Drive-Fassung tabellenbasiert gebaut und vor dem Livegang einmal in
Drive geprüft.

## Etappe 1 — Auszahlungen

- **Zahlungsanweisung einfrieren:** neue Spalte
  `claims.zahlungsanweisung_html`, gesetzt von `claim-mails` beim Versand der
  Anweisung (wie `beleg_html`). Ein Schutz verhindert späteres Überschreiben.
- **Anmelden:** Trigger auf `claims`, sobald `status = 'paid'` und
  `beleg_html` gesetzt ist: Zeilen für Zahlungsanweisung, Auszahlungsbeleg
  und jede Datei im Bucket `auslagen-belege/<claim_id>/`.
- **Altbestand:** alle bisher ausgezahlten Anträge werden einmal angemeldet.
  Fehlt die eingefrorene Anweisung, baut die Function sie aus den heutigen
  Daten nach, mit dem sichtbaren Vermerk „Nachträglich erstellt am …, die
  Originalmail ging am … an finanzen@“.
- **Zurück aus `paid`** (Ausnahme): noch nicht abgelegte Zeilen werden
  gelöscht, schon abgelegte bleiben, der Vorstand sieht einen Hinweis.
- **Anzeige:** In `admin-auszahlungen.html` je ausgezahltem Antrag
  „in Drive abgelegt am …“ mit Link, ab 3 Fehlversuchen rot mit Grund.

## Etappe 2 — Kassenbuch

- **Beleg-Upload** im Buchungsdialog (PDF, JPG, PNG, HEIC, bis 10 MB) in den
  neuen privaten Bucket `kassenbuch-belege`, neue Spalte
  `bank_buchungen.beleg_pfad`. Das Linkfeld bleibt für Altfälle.
  „Beleg fehlt“ gilt, wenn weder Pfad noch Link da ist und die Buchung keinen
  Portal-Vorgang (Antrag, Rechnung) hat.
- **Original-CSV:** `kassenbuchImport` lädt die Datei vor dem Einlesen in den
  privaten Bucket `kontoauszuege` und meldet sie an.
- **Monatsblatt:** pg_cron am 10. jedes Monats für den Vormonat: alle
  Buchungen, Zuordnung, Kostenart, Sphäre, Anfangs- und Endsaldo. Ändert sich
  danach eine Buchung dieses Monats, entsteht beim nächsten Lauf ein neues
  Blatt `Kassenbuch 2026-10 (Stand 2026-11-20).pdf`; das alte bleibt liegen.
- Hinweis im Kassenbuch: „11 Ausgaben ohne Beleg“ mit Filter.

## Etappe 3 — Mitgliedsanträge

- **Online-Antrag:** bei `mitgliedsantrag_entscheiden` → `angenommen`
  angemeldet; die Function baut das Blatt aus der Zeile (gleiche Vorlage wie
  `mitgliedsantrag-druck.html`, ausgelagert in eine DOM-freie Datei).
- **Mail-/Papierantrag:** auf der Mitglieder-Seite Datei hochladen statt
  Scan-Link (Bucket `mitglied-unterlagen`, privat), wird sofort angemeldet.
  Die fünf Anträge vom 03.11. lädt Eric einmal hoch.
- Abgelehnte Anträge werden nicht abgelegt.

## Fehler und Sicherheit

- Der Schlüssel des Skripts bleibt der bestehende; die Function bleibt bei
  „nur diese Aktionen“. Signierte Links laufen nach 10 Minuten ab.
- Alle neuen Buckets privat, Policies nur `is_board()` (über das Dashboard,
  der SQL-Editor darf `storage.objects` nicht ändern).
- Zahlungsanweisungen enthalten volle IBANs: Drive-Ordner nur für den
  Vorstand (bestätigt 05.11.2026).
- Ein Fehler bei einer Datei hält die anderen nicht auf; nach 3 Versuchen
  sichtbar im Portal.

## Tests

- DOM-freie Logik (Dateiname, Ordner, Vorlagen) mit Prüfskript unter
  `scripts/`, wie bei `drive-ablage.js`.
- Migration je Etappe mit Testblock, der mit `TEST … BESTANDEN` endet;
  Fälle suchen sich ihre Voraussetzungen selbst und brechen sonst ab.
- Nach dem Skripttausch: `belege_offen` per Token → 0 offene Zeilen, und
  drei Stichproben in Drive öffnen (PDF lesbar, IBAN vollständig, Umlaute).
