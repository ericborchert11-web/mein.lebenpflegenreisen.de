# WhatsApp für Sitzwachen-Benachrichtigungen — Entscheidungsgrundlage

**Stand 01.09.2026.** Für den Vorstand. Am Ende steht eine Empfehlung, zu der
nur „ja" oder „nein" nötig ist.

**Umgesetzt ist bisher nichts außer der Vorbereitung:** Spalten, eine Tabelle
für die Template-Entwürfe und ein Adapter-Stub hinter `WHATSAPP_ENABLED=false`.
Kein Provider gebucht, keine Meta-Registrierung gestartet, kein Template
eingereicht.

---

## 1. Worum es geht

Bei Sana wandert ein Bereitschaftstelefon zwischen den Abteilungsleitungen —
eine Person hat es das ganze Wochenende, danach die nächste. Viel läuft dort
über WhatsApp. Gewünscht wäre: Buchungsbestätigungen für Ehrenamtliche per
WhatsApp, dazu Buchungs- und Stornobestätigungen an die Klinik.

Der Wunsch ist nachvollziehbar. Eine Mail auf einem Bereitschaftstelefon, das
alle zwei Tage die Person wechselt, ist ein schlechter Kanal.

---

## 2. Die Zahlen — und warum sie noch keine sind

**Das Briefing verlangt echte Zahlen aus der Datenbank. Die gibt es heute
nicht:** Die Zusammenarbeit mit Sana läuft seit **heute**, dem 01.09.2026. Ein
30-Tage-Rückblick auf Sitzwachen-Buchungen wäre ein Rückblick auf einen
Zeitraum, in dem der Betrieb noch nicht lief. Jede Zahl daraus wäre eine
erfundene Zahl mit dem Anschein von Genauigkeit.

**Die Abfrage steht bereit.** Nach vier bis sechs Wochen Betrieb im
SQL-Editor ausführen und die Tabelle unten damit neu rechnen:

```sql
select count(*)                                              as buchungen_30t,
       count(*) filter (where status::text = 'cancelled')    as davon_storno,
       round(count(*) * 3.5)                                 as nachrichten_geschaetzt
  from public.bookings
 where clinic_id is not null
   and date >= current_date - 30;
```

**Nachrichten je Buchung — die Annahme, auf der alles steht:**

| Anlass | Nachrichten |
|---|---|
| Ehrenamt: Bestätigung | 1 |
| Ehrenamt: Erinnerung 24 h vorher | 1 |
| Klinik: Bestätigung | 1 |
| bei Absage zusätzlich: Storno + Ersatzsuche + Ersatzbestätigung | 2–3, aber nicht bei jeder Buchung |

**Ø ≈ 3,5 Nachrichten je Buchung.** Die Zahl stammt aus dem Briefing und ist
plausibel; sie ist nicht gemessen.

---

## 3. Was es kostet

Meta rechnet seit Juli 2025 **je zugestellter Template-Nachricht** ab, nach
Empfängerland und Kategorie. **Alle unsere Nachrichten sind Utility** —
Buchungs- und Stornobestätigung, Erinnerung. Kein Marketing.

> **Vor Vertragsabschluss auf der Meta-Preisliste verifizieren.** Die Preise
> unten sind Rechercheergebnisse vom 01.09.2026, keine Zusagen. Deutschland,
> Utility: **≈ 0,0456 € je Nachricht.**

Antworten innerhalb eines offenen 24-Stunden-Servicefensters (der Empfänger hat
zuletzt geschrieben) sind kostenlos; Utility-Templates in diesem Fenster
ebenfalls.

| Sitzwachen/Monat | Nachrichten | Meta | + 360dialog (49 €/Mon.) | + Twilio (≈ 0,005 $/Nachr.) |
|---|---|---|---|---|
| 40 | 140 | ≈ 6,40 € | ≈ 55 € | ≈ 7 € |
| 80 | 280 | ≈ 12,80 € | ≈ 62 € | ≈ 14 € |
| 150 | 525 | ≈ 24 € | ≈ 73 € | ≈ 26 € |
| 300 | 1.050 | ≈ 48 € | ≈ 97 € | ≈ 53 € |

**Das Ergebnis ist eindeutig: die Nachrichten kosten nichts.** Selbst bei 300
Sitzwachen im Monat liegt der Nachrichtenpreis unter 50 €. Der eigentliche
Preis ist **Entwicklungszeit und Datenschutzaufwand** — siehe Abschnitt 6.

### Zum Vergleich: SMS

Über einen deutschen Anbieter (z. B. seven.io) ≈ **0,07–0,09 € je SMS**, also
grob das Doppelte bis Zehnfache pro Nachricht — bei 280 Nachrichten im Monat
rund 20–25 €. Immer noch wenig.

