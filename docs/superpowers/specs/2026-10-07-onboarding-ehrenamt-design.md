# Onboarding für neue Ehrenamtliche — Design

Stand 07.10.2026, abgestimmt mit Eric im Brainstorming. Leitlinie (Eric):
„Mach es so, wie es für die Bewerbenden am angenehmsten ist."

Sicherheitsdetails (Rechte, Schutzregeln, Testfälle) stehen bewusst **nicht**
hier, weil das Repo öffentlich ist. Sie liegen lokal unter
`sql/2026-10-07-onboarding-notizen.md`.

## Ziel

Wer sich als Ehrenamtliche:r bewirbt, sieht vom ersten Tag an einen roten
Faden aus sechs Schritten und immer genau **einen** nächsten Schritt. Der
Vorstand sieht auf einen Blick, wer wo steht und wo der Verein am Zug ist.

## Die sechs Schritte

| # | Schritt | Person sieht / tut | Erledigt, wenn |
|---|---|---|---|
| 1 | Registrieren | Konto anlegen; Schrittleiste mit „Wir melden uns für ein Kennenlernen" | Konto existiert |
| 2 | Kennenlernen + BZR-Antrag | Termin (Termine-Modul) mit Zusage-Knopf und „Bring mit: Personalausweis" | Vorstand hakt `Kennenlernen am` und `BZR beantragt am` ab |
| 3 | Mitgliedsantrag + Datenschutz + Schweigepflicht | öffnet sich erst, wenn die BZR-Abfrage genehmigt ist; Online-Formular, zwei Bestätigungen | Vorstand nimmt den Antrag an |
| 4 | Einführungsveranstaltung + Unterlagen | Termin mit Zusage; Liste Lebensmittelpass (§ 43 IfSG), Masernnachweis, Erste Hilfe | Teilnahme, IfSG-Belehrung vor Ort, alle drei Unterlagen genehmigt |
| 5 | Einarbeitungstag | Termin mit Zusage; danach Antrag auf die halbe Pauschale | Vorstand hakt `Einarbeitung am` ab |
| 6 | Alles da | Glückwunsch, Sprung zu „Sitzwachen-Zeiten eintragen" | Vorstand schließt ab (ein Klick), Konto wird freigegeben |

Jeder Schritt wird aus den Daten **berechnet**, nicht von Hand gesetzt. Die
Reihenfolge ist nur an einer Stelle streng: Schritt 3 öffnet erst mit
genehmigter BZR-Abfrage. Unterlagen aus Schritt 4 dürfen früher kommen.

## Entscheidungen

- **Konto ab Schritt 1** (Variante B). `/mitmachen/` führt direkt zur
  Registrierung; der bisherige Knopf „Ins Portal einladen" wird für neue
  Bewerbungen überflüssig.
- **Konto-Status bleibt `pending` bis Schritt 6.** `pending` heißt künftig „im
  Onboarding". Ehrenamtliche mit `pending` dürfen sich anmelden, landen aber
  nur auf `onboarding.html`. Kein neuer Statuswert: Alle Buchungs- und
  Zuteilungslisten filtern bereits auf `approved`, damit taucht niemand im
  Onboarding dort auf. Das Versprechen „Freigabe in 1–2 Werktagen" entfällt.
- **Nur für Neue.** Die bestehenden Ehrenamtlichen bekommen das Kennzeichen
  „Bestand" und durchlaufen nichts.
- **BZR ersetzt das Führungszeugnis.** Die Regel lautet überall
  „Führungszeugnis **oder** gültige BZR-Abfrage". Sie gilt in der
  Sperrprüfung und in der Ampel der Vorstandsansicht gleichermaßen. Für
  Neue wird die BZR-Abfrage damit Pflicht; für den Bestand bleibt sie wie
  bisher nur im JVK sperrend.
- **BZR-Daten nicht im Portal.** Das Formular für die Justiz wird beim
  Kennenlernen auf Papier ausgefüllt, dort wird auch der Ausweis kopiert. Im
  Portal stehen nur „beantragt am" und danach Freigabe und Datum wie bisher.
- **Mitgliedsantrag komplett online** (Variante A): Anschrift, Geburtsdatum,
  Beitrag (Betrag ab 1 €, monatlich/jährlich). Mitgespeichert werden die
  Fassung der Satzung (01.08.2026) und die Fassung der Erklärungstexte. Das
  SEPA-Lastschriftmandat entfällt vorerst, weil die Gläubiger-ID fehlt; bis
  dahin wird der Beitrag überwiesen. Nach dem Absenden gibt es das PDF zum
  Herunterladen.
