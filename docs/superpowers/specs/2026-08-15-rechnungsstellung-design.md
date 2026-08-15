# Rechnungsstellung im Portal — Design

Datum: 2026-08-15
Projekt: mein.lebenpflegenreisen.de (LPR-Portal)
Status: freigegeben, bereit für die Implementierungsplanung

## Zweck

Der Verein soll seine Rechnungen im Portal schreiben statt in einem Google Doc
auf einem einzelnen Rechner. Drei Gründe:

1. **Ortsunabhängig.** Nummernkreis und Rechnungsstand liegen zentral, nicht
   auf dem Laptop, an dem zuletzt jemand gearbeitet hat.
2. **Lückenlos.** Rechnungsnummern vergibt die Datenbank, nicht ein Mensch mit
   einer Liste.
3. **Ohne Abtippen.** Die monatliche Sammelrechnung an eine Klinik entsteht aus
   den Einsätzen, die ohnehin im Portal stehen.

Am Ende sollen **alle** Rechnungen des Vereins über das Portal laufen. Die
freie, manuell befüllte Rechnung ist deshalb kein Nachgedanke, sondern der Kern:
sie muss ab Etappe 1 funktionieren, weil zwei anstehende Rechnungen Leistungen
betreffen, die im Portal gar nicht abgebildet sind.

Ausdrücklich **nicht** Ziel: Mahnwesen, Bankabgleich, Buchhaltung,
Einnahmen-Überschuss-Rechnung, eine Rechnungsansicht für Kliniken im
Klinik-Login.

## Grundentscheidungen

| Frage | Entscheidung | Grund |
|---|---|---|
| Vorlage | Google Doc einmal auslesen, danach HTML/CSS im Portal | Ein Doc lässt sich nachträglich überschreiben, eine festgeschriebene Rechnung darf das nicht |
| PDF | Browser-Druckdialog | Kein Build, keine Bibliothek, volle CI-Kontrolle über CSS |
| Drive | Ablage von Hand per Drag & Drop | Automatischer Upload bräuchte OAuth-Projekt und clientseitige PDF-Erzeugung; das Layout würde dabei schlechter |
| Empfänger | Adressbuch im Portal | Klinik-Buchhaltung sitzt oft nicht dort, wo der Klinik-Account registriert ist |
| Nummer | Erst beim Festschreiben | Verworfene Entwürfe dürfen keine Lücke reißen |
| Korrektur | Storno-Rechnung, nie Überschreiben | GoBD |
| Zahlung | Statusfeld offen/bezahlt/überfällig | Überblick ja, Mahnwesen nein |

## Rollen und Zugang

Ausschließlich Vorstand. Einstieg wie bei allen Admin-Seiten:

```js
if (!LPR.requireRole('admin', 'login.html?next=admin-rechnungen.html'))
  throw new Error('kein Zugriff');
```

Alle neuen Tabellen bekommen RLS eingeschaltet, und jede Policy prüft
`is_board()`. Kein Ehrenamtlicher und keine Klinik hat auf irgendeine der vier
Tabellen Zugriff — weder lesend noch schreibend.

## Datenmodell

Vier neue Tabellen plus ein Zähler. Alle Geldbeträge als `integer` in **Cent**.
Der Kommentar in `app.js:1603` hält fest, dass eine Browser-Rundung schon einmal
von dem abwich, „was später auf der Rechnung steht" — mit Cent-Integern kann das
nicht wiederkehren.

### `billing_recipients` — Adressbuch

| Spalte | Typ | Anmerkung |
|---|---|---|
| `id` | uuid, PK | |
| `name` | text, not null | Firmierung oder Familienname |
| `address` | text | Straße und Hausnummer |
| `postal_code`, `city` | text | |
| `contact_person` | text | |
| `customer_ref` | text | Kunden- oder Aktenzeichen der Gegenseite |
| `email` | text | für den späteren Versand, jetzt nur Ablage |
| `payment_days` | int, default 14 | Zahlungsziel |
| `clinic_id` | uuid, FK → `clinics`, nullable | Verbindung für die Sammelrechnung |
| `shift_price_cents` | int, nullable | Standardpreis je Sitzwachen-Schicht |
| `active` | bool, default true | |
| `created_at` | timestamptz | |

`shift_price_cents` ist bewusst am Empfänger und nicht global: verhandelt eine
Klinik andere Konditionen, darf das keine Code-Änderung auslösen. Ist das Feld
leer, gilt der Vereins-Standard von 20 000 Cent.

### `invoices` — Kopf

