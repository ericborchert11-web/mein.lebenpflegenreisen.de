# Reise-Jahreskalender — Design

Datum: 2026-08-14
Projekt: mein.lebenpflegenreisen.de (LPR-Portal)
Status: freigegeben, bereit für die Implementierungsplanung

## Zweck

Der Vorstand braucht eine Jahressicht auf die Reisen. Sie soll drei Fragen
beantworten:

1. Was läuft wann im Jahr?
2. Welche Reise ist unterbesetzt?
3. Wer ist wann verplant?

Die Seite ist ein Planungswerkzeug zum Ansehen. Reisen angelegt, geändert und
gelöscht werden weiterhin ausschließlich in `admin-reisen.html`.

Ausdrücklich **nicht** Ziel: freie Zeiträume für neue Reisen finden, Reisen per
Drag & Drop verschieben, eine Sicht für Ehrenamtliche oder Kliniken, eine
öffentliche Version ohne Login.

## Rollen und Zugang

Nur `admin` / `board`. Der Einstieg folgt dem Muster der übrigen Admin-Seiten:

```js
if (!LPR.requireRole('admin', 'login.html?next=admin-jahreskalender.html'))
  throw new Error('kein Zugriff');
```

Keine neuen Tabellen, keine neuen Policies, keine Migration. Alle verwendeten
Funktionen sind bereits für den Vorstand gedacht und laufen gegen die
bestehenden RLS-Regeln.

## Aufbau

Neue Datei `admin-jahreskalender.html` im Wurzelverzeichnis, wie alle anderen
Seiten des Portals. In `layout.js` bekommt der Admin-Block einen Punkt
„Jahreskalender" direkt hinter „Reisen", mit `c('jahreskalender')`.

### Kopfzeile

- Jahres-Umschalter `‹ 2026 ›`, Startwert ist das laufende Kalenderjahr
- Ansichts-Umschalter `Nach Reise | Nach Person`
- Status-Filter als Chips: Entwurf, Offen, Geschlossen, Abgeschlossen sind
  vorausgewählt; Abgesagt ist abgewählt und lässt sich zuschalten
- Rechts eine Kennzahl: Anzahl Reisen im Jahr und wie viele davon kritisch sind

Der Jahreswechsel lädt die Daten neu. Ansichts- und Filterwechsel arbeiten auf
den bereits geladenen Daten, ohne Netzwerkzugriff.

## Geteilte Besetzungslogik

Die Besetzungsregel des Vereins lautet: **Ein Reisetag gilt erst als besetzt,
wenn Vormittag und Nachmittag jeweils von einer bestätigten Anmeldung abgedeckt
sind.** Diese Regel steht heute ausschließlich in `admin-reisen.html`.

Fünf Funktionen wandern nach `app.js` und werden über das `LPR`-Objekt
exportiert:

| Funktion | Aufgabe |
|---|---|
| `LPR.enumTripDays(startDate, endDate)` | Liste aller Tage einer Reise als `YYYY-MM-DD` |
| `LPR.signupEffectiveDays(signup, allDays)` | Tage, für die eine Anmeldung gilt (leeres `days` = ganze Reise) |
| `LPR.signupCoversHalf(signup, day, half)` | deckt die Anmeldung `am` bzw. `pm` dieses Tages ab |
| `LPR.tripDayGaps(signups, trip, day)` | offene Tageshälften eines Tages als Array |
| `LPR.tripCoverage(signups, trip)` | `{ total, uncovered }` für die ganze Reise |

Es sind reine Funktionen ohne Netzwerkzugriff und ohne Zustand. Nur Anmeldungen
mit `status === 'confirmed'` zählen; Warteliste und Stornos werden ignoriert.

`admin-reisen.html` verliert seine lokalen Definitionen von `enumTripDays`,
`effectiveDays`, `coversHalf`, `dayGaps` und `coverageSummary` und ruft
stattdessen die `LPR.*`-Varianten auf. Verhalten und Darstellung dort bleiben
unverändert — das ist eine reine Verschiebung, keine Änderung. Danach gibt es im
Projekt genau eine Besetzungs-Wahrheit.

Dies und der Sprungziel-Anker (siehe unten) sind die einzigen beiden Eingriffe
in bestehenden Code.

## Datenfluss

Beim Laden und bei jedem Jahreswechsel:

