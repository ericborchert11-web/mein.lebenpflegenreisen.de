# Änderungen

## 04.09.2026 — Freigabe-Mail für Kliniken

Am 03.09.2026 gab der Vorstand ein Klinik-Konto frei, ohne dass die Klinik
davon erfuhr — weder `approveUser()` noch `approveClinic()` verschicken
etwas, und `notify-registrierung` meldet nur dem Verein, dass jemand ein
Konto beantragt hat. Beide Seiten hätten wochenlang aufeinander warten
können.

Neue Edge Function `klinik-freigabe-mail`, ausgelöst per Datenbank-Webhook auf
`clinic_details` (UPDATE). Sie meldet der Klinik die Freigabe und legt einen
Anmeldelink bei (`auth.admin.generateLink`, Fallback auf `login.html`, falls
der Link nicht entsteht — eine Freigabe ganz ohne Nachricht ist der
schlechtere Ausgang). Zwei Sperren gegen Doppelmails: der Statuswechsel muss
tatsächlich auf `approved` erfolgen, und `freigabe_mail_gesendet_at` darf noch
leer sein — Letzteres zusätzlich zur billigen Nutzlast-Prüfung mit einem
frischen Read aus der Datenbank, damit eine wiederholte Webhook-Zustellung
nach erfolgreichem Versand keine zweite Mail auslöst. Der Vermerk wird erst
nach erfolgreichem Versand gesetzt; schlägt das Setzen selbst fehl, bleibt die
Funktion trotzdem bei Status 200 (sonst würde genau das eine Wiederholung und
damit die Doppelmail provozieren) und loggt es zum Nachtragen von Hand.

`clinic_name` kommt aus dem öffentlichen Registrierungsformular und läuft
ungeprüft bis in `clinic_details` durch — im HTML-Teil der Mail wird er
deshalb wie der Kliniken-Name in der Anrede über `esc()` escaped (wörtlich aus
`notify-registrierung` übernommen); der Text-Teil bleibt bewusst unescaped.
Import und Client-Aufbau folgen dem Muster der Geschwister-Functions
(`jsr:@supabase/supabase-js@2`, `{ auth: { persistSession: false } }`).

Bisher nur die Funktion geschrieben (`functions/klinik-freigabe-mail/index.ts`,
nicht im Repo — `functions/` ist gitignored). Deploy, Webhook-Einrichtung und
der Bestandsfall Susann Polster (freigegeben, aber ohne `clinic_details`-Zeile)
stehen noch aus.

## 01.09.2026 — Feedback Sana Klinikum Lichtenberg

Erste Rückmeldung aus der Zusammenarbeit mit dem Sana Klinikum Lichtenberg,
die am 01.09.2026 angelaufen ist. Sechs Themen, Reihenfolge nach Dringlichkeit.

### Patientenanzahl an der Buchung (A)
Die Klinik gibt an, ob eine Sitzwache eine oder zwei Personen betreut.
Angezeigt wird nur die 2 — der Regelfall braucht keine Beschriftung. Ohne
Preiswirkung und ohne Stufen-Regel.

### Benachrichtigungen (B)
Der eigentliche Anlass: Sanas Frage „Wenn ein Dienst wegfällt — wie erfahren
wir das?" Bisher gar nicht. Jetzt melden Buchung, Änderung, beide Stornoarten,
Ersatz, No-Show, Erinnerung und der unbesetzte Dienst kurz vor Beginn.

Eine Outbox mit Doppelversand-Bremse, die Empfängerlogik in SQL (damit ein
zweiter Kanal sie nicht ein zweites Mal braucht), Versand über die neue Edge
Function `notify`. Mailvorlagen als HTML-Dateien, die ohne Codekenntnis
änderbar sind.

**Beim Ausrollen:** Der alte `bookings`-Webhook auf `notify-booking` muss
gelöscht werden, sonst geht die Buchungsmail doppelt raus.

### No-Show (C)
Den Status gab es schon, gesetzt vom Vorstand. Neu: die Klinik kann melden
(ab Dienstbeginn bis 72 Stunden danach), es steht fest wer wann, der Vorstand
kann zurücknehmen, und im Jahreskalender sind Stornos und No-Shows hinter
einem eigenen Schalter sichtbar. An der Abrechnung ist nichts geändert — ein
No-Show taucht dort ohnehin nicht auf.

### Zwei Ampeln im Vorstandsbereich (D)
Zuverlässigkeit und Kapazität, Schwellenwerte ohne Deploy änderbar. Zwei
No-Shows in zwölf Monaten setzen eine Dienstsperre: keine neuen Dienste mehr,
bereits zugesagte bleiben. Montags eine Wochenmail.

### Ehrenamtlichen-Akquise (E)
Der bestehende Funnel bekommt Bezirk, Pflegebezug, Verfügbarkeit und Herkunft;
dazu ein Einladungslink im eigenen Profil und eine Auswertung, welcher Kanal
Menschen bringt, die am Ende wirklich Dienst tun. Material (Landingpage, zwei
Flyer, Textbausteine, Onboarding-Sequenz, Acht-Wochen-Plan) unter
`marketing/ehrenamt/`.

### WhatsApp (F)
Nur Analyse und Vorbereitung — `docs/whatsapp-evaluation.md`. Empfehlung: jetzt
nicht, in drei Monaten neu ansehen und dann gleich mit dem Dienst-Broadcast,
der im 24-Stunden-Fenster kostenlos wäre. Kein Provider gebucht, keine
Meta-Registrierung, `WHATSAPP_ENABLED` bleibt aus.