Dafür entfällt alles Schwierige: kein Template-Freigabeprozess, keine
Meta-Abhängigkeit, kein AVV mit Meta Platforms Ireland, keine
Drittlandsübermittlung. Der Aufwand liegt bei etwa einem Personentag statt bei
sechs bis acht.

Was fehlt: keine Antworten, keine Buttons, keine Lesebestätigung — und die
Klinik nutzt WhatsApp, nicht SMS.

---

## 4. Provider

| Weg | Grundgebühr | Aufschlag | Bewertung |
|---|---|---|---|
| **Meta Cloud API direkt** | keine | keiner | Günstigste Variante, aber eigene Business-Verifizierung und eigener Betrieb der Webhooks |
| **360dialog** (Berlin, EU-Hosting) | ≈ 49 €/Mon. | keiner | Teuerste je Nachricht bei unserem Volumen, aber **EU-Anbieter mit einfachem AVV** |
| **Twilio** | keine | ≈ 0,005 $ | Günstig, US-Anbieter, mehr Vertragswerk |
| Wati, Brevo u. ä. | 50–500 €/Mon. | — | Inbox-Plattformen. Für uns überdimensioniert |

Die Meta-Business-Verifizierung (Vereinsregisterauszug) ist für höhere
Sendelimits nötig. **Das Startlimit reicht für unser Volumen** — die
Verifizierung ist also nicht der erste Schritt.

---

## 5. Datenschutz — Checkliste

| Punkt | Stand |
|---|---|
| Rechtsgrundlage Ehrenamtliche: Einwilligung (Art. 6 Abs. 1 lit. a), Opt-in im Profil, jederzeit widerrufbar | **erledigt (Struktur)** — `profiles.whatsapp_opt_in`, `notify_channel`; UI erst sichtbar, wenn das Flag steht |
| Rechtsgrundlage Klinik: Vereinbarung mit Sana als Institution + Opt-in der Bereitschaftsnummer (Art. 6 Abs. 1 lit. b) | **braucht Eric** — das Telefon gehört der Klinik, nicht einer Person; die Einwilligung gibt die Institution |
| AVV mit dem Provider | **offen** — bei 360dialog EU-intern und einfach; bei Meta/Twilio Drittland |
| AVV bzw. SCC mit Meta Platforms Ireland für die WhatsApp Business Platform | **offen** — Data Privacy Framework prüfen |
| Verzeichnis der Verarbeitungstätigkeiten ergänzen | **offen** |
| Datenschutz-Folgenabschätzung (Kontext Krankenhaus) | **offen** — kurz durchführen und begründen, auch wenn keine Gesundheitsdaten fließen. Der Kontext allein ist der Grund |
| Datenschutzerklärung Website und App um den Kanal ergänzen | **offen** |
| Löschfrist: Outbox-Payloads nach 90 Tagen anonymisieren | **offen** — ein `pg_cron`-Lauf, ein Tag Arbeit |
| Inhaltsregeln: keine Patientendaten | **erledigt** — `notify_payload` führt `patient_notes`, `patient_room` und `fallnummer` gar nicht erst mit; Test O prüft das |
| Name der Sitzwache nur mit deren Einwilligung an die Klinik | **erledigt (Regel)** — dokumentiert in `functions/notify/whatsapp.ts`, sonst Kurzfassung „Sitzwache bestätigt — Details in der App" |

**Der schwierigste Punkt ist nicht die Technik, sondern Meta.** Für E-Mail
haben wir einen Auftragsverarbeiter (Resend) und eine überschaubare Kette. Für
WhatsApp kommt Meta Platforms Ireland dazu — in einem Umfeld, in dem schon die
Metadaten heikel sind: Wer bekommt Nachrichten von einem Verein, der Sitzwachen
im Krankenhaus stellt?

---

## 6. Aufwand

| Schritt | Aufwand |
|---|---|
| Provider auswählen, Konto, Nummer, Verifizierung | 1 PT |
| 5 Templates formulieren, einreichen, Meta-Freigabe abwarten (1–3 Werktage je Template, Nachbesserungen üblich) | 1,5 PT |
| Adapter fertig bauen, Opt-in-UI, Kanalwahl | 2 PT |
| Webhooks für Zustellstatus und eingehende Antworten | 1 PT |
| Datenschutz: AVV, DSFA, Verzeichnis, Erklärungen | 1,5–2 PT |
| Test mit echten Nummern | 0,5 PT |
| **Summe** | **7,5–8 PT** |

Laufend: 0 € bis 49 €/Monat je nach Provider, plus < 50 €/Monat Nachrichten.

