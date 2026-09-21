# Kassenbuch — Entwurf

Stand: 21.09.2026 · Status: freigegeben, Umsetzung offen

## Warum

Das Portal kennt heute zwei Geldwege: Rechnungen (Einnahmen) und Anträge
(Auszahlungen an Ehrenamtliche). Alles andere, was das Konto verlässt —
Notarkosten, Betriebshaftpflicht, Porto, Software —, steht nirgends. Beim
Abgleich am 21.09.2026 waren das sieben Buchungen über 1.088,91 €, die in
keiner Liste des Vereins auftauchten.

Für die Kassenprüfung ist das die entscheidende Lücke. Ein Prüfer fragt nicht
„sind die erfassten Kosten richtig?", sondern „ist **jede** Kontobewegung
belegt?". Diese Frage kann der Verein derzeit nicht beantworten.

Ziel: Der Vorstand lädt monatlich den CSV-Export des Vereinskontos hoch. Das
Portal ordnet zu, was es kennt, und fragt nach dem Rest. Die Belege selbst
bleiben in Google Drive, verlinkt aus der jeweiligen Buchung.

## Entscheidungen

Mit Eric abgestimmt am 21.09.2026:

- **Vollständiges Kassenbuch**, keine bloße Kostenliste. Der Nachweis der
  Vollständigkeit ist der eigentliche Zweck.
- **Upload im Portal**, nicht Import per Skript: Der Weg muss auch ohne Claude
  und für einen künftigen Kassenwart funktionieren.
- **Kostenart und gemeinnützige Sphäre** je Buchung (ideeller Bereich,
  Zweckbetrieb, wirtschaftlicher Geschäftsbetrieb, Vermögensverwaltung). Damit
  fällt die Aufteilung für die Anlage Gem nebenbei ab.
- **Lückenlos ab Kontoeröffnung**, nicht erst ab heute.
- **Die IBAN der Gegenseite wird nicht importiert.** Sie steht in jeder
  CSV-Zeile, wird für die Prüfung nicht gebraucht und würde die Kontonummern
  aller Ehrenamtlichen in eine weitere Tabelle tragen. Name, Datum, Betrag und
  Verwendungszweck genügen zur Identifikation.

## Datenmodell

Eine neue Tabelle `bank_buchungen`, eine Zeile je Kontobewegung, RLS wie bei den
Rechnungen (nur Vorstand). Felder:

- aus der CSV unverändert: `buchungstag`, `valuta`, `betrag_cents` (negativ =
  Ausgang), `gegenpartei`, `verwendungszweck`, `buchungstext`, `konto_iban`
- `fingerabdruck`, eindeutig, gebildet aus Konto, Buchungstag, Betrag,
  Verwendungszweck und Gegenpartei — verhindert Doppelerfassung beim erneuten
  Upload derselben Datei
- Zuordnung zu einem bekannten Vorgang: `invoice_id` oder `claim_id`
- eigener Kostenbeleg, nur wenn kein Vorgang dahintersteht: `kostenart`,
  `sphaere`, `beleg_url` (Google Drive), `notiz`
- Herkunft: `importiert_am`, `importiert_von`

Kein zweites Kassenbuch und keine Kopien vorhandener Daten: Wo eine Rechnung
oder ein Antrag dahintersteht, ist der vorhandene Beleg der Beleg, die Zeile
verweist nur darauf. Damit gibt es über eine Zahlung nie zwei Wahrheiten.

Eine Buchung ist danach in genau einem von drei Zuständen: einem Vorgang
zugeordnet, mit eigenem Kostenbeleg versehen, oder offen. Offen ist der
Arbeitsvorrat.

Zweite, kleine Tabelle `kontostaende`: je Stichtag ein vom Auszug abgetippter
Kontostand, plus der Anfangsbestand. Grundlage des Saldo-Abgleichs.

## Import

