# Cockpit — UI-Analyse nach der ersten Woche

**Stand 13.09.2026.** Gegenlesen der Seite `admin-cockpit.html` im echten Browser,
mit echten Daten, angemeldet als Vorstand. Nicht aus dem Entwurf heraus
beurteilt, sondern aus dem, was tatsächlich auf dem Bildschirm steht.

> Maßstab sind Werkzeuge, die im Alltag bestehen: **Things 3** (Today / Upcoming
> / Anytime / Someday), **Linear** (Triage, Current, Backlog), **Todoist**
> (Heute mit Überfälligem obenauf), **Basecamp** („Hey!" zeigt nur, was *dich*
> braucht). Ihr gemeinsamer Nenner ist keine Optik, sondern eine Regel:
> **Eine Liste, die „jetzt" heißt, enthält nichts, was nicht jetzt ist.**

## Der Befund in einer Zahl

Der Block „Jetzt dran" zeigt **47 Zeilen**. Davon:

| | Zeilen | |
|---|---|---|
| Überfällig | 12 | davon **7-mal dieselbe Sache**: abgelaufene BZR-Abfragen |
| Diese Woche | 0 | |
| Nächste 14 Tage | 1 | |
| **Ohne Datum** | **34** | der komplette Startbestand aus dem Seed |

**72 % der Liste sind Backlog.** Wer sie morgens öffnet, sucht die eine Zeile,
die heute zählt, zwischen 34 Zeilen, die irgendwann zählen. Genau das ist der
Fehler, den Things 3 mit der Trennung von *Today* und *Anytime* behebt: „Heute"
entsteht dort durch eine **Entscheidung**, nicht dadurch, dass etwas existiert.

---

## A · Korrektheit — das gehört gar nicht in die Liste

Diese vier sind keine Geschmacksfragen. Sie produzieren falsche Dringlichkeit.

**A1 · Sieben abgelaufene BZR-Abfragen sind keine überfälligen Aufgaben.**
Alle sieben `compliance_ablauf`-Punkte sind BZR, und die BZR ist eine
**optionale** Unterlage — sperrend nur im JVK, über `clinics.bzr_pflicht`.
Ein optionales Dokument, das 2025 ablief, ist keine überfällige Pflicht.
→ Regel einschränken: nur Pflichtdokumente, plus BZR nur bei Personen, die im
JVK eingesetzt werden.

**A2 · Eine Stornorechnung wird angemahnt.** `RE-2026-0004 an Heilpraxis
Frommholz` steht mit **−10.569,00 €** als „überfällig seit 27 Tagen". Das ist
das Stornodokument zu einer anderen Rechnung, keine offene Forderung.
→ Negative Summen ausschließen — **und nur die**. Der erste Versuch schloss
auch `cancels_invoice_id` aus und warf damit RE-2026-0010 über 11.169 € mit
heraus, die größte offene Forderung des Vereins: sie trägt das Feld, weil sie
eine stornierte Rechnung *ersetzt*. Ersatzdokument und Gutschrift unterscheiden
sich am Vorzeichen, nicht an diesem Feld.

**A3 · Die Cockpit-Einstellungen existieren nicht in der Datenbank.** Der
`insert` aus Migration B ist nie gelaufen — der SQL-Editor hat beim
`min(uuid)`-Fehler das ganze Skript verworfen. Die Sicht arbeitet seither mit
den eingebauten Rückfallwerten, inhaltlich also richtig, aber der
Einstellungsblock ist leer und nichts ist änderbar.
→ Den `insert` nachziehen.

**A4 · Der Zurück-Link steht auf der Übersicht.** „← Alle Vorgänge" trägt
`hidden`, aber die Klasse setzt `display:inline-block` und schlägt es.
→ `.ck-zurueck[hidden] { display:none }`.

---

## B · Lärm — dieselbe Sache siebenmal