---

## 7. Phase 2 — der eigentliche Gewinn

Antworten im 24-Stunden-Fenster sind **kostenlos**. Damit wäre etwas möglich,
das per Mail nicht funktioniert:

> „Am Freitag, 22–06 Uhr, Station 4B ist ein Dienst frei geworden. Antworte mit
> **JA**, wenn du ihn übernimmst."

Ein Broadcast an alle verfügbaren Sitzwachen, die erste Antwort bekommt den
Dienst. Genau der Fall, den `booking.unfilled` heute nur *meldet* — gelöst
würde er damit erst.

Das ist der stärkste Grund für WhatsApp, und er hat mit Bestätigungen nichts zu
tun. **Er ist nicht Teil dieser Entscheidung**, sollte aber mitgedacht werden:
Wer heute nur Bestätigungen umstellt, zahlt 8 Personentage für Komfort. Wer
Phase 2 mitplant, kauft dafür ein Werkzeug gegen unbesetzte Dienste.

---

## 8. Empfehlung

**Jetzt: nein. In drei Monaten: neu ansehen — dann aber gleich mit Phase 2.**

Begründung:

1. **Der Nutzen ist heute klein.** Die Mails aus Aufgabe B lösen Sanas
   eigentliches Problem — die Klinik erfährt jetzt von einer Absage. Das war
   die Sorge im Jour Fixe, nicht der Kanal.
2. **Der Aufwand ist heute groß.** 8 Personentage plus ein Datenschutzpaket mit
   Meta als Drittland-Empfänger, für eine Zustellart, die nichts Neues
   ermöglicht.
3. **Die Zahlen fehlen.** Es gibt keinen Betriebsmonat. Über einen zweiten
   Kanal zu entscheiden, bevor der erste einen Monat lief, ist eine Entscheidung
   ohne Grundlage.
4. **Phase 2 ändert das Bild.** Sobald unbesetzte Dienste ein wiederkehrendes
   Problem sind — die Kapazitätsampel wird es zeigen —, ist der
   Dienst-Broadcast ein echter Hebel. Dann lohnen sich dieselben 8 Personentage.

**Wenn der Vorstand jetzt „ja" sagt**, dann mit **360dialog**: Berlin, EU-Hosting,
ein AVV statt dreier Vertragswerke. Die 49 €/Monat sind bei diesem Volumen der
Preis dafür, den Datenschutzteil klein zu halten — und der ist hier der teure
Teil, nicht die Nachrichten.

**Was in der Zwischenzeit hilft und nichts kostet:** Web-Push läuft im Portal
bereits und ist kostenlos. Für Ehrenamtliche mit installierter App ist das der
schnellere Kanal als jede Mail. Bevor WhatsApp gebucht wird, lohnt die Frage,
wie viele Sitzwachen Push überhaupt aktiviert haben.

---

## 9. Template-Entwürfe für die Meta-Freigabe

Alle Kategorie **Utility**, Sprache `de`. Stehen als Entwurf in
`whatsapp_templates` mit `freigegeben = false`.

**`sitzwache_bestaetigung_ehrenamt`**
> Dein Sitzwachen-Dienst steht: {{1}}, {{2}} am {{3}}, {{4}}. Details und
> Ansprechperson in der App: mein.lebenpflegenreisen.de

**`sitzwache_erinnerung`**
> Erinnerung: morgen Sitzwache in {{1}}, {{2}} am {{3}}, {{4}}. Wenn sich die
> Anfahrt verzögert, melde es in der App.

**`sitzwache_bestaetigung_klinik`**
> Sitzwache bestätigt für {{1}}, {{2}}: {{3}} ({{4}}). Kontakt über den Verein:
> sitzwachen@lebenpflegenreisen.de

**`sitzwache_storno_klinik`**
> Der Sitzwachen-Dienst am {{1}}, {{2}} auf {{3}} ist derzeit nicht besetzt. Wir
> suchen Ersatz und melden uns.

**`sitzwache_ersatz_klinik`**
> Ersatz gefunden für {{1}}, {{2}}: {{3}} ({{4}}).

**Zwei Regeln beim Einreichen:**

- **Kein Absagegrund** in `sitzwache_storno_klinik`. Warum jemand absagt, geht
  die Klinik nichts an.
- **`{{3}}` in den Klinik-Templates ist der Name der Sitzwache.** Er darf nur
  gesendet werden, wenn diese Person `whatsapp_opt_in` gesetzt hat. Sonst die
  Kurzfassung ohne Namen — die dann ein **eigenes** Template braucht, weil Meta
  keine leeren Variablen zulässt.