- **Datenschutz und Schweigepflicht** werden mit dem Antrag online bestätigt
  und landen als eingereichte Unterlagen in der vorhandenen
  Unterlagen-Verwaltung; mit der Annahme des Antrags gelten sie als genehmigt.
- **Lebensmittelpass** = Bescheinigung der Erstbelehrung nach § 43 IfSG
  (vorhandene Unterlage). Die **IfSG-Belehrung vor Ort** ist ein eigenes
  Häkchen bei der Einführungsveranstaltung.
- **Erste Hilfe** gehört in Schritt 4.
- **Termine über das Termine-Modul.** Einführungsveranstaltung und
  Einarbeitungstag sind Termine mit Einladung und Zusage. Die **Teilnahme**
  hält die Onboarding-Tabelle fest, nicht das Termine-Modul (das kennt nur
  Zusage/Absage und bleibt unverändert).
- **Geld:** Einführungsveranstaltung ohne Aufwandsentschädigung.
  Einarbeitungstag mit der **halben Sitzwachen-Schichtpauschale** des Tarifs
  der Person (T1/T2), als normaler Antrag in der Abrechnung, einmal pro
  Person, zählt in den Freibetrag.

## Seite für Bewerbende (`onboarding.html`)

Handy zuerst, Du-Form.

- Schrittleiste 1–6 oben, darunter groß der eine nächste Schritt mit einem
  Satz, was jetzt passiert.
- „Bring mit"-Liste vor jedem Termin (Kennenlernen: Personalausweis;
  Einführung: Lebensmittelpass, Impfausweis, Erste-Hilfe-Nachweis).
- Ehrliche Wartezeiten, wenn der Verein am Zug ist („Die BZR-Abfrage dauert
  erfahrungsgemäß einige Wochen — du musst nichts tun").
- Termin mit Ort, Uhrzeit, Zusage-Knopf und Kalendereintrag direkt im Schritt.
- Mitgliedsantrag vorausgefüllt mit Name und Mail, Zwischenstand bleibt beim
  Abbrechen erhalten, Erklärungstexte aufklappbar statt Kleingedrucktes.
- Unterlagen aus Schritt 4 sind ab Schritt 1 sichtbar.
- Schritt 6: Glückwunsch und direkter Sprung zu den Sitzwachen.
- Alle anderen Portalseiten leiten Personen im Onboarding hierher um.

## Vorstand

`admin-ehrenamt-interesse.html` wird zur Onboarding-Übersicht: eine Spalte je
Schritt, pro Person Abhak-Knöpfe mit Datum (Kennenlernen, BZR beantragt,
Einführung, IfSG-Belehrung, Einarbeitung), Antrag ansehen und annehmen,
„Onboarding abschließen". Hinweis bei Personen, die länger als 14 Tage auf
einem Schritt stehen, bei dem der Verein am Zug ist.

## Benachrichtigungen

- Neue Registrierung → ehrenamt@ (gibt es bereits).
- Mitgliedsantrag eingereicht → Vorstand.
- Neuer Schritt freigeschaltet → Mail an die Person (Du-Form).

## Etappen (je eigene Plan-Datei)

1. **Datenbank:** Onboarding-Tabelle, Mitgliedsanträge, Einreichen/Annehmen,
   Regel „Führungszeugnis oder BZR", Bestands-Kennzeichen, Tests.
2. **Seite für Bewerbende:** Anmelde-Tor für `pending`, `onboarding.html`,
   Mitgliedsantrag mit PDF, `/mitmachen/` auf Registrierung umstellen.
3. **Vorstandsübersicht und Mails.**
4. **Halbe Pauschale für den Einarbeitungstag.**

## Prüfung

SQL-Test je Etappe im bekannten Muster; Testfälle suchen sich ihre
Voraussetzung selbst und brechen sonst ab, statt still zu überspringen.
Oberfläche: Prüf-Harness bei 390 px, danach Abnahme durch Eric im Browser.

## Nicht Teil dieses Vorhabens

- SEPA-Lastschriftmandat (erst mit Gläubiger-ID)
- Selbstbuchung von Kennenlern-Zeitfenstern
- Dokument-Uploads (Unterlagen werden weiterhin vor Ort gezeigt und vom
  Vorstand genehmigt)
- Änderungen für Bestandsmitglieder