| Spalte | Typ | Anmerkung |
|---|---|---|
| `id` | uuid, PK | |
| `invoice_no` | text, unique, nullable | leer solange Entwurf |
| `status` | text | `draft`, `issued`, `paid`, `cancelled` |
| `recipient_id` | uuid, FK → `billing_recipients` | |
| `recipient_snapshot` | jsonb | eingefrorene Anschrift beim Festschreiben |
| `invoice_date` | date | |
| `service_from`, `service_to` | date | Leistungszeitraum |
| `due_date` | date | |
| `tax_mode` | text | `exempt` oder `vat` |
| `tax_rate` | numeric, default 0 | nur bei `vat` |
| `tax_note` | text | Vorbelegung: „umsatzsteuerfrei nach § 4 Nr. 18 UStG" |
| `intro_text` | text, nullable | freier Satz über der Positionstabelle |
| `subtotal_cents`, `tax_cents`, `total_cents` | int | |
| `paid_on` | date, nullable | |
| `cancels_invoice_id` | uuid, nullable | gesetzt bei Storno-Rechnungen |
| `cancelled_by_invoice_id` | uuid, nullable | gesetzt beim stornierten Original |
| `created_by`, `created_at`, `issued_at` | | |

`recipient_snapshot` ist der Grund, warum Adressänderungen im Adressbuch nicht
rückwirkend eine verschickte Rechnung verändern.

### `invoice_items` — Positionen

`id`, `invoice_id` (FK, on delete cascade), `pos` (int), `quantity` (numeric),
`description` (text), `period_text` (text, nullable), `unit_price_cents` (int),
`amount_cents` (int).

`period_text` ist frei, weil die Vorlage eine Spalte „Leistungszeitraum" führt,
die bei manchen Positionen leer bleibt.

### `invoice_bookings` — Doppelabrechnungsschutz

`invoice_id`, `booking_id` (FK → `bookings`), `item_id`. Ein partieller Unique-
Index auf `booking_id` — nur für Rechnungen, die nicht storniert sind — stellt
sicher, dass derselbe Einsatz nicht zweimal in Rechnung geht.

### `invoice_counters`

`year` (int, PK), `last_no` (int). Wird ausschließlich von `issue_invoice()`
angefasst.

## Nummernkreis und Sperre

Zwei RPCs, `SECURITY DEFINER`, beide prüfen `is_board()`:

**`issue_invoice(p_id uuid)`**
1. Rechnung laden, Status muss `draft` sein, mindestens eine Position vorhanden
2. Zähler des Jahres per `update … returning` sperren und hochzählen
3. Nummer im Format `RE-2026-0001` setzen
4. Empfänger aus `billing_recipients` in `recipient_snapshot` kopieren
5. Summen aus `invoice_items` neu berechnen und festschreiben
6. `status = 'issued'`, `issued_at = now()`

Schritt 2 in derselben Transaktion wie Schritt 3 — zwei gleichzeitige
Festschreibungen dürfen nie dieselbe Nummer bekommen.

**`cancel_invoice(p_id uuid, p_reason text)`**
Legt eine neue Rechnung mit negativen Beträgen und eigener Nummer an, setzt die
Verweise in beide Richtungen und das Original auf `cancelled`. Es wird nichts
gelöscht und nichts überschrieben.

**Sperr-Trigger.** Ein `before update`-Trigger auf `invoices` und
`invoice_items` weist Änderungen zurück, sobald der Status nicht mehr `draft`
ist. Einzige Ausnahme: `paid_on` und der Wechsel `issued` → `paid`, denn der
Zahlungseingang ist kein Eingriff in den Rechnungsinhalt.

## Seiten

### `admin-rechnungen.html` — Liste

Filter für Jahr, Status und Empfänger. Kopfzeile zeigt „offene Forderungen
gesamt". Zeilen: Nummer, Datum, Empfänger, Betrag, Status, Fälligkeit.
Überfällig heißt: Status `issued` und `due_date` liegt in der Vergangenheit —
das ist eine Anzeigeregel, kein gespeicherter Status. Zwei Aktionen: „Neue
Rechnung" und „Sammelrechnung aus Sitzwachen".

In `layout.js` kommt der Punkt „Rechnungen" in den Admin-Block.

### `rechnung.html?id=…` — Editor, Ansicht, Druck

Im Entwurf: Empfänger aus dem Adressbuch wählen, Daten und Zahlungsziel setzen,
Positionen zeilenweise anlegen, verschieben, löschen. Summen rechnet der Browser
zur Anzeige, verbindlich sind die Summen aus `issue_invoice()`.

Steuerblock: Auswahl zwischen „steuerfrei" mit editierbarem Befreiungsgrund
(Vorbelegung § 4 Nr. 18 UStG) und „steuerpflichtig" mit Satz. Die zweite
Variante wird heute nicht gebraucht, steht aber in der Vorlage und kostet nichts.

Nach dem Festschreiben ist die Seite reine Ansicht, mit den Aktionen „Drucken",
„Als bezahlt markieren" und „Stornieren".

### `admin-empfaenger.html` — Adressbuch

