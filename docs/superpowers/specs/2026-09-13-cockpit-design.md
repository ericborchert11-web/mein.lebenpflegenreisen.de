# Cockpit — Assistenz der Geschäftsführung im Vorstandsbereich

**Stand 13.09.2026.** Eine Startseite für den Vorstand, auf der steht, was
fällig ist: manuell erfasste Vorgänge und automatisch abgeleitete Punkte aus
den Bestandsmodulen. Dazu ein Block in der bestehenden Wochenmail und
Erinnerungen über die bestehende Outbox.

> Dieses Repo ist öffentlich. Migrations-SQL und Edge-Function-Quellen sind
> gitignored und stehen deshalb nicht in diesem Dokument — hier steht, *was*
> gebaut wird und warum, nicht die Policies.

## Was das Cockpit nicht ist

Es entscheidet nichts. Es überweist nicht, stellt keine Rechnung, ändert keinen
Preis und schließt keinen Vorgang von selbst ab. Es erinnert und verlinkt.

Es hält auch keine Kopien. Jeder abgeleitete Punkt ist eine Sicht auf die
Tabelle, die ihn schon besitzt; bearbeitet wird er in dem Modul, dem er gehört.
Eine Fördermittel-Aufgabe, die im Cockpit steht, ist dieselbe Zeile, die
`admin-foerdermittel.html` zeigt und die der Repo-Sync aus `foerdermittel`
schreibt — nicht ihre Zwillingsschwester.

## Bestandsaufnahme (13.09.2026, Repo-Stand b651604)

Vor dem Entwurf gelesen, weil drei Annahmen aus dem Briefing sonst danebenlägen.

**Die Wochenmail gibt es schon.** `notify_weekly_board()` (Migration Q) baut
einen Payload aus `v_kpi_reliability`, `v_kpi_capacity` und den auffälligen
Personen aus `v_volunteer_reliability` und legt **eine** Outbox-Zeile an —
Empfänger `vorstand@lebenpflegenreisen.de`, Rolle `board`. Der pg_cron-Lauf
`notify-wochenmail` startet sie montags um **05:00 UTC**; das ist 07:00 Berliner
Sommerzeit und im Winter 06:00. Die Zeitzone wird bewusst nicht nachgerechnet
(Begründung steht in Migration O2), und das Cockpit ändert daran nichts.

**Der Dedupe-Schlüssel ohne Buchung steckt im Ereignisnamen.** Der Unique-Index
der Outbox lautet `(event, coalesce(booking_id, Null-UUID), booking_version,
channel, recipient)`. Eine Meldung ohne Buchung hat für alle drei mittleren
Felder feste Werte — unterscheidbar bleibt sie nur über `event`. Die Wochenmail
macht das vor: ihr Ereignis heißt `board.weekly.2026-W37`, die Kalenderwoche
steckt im Namen. `vorlagenName()` in der Edge Function fängt das mit einem
Präfixvergleich wieder ein (`event.startsWith('board.weekly')`), damit trotzdem
eine einzige Vorlage zuständig ist.

**Entschieden:** Dieses Muster wird fortgeführt, keine neue Spalte
`dedupe_key`. Cockpit-Ereignisse heißen `cockpit.aufgabe.<aufgabe_id>.<stufe>`
bzw. `cockpit.warten.<aufgabe_id>.<intervall>`, und `vorlagenName()` bekommt
zwei weitere Präfixzweige. Eine zusätzliche Spalte hätte denselben Zweck
erfüllt und den bestehenden Index angefasst — das ist die teurere von zwei
gleichwertigen Lösungen.

**Push kann heute nur Buchungen.** `send-push` hängt an einem eigenen Webhook
auf `bookings`, liest `record`/`old_record`, baut Titel und Text **selbst** und
sucht die Abos über `push_abos.user_id`. Es gibt keinen Weg, dieser Funktion
einen fertigen Text zu übergeben; der Kanal `push` kommt in der Outbox nicht
vor (`channel` erlaubt `email`, `whatsapp`, `sms`).

