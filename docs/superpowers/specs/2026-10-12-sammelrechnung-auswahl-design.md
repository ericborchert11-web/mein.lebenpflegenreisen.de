# Sammelrechnung: einzelne Dienste auswählen — Design

Stand 12.10.2026, mit Eric abgestimmt (Variante A). Sicherheitsdetails (Rechte,
Tests) stehen lokal unter `sql/`, nicht hier (öffentliches Repo).

## Anlass

Manchmal fehlt zu einem Dienst noch der Zeitnachweis. Dann soll er nicht auf
die Wochenrechnung, sondern erst auf eine Folgerechnung. Heute übernimmt der
Dialog „Sammelrechnung aus Diensten" zwangsläufig alle erledigten Dienste der
Woche. Außerdem richten sich Zeitnachweis und Festschreibe-Sperre nach dem
Leistungszeitraum. Ein Dienst, den man aus dem Entwurf löscht, sperrt die
Rechnung deshalb trotzdem.

## Entscheidungen (Eric)

- **Auswahl per Häkchen** im Dialog, je Dienst.
- **Variante A:** Liegengebliebene Dienste erscheinen bei der nächsten
  Wochenrechnung im Block „Noch offen aus früheren Wochen" und lassen sich dort
  mit anhaken. Keine eigenen Nachtragsrechnungen.

## Oberfläche (Dialog in `admin-rechnungen.html`)

- Je Dienst: Häkchen, Datum, Schicht, Station, Stufe, Betrag und die neue
  Spalte **Zeitnachweis** (vollständig / unbestätigt / ohne Einsatzdoku).
- **Vorbelegung:** Beim Empfänger mit `nachweis_art = 'digital'` sind nur
  Dienste mit vollständigem Nachweis angehakt. Bei `papier` oder `keiner` sind
  alle angehakt, und die Spalte zeigt „—".
- Über der Woche steht der Block **„Noch offen aus früheren Wochen"**, wenn es
  dort etwas gibt. Es gelten dieselben Spalten und dieselbe Vorbelegung.
- Schon abgerechnete Dienste der Woche bleiben grau und ohne Häkchen sichtbar
  („schon auf RE-…").
- Die Summenzeile zählt nur angehakte Dienste. „Entwurf anlegen" ist
  gesperrt, solange nichts angehakt ist.

## Datenbank (Migration AZ, ersetzt die Funktionen aus AY)

**Abrechenbar** bleibt wie in AY: erledigt, Klinik-Konto der Empfänger-Klinik,
auf keiner nicht stornierten Rechnung. Die Regel steht weiterhin nur in
`sammelrechnung_dienste`.

`sammelrechnung_dienste(p_recipient_id, p_von, p_bis)` liefert zusätzlich:
- `nachweis`: `'vollstaendig' | 'unbestaetigt' | 'ohne_doku' | null`. `null`
  steht für Empfänger ohne digitalen Nachweis. Für die Bewertung gilt dieselbe
  Regel wie in `_zeitnachweis_status`: Unterschrift der Pflege geleistet und
  vorhanden oder Vorstandsbestätigung.
- `nachtrag boolean`: true für Dienste **vor** `p_von`, die noch nicht
  abgerechnet sind. Diese Zeilen kommen nur, wenn ihr Datum am oder nach dem
  **Beginn der ersten Sammelrechnung** dieses Empfängers liegt. Gemeint ist das
  kleinste `service_from` einer nicht stornierten Rechnung des Empfängers mit
  mindestens einer Position mit `booking_id`. Gibt es keine solche Rechnung,
  gibt es keine Nachträge. Grund: Ältere Dienste stehen auf Rechnungen ohne
  Dienst-Verknüpfung und würden sonst fälschlich als offen gelten.
- Schon abgerechnete Dienste vor `p_von` kommen nicht.

`sammelrechnung_anlegen(p_recipient_id, p_von, p_bis, p_booking_ids uuid[])`
ersetzt die Fassung mit drei Parametern, die entfernt wird:
- Jede übergebene id muss eine abrechenbare, noch nicht abgerechnete Zeile aus
  `sammelrechnung_dienste(p_recipient_id, p_von, p_bis)` sein, also aus der
  Woche oder ein Nachtrag. Sonst bricht der Aufruf mit Nennung ab, und es wird
  nichts angelegt. Eine leere Liste ist ein Fehler.
- Leistungszeitraum: `service_from` ist das Minimum aus `p_von` und dem
  ältesten gewählten Datum, `service_to` ist `p_bis`.
- Der Betreff bleibt der Wochenbetreff („Sitzwachen KW 42 (…)"). Der
  Einleitungstext nennt Anzahl, T1/T2 und bei Nachträgen zusätzlich
  „davon n aus früheren Wochen (KW 41)".
- Positionen wie bisher, eine je Dienst, sortiert nach Datum und Schicht.

## Zeitnachweis folgt den Positionen

`zeitnachweis_fuer_rechnung` und `_zeitnachweis_status` (und damit die
Festschreibe-Sperre `tg_invoice_zeitnachweis`) bestimmen ihre Dienste neu:
- **Rechnung mit mindestens einer Position mit `booking_id`:** genau diese
  Dienste, egal welcher Zeitraum.
- **Sonst:** wie bisher alle erledigten Klinik-Dienste im Leistungszeitraum.

Ein zurückgehaltener Dienst sperrt die Rechnung damit nicht mehr. Wird eine
Position im Entwurf gelöscht, verschwindet ihr Dienst auch aus dem Nachweis.

## Fehlerfälle

- Zwei Fenster legen gleichzeitig an: Die zweite Anlage findet die Dienste
  schon abgerechnet und bricht mit Meldung ab. Die Meldung erscheint im Dialog,
  nicht als Toast.
- Push vor Migration: Der Dialog ruft die Vierer-Signatur, die es noch nicht
  gibt. Deshalb gilt die Reihenfolge erst Migration, dann Push.

## Prüfung

- SQL-Test (DO-Block mit absichtlichem `raise exception 'TEST BESTANDEN…'`):
  Auswahl legt nur gewählte Dienste an; fremde, doppelte oder schon
  abgerechnete ids werden abgelehnt; Nachtrag erweitert `service_from`;
  Zeitnachweis-Status zählt nur Positionen.
- `scripts/pruefe-sammelrechnung.mjs`: Summe der Auswahl und Vorbelegung.
- Browser-Abnahme durch Eric.