| Quelle | Zweck | Zeitpunkt |
|---|---|---|
| `LPR.listAllTripsAdmin()` | alle Reisen inkl. Entwürfen | sofort |
| `LPR.getAllTripSignupsAdmin()` | Anmeldungen inkl. `days`, `dayHalves`, `full_name` | sofort |
| `LPR.listVolunteersAdmin()` | Personen-Zeilen (`role='volunteer'`, `status='approved'`) | sofort |
| `LPR.adminListBookings(von, bis)` | Sitzwachen des Jahres | erst beim ersten Wechsel auf „Nach Person" |

Eine Reise gehört zum Jahr, wenn sie es berührt: `start_date <= JJJJ-12-31`
**und** `end_date >= JJJJ-01-01`. Damit verschwindet eine Reise über den
Jahreswechsel nicht, sondern erscheint in beiden Jahren.

Anmeldungen werden nach `trip_id` gruppiert und einmal pro Reise durch
`LPR.tripCoverage` geschickt. Das Ergebnis wird zwischengespeichert, damit ein
Filter- oder Ansichtswechsel nicht neu rechnet.

Taucht in den Anmeldungen eine `user_id` auf, die nicht in `members` steht (etwa
weil die Person inzwischen nicht mehr `approved` ist), bekommt sie trotzdem eine
Zeile in der Personen-Ansicht, mit dem `full_name` aus der Anmeldung.

## Ansicht „Nach Reise"

Zwölf Zeilen, eine je Monat, jede mit einem Tagesraster von 1 bis 31. Reisen
sind Balken, deren Position und Breite aus der Tagesnummer folgen:
`left = (Starttag − 1) / 31`, `width = Tageszahl / 31`.

**Ampel nach Tagesabdeckung:**

| Bedingung | Farbe | Beschriftung |
|---|---|---|
| `uncovered === 0` | grün | „alle Tage besetzt" |
| `0 < uncovered * 2 <= total` | gelb | „N von M Tagen offen" |
| `uncovered * 2 > total` | rot | „N von M Tagen offen" |
| `status === 'draft'` | grau schraffiert | „Entwurf" |

Entwürfe bekommen bewusst keine Ampel: solange die Reise nicht offen ist, sagt
„unbesetzt" nichts aus. Abgesagte Reisen sind standardmäßig ausgeblendet und
erscheinen bei zugeschaltetem Filter blass und durchgestrichen.

Drei Darstellungsregeln, die für korrektes Lesen nötig sind:

- **Kurze Monate.** Alle Zeilen sind gleich breit, aber Februar hat 28 Tage. Der
  überzählige Bereich ab `ndays / 31` wird schraffiert abgeblendet, sonst liest
  man eine Februarwoche als länger, als sie ist.
- **Monatsübergreifende Reisen.** Eine Reise vom 26.09. bis 03.10. wird in beiden
  Monatszeilen gezeichnet, jeweils auf den Monat zugeschnitten, mit einer
  Schnittkante und der Andeutung `◀` bzw. `▶`.
- **Schmale Balken.** Balken unter 30 % Zeilenbreite haben zu wenig Platz für den
  Titel. Sie schreiben ihn rechts neben den Balken statt darauf.

Monate ohne Reise behalten ihre Zeile und bleiben leer.

## Detail-Panel

Klick auf einen Balken öffnet ein Panel rechts neben dem Kalender; unterhalb von
900 px Fensterbreite fährt es stattdessen von unten als Blatt herein. Inhalt:

- Titel, Ort, Zeitraum
- Status, `max_spots`, Partner, Tagessatz falls `rate_override_per_day` gesetzt
- Abdeckungs-Kopf, etwa „⚠ 6 von 8 Tagen nicht vollständig besetzt"
- Tagesliste mit den Namen der bestätigten Begleiter:innen und den offenen
  Hälften, inklusive der Fälle „Vormittag unbesetzt" und „Nachmittag unbesetzt"
- Schaltfläche „In Reisen bearbeiten →"

Die Tagesliste entspricht inhaltlich `renderDayCoverage` aus
`admin-reisen.html`, wird aber aus den geteilten `LPR.*`-Funktionen gespeist.

Die Schaltfläche führt auf `admin-reisen.html#trip-<id>`. Dafür bekommt
`admin-reisen.html` eine Ergänzung: beim Laden `location.hash` auswerten, die
passende Reise aufklappen und dorthin scrollen. Ist der Anker unbekannt,
passiert nichts weiter — die Seite verhält sich wie bisher.

## Ansicht „Nach Person"