**Entschieden:** `send-push` bekommt einen zweiten Zugang — einen Aufruf mit
ausdrücklichem Inhalt (Empfänger-IDs, Titel, Text, URL, Tag). Der Buchungsweg
bleibt unberührt. In der Outbox wird `push` ein erlaubter Kanal, und `notify`
verteilt: `email` an Resend, `push` weiter an `send-push`. Damit bleibt es bei
**einer** Warteschlange mit einer Doppelversand-Bremse und einem Statusfeld
(D4), statt ein zweiter Versandweg neben ihr zu entstehen.

**`NOTIFY_REDIRECT_TO` ist am 05.09.2026 entfernt worden.** Mails gehen an die
echten Empfänger. Der Testlauf in Etappe C setzt die Variable deshalb
ausdrücklich wieder, bevor die erste Cockpit-Zeile in die Outbox geht, und
entfernt sie danach.

**`is_board()` existiert** und bewacht schon `app_settings`. **`profiles.email`
existiert** — `notify_recipients()` liest die Spalte. Erinnerungen brauchen
also kein `auth.users`.

**Es gibt genau ein Vorstandskonto:** `vorstand@lebenpflegenreisen.de`. Eric und
Sonja haben daneben persönliche Konten, beide mit `role = 'volunteer'`. Damit
lässt sich „zuständig" nicht auf ein Board-Profil einschränken, wie es das
Briefing vorsah — es gäbe nur eine Wahl. `zustaendig` zeigt deshalb auf ein
beliebiges Profil, und der Seed setzt die persönlichen Konten: dort erreichen
Erinnerungen den Menschen, nicht das Sammelpostfach.

Das hat eine Folge, die eine Entscheidung braucht: Wer eine Erinnerung an sein
persönliches Konto bekommt, kann das Cockpit damit **nicht öffnen** —
`is_board()` ist dort false. Solange das so bleibt, ist die Wochenmail an
vorstand@ der verlässliche Weg; die Alternative wäre, beide Konten auf `board`
zu heben. Das ist Erics Entscheidung, nicht meine, und steht als offener Punkt
im Etappenbericht.

## Aufbau

```
admin-cockpit.html              Startseite des Vorstands (roleTarget('admin'))
   │
   ├── vorgaenge / aufgaben / vorgang_verlauf     neu, board-only
   │      eigene Daten, im Cockpit bearbeitbar
   │
   └── v_cockpit_punkte                           neu, nur lesend
          eine CTE je Quelle über Bestandstabellen
          invoices · claims · pay_supplements · foerder_aufgaben
          compliance_records · bookings · einsaetze · trips
          ehrenamt_interessenten · clinic_applications · profiles
```

Beide Hälften landen in derselben Liste „Jetzt dran", unterschieden nur durch
ein Herkunfts-Abzeichen: bei einer eigenen Aufgabe steht „erledigt", bei einem
abgeleiteten Punkt „öffnen".

## Warum zwei Tabellen und nicht `foerder_aufgaben` erweitern

Naheliegend wäre, die bestehende Aufgabenlogik zu übernehmen. Dagegen spricht
ein Betriebsdetail: `foerder_aufgaben.repo_key` gehört einem Sync aus dem
Repo `foerdermittel`. Aufgaben, die dort nicht vorkommen, hätten `repo_key`
null und wären beim nächsten Abgleich Sonderfälle — oder schlimmer, stille
Verluste. Die BGW-Anmeldung hat im Fördermittel-Modul außerdem nichts zu
suchen; sie würde dessen Programmlisten verwässern.

`foerder_aufgaben` bleibt deshalb, wo sie ist, und erscheint im Cockpit nur als
abgeleiteter Punkt (D3).

## Bereiche als Text, Status als Text

