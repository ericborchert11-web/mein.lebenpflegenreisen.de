# Digitaler Zeitnachweis zur Sitzwachen-Rechnung — Design

Stand 09.10.2026, abgestimmt mit Eric. Sicherheitsdetails (Rechte, Policies,
Tests) stehen lokal unter `sql/`, nicht hier (öffentliches Repo).

## Ziel

Zu jeder Sitzwachen-Rechnung gibt es einen digitalen Zeitnachweis: ein Blatt je
Dienst mit allen Zeiten und der Bestätigung. Fehlt die Unterschrift der Station,
kann der Vorstand den Dienst digital bestätigen — erkennbar als
Vorstandsbestätigung, nie als Unterschrift der Station.

## Entscheidungen (Eric)

- **Form: Einzelnachweis je Dienst** (ein A4-Blatt pro Dienst), davor ein
  Deckblatt.
- **Zuordnung automatisch aus der Rechnung:** alle abgeschlossenen
  Klinik-Dienste der Klinik, an die die Rechnung geht, im Leistungszeitraum der
  Rechnung (`service_from` bis `service_to`). Stornierte Einsätze zählen nicht,
  Privatkunden-Einsätze nicht.
- **Vorstandsbestätigung:** digitale Unterschrift (Unterschriftsfeld wie bei der
  Sitzwache) plus **Pflicht-Grund**; nur für abgeschlossene Einsätze ohne
  Unterschrift der Pflege; je Einsatz einmal; nachträglich nicht änderbar
  (GoBD, wie die übrige Einsatzdoku). Auf dem Blatt steht ausdrücklich
  „Bestätigt durch den Vorstand ({Name}) am {Datum} — keine Unterschrift der
  Station. Grund: …".

## Inhalt

**Deckblatt:** Rechnungsnummer, Klinik, Leistungszeitraum, Anzahl Dienste,
Summe Netto-Stunden, Legende (Pflege / Vorstand / unbestätigt).

**Blatt je Dienst:** Datum, Schicht, Station, Fallnummer, Sitzwache (Name),
Beginn, Ende, jede Pause mit Uhrzeiten, Netto-Zeit, Bestätigung:
- Pflege: Unterschriftsbild + Zeitpunkt
- Vorstand: Unterschriftsbild + Name + Datum + Hinweis + Grund
- unbestätigt: nur am Bildschirm rot; vor dem Druck Hinweis

**Nicht auf dem Nachweis:** Übergabe-Notizen und freie Texte (können
Gesundheitsdetails enthalten). Nur Zeiten und Bestätigung.

**Dienste ohne digitale Einsatzdoku** (abgeschlossen, aber nie über die App
erfasst): erscheinen als Warnung mit Weg zur vorhandenen Nacherfassung im
Vorstandsbereich.

## Oberfläche

- `zeitnachweis.html?rechnung=<id>` (Vorstand), Druck/PDF über den
  Browser-Druckdialog wie `rechnung.html` (kein box-shadow, A4).
- Bildschirmleiste oben: Liste unbestätigter Dienste mit „Als Vorstand
  bestätigen" (Unterschriftsfeld + Grund, vorbelegt mit Kategorie und Vermerk
  der Sitzwache) und Liste der Dienste ohne Einsatzdoku.
- `rechnung.html`: Knopf „Zeitnachweis"; im Rechnungsdruck die Zeile
  „Anlage: Zeitnachweis ({n} Dienste)".

## Etappen

1. Datenbank: Bestätigungstabelle, Bestätigungs-RPC, Nachweis-RPC, Tests.
2. Seite `zeitnachweis.html` + Verknüpfung in `rechnung.html`.
