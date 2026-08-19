# Auszahlungsprozess für Aufwandsentschädigungen — Design

**Stand 19.08.2026.** Freigegeben von Eric (Vorstand) am 19.08.2026: Ablauf,
Empfängeradressen, Wortlaut des Steuerhinweises, Freibetrag 3.300 €.

## Warum

Der Ablauf von „Antrag gestellt" bis „Geld überwiesen und bestätigt" existiert
heute in Teilen, hängt aber an der falschen Stelle: **die Mail an die Buchhaltung
entsteht im Browser des Mitglieds**, direkt beim Einreichen — sie setzt voraus,
dass ein PDF im Browser erzeugt, in den Storage geladen und eine Edge Function
aufgerufen wird. Bricht einer der Schritte ab oder entsteht der Antrag anders
(Nacherfassung durch den Vorstand), passiert gar nichts, und niemand erfährt vom
Antrag. Genau das ist am 19.08.2026 bei einem nacherfassten Antrag aufgefallen.

Zweitens verschickt dieser Weg die Zahlungsaufforderung **vor** der Freigabe. Der
Vorstand soll aber erst genehmigen und dann zur Zahlung anweisen.

Drittens gibt es das Auszahlungsdokument bereits als Bildschirmansicht, aber
niemand bekommt es zugeschickt — und es trägt sichtbar den Vermerk „ENTWURF".

## Zielablauf

| Auslöser (Zustand in `claims`) | Mail an | Inhalt |
|---|---|---|
| Antrag entsteht (`status = submitted`) | finanzen@, Kopie vorstand@ | Eingangsmeldung: wer, wofür, Zeitraum, Betrag, Link zur Freigabe |
| Vorstand gibt frei (`→ approved`) | finanzen@, Kopie vorstand@ | Zahlungsanweisung: Name, Personalnummer, **volle IBAN**, Betrag, Verwendungszweck, Antrag-ID |
| Auszahlung markiert (`→ paid`) | das Mitglied | Vollständiger Auszahlungsbeleg als Mailinhalt, **IBAN maskiert** |

Die Überweisung selbst bleibt Handarbeit. Das Portal fordert sie an und quittiert
sie, führt sie nicht aus. Der Zustand `rejected` löst keine Mail aus; die
Ablehnung samt Grund sieht das Mitglied im Portal (unverändert).

## Entscheidungen

- **Keine PDF-Anhänge.** Beide Mails tragen ihren Inhalt im Text bzw. als
  formatiertes HTML. Serverseitige PDF-Erzeugung wäre der einzige echte
  Aufwandstreiber gewesen; der Beleg bleibt im Portal druckbar.
- **Ein Postfach für den Vorgang:** finanzen@lebenpflegenreisen.de, vorstand@
  immer in Kopie.
- **Auslöser liegen in der Datenbank**, nicht im Browser. Ein per Hand
  nachgetragener Antrag löst dieselben Mails aus wie ein geklickter.
- **Freibetrag 3.300 €** (§ 3 Nr. 26 EStG) bzw. 960 € (§ 3 Nr. 26a EStG) —
  Stand bestätigt.

## Bausteine

### Edge Function `claim-mails`

Neu, ausschließlich für Anträge zuständig; Versand über Resend wie die
bestehenden Functions, abgesichert mit demselben Secret-Header-Muster. Sie baut
alle drei Mails und entscheidet anhand von Status und Zeitstempeln, ob und was zu
senden ist.

`notify-booking` bleibt unverändert für Buchungen zuständig. Der dort heute
mithängende `claims`-Zweig (Auszahlungsbeleg bei `paid`) wird abgeklemmt, sonst
ginge die Bestätigung doppelt raus. Damit hat jede Function genau ein Thema.

### Zwei Zugänge zur Function

Ein Datenbank-Webhook auf `claims` für INSERT und UPDATE ruft `claim-mails` im
Normalbetrieb auf. Daneben nimmt sie einen direkten Aufruf mit einer `claim_id`
entgegen — das ist der Knopf „Mail erneut senden" in der Vorstandsliste und der
Weg, einen hängengebliebenen Vorgang von Hand nachzuziehen. Beide Zugänge laufen
durch dieselbe Entscheidungslogik aus Status und Zeitstempeln; der manuelle
Aufruf darf einen gesetzten Zeitstempel bewusst übergehen.

### Doppelversand-Bremse

Drei Zeitstempel auf `claims`, die die Function vor dem Senden prüft und danach
setzt:

- `intake_mail_at` — Eingangsmeldung verschickt (neu)
- `submitted_to_payroll_at` — Zahlungsanweisung verschickt (**existiert**, bekommt
  diese neue Bedeutung; bisher: Mail beim Einreichen)
- `payout_mail_at` — Auszahlungsbeleg an das Mitglied verschickt (neu)

Ist der jeweilige Stempel gesetzt, sendet die Function nicht erneut. Webhooks
feuern bei Wiederholungen und Nachläufen mehrfach; ohne diese Bremse bekäme die
Buchhaltung denselben Auftrag zweimal. Die Stempel sind zugleich der Nachweis,
wann was rausging, und werden im Beleg und in der Vorstandsliste angezeigt.

### Beleg als gemeinsame Vorlage

Der Beleg wird heute als String in `abrechnung.html` zusammengebaut. Er zieht in
eine eigene Datei um, die Bildschirmansicht und Mail gemeinsam nutzen. Sonst
driften beide Fassungen auseinander — und die gemailte ist die, die beim
Finanzamt landet. Die Function rendert dieselbe Vorlage serverseitig.

