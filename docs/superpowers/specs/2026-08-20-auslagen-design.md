# Auslagen und Anreisekosten — Design

**Stand 20.08.2026.** Entscheidungen von Eric (Vorstand) am 20.08.2026: Betrag aus
einem Referenzpreis je Reise, zwei Auslagenarten, getrennte Überweisung, Antrag
durch die fahrende Person.

## Warum

Neben der Aufwandsentschädigung entstehen echte Auslagen — Bahnticket,
Parkgebühr, Material — und Anreisen mit dem eigenen Auto. Beides wird heute
außerhalb des Portals geregelt und ist damit nirgends dokumentiert.

Der Grund, es sauber zu trennen, ist steuerlich: **Auslagenersatz gegen Nachweis
ist nach § 3 Nr. 50 EStG steuerfrei und zählt nicht gegen den
Übungsleiterfreibetrag.** Würde man 80 € Fahrtkosten auf die Pauschale
draufrechnen, verbrauchte das 80 € Freibetrag, die niemand verbrauchen müsste —
und der Auszahlungsbeleg träfe eine falsche Aussage über die Steuerpflicht.

## Entscheidungen

- **Der Betrag der Autoanreise kommt aus einem Referenzpreis an der Reise**, nicht
  aus Kilometern und nicht aus freier Eingabe. Für Oberhof sind das 25 € je
  Strecke (Flixbus-Jahresdurchschnitt); zwei Personen hin und zurück ergeben
  100 €. Vorteil: Die Regel steht einmal fest, alle Anträge zur selben Reise sind
  gleich, und bei einer Prüfung ist nachvollziehbar, woher die Zahl stammt.
- **Zwei Auslagenarten:** Anreise-Pauschale (ohne Beleg) und Erstattung gegen
  Beleg (Datei zwingend).
- **Getrennte Anträge und getrennte Überweisungen** für Pauschale und Auslagen.
- **Bei Fahrgemeinschaften beantragt nur die fahrende Person**, die Mitfahrenden
  werden benannt und für dieselbe Reise gesperrt.

Zum steuerlichen Rahmen: Erstattet wird nach Vergleichspreis, nicht nach der
Kilometerpauschale von 0,30 €/km. Für Oberhof (rund 380 km je Strecke) lägen
Kilometerpauschale bei etwa 228 €, der Vergleichspreis bei 100 € — die
Erstattung bleibt also deutlich unter dem steuerlich Zulässigen. Diese
Einordnung ist keine Steuerberatung und gehört vor dem ersten Beleg einmal
bestätigt.

## Kein zweites System

Auslagen bekommen ein Unterscheidungsmerkmal am Antrag (`kind` mit den Werten
`pauschale` und `auslage`) statt einer eigenen Tabelle. Damit erben sie den
gesamten Ablauf, der seit dem 20.08.2026 in Betrieb ist: Antrag, Freigabe,
Zahlungsanweisung an finanzen@, Überweisung, Beleg, Mails, Nachversand,
Einfrieren des Dokuments. Eine zweite Tabelle hieße, all das ein zweites Mal zu
bauen und ein zweites Mal zu pflegen.

## Datenmodell