`vorgaenge.bereich` ist Text mit Prüfregel, kein Enum: Der Vorstand soll einen
Bereich ergänzen können, ohne dass jemand eine Migration schreibt; die Liste
fürs Auswahlfeld steht in `app_settings` unter `cockpit.bereiche`. Dieselbe
Begründung wie bei `invoices.status` und `claims.status`, und dieselbe Lehre
wie bei `bookings.shift`, wo das Enum `shift_slot` jede Erweiterung zu einer
eigenen Transaktion macht (D9).

## Der Verlauf ist das Gedächtnis

`vorgang_verlauf` hält fest, wer wann was erledigt, notiert, nachgefasst oder
erinnert bekommen hat. Ohne ihn beantwortet das Cockpit die Frage „seit wann
warten wir eigentlich auf den Arbeitgeber-Service?" nur mit einem Datum, das
jemand überschrieben haben könnte. Geschrieben wird er von Triggern, nicht vom
Browser — `created_by` setzt die Datenbank per `auth.uid()`, wie bei
`foerderCreateAufgabe`.

## Fälligkeiten werden nicht erfunden

Im Startbestand bekommt nur ein Datum, was extern oder satzungsmäßig feststeht:
die Mitgliederversammlung am 21.11.2026 und die Einladungsfrist dazu. Alles
andere steht ohne Datum in „Ohne Datum", bis Eric es selbst setzt (D8). Eine
erfundene Frist ist schlimmer als keine: Sie sieht aus wie eine Zusage an
jemanden.

Für die Mitgliederversammlung heißt das: **nur der Termin selbst ist hart.**
Die Einladungsfrist aus dem Briefing (§ 8 Abs. 4, vier Wochen) gibt es nicht —
am 13.09.2026 gegen die konsolidierte Satzung vom 01.08.2026 geprüft: § 12
verlangt Textform unter Angabe der Tagesordnung und nennt **keine Frist**; § 8
regelt die Beendigung der Mitgliedschaft. Ohne Satzungsfrist gilt nur § 32 BGB,
also „rechtzeitig genug, dass Mitglieder teilnehmen können". Die Einladung steht
deshalb mit einem selbst gesetzten, verschiebbaren Datum im Seed und nicht als
harte Frist.

## Was auf dem Sperrbildschirm steht

Push kennt keinen vertraulichen Modus. Deshalb: kein Betrag, kein Name Dritter,
kein Aktenzeichen — nur der Aufgabentitel und wann sie fällig ist (D6). Diese
Regel gilt im Portal schon; `send-push` begründet sie in seinem Kopfkommentar
mit dem Satz, der auch hier gilt: im Bus liest die Person daneben mit.

In der Wochenmail stehen Beträge, aber keine IBAN. Die Zahlungsanweisung mit
IBAN ist eine eigene Mail an finanzen@ und bleibt es.

## Abgeleitete Punkte — die Regeln

Fünfzehn Quellen, alle mit denselben Spalten: `quelle`, `art`, `ref_id`,
`titel`, `untertitel`, `faellig_am`, `betrag_cents`, `anzahl`, `link`, `prio`.

| quelle | Regel |
|---|---|
| `rechnung_ueberfaellig` | `issued` und `due_date` in der Vergangenheit |
| `rechnung_faellig` | `issued`, `due_date` in `cockpit.rechnung_vorwarnung_tage` (3) |
| `ueberweisung_offen` | `claims.status = 'approved'`, beschriftet nach `kind` (Pauschale / Auslage) |
| `antrag_zur_freigabe` | eingereicht, noch nicht entschieden |
| `foerder_aufgabe` / `foerder_frist` | offen mit Datum in 60 Tagen |
| `compliance_ablauf` | `valid_until` ≤ heute + `cockpit.compliance_vorwarnung_tage` (30) |
| `dienst_unbesetzt` / `dienst_unbestaetigt` | Beginn in 7 Tagen bzw. 48 Stunden |
| `termin_ohne_zuteilung` | Kunden-Termin ohne Person, Beginn in 7 Tagen |
| `reise_unterbesetzt` | bestätigte Anmeldungen < `max_spots`, 90 Tage — grob, die tagegenaue Ampel bleibt im Jahreskalender |
| `interessent_wartet` | Status `neu`, älter als 48 Stunden |
| `klinik_antrag` | Anmeldung wartet auf Freigabe |
| `dienstsperre` | `profiles.status = 'paused'` |
| `ampel` | `kpi_ampeln` nicht grün |

