# Erlöskonten im Kassenbuch + Kleinunternehmer-Ampel — Etappe 0: Befund

Stand 07.10.2026. Reine Bestandsaufnahme, kein Code, keine Migration.
Grundlage ist das Briefing „Erlöskonten im Kassenbuch + Kleinunternehmer-Anzeige".
SQL liegt nach Repo-Konvention nur lokal unter `sql/` (gitignoriert) — hier steht
keins.

## 1. Was es gibt

### Kassenbuch = Kontoauszug, kein Erfassungsformular

| Teil | Wo | Was |
|---|---|---|
| Seite | `admin-kassenbuch.html` | CSV-Upload (Sparkasse), Liste mit Jahr- und Statusfilter, Dialog „Buchung zuordnen", Auswertung, Saldo-Abgleich, CSV-Export |
| Leseansicht | `pruefung.html` | dasselbe nur lesend für die Kassenprüfung |
| Tabelle | `bank_buchungen` | eine Zeile je Kontobewegung, `betrag_cents` mit Vorzeichen (Eingang > 0), `buchungstag`, `valuta`, `invoice_id` **oder** `claim_id` (Check: höchstens einer), `kostenart` (Freitext), `sphaere` (Check: ideell/zweckbetrieb/wirtschaftlich/vermoegensverwaltung), `beleg_url`, `notiz` |
| Tabelle | `kontostaende` | Anker für den Saldo-Abgleich |
| Logik ohne DB | `kassenbuch-csv.js`, `kassenbuch-zuordnung.js` (Kostenarten-Liste, Erkennung `RE-…`/`LPR-AZB-…`), `kassenbuch-auswertung.js` (Summen, CSV-Export mit BOM) | je ein Prüfskript unter `scripts/` |
| API | `app.js` ab ca. Z. 6560 (`KASSENBUCH_COLS`, Laden, Import, Zuordnen) | |
| RLS | `bank_buchungen`, `kontostaende`: board lesen/schreiben; **zusätzlich SELECT für `is_kassenpruefer()`** | |

**Wichtig für das Briefing:** Buchungen werden nicht von Hand erfasst, sie kommen
aus dem Kontoauszug. Jede Zeile hat deshalb **immer** einen `buchungstag` — das
ist der Zahlungseingang. Ein Feld `zahlungseingang_am` braucht `bank_buchungen`
nicht. Der Ort für die Konto-Auswahl ist der bestehende Dialog „Buchung
zuordnen", nicht ein neues Formular.

`kostenart` und `sphaere` sind heute auf **Ausgaben** zugeschnitten (Versicherung,
Porto, Bankgebühren …). Für Eingänge gibt es keine eigene Einteilung — ein
Eingang ist entweder einer Rechnung zugeordnet oder bekommt eine Kostenart wie
„Sonstiges".

### Rechnungen

| Teil | Wo | Was |
|---|---|---|
| Seiten | `admin-rechnungen.html` (Liste), `rechnung.html` (Editor, Beleg, Druck) | |
| Tabellen | `invoices`, `invoice_items`, `billing_recipients`, `invoice_item_templates`, `invoice_counters` | |
| Steuerfelder | `invoices.tax_mode` (`exempt`/`vat`), `tax_rate`, **`tax_note` Freitext**, `care_share_cents` (§ 45b-Anteil) | |
| Zahlung | `invoices.status` → `paid` + `paid_on` (von Hand gesetzt), unabhängig davon die Zuordnung in `bank_buchungen.invoice_id` | |
| Sperre | `tg_invoice_locked()` zählt die gesperrten Spalten **einzeln** auf — jede neue Spalte in `invoices` muss dort hinein, sonst ist sie nach dem Festschreiben änderbar | |

**Konflikt mit dem Briefing:** Der Default von `invoices.tax_note` lautet
„… umsatzsteuerfrei nach § 4 Nr. 18 UStG …". Jede bisher erstellte Rechnung trägt
diesen Satz, sofern niemand ihn überschrieben hat. Das Briefing verbietet § 4
Nr. 18 künftig ganz. Bereits versendete Rechnungen bleiben nach Abschnitt 6 des
Briefings unangetastet — der Default und neue Rechnungen müssen umgestellt werden.

