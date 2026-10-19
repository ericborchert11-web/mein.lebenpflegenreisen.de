# Controlling nach Station, Empfänger frei wählbar — Design

Stand 19.10.2026. Anlass: Rückmeldung aus dem Controlling einer Klinik — die
Fachabteilungen in der Auswertung stimmen teilweise nicht, und „ohne Angabe“
ist unklar.

## Ursache

Die Abteilung stand nicht an der Buchung, sondern kam vom buchenden
Klinik-Konto. Dasselbe Konto bestimmte die Empfänger der Bestätigung. Bei
telefonischen Buchungen wählt der Vorstand das Konto nach der Person, die
angerufen hat — damit war die Abteilung in der Auswertung zufällig.
Dazu ist die Station ein freies Textfeld („Station 1H“, „1 H“, „1H“ wurden
drei Zeilen).

## Entscheidungen

- **Auswertung nur nach Station.** Schreibweisen derselben Station werden
  zusammengefasst (Kleinbuchstaben, „Station“ vorne weg, ohne Leerzeichen und
  Satzzeichen). Rein numerische Stationen erscheinen als „Station 1H“.
- **Station ist Pflicht**, wenn das Haus ein Controlling-Konto hat — beim
  Buchen durch die Klinik und in den Dialogen des Vorstands.
- **Empfänger frei wählbar.** Beim Anlegen offener Dienste wählt der Vorstand
  das Haus und kreuzt an, wer die Bestätigung bekommt. Die Auswahl hängt an
  der Buchung und gilt für alle Mails zu diesem Dienst (Absage, Ersatz,
  nicht erschienen). Konten mit „alle Abteilungen“ und das Sammelpostfach
  bekommen weiterhin alles. Ohne Auswahl gilt die alte Regel (buchendes Konto
  und gleiche Abteilung). Nur Konten desselben Hauses zählen.
- **Korrektur in der Buchungsliste:** „Station / Empfänger“. Bei vergangenen
  Diensten geht keine Mail raus; bei künftigen meldet ein Stationswechsel die
  Änderung wie bisher.
- Die Abteilung am Konto bleibt als Hinweis in der Auswahl, steuert aber nichts
  mehr in Auswertung und Auswahl-Mails.

## Technik

Migration BB (lokal unter `sql/`): `station_schluessel()`,
`sitzwachen_auswertung` ohne Abteilung, Spalte `benachrichtigen` an Buchung und
offenem Dienst, `notify_recipients` mit Auswahl, `bookings_notify` ohne
Änderungsmail für vergangene Dienste, `board_offenen_dienst_besetzen` übernimmt
die Auswahl, neue RPCs `board_buchung_angaben` und `klinik_station_pflicht`.
Test `sql/test-2026-10-19-bb.sql` (17 Prüfungen, alles im Rollback).