`compliance_records.valid_until` bleibt das Ablaufdatum, auch seit der Änderung
vom 11.09.2026: Eingegeben wird seither der Tag der Genehmigung, gespeichert
weiterhin der Ablauf. Die Ablaufwarnung rechnet also unverändert.

### Vier Korrekturen aus der Vorprüfung

**`pay_supplements` ist keine Antragstabelle.** Ihre Spalten heißen
`applies_to_activity`, `condition_type`, `bonus_value`, `effective_from` — das
sind Zuschlagsregeln. Auslagen liegen in `claims` mit `kind = 'auslage'` und
`auslage_art` (`anreise` | `beleg`); genau so legt `adminCreateAuslageClaim()`
sie an. „Überweisungen offen" ist deshalb **eine** Quelle über `claims`,
getrennt nach `kind`, nicht zwei.

**`bookings.volunteer_id` ist NOT NULL.** Eine Buchung ohne zugeteilte Person
gibt es nicht; „unbesetzt" ist immer die Folge einer Absage. `notify_sweep_unfilled()`
rechnet schon heute so, und das Cockpit spiegelt diese Regel wörtlich, statt
eine zweite zu erfinden. `termin_ohne_zuteilung` ist entsprechend die abgesagte
Buchung mit `kunde_id` ohne Ersatz.

**`claims.amount` steht in Euro**, nicht in Cent wie `invoices.*_cents`. Die
Sicht rechnet um, damit eine Spalte eine Einheit hat. Test B prüft die Summe
gegen die Tabelle.

