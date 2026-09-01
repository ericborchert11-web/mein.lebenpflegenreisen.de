# Sana-Feedback: Patientenzahl, Benachrichtigungen, No-Show, Ampeln, Akquise, WhatsApp

**Stand 01.09.2026.** Entwurf zu den Aufgaben A–F aus dem Briefing vom
01.09.2026 (Feedback Sana Klinikum Lichtenberg).

---

## 1. Bestandsaufnahme — was das Briefing anders annimmt als der Code

Fünf Punkte, an denen die Wirklichkeit vom Briefing abweicht. Sie bestimmen den
ganzen Entwurf, deshalb stehen sie vorn.

### 1.1 Der Mailversand läuft über Resend, nicht über Ionos

Das Briefing nennt Ionos-SMTP. Die Umstellung auf **Resend** ist am 11.08.2026
passiert — Supabase Auth *und* alle Edge Functions. `functions/README-mailversand.md`
belegt es mit der DNS-Abfrage, und `functions/mailer-resend.ts` liegt als fertiger
HTTP-API-Mailer daneben.

**Folge:** Default D7 („Adapter für Resend vorbereiten, nicht aktivieren") ist
gegenstandslos. Es gibt nichts zu entscheiden und nichts, was Geld kostet — Resend
ist der laufende Weg. Die neue Function nutzt `mailer-resend.ts` über die HTTP-API,
nicht SMTP: Ein POST gibt einen Statuscode zurück, den die Outbox speichern kann,
und genau daran hat es beim Ionos-Ausfall gefehlt.

**Die Falle bleibt:** Absender immer `…@lebenpflegenreisen.de`, nie
`…@send.lebenpflegenreisen.de` — Resend antwortet auf die Subdomain mit 403.

### 1.2 Es gibt schon eine Buchungsmail: `notify-booking`

Eine deployte Edge Function `notify-booking` hängt an einem Webhook auf `bookings`
und mailt heute schon die Sitzwache an. Ihr Quelltext liegt **nicht im Repo**
(`functions/` ist gitignored und enthält sie nicht).

**Folge:** Eine zweite, Outbox-getriebene Function würde die Buchungsmail
verdoppeln. Der Weg ist derselbe wie schon einmal bei `claim-mails`: die neue
Function übernimmt das Thema vollständig, der **alte Webhook wird gelöscht**. Das
ist ein manueller Schritt für Eric und steht als solcher im Abschlussbericht.

### 1.3 Die Klinik bucht bereits blind — aber es gibt keinen unbesetzten Zustand

Die Buchungsmaske ist neutral, wie das Briefing es beschreibt: `klinik-buchen.html`
ruft `bookShiftFair` → RPC `book_shift_fair`, und die Vergaberegel in der Datenbank
sucht die Person aus. Die Namen verlassen die Datenbank gar nicht erst.

Daraus folgt aber etwas, das das Briefing nicht vorsieht: **eine Buchung entsteht
immer schon zugeteilt.** Findet die Regel niemanden, entsteht gar keine Buchung
(„Zuteilung nicht möglich"). Einen Status `requested` — Anfrage liegt vor, Pool
sieht sie, jemand übernimmt — gibt es nicht und hat es nie gegeben.

**Folge für die Event-Matrix:**

- `booking.requested` entfällt. Die Klinik bekommt bei der Buchung sofort eine
  Bestätigung **mit Namen**, nicht eine neutrale Eingangsbestätigung.
- `booking.unfilled_24h` kann bei einer *neuen* Buchung nicht eintreten. Es tritt
  genau in dem Fall ein, den Sana angesprochen hat: **die Sitzwache sagt ab.** Dann
  steht die Klinik ohne Besetzung da, und heute merkt das niemand automatisch.
  Der Cron sucht deshalb nach *abgesagten Buchungen mit noch zukünftigem Beginn,
  für die keine Ersatzbuchung existiert*.

Das ist die ehrliche Übersetzung von Sanas Frage „wenn ein Dienst wegfällt — wie
erfahren wir das?" auf das Modell, das wirklich läuft.

### 1.4 Stornoarten sind Spalten, kein Status

Das Enum kennt `planned`, `confirmed`, `completed`, `no_show`, `cancelled` — ein
einziges, generisches `cancelled`. Wer storniert hat, steht daneben in
`cancelled_by_user_id`, `cancelled_at`, `cancellation_reason`.

**Entscheidung (D1/D2, Bestand gewinnt):** Das Enum wird **nicht** in
`cancelled_by_clinic` / `cancelled_by_volunteer` gespalten. Der Handelnde wird aus
`cancelled_by_user_id` gegen `volunteer_id` bzw. `clinic_id` abgeleitet. Ein
gespaltenes Enum müsste in jedem Statusfilter, jeder Pill-Klasse und jeder
Beschriftung nachgezogen werden (`admin-sitzwachen.html`, `klinik-buchungen.html`,
Abrechnung) — viel Angriffsfläche für null zusätzliche Information.

### 1.5 Stufe A/B existiert nicht

Das Briefing setzt zwei Leistungsstufen voraus. Im Code gibt es sie nirgends.
`profiles.qualifications` ist ein Schulungskatalog (Sitzwachen-Schulung,
Reiseleitungs-Schulung, Führungszeugnis, Erste Hilfe, Demenz-Schulung) — kein
Berufsabschluss, keine Pflegefachkraft-Kennzeichnung.

**Kleinste sinnvolle Lösung (D13):** Der Katalog bekommt einen sechsten Eintrag
`pflegefachkraft`. Die Stufe wird daraus abgeleitet — mit dem Eintrag Stufe B,
ohne ihn Stufe A. Der Katalog ist ohnehin board-only pflegbar
(`setUserHardPreferences`), und genau dorthin gehört ein Berufsabschluss.
Zusätzlich `profiles.berufsabschluss` (Text, optional) für den Klartext in der
Mail. Keine neue Tabelle, kein neues Konzept.

**Ausdrücklich nicht umgesetzt:** die Regel „2 Patient:innen ⇒ Stufe B". Das
Briefing schließt sie aus, und die Buchung wählt keine Person aus.

### 1.6 Was es schon gibt und wiederverwendet wird

| Vorhanden | Wird für |
|---|---|
| `ehrenamt_interessenten` + Function `ehrenamt-interesse` + `admin-ehrenamt-interesse.html` | Aufgabe E — der Funnel ist gebaut, er wird erweitert, nicht neu angelegt |
| `no_show` als Status, im Vorstandsbereich setzbar | Aufgabe C — vorhanden, aber unvollständig |
| `mailer-resend.ts` | die Versandschicht der neuen Function |
| `claims`-Muster (Webhook + Zeitstempel-Bremse) | Vorbild für die Outbox |
| `clinics` (Stammdaten, `id` ist **text**) | Aufgabe B — Zuordnung Klinikkonto → Klinik |

---

## 2. Aufgabe A — Patientenanzahl

`bookings.patient_count smallint not null default 1 check (patient_count in (1,2))`.

Der Weg hinein führt über `book_shift_fair` — die Klinik schreibt nicht direkt in
`bookings`, die RPC tut es. Also bekommt die RPC einen Parameter
`p_patient_count` mit Vorgabewert 1. Der Vorgabewert ist wichtig: die Function hat
weitere Aufrufer (`admin-sitzwachen.html`), die nichts davon wissen müssen.

Angezeigt wird die Zahl nur, wenn sie 2 ist — ein Badge „2 Patient:innen". Eine 1
überall hinzuschreiben wäre Lärm; der Regelfall braucht keine Beschriftung.

Orte: `klinik-buchen.html` (Segmented Control, Vorgabe 1), `klinik-buchungen.html`,
`mein-bereich.html` (Dienstdetail), `admin-sitzwachen.html`, CSV-Export,
alle Mail-Vorlagen.

**Kein Eingriff in die Abrechnung** (D6/D11). Zwei Patient:innen sind eine
Sitzwache und ein Preis. Die Spalte erscheint im Export als Information, nicht als
Rechengröße.

## 3. Aufgabe B — Benachrichtigungen

### 3.1 Klinikkonten und Abteilungen

Heute ist `bookings.clinic_id` die **Profil-ID des Klinikkontos**, nicht
`clinics.id`. Klinikkonto und Klinik-Stammsatz sind zwei Dinge, die bisher nichts
verbindet. Für „alle Abteilungsleitungen derselben Klinik" braucht es diese
Verbindung.

Neu auf `profiles` (nur für `role = 'clinic'` gefüllt):

| Spalte | Zweck |
|---|---|
| `clinic_ref text references clinics(id)` | zu welcher Klinik gehört das Konto |
| `department text` | Station/Abteilung |
| `notify_email boolean default true` | will Mails |
| `notify_all_departments boolean default false` | PDL: alle Abteilungen |

Neu auf `clinics`: `notification_cc text` — Sammeladresse, bekommt alles zusätzlich.

Vorstands-UI zum Einladen: in `admin-kliniken.html`, weil dort die Klinik schon
gepflegt wird. Kein SQL für Eric.

### 3.2 Empfängerlogik

Eine SQL-Funktion `notify_recipients(p_booking_id, p_event)` liefert Zeilen
`(rolle, email, name)`. In SQL, nicht in TypeScript: WhatsApp soll später
dieselbe Logik benutzen, und zwei Fassungen driften auseinander.

- **Klinik:** Ersteller (`clinic_id`) + alle `clinic`-Profile mit gleichem
  `clinic_ref` und (gleicher `department` oder `notify_all_departments`) und
  `notify_email` + `clinics.notification_cc`. Dedupliziert über `lower(email)`.
- **Ehrenamt:** `volunteer_id`.
- **Vorstand:** `vorstand@lebenpflegenreisen.de` bei Ausnahmefällen.

### 3.3 Ereignisse auf dem echten Statusmodell

| Ereignis | Wann | Klinik | Ehrenamt | Vorstand |
|---|---|---|---|---|
| `booking.created` | Buchung entsteht (`planned`) | Bestätigung **mit Name + Stufe** | Dienstbestätigung + `.ics` | – |
| `booking.confirmed` | Sitzwache bestätigt (`confirmed`) | „bestätigt" | – | – |
| `booking.updated` | Zeit/Station/Patientenzahl geändert | Änderung | Änderung | – |
| `booking.cancelled_by_volunteer` | `cancelled`, `cancelled_by_user_id = volunteer_id` | „nicht mehr besetzt, wir suchen Ersatz" | Storno-Bestätigung | Alarm bei < 48 h |
| `booking.cancelled_by_clinic` | `cancelled`, sonst | Storno-Bestätigung | Storno-Mitteilung | Alarm bei < 24 h |
| `booking.replacement` | neue Buchung, gleiche Klinik/Datum/Schicht nach einer Absage | „Ersatz bestätigt: Name + Stufe" | Dienstbestätigung | – |
| `booking.unfilled` | Cron: abgesagt, Beginn < 48 h / < 24 h, kein Ersatz | bei 24 h: „noch kein Ersatz" | – | Alarm 48 h **und** 24 h |
| `booking.no_show` | Status `no_show` | „Danke, wir klären das" | **keine Mail** | Alarm |
| `booking.reminder_24h` | Cron, 24 h vor Beginn | – | Erinnerung | – |

`booking.created` ersetzt `booking.requested`: die Klinik erfährt den Namen sofort,
weil er sofort feststeht (§ 1.3).

### 3.4 Outbox

```
notification_outbox(
  id, event, booking_id, booking_version, channel, recipient, recipient_role,
  payload jsonb, status, attempts, provider_message_id, error, created_at, sent_at)
unique (event, booking_id, booking_version, channel, recipient)
```

`booking_version` ist ein Zähler auf `bookings`, den ein Trigger bei jeder
inhaltlichen Änderung hochzählt. Ohne ihn könnte dieselbe Buchung nach einer
Änderung nie ein zweites Mal dasselbe Ereignis melden.

Ein Trigger auf `bookings` schreibt die Zeilen. Ein Database-Webhook auf INSERT in
`notification_outbox` ruft die Function `notify`. Ein `pg_cron`-Sweep alle 15
Minuten nimmt `pending` und `failed` mit weniger als 5 Versuchen.

RLS: nur Service-Role. Der Vorstand liest den Zustand über eine Sicht.

### 3.5 Versand

Edge Function `notify`, Secret-Header `x-notify-secret` (eigenes Secret, nicht das
von `notify-booking` oder `claim-mails`). Antwortet **immer** mit 200 — ein
Fehlerstatus ließe Postgres den Webhook wiederholen und dieselbe Mail mehrfach
verschicken; der Erfolg steht im Rumpf. Das ist das Muster aus `claim-mails`.

`NOTIFY_REDIRECT_TO` leitet alles um und stellt `[TEST → original@…]` vor den
Betreff.

Vorlagen als Dateien unter `functions/notify/templates/*.html` mit
`{{platzhaltern}}`.

### 3.6 Was in eine Mail darf

Buchungs-ID, Klinik, Station, Datum, Zeitfenster, Stufe, Patient:innen,
Ansprechperson, Link, Kontakt. An die Klinik zusätzlich Vor- und Nachname der
Sitzwache und die Stufe im Klartext — **keine** Telefonnummer, keine Mailadresse.
Bei Absage kein Grund. Keine Patientendaten: `patient_notes`, `patient_room` und
`fallnummer` gehen in **keine** Mail.

## 4. Aufgabe C — No-Show

Vorhanden: Status `no_show`, gesetzt vom Vorstand in `admin-sitzwachen.html`;
`klinik-buchungen.html` kennt die Beschriftung. Es fehlen: die Klinik als
Handelnde, Nachvollziehbarkeit, die Darstellung im Kalender und der Ausschluss aus
dem Nachweis.

Neu: `no_show_marked_by`, `no_show_marked_at`, `no_show_note`. RPC
`set_booking_no_show(p_booking_id, p_note)` — Klinik ab Dienstbeginn bis 72 h
danach, Vorstand immer; und `clear_booking_no_show` nur für den Vorstand.

Kalender: storniert grau und durchgestrichen, No-Show rot, Filter „Stornos &
No-Shows anzeigen" (Vorgabe: aus). Nie löschen, nur Status.

Abrechnung: `no_show` fliegt aus dem Stundennachweis. Der Nachweis zählt geleistete
Stunden — ein nicht geleisteter Dienst gehört dort nicht hin.

## 5. Aufgabe D — Ampeln

`app_settings(key text primary key, value jsonb, updated_at, updated_by)`,
board-only, im Vorstands-UI änderbar. Schwellen wie in Abschnitt 5 des Briefings.

Sichten `v_kpi_reliability`, `v_kpi_capacity`, `v_volunteer_reliability` —
`security_invoker`, board-only lesbar.

Zwei Karten im Vorstandsbereich mit Farbe, Kennzahl, Zeitfenster und Tooltip
„Warum?" (Schwelle + Ist-Wert). Dazu der Hinweis, die Schwellen nach drei Monaten
echter Daten nachzujustieren, und der Satz zum Vorlauf von 4–6 Wochen beim
Onboarding.

Zwei No-Shows in 12 Monaten setzen `profiles.status = 'paused'`. Bereits zugesagte
Dienste bleiben stehen; darüber entscheidet der Vorstand.

Montags 07:00 eine Wochenmail an den Vorstand über dieselbe Outbox.

## 6. Aufgabe E — Akquise

`ehrenamt_interessenten` bekommt `bezirk`, `hintergrund` (Pflegebezug ja/nein),
`verfuegbarkeit`, `ref_code`. Der Pipeline-Status bleibt, wie er ist (D1) —
`neu → kontaktiert → gespraech → uebernommen → abgelehnt/kein_kontakt` sagt
dasselbe wie der Vorschlag im Briefing.

Neu im Vorstands-UI: „In Profil überführen". Einladungslink mit `?ref=` im
Ehrenamt-Profil, Quellenauswertung im Dashboard.

Material unter `marketing/ehrenamt/`: Landingpage-Text, zwei Flyer, Textbausteine
in drei Längen je Kanal, Onboarding-Sequenz, `PLAN.md` über acht Wochen. Sana darf
genannt werden, Charité und St. Hedwig nicht. Kein WordPress-Eingriff (D12).

## 7. Aufgabe F — WhatsApp

Nur Analyse und Vorbereitung. `docs/whatsapp-evaluation.md` mit echten Zahlen aus
der Datenbank, Datenschutz-Checkliste, Template-Entwürfen und einer Empfehlung.

Im Code: Outbox-Kanal `whatsapp`, Adapter-Stub hinter `WHATSAPP_ENABLED=false`,
Spalten `profiles.phone_e164`, `profiles.whatsapp_opt_in`, `profiles.notify_channel`,
`clinics.oncall_phone_e164`, `clinics.whatsapp_opt_in`. Opt-in-UI erst sichtbar,
wenn das Flag steht. **Kein Provider, keine Meta-Registrierung.**

## 8. Reihenfolge

A → B → C → D → E → F. Jede Etappe ist für sich lauffähig und wird für sich
committet.

## 9. Offene Entscheidungen

1. **Alten `bookings`-Webhook auf `notify-booking` löschen** — sonst doppelte
   Buchungsmail. Empfehlung: löschen, sobald `notify` deployt ist.
2. **Stornofristen und -gebühren im Sana-Vertrag** → Sonja. Hier wird nur
   `cancelled_at` und der Abstand zum Beginn erfasst, nicht bepreist.
3. **WhatsApp ja/nein und Provider** → nach `docs/whatsapp-evaluation.md`.
4. **`sitzwachen@` als sichtbarer Absender** — seit Resend möglich, bisher steht
   `info@` dort. Empfehlung: Reply-To auf `sitzwachen@`, Absender `info@` lassen.
