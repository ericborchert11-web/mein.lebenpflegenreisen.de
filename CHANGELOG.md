# Änderungen

## 08.10.2026 — Sammelrechnung aus Diensten

Sana will wöchentlich abgerechnet werden, Montag bis Sonntag, mit Stufe T1/T2
je Dienst fürs Controlling. In der Rechnungsübersicht legt „Sammelrechnung aus
Diensten" für eine Klinik und eine Woche den Entwurf an: eine Position je
erledigtem Dienst mit Datum, Schicht, Station und Stufe, die Einleitung zählt
T1 und T2, Erlöskonto Klinik und § 19-Hinweis sind gesetzt. Stornierte, nicht
erschienene und unbesetzte Dienste kosten nach Vertrag nichts und tauchen gar
nicht erst auf.

Jede Position merkt sich ihren Dienst. Was auf einer nicht stornierten Rechnung
steht, wird nicht noch einmal berechnet; die Vorschau zeigt es grau mit der
Rechnungsnummer. Wird eine Rechnung storniert, ist der Dienst wieder abrechenbar.

## 07.10.2026 — Pflichthinweis auf Rechnungen folgt dem Erlöskonto

Im Rechnungseditor wird kein Befreiungsgrund mehr getippt. Man wählt das
Erlöskonto, und die Rechnung bekommt den mit der Steuerberaterin abgestimmten
Hinweis: § 19 UStG für Klinik und steuerpflichtige Reisen, § 4 Nr. 16 Buchst. g
für 45a-Leistungen und 45a-gedeckte Reisen, keinen bei sonstigen Einnahmen.
Ohne Konto, mit § 4 Nr. 18 oder mit „Personalgestellung“ auf einer
Klinik-Rechnung lässt sich nichts festschreiben. Im Kassenbuch gibt es dazu den
Jahresexport der Erlöse für die Steuerberaterin.

## 07.10.2026 — Erlöskonten und Kleinunternehmer-Ampel im Kassenbuch

Seit der Anerkennung nach § 45a SGB XI müssen die Einnahmen nach drei
Erlöskonten getrennt sein — 45a (steuerfrei), Klinik (steuerpflichtig), Reisen
(je nach Bescheid) — und die Kleinunternehmergrenze nach § 19 UStG muss laufend
sichtbar sein. Gezählt wird nach Zahlungseingang, also aus dem Kassenbuch.

Jede Rechnung und jeder Eingang ohne Rechnung trägt jetzt ein Erlöskonto; ob
der Betrag steuerpflichtig ist, leitet die Datenbank daraus ab, nur bei Reisen
wählt der Vorstand („vom 45a-Bescheid gedeckt"). Ein Eingang ohne Rechnung gilt
erst mit Konto als zugeordnet — sonst fehlte er still in der Ampel. Die Ampel
steht oben im Kassenbuch und als Kachel im Cockpit: grün unter 80 %, gelb bis
100 %, rot darüber, mit Hinweis auf Eingänge ohne Konto und Rechnungen ohne
Zahlungseingang. Die Grenzen stehen in den Einstellungen, nicht im Code.

Nebenbei behoben: Die Zuordnung verglich Rechnungsbeträge ohne Vorzeichen. Ein
Eingang konnte dadurch auf eine Gutschrift fallen — genau so hing die Zahlung
der Heilpraxis vom 19.08. an der Gutschrift RE-2026-0004.

## 13.09.2026 — Cockpit: der Vorstand wird erinnert

Das Cockpit sagt seit heute auch dann Bescheid, wenn niemand sich anmeldet. Die
Wochenmail am Montag beginnt jetzt mit dem, was ansteht — Überfälliges, diese
Woche, Wartendes, Finanzen —, der Sitzwachen-Teil mit den beiden Ampeln steht
darunter. Aus „Wochenbericht" wird damit „Wochenstart".

Dazu ein täglicher Lauf: eine Aufgabe meldet sich sieben Tage, einen Tag und am
Tag ihrer Fälligkeit; etwas, das auf eine Antwort wartet, meldet sich nach
vierzehn Tagen und dann in gleichen Abständen wieder; eine Rechnung meldet sich
genau einmal, am Tag nach dem Zahlungsziel. **Überfälliges wird bewusst nicht
täglich gemahnt** — wer jeden Morgen dieselbe Mail bekommt, liest ab der dritten
keine mehr.

Push läuft über dieselbe Warteschlange wie die Mails und nicht daneben.
`notification_outbox` kennt dafür einen dritten Kanal, `notify` verteilt nach
Kanal, und `send-push` bekam einen zweiten Zugang, der einen fertigen Inhalt
annimmt statt ihn aus einer Buchung zu bauen. Der private VAPID-Schlüssel bleibt
damit in genau einer Funktion, und es gibt weiterhin eine Doppelversand-Bremse,
ein Statusfeld und eine Stelle, an der man nachsieht, warum nichts ankam.

Auf den Sperrbildschirm geht nur der Titel und wann etwas fällig ist. Rechnungen
werden deshalb gar nicht gepusht: dort stünden ein Betrag und der Name eines
Dritten.

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