Neue Seite `admin-kassenbuch.html`, Menüpunkt neben „Rechnungen". Die Datei wird
**im Browser** gelesen, nichts geht an einen fremden Dienst.

Drei Eigenheiten des Sparkassen-Exports, die der Parser beachten muss:

1. Die Datei ist **ISO-8859-1**, nicht UTF-8. Falsch gelesen wird aus „Schröder"
   ein „Schrder".
2. Zahlen und Daten stehen deutsch: `1.234,56` und `21.09.26` (zweistelliges
   Jahr).
3. Nur Zeilen mit „Umsatz gebucht" werden übernommen. Vorgemerkte Umsätze
   ändern sich noch und würden später als Dublette erscheinen.

Vor dem Schreiben zeigt die Seite eine Vorschau („14 neue Buchungen, 17 bereits
bekannt") und speichert erst auf Bestätigung.

## Zuordnung

Beim Import erkennt das Portal selbst:

- `RE-JJJJ-NNNN` im Verwendungszweck → diese Rechnung
- `Antrag XXXXXXXX` → dieser Antrag, über die ersten acht Zeichen der
  Antrags-ID (so schreibt es die Zahlungsanweisung)
- `LPR-AZB-JJJJ-NNNN` → dieser Antrag über die Belegnummer

Zugeordnet wird **nur bei übereinstimmendem Betrag**. Sonst bleibt die Zeile
offen mit dem Hinweis „Nummer gefunden, Betrag weicht ab". Der Anlass steht im
Repo: RE-2026-0007 lautete auf 849,19 €, eingegangen sind 819,19 €. Eine solche
Differenz darf nicht stillschweigend als erledigt verbucht werden.

Alles Übrige wird von Hand zugeordnet: entweder ein Vorgang aus einer Suche,
oder ein eigener Kostenbeleg. Kostenarten zum Start: Versicherung · Recht &
Notar · Porto & Versand · Büro & Material · Software & IT · Bankgebühren ·
Fahrt- und Reisekosten · Aufwandsentschädigung · Spenden & Weiterleitung ·
Sonstiges. Jede Kostenart bringt einen Sphären-Vorschlag mit, der überschrieben
werden kann.

## Ansicht

Das Kassenbuch nach Monaten gruppiert: Datum, Gegenpartei, Zweck, Betrag,
Zuordnung, Beleg. Darüber der Arbeitsvorrat als zwei Zahlen: „N Buchungen ohne
Zuordnung · M ohne Beleg". Sind beide null, ist der Monat fertig.

Dazu:

- **Summen je Kostenart und je Sphäre** für ein wählbares Jahr — die Vorarbeit
  für die Anlage Gem.
- **Saldo-Abgleich.** Die CSV enthält keinen Kontostand. Das Portal rechnet ihn
  aus Anfangsbestand plus allen Buchungen und stellt ihn dem monatlich
  abgetippten echten Kontostand gegenüber. Stimmen beide überein, ist bewiesen,
  dass keine Buchung fehlt; weichen sie ab, ist der Monat benannt, in dem etwas
  fehlt. Ohne diesen Abgleich lässt sich nur sagen „was erfasst ist, ist
  belegt", nicht „es ist alles erfasst".
- **CSV-Export** der Kassenbuchansicht für den Prüfer.

## Nicht im Umfang

Bewusst weggelassen, jeweils nachrüstbar:

- Bargeld und Handkasse — der Verein hat keine.
- Mehrere Konten.
- Aufteilung einer Buchung auf mehrere Kostenarten oder Vorgänge.
- Kostenbelege ohne Kontobewegung.
- Ein Punkt im Cockpit für offene Buchungen.

## Offene Punkte

- Anfangsbestand und Datum der Kontoeröffnung müssen einmal ermittelt werden.
- Die zurückliegenden Monate müssen als CSV gezogen und hochgeladen werden,
  bevor der Saldo-Abgleich aussagekräftig ist.