**B1 · Gleichartige Punkte zusammenfassen.** Sieben Zeilen „… bzr ist
abgelaufen" sind eine Information, nicht sieben. Linear und GitHub gruppieren
ab einer Schwelle und zeigen eine Zeile mit Zahl.
→ Regel: Liefert eine Quelle mehr als drei Zeilen, wird daraus **eine** Zeile
(„7 Personen: Nachweis abgelaufen"), aufklappbar.

**B2 · „Ohne Datum" gehört nicht in „Jetzt dran".** Der Block wird zur
Ablage. Things 3 macht daraus einen eigenen Ort.
→ Eigener, eingeklappter Block **„Irgendwann"** unter den Vorgängen. „Jetzt
dran" enthält dann nur noch Überfälliges, Diese Woche und die nächsten 14 Tage.
Nach heutigem Stand: **13 Zeilen statt 47.**

**B3 · Jeder Punkt steht zweimal auf der Seite.** Einmal in „Jetzt dran", einmal
im Sachgebiet (Finanzen / Einsätze / Fördermittel). Das war Absicht — zwei
Fragen, zwei Antworten —, kostet aber die halbe Seitenlänge. Kein
Projektwerkzeug zeigt dieselbe Zeile zweimal untereinander.
→ Die drei Sachgebiets-Blöcke standardmäßig **einklappen** (`<details>`), oder
zu Reitern machen. Die Zahl im Kopf bleibt sichtbar.

---

## C · Bedienung

**C1 · Abhaken gehört nach links, als Kästchen.** Heute ist „erledigt" ein
Knopf ganz rechts, hinter Betrag, Datum und Abzeichen. Things, Todoist,
Reminders und Linear setzen das Kästchen an den Zeilenanfang — dort, wo das
Auge die Zeile beginnt, und in Daumenreichweite.

**C2 · Die Zeile trägt drei Abzeichen und zwei Knöpfe**, und „Vorgang" steht
zweimal: einmal als Herkunft, einmal als Knopf. Bei eigenen Aufgaben ist das
Abzeichen überflüssig — das Kästchen sagt es schon.
→ Abzeichen nur bei abgeleiteten Punkten, Knopf „Vorgang" → „Öffnen".

**C3 · Die Kacheln sind kaputt und zu passiv.** Zahl und Wort kleben aneinander
(`0fällig heute`), weil `.zahl` inline rendert. Und ein Klick scrollt nur.
→ `display:block`, und ein Klick **filtert** die Liste (Todoist, Linear).

**C4 · Der Fortschrittsbalken lügt.** Auf den Vorgangs-Karten füllt er sich mit
dem Anteil *wartender* Aufgaben. Ein Balken, der voller wird, wenn nichts
vorangeht, ist schlimmer als keiner.
→ Entweder erledigt/gesamt zeigen (dafür müssen auch erledigte Aufgaben geladen
werden) oder ersatzlos streichen.

**C5 · `prompt()` für „wartet auf …" und das Nachfassen.** Funktioniert, sieht
aber nach Browser aus und nicht nach Portal; auf dem iPhone ein Systemdialog
mitten im Ablauf.
→ Dasselbe Blatt von unten wie die Schnellerfassung.

---

## D · Sprache

**D1 · Die Umlaute fehlen im Startbestand.** „Fehlende Angaben ergaenzen",
„Vier Punkte klaeren", „Gefaehrdungsbeurteilung". Ich hatte sie beim Seed
umschrieben, um dem SQL-Editor auszuweichen — sichtbar wird das trotzdem, und
es sieht nach kaputt aus.
→ Die 40 Titel einmal mit echten Umlauten nachziehen.

**D2 · „Jetzt dran" ist der richtige Name.** Bleibt.

---

## Was ich vorschlage, in dieser Reihenfolge

| | Was | Wirkung | Aufwand |
|---|---|---|---|
| 1 | A1–A4 | Aus 12 überfälligen werden 4 echte | klein, 1 SQL + 2 Zeilen CSS/SQL |
| 2 | B2 + B1 | Aus 47 Zeilen werden 13 | mittel |
| 3 | C3 + C4 + C1 | Die Seite wird les- und bedienbar | mittel |
| 4 | B3, C2, C5, D1 | Ruhe und Handschrift | klein bis mittel |

Schritt 1 und 2 zusammen sind der Unterschied zwischen „ich schaue jeden Morgen
rein" und „ich schaue da nicht mehr rein". Alles Weitere ist Feinarbeit und
kann warten.

## Was ich nicht ändern würde

- **Der Aufbau der Seite** — Kachelleiste, „Jetzt dran", „Warten auf",
  Vorgänge, Sachgebiete — trägt. Er entspricht dem, was Basecamp „Hey!" und
  Linear „Current" machen.
- **„Warten auf" als eigener Block.** Kein verbreitetes Werkzeug hat das, und
  genau das ist hier richtig: Vereinsarbeit besteht zu großen Teilen aus
  Warten auf Behörden. Der Block ist der eigenständigste Teil des Cockpits.
- **Die leeren Zustände.** „Nichts fällig in den nächsten 14 Tagen. Gute
  Woche." ist gut. Nicht ersetzen durch eine Grafik.