**An der Reise** ein Vergleichspreis je Strecke samt kurzer Herkunftsnotiz
(„Flixbus-Jahresdurchschnitt 2026"). Ohne gepflegten Preis ist die
Anreise-Pauschale für diese Reise nicht wählbar — lieber gesperrt als geraten.

**Am Antrag** zusätzlich: die Art (`pauschale`/`auslage`), bei Auslagen die
Unterart (Anreise-Pauschale oder Beleg-Erstattung), der Pfad zur Nachweisdatei
und bei Fahrgemeinschaften die Liste der Mitfahrenden.

Die Aufschlüsselung nutzt das vorhandene Feld für Positionen. Bei der
Anreise-Pauschale steht dort die Rechnung im Klartext: Anzahl Personen, Anzahl
Strecken, Referenzpreis, Summe. Damit erklärt sich der Betrag auf dem Beleg von
selbst.

## Ablauf

Identisch zur Pauschale, mit drei Unterschieden: Die Freibetragsrechnung
ignoriert Auslagen, der Beleg trägt einen eigenen Titel und Steuerhinweis, und
bei der Beleg-Erstattung hängt ein Nachweis am Vorgang. Die Zahlungsanweisung an
finanzen@ nennt im Verwendungszweck „Auslagenersatz" statt
„Aufwandsentschaedigung", damit die Buchung auf dem Kontoauszug unterscheidbar
bleibt.

## Der Beleg für Auslagen

Titel **„Erstattung von Auslagen"**, im Untertitel § 3 Nr. 50 EStG. Kein
Freibetragsbalken — er wäre hier sachlich falsch. Statt des fünfteiligen
Steuerhinweises ein kurzer eigener (Vorschlag, vom Vorstand freizugeben):

> **Hinweis**
>
> 1. Diese Zahlung ist **Ersatz tatsächlich entstandener Auslagen** nach
>    § 3 Nr. 50 EStG. Sie ist **kein Arbeitslohn, kein Honorar und keine
>    Aufwandsentschädigung**.
> 2. Sie ist **steuerfrei** und **zählt nicht gegen den Jahresfreibetrag** der
>    Übungsleiterpauschale (§ 3 Nr. 26 EStG). In der Einkommensteuererklärung ist
>    sie nicht anzugeben.
> 3. Bei Anreise mit dem eigenen Fahrzeug erstattet der Verein pauschal in Höhe
>    der günstigsten zumutbaren Alternative des öffentlichen Verkehrs; die
>    Berechnung steht oben. Ein zusätzlicher Abzug als Werbungskosten für dieselbe
>    Fahrt ist damit nicht möglich.
> 4. Die Nachweise verbleiben beim Verein und werden zehn Jahre aufbewahrt
>    (§ 147 AO, Art. 6 Abs. 1 lit. c DSGVO).

## Fahrgemeinschaften

Wer fährt, hatte die Kosten und beantragt die volle Summe. Die Mitfahrenden
werden im Antrag benannt; für dieselbe Reise ist deren eigener Anreise-Antrag
danach gesperrt, mit dem Hinweis, wer die Fahrt bereits abgerechnet hat. In der
Vorstandsliste steht die Fahrgemeinschaft am Antrag, damit die Freigabe sieht,
wofür die 100 € stehen.

## Nachweisdateien

Foto oder PDF, hochgeladen beim Einreichen, abgelegt in einem eigenen
Ablagebereich. Lesen dürfen die einreichende Person und der Vorstand, sonst
niemand. Ohne Datei lässt sich eine Beleg-Erstattung nicht abschicken; die
Anreise-Pauschale braucht keine.

Die digitale Kopie genügt für die Buchführung, solange sie vollständig und
lesbar ist. Die Originale müssen nicht eingeschickt werden.

## Die Stellen, an denen Auslagen nicht mitzählen dürfen

Der einzige ernsthafte Fehlerweg dieses Umbaus. Jede Stelle bekommt eine eigene
Prüfung:

1. der Jahresbalken auf dem Auszahlungsbeleg,
2. die Pauschalen-Übersicht des Vorstands (Datenbankfunktion),
3. die Freibetrags-Ampel in der Antragsliste,
4. die Jahressumme in der Edge Function,
5. `claimTotals()` in `app.js` — beim Bauen gefunden: Budget-Balken, die
   85-Prozent-Warnung, der Bestätigungsdialog beim Einreichen **und** die Kachel
   in „Mein Bereich" rechnen alle über diese eine Funktion. Ohne sie wäre die
   Korrektur in `abrechnung.html` wirkungslos gewesen.

## Fehlerfälle

- **Kein Vergleichspreis an der Reise:** Anreise-Pauschale nicht wählbar, mit
  Hinweis an die Person und an den Vorstand.
- **Nachweisdatei fehlt oder ist unlesbar:** Der Vorstand lehnt ab wie bei jedem
  anderen Antrag; der Grund geht an die Person.
- **Zweiter Anreise-Antrag zur selben Reise:** blockiert, mit Nennung des
  bestehenden Vorgangs.
- **Mitfahrende Person nicht angemeldet:** Warnung bei der Freigabe, keine
  Blockade — es kann jemand kurzfristig eingesprungen sein.

## Nicht Teil dieser Etappe

Vorschüsse, Verpflegungspauschalen, Auslagen ohne Reisebezug, die
Kilometerpauschale als zweiter Rechenweg, und Auslagen bei Sitzwachen.

## Offene Punkte

- Bestätigung der steuerlichen Einordnung (§ 3 Nr. 50 und die Erstattung nach
  Vergleichspreis) durch die Steuerberatung.
- Freigabe des Wortlauts oben durch den Vorstand.
- Pflege der Vergleichspreise: wer trägt sie ein, wie oft werden sie geprüft.