Der Editor bietet `vat` (steuerpflichtig, mit Steuersatz und USt-Ausweis) frei an.
Nach Briefing gibt es keinen USt-Ausweis — die Option gehört gesperrt oder
ausgeblendet.

Die Fußzeile druckt „USt-IdNr. nicht erteilt" (`VEREIN.ustidnr`). Unkritisch,
nur zur Kenntnis.

### Wo Einnahmen entstehen

| Weg | Verknüpfung zu Buchung/Reise/Kunde? |
|---|---|
| Rechnung aus dem Rechnungsmodul, Zahlung kommt aufs Konto, Kassenbuch ordnet per `RE-JJJJ-NNNN` zu | **keine**: `invoice_items` hat weder `booking_id` noch `trip_id`; nur `billing_recipients.clinic_id` verrät, dass der Empfänger eine Klinik ist (das Cockpit vermerkt dieselbe Lücke bei „Sammelrechnung offen") |
| Eingang ohne Rechnung (Mitgliedsbeitrag, Spende, Zuschuss, Erstattung) | nur die Bankzeile selbst; heute per Kostenart erledigt |
| Klinik-Buchungen (`bookings`), Reisen (`trips`), Kunden-Termine | erzeugen **keine** Einnahme im Portal; abgerechnet wird von Hand im Rechnungsmodul. Kunden-Etappe 2 (Rechnung aus Terminen) ist nicht gebaut |
| Fördermittel (`foerder_programme`) | Antragsverwaltung, keine Geldbewegung |
| Mitgliedsbeiträge | keine Tabelle |

Es gibt also genau **zwei** Stellen, an denen ein Erlöskonto entschieden werden
kann: die **Rechnung** und die **Eingangszeile im Kassenbuch ohne Rechnung**.

### app_settings

Vorhanden seit Migration O (01.09.2026): `key text pk, value jsonb, beschreibung,
updated_at, updated_by`, RLS board-only, Helfer `app_setting_num(key, fallback)`,
API `LPR.getAppSettings(praefix)` / `LPR.setAppSetting(key, zahl)`. Schlüssel
tragen einen Bereichs-Präfix (`notify.…`, `cockpit.…`). Für die Schwellen passt
das ohne Umbau; Vorschlag: `ust.grenze_vorjahr`, `ust.grenze_laufend`,
`ust.gruendungsjahr`.

### Cockpit

Live seit 13.09.2026 (`admin-cockpit.html`), kennt bereits eine Quelle `ampel`.
Nach D7 kommt die Kleinunternehmer-Ampel also auch als Kachel dorthin.

## 2. Vorschlag für Etappe 1 (zur Freigabe)

1. **Enum `erloeskonto`** (`erloes_45a`, `erloes_klinik`, `erloes_reisen`, `sonstige`).
2. **Auf `invoices`:** `erloeskonto` und `ust_pflichtig`. Gewählt beim Schreiben
   der Rechnung, weil der Pflichthinweis davon abhängt — die Zahlung kommt erst
   später. Beide Spalten in `tg_invoice_locked()` aufnehmen.
3. **Auf `bank_buchungen`:** `erloeskonto` und `ust_pflichtig` nur für **Eingänge
   ohne Rechnung**. Ist die Zeile einer Rechnung zugeordnet, gilt das Konto der
   Rechnung (in der Sicht abgeleitet, nicht kopiert — sonst laufen zwei Stände
   auseinander). Ausgaben: beide Spalten `null`, per Check erzwungen.
   Abweichung vom Briefing („`ust_pflichtig not null`"): `not null` nur für
   Eingänge, sonst müssten alle Ausgaben ein sinnloses Flag tragen.
4. **Trigger** leitet `ust_pflichtig` aus dem Konto ab (Klinik → true, 45a/sonstige
   → false, Reisen → nur wenn leer, Default true).
5. **Sicht `v_ust_umsatz`** (`security_invoker`): je Jahr Summe der steuerpflichtigen
   Eingänge nach `buchungstag`, Summe je Konto, und als Warnzahl die
   **festgeschriebenen, noch nicht auf dem Konto zugeordneten Rechnungen** — das
   ist die eigentliche Entsprechung zu „Buchung ohne Zahlungsdatum".
6. **Altbestand:** Eingänge mit Rechnung an einen Empfänger mit `clinic_id` →
   `erloes_klinik`; alles andere → `sonstige` **und** auf eine Liste für Eric.
   Reisen lassen sich technisch nicht erkennen (keine `trip_id`) und landen
   deshalb ebenfalls auf der Liste.
7. **RLS:** schreiben nur board; die bestehende Leseberechtigung der Kassenprüfung
   bleibt erhalten (Briefing sagt „nur board", das würde `pruefung.html` die
   neuen Spalten vorenthalten).

## 3. Offene Fragen an Eric

1. **Stichtag.** Gilt die Zuordnung für alle Eingänge 2026 oder erst ab
   06.10.2026? Bis zum 06.10. sind Klinik-Rechnungen als § 4 Nr. 18 steuerfrei
   ausgestellt worden. Zählen diese Einnahmen trotzdem gegen die 25.000-€-Grenze
   2026? (Für Sonja — die Ampel rechnet, was wir ihr sagen.)
2. **Sammelüberweisung über mehrere Rechnungen** lässt sich heute gar nicht
   zuordnen (eine Bankzeile = eine Rechnung, Betrag muss passen). Bleibt das so?
3. **Kassenprüfung** liest die neuen Felder mit — einverstanden?
4. **`vat` im Rechnungseditor** ganz sperren, oder nur ausblenden und für den
   späteren Wechsel in die Regelbesteuerung aufheben?
5. **Altbestand-Liste:** Der Abfrage-Entwurf zeigt alle Eingänge 2026 mit Empfänger
   und Vorschlag; Eric ordnet Reisen und Unklares zu, bevor die Migration läuft.

## 4. Entscheidungen (Eric, 07.10.2026)

1. **Stichtag:** alle Eingänge 2026 werden zugeordnet und zählen.
2. **Sammelüberweisungen** gibt es nicht; eine Kontozeile = eine Rechnung bleibt.
3. **Kassenprüfung** liest die neuen Felder mit.
4. **`vat` im Editor:** ausblenden, nicht aus der Datenbank entfernen — für den
   späteren Wechsel in die Regelbesteuerung (Etappe 3).
5. **Konto + Flag nur bei Eingängen**, Ausgaben bleiben leer.

## 5. Etappe 1 — Datenmodell (Migration AT)

Dateien lokal: `sql/2026-10-07-vorpruefung-erloeskonten.sql`,
`sql/2026-10-07-at-erloeskonten.sql`, `sql/2026-10-07-test-at-erloeskonten.sql`.

- Typ `erloeskonto`; Spalten `erloeskonto` + `ust_pflichtig` auf `invoices` und
  `bank_buchungen`, alle nullable.
- Ableitung in einer Funktion `ust_pflichtig_ableiten()`, aufgerufen von je
  einem Trigger pro Tabelle. Reisen: Vorgabe true; wer erst auf Reisen umstellt,
  bekommt true — der mitgebrachte Wert des alten Kontos zählt nicht als Wahl.
- Kontozeile mit Rechnung oder Antrag, oder Ausgabe: eigenes Konto wird vom
  Trigger geleert (sonst scheiterte die bestehende Zuordnung im Kassenbuch).
  Checks sichern das zusätzlich ab.
- Storno erbt das Konto der stornierten Rechnung per Insert-Trigger;
  `cancel_invoice()` bleibt unberührt.
- `tg_invoice_locked()` bleibt unberührt: Das Konto ist Einordnung, nicht
  Rechnungsinhalt, und muss für den Altbestand auch nach dem Festschreiben
  nachziehbar sein. Der gedruckte Hinweis (`tax_note`) bleibt gesperrt.
- **Kein Pflichtfeld in Etappe 1.** Ein `not null` auf Eingängen würde den
  CSV-Import brechen (Zeilen kommen ohne Konto herein), eins auf Rechnungen das
  Festschreiben, solange der Editor das Feld noch nicht hat. Die Pflicht kommt
  mit der Oberfläche (Etappe 2 Dialog, Etappe 3 Editor); bis dahin zählt die
  Sicht die Lücken.
- **Altbestand:** Klinik-Empfänger → `erloes_klinik`. Alles andere bleibt leer und
  steht auf der Liste am Ende der Migration. Abweichung vom Briefing: nicht
  `sonstige`, weil das nicht gegen die Grenze zählt — ein stiller Fehler in die
  günstige Richtung.
- Schwellen in `app_settings`: `ust.grenze_vorjahr`, `ust.grenze_laufend`,
  `ust.gruendungsjahr`.
- Sicht `v_ust_umsatz` (security_invoker, anon ohne Recht) je Jahr ab 2026:
  steuerpflichtig, ausgenommen, Summe je Konto, Eingänge ohne Konto, Rechnungen
  ohne Konto, offene Rechnungen ohne Kontozeile, bezahlte Rechnungen ohne
  Kontozeile (am Kassenbuch vorbei), Grenzen, Vorjahr. Eingänge mit Antrag sind
  Rückflüsse und zählen nicht.
- RLS: keine neue Policy nötig — die bestehenden (board schreibt, Kassenprüfung
  liest) gelten für neue Spalten automatisch.
- Geprüft vor dem Ausrollen in PGlite gegen ein nachgebautes Mini-Schema:
  Migration zweimal hintereinander fehlerfrei, Test „TEST BESTANDEN".

**Vorprüfung PROD (07.10.2026):** keine Namenskonflikte, auf `bank_buchungen`
kein Trigger. Kein einziger Rechnungsempfänger trägt eine `clinic_id` — die
automatische Klinik-Zuordnung greift also bei keiner Rechnung, alle kommen auf
die Liste. Storno-Paare ohne Geldfluss sind daraufhin aus Liste und Warnzahl
genommen (sie heben sich auf).

**Ausgerollt 07.10.2026:** Migration AT auf PROD (Buchstabe AS war von der
Onboarding-Arbeit belegt). Altbestand zugeordnet: Reisen 0004/0006/0007/0014/0018,
Klinik 0011/0012/0013 (privat gebuchte Sitzwachen, D4), Spende → sonstige, Eingang
„2026-0018" der Rechnung RE-2026-0018 zugeordnet. Stand der Sicht 2026:
steuerpflichtig 21.291,94 € von 25.000 € (85 %, gelb), 0 ohne Konto, 2 Rechnungen
offen (0012/0013, zusammen 1.700 € Klinik). Alle Reisen stehen auf der vorsichtigen
Vorgabe „steuerpflichtig" — ob das so bleibt, ist eine Frage an Sonja.
Kopierfallen dabei: `create view … with (…) as` und `'§ …'` im Literal — SQL geht
seither ASCII-rein per Zwischenablage.

**Nebenbefund Heilpraxis-Rechnung (07.10.2026, bereinigt):** Für die Reise
25.05.–05.06. war nach Stornos am 21.09. keine gültige Rechnung mehr übrig, die
Zahlung vom 19.08. hing an der Gutschrift 0004. Ursache der Fehlzuordnung:
`gleicherBetrag()` in `kassenbuch-zuordnung.js` vergleicht Beträge ohne
Vorzeichen, ein Eingang passt so auf eine Gutschrift — Fix in Etappe 2.
Ersatzrechnung RE-2026-0019 (10.569 €, § 19-Hinweis) ausgestellt, Zahlung
umgehängt, 0004 wieder offen.

**Test AT auf PROD bestanden (07.10.2026).** Etappe 1 abgeschlossen.
