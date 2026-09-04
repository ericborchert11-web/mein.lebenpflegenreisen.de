# Änderungen

## 04.09.2026 — Freigabe-Mail für Kliniken

Am 03.09.2026 gab der Vorstand ein Klinik-Konto frei, ohne dass die Klinik davon
erfuhr — weder `approveUser()` noch `approveClinic()` verschicken etwas, und
`notify-registrierung` meldet nur dem Verein, dass jemand ein Konto beantragt
hat. Beide Seiten hätten wochenlang aufeinander warten können.

Zunächst war dafür eine eigenständige Edge Function mit eigenem Webhook geplant
und schon deployt. Beim Einrichten des Webhooks fiel auf, dass es
`notification_outbox` längst gibt: eine ausgebaute Warteschlange mit eindeutigem
Index gegen Doppelversand, Wiederholungszähler, Status je Nachricht und einer
einzigen versendenden Function `notify`. In derselben Migration steht die
Begründung, Empfängerlogik gehöre in SQL und nicht in TypeScript, damit nicht
zwei Fassungen auseinanderlaufen. Eine zweite Zustellkette daneben wäre genau
das gewesen — die eigenständige Function wurde deshalb wieder abgeräumt.

Umgesetzt ist die Meldung jetzt über die Outbox: Ein Trigger auf
`clinic_details` reiht beim echten Statuswechsel auf `approved` eine Zeile ein,
`notify` verschickt sie mit der neuen Vorlage `klinik.freigabe.clinic`. Der
Anmeldelink entsteht erst beim Versand — er gilt nur eine Stunde, und zwischen
Einreihen und Versand können Wiederholungen liegen — und immer für den
gemeinten Empfänger, nie für die Adresse aus `NOTIFY_REDIRECT_TO`. Doppelmails
verhindert der eindeutige Index; die Meldung ist damit einmalig je
Empfängeradresse.

Dabei fiel auf, dass `_rahmen-schlicht.html` die Kopfzeile „Sitzwachen ·
Wochenbericht" fest verdrahtet hatte. Bisher unsichtbar, weil nur die Wochenmail
diesen Rahmen nutzte; die Freigabe-Mail hätte damit behauptet, ein Wochenbericht
zu sein. Die Zeile ist jetzt der Platzhalter `{{rahmen_titel}}`.

Ende zu Ende geprüft: Freigabe um 09:28:54, Outbox-Zeile im selben Moment,
`sent` eine Sekunde später beim ersten Versuch, Mail zugestellt, Anmeldelink
führte in die Klinikansicht des richtigen Kontos.

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