Zeilen sind Personen, die Achse ist das ganze Jahr mit Tagesauflösung.

- **Reisen** sind farbige Blöcke in der Ampelfarbe ihrer Reise, mit einer
  Mindestbreite von etwa 7 px, damit ein Ein-Tages-Einsatz sichtbar bleibt.
  Gezeichnet werden nur Anmeldungen mit `status === 'confirmed'`; die Warteliste
  bedeutet keine Verplanung.
- **Sitzwachen** sind schmale graue Striche. Sie sind bewusst schwächer
  gewichtet als Reisen und sollen den Blick nicht dominieren. Buchungen mit
  `cancelled_at != null` oder `status === 'cancelled'` zählen nicht.
- Elf feine Trennlinien markieren die Monatsgrenzen — bei einer durchgehenden
  Jahresachse liegt die zwölfte am linken Rand der Spur. Darüber ein
  Monatslineal mit allen zwölf Beschriftungen.

**Sortierung:** absteigend nach Anzahl der Einsatztage im Jahr. Personen ganz
ohne Einsatz stehen in einem zugeklappten `<details>`-Block „Ohne Einsatz JJJJ
(N)" darunter, damit man Reserven findet, ohne dass leere Zeilen die Sicht
verstopfen.

**Doppelverplanung:** Hat eine Person am selben Tag einen bestätigten
Reise-Einsatz und eine Sitzwache, bekommt der Sitzwachen-Strich einen roten Ring
und über der Liste steht ein Zähler mit den betroffenen Namen und Tagen. Das ist
ein Hinweis, keine Sperre — es kann legitime Fälle geben.

Ein Klick auf einen Reise-Block öffnet dasselbe Detail-Panel wie in der
Reise-Ansicht.

## Fehlerfälle und Leerzustände

Eine leere Liste ist in diesem Portal nie automatisch „keine Daten" — RLS kann
Zeilen wegfiltern. Deshalb:

| Situation | Verhalten |
|---|---|
| `listAllTripsAdmin` oder `getAllTripSignupsAdmin` schlägt fehl | Fehlerbanner mit der Meldung statt eines leeren Jahres, kein Kalender |
| `listVolunteersAdmin` schlägt fehl | Reise-Ansicht bleibt nutzbar, der Umschalter „Nach Person" ist deaktiviert mit Hinweis |
| `adminListBookings` schlägt fehl | Personen-Ansicht zeigt Reisen, oben der Hinweis „Sitzwachen konnten nicht geladen werden" |
| Jahr ohne Reisen | Leerzustand mit Link „Reise anlegen" nach `admin-reisen.html` |
| Reise mit `end_date < start_date` in den Daten | Balken wird übersprungen, Reise erscheint stattdessen in einer Hinweiszeile unter dem Kalender |

## Verifikation

Das Repository hat keine Testinfrastruktur. Geprüft wird im Browser:

1. `admin-reisen.html` vor und nach dem Verschieben der fünf Funktionen
   vergleichen: Abdeckungsköpfe, Tageslisten und Warnungen müssen für dieselben
   Reisen identisch bleiben.
2. Kalender und `admin-reisen.html` nebeneinander: die Angaben „N von M Tagen
   offen" müssen je Reise übereinstimmen.
3. Grenzfälle im Kalender ansehen: Ein-Tages-Reise, Reise über eine
   Monatsgrenze, Reise über den Jahreswechsel, Februar, Entwurf, abgesagte Reise
   mit und ohne Filter.
4. Personen-Ansicht: eine Person mit vielen Sitzwachen, eine ohne jeden Einsatz,
   ein konstruierter Konflikttag.
5. Abmelden und `admin-jahreskalender.html` direkt aufrufen — es muss auf
   `login.html?next=admin-jahreskalender.html` führen.

## Bewusst weggelassen

- Drag & Drop und Bearbeiten im Kalender: `admin-reisen.html` kann das bereits,
  eine zweite Formular- und Validierungslogik wäre eine zweite Fehlerquelle.
- Sitzwachen in den Monatszeilen: dort geht es um Reisen, und viele Sitzwachen
  machen die Zeilen unruhig.
- Tagesgenaue Einfärbung innerhalb eines Reisebalkens: welche Tage offen sind,
  steht im Detail-Panel.
- Druckansicht: kann nachgerüstet werden, wenn sich in der Praxis zeigt, dass
  der Kalender in Vorstandssitzungen auf Papier gebraucht wird.