**`invoice_items` hat kein `booking_id`.** Das Briefing setzte voraus, dass
eine Rechnungsposition ihren Dienst kennt und ein partieller Unique-Index den
Doppelabrechnungsschutz bildet. Beides gibt es nicht — in den
Rechnungs-Migrationen vom 15.08.2026 kommt das Wort `booking` kein einziges
Mal vor. Positionen entstehen frei aus den Leistungsvorlagen. **Die Quelle
`sammelrechnung_offen` entfällt deshalb**; eine Näherung („X abgeschlossene
Dienste im Vormonat") wäre schlimmer als nichts, weil sie auch nach der
gestellten Rechnung stehen bliebe und niemand sie loswürde. Sie kommt wieder,
sobald die Verbindung existiert — entweder durch ein nachgerüstetes
`invoice_items.booking_id` (mit Nacherfassung der bestehenden Rechnungen) oder
auf Monatsebene über `invoices.service_from`/`service_to` je Empfänger.

**`unstaffed_requests` hat kein Feld für „erledigt".** Jede Meldung bliebe ewig
stehen. Aufgenommen werden deshalb nur Meldungen mit einem Datum in der
Zukunft — die räumen sich von selbst ab.

### Zugang: Funktion statt Sicht

Die Sicht ist für niemanden freigegeben; gelesen wird sie über
`cockpit_punkte()` mit `is_board()`-Gate. Hausmuster wie `board_meldungen` und
`board_fehlbedarf`.

Der Umweg hat einen Grund. Mit `security_invoker` bräuchte ein Vorstandskonto
Leserecht auf jede Tabelle darunter — auch auf `v_kpi_reliability` und
`v_kpi_capacity`. Diese Rechte an `authenticated` zu geben hieße, die
Kennzahlen des Vereins jedem angemeldeten Konto zu öffnen; an Ehrenamtliche
gehören sie nicht. Ein Zugang mit einem einzigen, sichtbaren Riegel ist die
engere Lösung. Ein Nicht-Vorstand bekommt dort einen **Fehler**, keine leere
Liste: eine leere Liste sieht aus wie ein aufgeräumter Schreibtisch.

## Erinnerungen

Ein täglicher pg_cron-Lauf legt Outbox-Zeilen an, der bestehende Webhook trägt
sie zur Edge Function, die verteilt nach Kanal. Vier Ereignisse:

| Ereignis | Wann | Kanäle |
|---|---|---|
| `cockpit.aufgabe.*` | 7 Tage, 1 Tag, am Tag der Fälligkeit | Mail + Push |
| `cockpit.warten.*` | nach `cockpit.nachfassen_tage` (14), dann in gleichen Abständen | Mail + Push |
| `cockpit.rechnung.*` | am Tag nach `due_date`, einmalig je Rechnung | Mail |
| `cockpit.sammelrechnung.*` | am 3. Werktag des Monats, wenn es etwas zu stellen gibt | Mail |

Überfällige Aufgaben werden **nicht** täglich gemahnt. Wer jeden Morgen
dieselbe Mail bekommt, liest ab der dritten keine mehr; sie stehen in der
Wochenmail und im Cockpit.

## Reihenfolge

**A** Datenmodell, Sichten, Seed, Cockpit lesend, Startseite. *(13.09.2026 fertig)*
**B** Bearbeiten, Schnellerfassung, Verlauf, Einstellungen.
**C** Wochenmail-Block, Erinnerungen, Push, Testlauf mit Umleitung.
**D** Sammelrechnung — am 13.09.2026 beauftragt, siehe unten.

Nach jeder Etappe Bericht und Halt.

## Etappe D: Sammelrechnung nachrüsten

Der Punkt fehlt, weil `invoice_items` keine `booking_id` trägt. Zwei Wege:

**a) Spalte nachrüsten.** `invoice_items.booking_id` plus partieller
Unique-Index über nicht-stornierte Rechnungen — so war es im Briefing gedacht.
Genau, dauerhaft, und der Doppelabrechnungsschutz säße dort, wo er hingehört.
Preis: Für die bestehenden Rechnungen weiß niemand mehr, welche Dienste in
welcher Position stecken; ohne Nacherfassung hielte das Cockpit sie für
unabgerechnet und würde sie ewig anmahnen. Es bräuchte also entweder eine
Nacherfassung von Hand oder einen Stichtag, vor dem nicht geprüft wird.

**b) Auf Monatsebene fragen.** Gibt es zu Empfänger X und Monat Y überhaupt
eine nicht-stornierte Rechnung, deren `service_from`/`service_to` den Monat
abdeckt? Wenn nicht, und es gab abgeschlossene Dienste — dann fehlt die
Sammelrechnung. Ohne Schemaänderung, ohne Nacherfassung, und der Punkt räumt
sich von selbst ab, sobald die Rechnung gestellt ist. Ungenauer: eine Rechnung
über nur die Hälfte der Dienste eines Monats sieht aus wie eine vollständige.

**Empfehlung b.** Die Sammelrechnung ist ohnehin eine Monatsangelegenheit, und
die Genauigkeit von (a) kostet eine Nacherfassung, die niemand machen will.
Fällt später auf, dass halbe Monate vorkommen, lässt sich (a) darauf aufsetzen.

Zu klären ist dabei der Weg von der Buchung zum Rechnungsempfänger:
`bookings.clinic_id` → `clinic_details.linked_clinic_id` → `clinics.id` →
`billing_recipients.clinic_id`, bei Kunden-Terminen über `bookings.kunde_id`.
Vor dem Bauen einmal die Typen dieser Kette prüfen.

## Später, ausdrücklich nicht jetzt

Kalender-Abo als `.ics`-Feed mit Token. Mail-in an eine Assistenz-Adresse.
Wochenmail je Person, sobald der neue Vorstand steht. Vorgangsvorlagen.