### Rückbau des Browser-Wegs

PDF-Erzeugung, Storage-Upload und der Aufruf von `send-claim-to-payroll` beim
Einreichen entfallen. Das Mitglied sieht stattdessen „Antrag eingegangen — der
Vorstand prüft ihn". Die Antragsbestätigung im Portal bleibt.

## Wortlaut des Steuerhinweises (freigegeben)

Auf dem Auszahlungsbeleg; Paragraf und Freibetrag werden je nach
`pauschale_art` eingesetzt.

> **Steuerlicher Hinweis**
>
> 1. Diese Zahlung ist eine Aufwandsentschädigung nach **§ 3 Nr. 26 EStG
>    (Übungsleiterpauschale)** für eine nebenberufliche, pflegerisch-betreuende
>    Tätigkeit im ideellen Bereich eines gemeinnützigen Vereins. Sie ist **kein
>    Arbeitslohn und kein Honorar**.
> 2. Sie ist **bis 3.300 € im Kalenderjahr steuer- und sozialversicherungsfrei**.
>    Der Freibetrag gilt **einmal pro Person und Jahr über alle Vereine und
>    Auftraggeber hinweg** — Leben Pflegen Reisen e. V. kennt nur die hier
>    gezahlten Beträge (in diesem Jahr: *Betrag* von 3.300 €).
> 3. **Gib diese Zahlung in deiner Einkommensteuererklärung an.** Steuerfreie
>    Aufwandsentschädigungen nach § 3 Nr. 26 EStG werden in der **Anlage N**
>    eingetragen (bei selbstständiger Tätigkeit in der **Anlage S**). Steuer fällt
>    nur auf den Teil an, der den Jahresfreibetrag übersteigt. **Bewahre diesen
>    Beleg auf** und lege ihn auf Nachfrage des Finanzamts vor.
> 4. Beträge über dem Freibetrag sind von dir zu versteuern und können
>    sozialversicherungspflichtig sein. Die Auszahlung erfolgt auf Grundlage
>    deiner Selbstauskunft im Antrag; für Richtigkeit und Vollständigkeit bist du
>    selbst verantwortlich.
> 5. Dieser Beleg ersetzt keine Steuerberatung. Der Verein übernimmt keine Haftung
>    für die individuelle steuerliche oder sozialversicherungsrechtliche
>    Behandlung; bei Fragen wende dich an dein Finanzamt oder eine Steuerberatung.
>    Die Antragsunterlagen werden beim Verein zehn Jahre aufbewahrt (§ 147 AO,
>    Art. 6 Abs. 1 lit. c DSGVO).

Punkt 3 ist bewusst so formuliert: **angeben ja, besteuert nur bei
Überschreitung**. Ein pauschales „muss versteuert werden" wäre sachlich falsch.
Der ENTWURF-Vermerk entfällt mit dieser Freigabe.

## Fehlerfälle

- **Mailversand scheitert:** Der Zeitstempel bleibt leer, der Zustandswechsel
  gilt trotzdem. Die Vorstandsliste zeigt bei freigegebenen Anträgen ohne
  `submitted_to_payroll_at` einen Hinweis samt Knopf „Mail erneut senden".
  Stiller Verlust ist der schlimmere Fall als eine zweite Mail.
- **Webhook feuert doppelt:** durch die Zeitstempel abgefangen.
- **Keine IBAN im Profil:** Die Zahlungsanweisung geht trotzdem raus, benennt das
  Fehlen aber ausdrücklich, damit die Buchhaltung nicht rätselt. Die Freigabe
  bleibt möglich; ohne IBAN kann nur nicht überwiesen werden.
- **Antrag ohne `amount_breakdown`** (Nacherfassung per Hand): Der Beleg zeigt die
  Summe ohne Aufschlüsselung. Kein Fehler, aber im Beleg sichtbar als
  „Nacherfassung durch den Vorstand".

## Datenschutz

Die volle IBAN steht nur in der Mail an finanzen@/vorstand@ — dieselben Personen
führen die Überweisung aus. In der Mail an das Mitglied und in jeder Ansicht im
Portal bleibt sie maskiert. Keine Gesundheits- oder Klientendaten in irgendeiner
dieser Mails; Anträge nennen Reise bzw. Dienst, nicht die begleitete Person.

## Test

Die Function lässt sich ohne Login prüfen: Statuswechsel in der Datenbank
auslösen und beobachten, ob Zeitstempel gesetzt werden und die Mail ankommt.
Prüfkriterium für den Versandweg bleibt der bekannte: Testmail an ein
Gmail-Konto, dort „Original anzeigen", `dkim=pass` mit `d=lebenpflegenreisen.de`.
Der Beleg wird gegen die Bildschirmfassung verglichen — beide stammen aus
derselben Vorlage, also genügt ein Abgleich pro Antragsart (Reise, Sitzwache).

## Nicht Teil dieser Etappe

- Die Anträge liegen im Vorstandsmenü unter „Sitzwachen", obwohl es fast immer
  Reisebegleitungen sind. Das Verschieben ist ein eigenes Thema.
- Serverseitige PDF-Erzeugung und ein Archiv der Belege im Storage.
- Mahnwesen, Teilzahlungen, Rückforderungen.
- Automatische Freigabe: Genehmigen bleibt ein bewusster Klick des Vorstands.

## Offene Punkte

- **finanzen@lebenpflegenreisen.de** muss als Postfach oder Alias existieren
  (Absender bleibt eine verifizierte Adresse der Hauptdomain).
- Für die erste echte Auszahlung fehlt noch die IBAN im Profil der Empfängerin.