Liste, anlegen, bearbeiten, deaktivieren. Beim Anlegen kann eine Klinik aus
`clinic_details` als Vorbefüllung gewählt werden; die Rechnungsanschrift ist
danach eine eigenständige Kopie und wird nicht nachgeführt.

### `app.js`

Ein neuer Block `LPR.billing.*` mit den Lese- und Schreibfunktionen. Keine
bestehende Funktion wird geändert.

## Druckansicht

Aufbau exakt nach der Vorlage „01 Rechnungsvorlage (§14 UStG)":

- Kopf mit Claim und Logo
- Rechnungssteller: Leben Pflegen Reisen e.V., Stephanstr. 46, 10559 Berlin,
  Amtsgericht Charlottenburg VR 42682 B, Steuernummer, „USt-IdNr.: nicht erteilt"
- Empfängerblock aus `recipient_snapshot`
- Zeile Rechnungsnummer / Rechnungsdatum / Leistungsdatum
- Positionstabelle: Pos, Menge, Leistung, Leistungszeitraum, Einzel-, Gesamtbetrag
- Entgelt, danach der Steuerabsatz in der zutreffenden Variante
- Zahlungsblock: Zahlungsziel, IBAN, BIC, Bank, Verwendungszweck = Rechnungsnummer
- Fußzeile mit Vereinsdaten und Vorstand

CSS in LPR-CI, A4 mit `@page`. `shared.css` bringt bereits `@media print` und
die Klasse `.no-print` mit — Navigation, A11y-Leiste und Aktionsknöpfe hängen
sich dort ein.

Vor `window.print()` wird `document.title` auf `RE-2026-0001 Empfängername`
gesetzt, damit der Browser den Dateinamen richtig vorschlägt.

**Keine `box-shadow` im Druck-Layout.** Chrome exportiert Schatten als
Soft-Mask; Vorschau und Keynote zeichnen daraus harte graue Kästen, während der
Chrome-Screenshot sauber aussieht. Prüfung am fertigen PDF: `grep -c /SMask`
muss 0 ergeben.

**Offener Punkt zur Beschaffung:** In der Vorlage steht bei Steuernummer ein
Platzhalter. § 14 UStG verlangt Steuernummer oder USt-IdNr.; letztere hat der
Verein nicht. Die Steuernummer beim Finanzamt für Körperschaften muss vor der
ersten echten Rechnung eingetragen werden. Sie wird als Konstante hinterlegt.

## Sammelrechnung aus Sitzwachen

Dialog mit Klinik und Monat. Geladen werden die Einsätze dieses Zeitraums, die
abgeschlossen und noch keiner aktiven Rechnung zugeordnet sind.

Der Entwurf bekommt **eine Position je Einsatztag**, damit die
Klinik-Buchhaltung prüfen kann, wofür sie zahlt. Auf die Position kommen Datum,
Schicht und Station. **Fallnummer, Zimmer, Patientenhinweise und der Name des
Ehrenamtlichen kommen nicht auf die Rechnung** — das Dokument verlässt den
Verein und wird abgelegt.

Preis je Position: `shift_price_cents` des Empfängers, sonst 20 000 Cent.

Einsätze ohne Unterschrift der Pflege werden im Dialog markiert und
vorausgewählt abgewählt, aber nicht blockiert. `admin-sitzwachen.html` führt
diesen Status bereits als Prüfpunkt „vor der Rechnungsstellung".

Beim Festschreiben werden die Einsätze über `invoice_bookings` verbunden.

## Etappen

**E1 — Fundament.** Migration, Adressbuch, freie Rechnung, Druckansicht,
Festschreiben, Storno, Zahlstatus. Danach sind die zwei anstehenden Rechnungen
schreibbar.

**E2 — Sitzwachen.** Sammelrechnungs-Dialog und Doppelabrechnungsschutz.

**E3 — nicht jetzt.** Reise- und Familienrechnungen, automatischer Drive-Upload,
E-Mail-Versand. Das Datenmodell bleibt dafür offen, gebaut wird nichts davon.

## Verifikation

Das Portal hat keine Testsuite; geprüft wird wie beim Fördermittel-Cockpit.

1. Migration auf PROD, danach jede Tabelle mit `rowsecurity = true` bestätigen
2. Mit einem Ehrenamt-Token gegen alle vier Tabellen: Lesen liefert `[]`,
   Schreiben 403. Dasselbe mit einem Klinik-Token
3. Nummernkreis: zwei Festschreibungen parallel auslösen, es dürfen keine zwei
   gleichen Nummern und keine Lücke entstehen
4. Sperre: Änderungsversuch an einer festgeschriebenen Rechnung muss scheitern
5. Storno: Summe aus Original und Storno ergibt null
6. PDF-Export im Browser erzeugen, gegen die Vorlage abgleichen, `grep -c /SMask`
   muss 0 sein
7. Doppelabrechnung: derselbe Einsatz darf in keiner zweiten Rechnung landen
