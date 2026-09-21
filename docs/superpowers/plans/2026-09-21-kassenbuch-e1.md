# Kassenbuch Etappe 1 — Implementierungsplan

> **Für agentische Umsetzung:** Schritte sind als Checkboxen (`- [ ]`) geführt.

**Goal:** Der Vorstand lädt auf `admin-kassenbuch.html` den CSV-Export des Vereinskontos hoch, sieht vor dem Schreiben eine Vorschau, und die Buchungen landen einmalig und unverändert in der Datenbank. Zuordnung, Auswertung und Saldo-Abgleich kommen in Etappe 2 und 3.

**Architecture:** Eine board-only Tabelle `bank_buchungen` mit eindeutigem Fingerabdruck gegen Doppelerfassung. Der CSV-Parser liegt in einer eigenen Datei `kassenbuch-csv.js`, die im Browser und in Node läuft — dadurch ist er ohne Login und ohne Datenbank testbar. `app.js` bekommt einen Abschnitt `LPR.kassenbuch*` nach dem Muster der Rechnungs-API, die Seite folgt dem Hausstil der übrigen `admin-*.html`.

**Tech Stack:** HTML/CSS/Vanilla JS mit `supabase-js`, GitHub Pages, PostgreSQL (Supabase Frankfurt). Test als Node-Skript im Hausmuster (`scripts/pruefe-*.mjs`, Exit-Code 1 bei Fehlschlag).

**Spec:** `docs/superpowers/specs/2026-09-21-kassenbuch-design.md`

---

## Kontext, den der Umsetzende kennen muss

**Das Repo ist öffentlich.** `sql/`, `functions/`, `supabase/` und `.superpowers/` stehen in `.gitignore`. SQL wird **nicht** committet, sondern Eric im Chat vorgelegt — er führt es im Supabase-SQL-Editor aus.

**Echte Kontodaten gehören nirgends ins Repo.** Der Test baut seine CSV im Skript selbst, mit erfundenen Namen. Die Datei aus `~/Downloads` wird nicht kopiert, nicht als Fixture abgelegt und nicht committet.

**Der Sparkassen-Export ist ISO-8859-1.** Im Browser heißt das `FileReader.readAsText(datei, 'ISO-8859-1')`, in Node `Buffer.from(...).toString('latin1')`. Mit UTF-8 gelesen wird aus „Schröder" ein „Schrder" — und das fällt erst auf, wenn die Namen schon in der Datenbank stehen.

**Cache-Kennung.** Jede Änderung an `app.js` braucht eine neue `?v…`-Kennung in **allen** Seiten, die die geänderte Funktion nutzen. Sonst hält der Browser die alte Datei fest und die Seite fällt still auf ihren Notnagel zurück (passiert am 21.09.2026 mit `getInvoiceRef`).

**Reihenfolge beim Ausrollen: erst Migration, dann Push.** Umgekehrt fragt die neue Seite eine Tabelle ab, die es nicht gibt.

**Neue Tabelle heißt für PostgREST erst nach `notify pgrst, 'reload schema';`**, sonst meldet die Seite „Could not find the table … in the schema cache".

---

## Dateien

- Neu: `kassenbuch-csv.js` — Parser und Fingerabdruck, sonst nichts. Läuft im Browser und in Node.
- Neu: `scripts/pruefe-kassenbuch-csv.mjs` — Test des Parsers gegen eine im Skript erzeugte CSV.
- Neu: `admin-kassenbuch.html` — Upload, Vorschau, Import, Liste.
- Neu (nicht im Repo): `sql/2026-09-21-kassenbuch-a.sql` — Vorprüfung, Tabelle, RLS, Test.
- Ändern: `app.js` — Abschnitt `LPR.kassenbuch*`.
- Ändern: `layout.js:168-174` — Menüpunkt „Kassenbuch" in der Gruppe Finanzen.

---

## Task 1: Vorprüfung der Datenbank

**Files:** Erstellen: `sql/2026-09-21-kassenbuch-vorpruefung.sql` (nicht committen)

- [ ] **Schritt 1: Abfrage schreiben und Eric vorlegen**

Geprüft wird dreierlei, weil jede Annahme sonst erst bei der Migration auffällt: ob `bank_buchungen` oder `kontostaende` schon existieren (`create table if not exists` schweigt bei abweichendem Aufbau), wie die Board-Prüffunktion heißt, und ob `pgcrypto` für `gen_random_uuid()` da ist.

```sql
select 'tabelle' as art, table_name as name
  from information_schema.tables
 where table_schema = 'public' and table_name in ('bank_buchungen','kontostaende')
union all
select 'funktion', proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and proname in ('is_board','gen_random_uuid');
```

- [ ] **Schritt 2: Ergebnis abwarten.** Bei einem Treffer auf `bank_buchungen` wird der Plan angepasst, nicht die Migration durchgedrückt.

---

## Task 2: Migration — Tabelle, RLS, Test

**Files:** Erstellen: `sql/2026-09-21-kassenbuch-a.sql` (nicht committen)

- [ ] **Schritt 1: Tabelle anlegen**

Felder wie in der Spezifikation. `betrag_cents` ist `int` und negativ bei Ausgängen. `fingerabdruck` ist `text not null unique` — er ist der einzige Schutz gegen doppelten Import und wird im Browser gebildet, nicht in der Datenbank, damit die Vorschau schon vor dem Schreiben weiß, was bekannt ist.

- [ ] **Schritt 2: RLS anschalten, Policy nur für den Vorstand**

Muster wie `invoices`: `enable row level security`, je eine Policy für select/insert/update/delete mit `public.is_board()`. Kein `grant` an `anon`.

- [ ] **Schritt 3: Test im Hausmuster**

Ein `do $$`-Block, der (a) eine Zeile einfügt, (b) dieselbe Zeile ein zweites Mal einfügt und die Unique-Verletzung erwartet, (c) beide wieder löscht und (d) mit `raise exception 'TEST BESTANDEN…'` endet. Nur `$$`, nie `$name$`.

- [ ] **Schritt 4: `notify pgrst, 'reload schema';` anhängen**

- [ ] **Schritt 5: Eric führt aus, Ergebnis abwarten**

---

## Task 3: CSV-Parser (Test zuerst)

**Files:** Erstellen: `kassenbuch-csv.js`, `scripts/pruefe-kassenbuch-csv.mjs`

- [ ] **Schritt 1: Test schreiben, der fehlschlägt**

Das Skript baut seine CSV selbst — erfundene Namen, echte Struktur des Sparkassen-Exports (Semikolon, Felder in Anführungszeichen, deutsche Zahl, zweistelliges Jahr, ISO-8859-1). Geprüft wird:

1. **Umlaute überleben:** Gegenpartei „Enrico Schröder" kommt als „Enrico Schröder" an, nicht als „Schrder".
2. **Betrag in Cent, Vorzeichen erhalten:** `"-1.234,56"` → `-123456`.
3. **Datum als ISO:** `"21.09.26"` → `"2026-09-21"`.
4. **Vorgemerktes fliegt raus:** Eine Zeile mit `Info = "Umsatz vorgemerkt"` erscheint nicht im Ergebnis.
5. **Fingerabdruck ist stabil und unterscheidet:** Zweimal dieselbe Zeile ergibt denselben Abdruck; zwei Zeilen mit gleichem Betrag und Datum, aber verschiedenem Zweck, ergeben verschiedene.
6. **Semikolon im Verwendungszweck** (in Anführungszeichen) zerreißt die Zeile nicht.

```js
#!/usr/bin/env node
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const KB = require('../kassenbuch-csv.js');

const fehler = [];
const pruefe = (name, bedingung, hinweis) => { if (!bedingung) fehler.push(`${name}\n    ${hinweis}`); };

const kopf = '"Auftragskonto";"Buchungstag";"Valutadatum";"Buchungstext";"Verwendungszweck";'
  + '"Glaeubiger ID";"Mandatsreferenz";"Kundenreferenz (End-to-End)";"Sammlerreferenz";'
  + '"Lastschrift Ursprungsbetrag";"Auslagenersatz Ruecklastschrift";"Beguenstigter/Zahlungspflichtiger";'
  + '"Kontonummer/IBAN";"BIC (SWIFT-Code)";"Betrag";"Waehrung";"Info";"Kategorie"';
const zeile = (tag, zweck, wer, betrag, info = 'Umsatz gebucht') =>
  `"DE14100500000191649783";"${tag}";"${tag}";"ONLINE-UEBERWEISUNG";"${zweck}";"";"";"";"";"";"";`
  + `"${wer}";"DE89100400000774799100";"COBADEFFXXX";"${betrag}";"EUR";"${info}";""`;

const csv = [kopf,
  zeile('21.09.26', 'Aufwandsentschaedigung; Teil 1', 'Enrico Schröder', '-1.234,56'),
  zeile('21.09.26', 'Aufwandsentschaedigung; Teil 2', 'Enrico Schröder', '-1.234,56'),
  zeile('20.09.26', 'Vorgemerkt', 'Testperson', '-10,00', 'Umsatz vorgemerkt')
].join('\r\n');

const text = Buffer.from(csv, 'latin1').toString('latin1');
const zeilen = KB.parseSparkasseCsv(text);

pruefe('Vorgemerktes fliegt raus', zeilen.length === 2, `bekommen: ${zeilen.length}`);
pruefe('Umlaut erhalten', zeilen[0].gegenpartei === 'Enrico Schröder', `bekommen: ${zeilen[0].gegenpartei}`);
pruefe('Betrag in Cent', zeilen[0].betrag_cents === -123456, `bekommen: ${zeilen[0].betrag_cents}`);
pruefe('Datum ISO', zeilen[0].buchungstag === '2026-09-21', `bekommen: ${zeilen[0].buchungstag}`);
pruefe('Semikolon im Zweck', zeilen[0].verwendungszweck === 'Aufwandsentschaedigung; Teil 1',
  `bekommen: ${zeilen[0].verwendungszweck}`);
pruefe('Fingerabdruecke unterscheiden', zeilen[0].fingerabdruck !== zeilen[1].fingerabdruck,
  'zwei Zeilen mit gleichem Betrag und Datum haben denselben Abdruck');
pruefe('Fingerabdruck stabil',
  KB.parseSparkasseCsv(text)[0].fingerabdruck === zeilen[0].fingerabdruck, 'zweiter Lauf weicht ab');

if (fehler.length) { console.error('FEHLER:\n- ' + fehler.join('\n- ')); process.exit(1); }
console.log('Kassenbuch-CSV: alle Pruefungen bestanden.');
```

- [ ] **Schritt 2: Test laufen lassen, Fehlschlag sehen**

Run: `node scripts/pruefe-kassenbuch-csv.mjs`
Erwartet: Abbruch, weil `kassenbuch-csv.js` fehlt.

- [ ] **Schritt 3: Parser schreiben**

`kassenbuch-csv.js` exportiert `parseSparkasseCsv(text)` und `fingerabdruck(zeile)`. Anforderungen: eigener Zeichen-für-Zeichen-Leser für das CSV (Anführungszeichen, doppelte Anführungszeichen als Escape, Zeilenumbrüche innerhalb von Feldern), Spaltenzuordnung über die Kopfzeile statt über feste Positionen, `Info`-Filter auf „gebucht", deutsche Zahl über `replace(/\./g,'').replace(',','.')`, zweistelliges Jahr → `2000 + jj`. Der Fingerabdruck ist ein Textschlüssel aus Konto, Buchungstag, Betrag, Verwendungszweck und Gegenpartei — kein Hash, damit er ohne Krypto-API auch in Node gleich fällt.

Die Datei endet mit einem Anhang, der sie in beiden Welten nutzbar macht:

```js
if (typeof module !== 'undefined' && module.exports) module.exports = KassenbuchCSV;
else if (typeof window !== 'undefined') window.KassenbuchCSV = KassenbuchCSV;
```

- [ ] **Schritt 4: Test laufen lassen, bestehen sehen**

Run: `node scripts/pruefe-kassenbuch-csv.mjs`
Erwartet: `Kassenbuch-CSV: alle Pruefungen bestanden.`

- [ ] **Schritt 5: Commit**

```bash
git add kassenbuch-csv.js scripts/pruefe-kassenbuch-csv.mjs
git commit -m "Kassenbuch: CSV-Parser mit Test"
```

---

## Task 4: API in app.js

**Files:** Ändern: `app.js`

- [ ] **Schritt 1: Drei Funktionen im Muster der Rechnungs-API ergänzen**

- `kassenbuchListe({ jahr, monat })` — liest `bank_buchungen`, sortiert nach `buchungstag` absteigend.
- `kassenbuchBekannteAbdruecke(abdruecke)` — fragt zu einer Liste von Fingerabdrücken ab, welche schon da sind. Das ist die Grundlage der Vorschau und läuft in Blöcken zu 200, weil die URL-Länge bei `in.(…)` sonst reißt.
- `kassenbuchImport(zeilen)` — schreibt neue Zeilen, `insert` mit `onConflict: 'fingerabdruck', ignoreDuplicates: true`. Rückgabe: Anzahl geschrieben.

Alle drei prüfen `getSession().role === 'admin'` und geben `{ ok, error, … }` zurück wie der Rest der Datei.

- [ ] **Schritt 2: In die Export-Liste am Dateiende aufnehmen**

- [ ] **Schritt 3: `node --check app.js`**

- [ ] **Schritt 4: Commit**

---

## Task 5: Seite admin-kassenbuch.html

**Files:** Erstellen: `admin-kassenbuch.html`; Ändern: `layout.js`

- [ ] **Schritt 1: Seite im Hausstil anlegen**

Kopfzeile wie `admin-rechnungen.html`, `LPR_Layout.init({ page: 'kassenbuch' })`, Rollenprüfung auf `admin`, sonst `login-view`.

Inhalt: Ein `<input type="file" accept=".csv,.CSV">`, darunter der Vorschaubereich, darunter die Liste der schon erfassten Buchungen (Datum, Gegenpartei, Zweck gekürzt, Betrag).

- [ ] **Schritt 2: Vorschau bauen**

`FileReader.readAsText(datei, 'ISO-8859-1')` → `KassenbuchCSV.parseSparkasseCsv` → Fingerabdrücke gegen die Datenbank prüfen → Meldung „N neue Buchungen, M bereits bekannt" plus Tabelle der neuen Zeilen. Der Import-Knopf erscheint erst hier und ist deaktiviert, wenn N = 0.

- [ ] **Schritt 3: Import**

Knopf ruft `LPR.kassenbuchImport(neueZeilen)`, meldet das Ergebnis über `LPR.showToast` und lädt die Liste neu.

- [ ] **Schritt 4: Menüpunkt in `layout.js`**

In der Gruppe „Finanzen" nach „Rechnungen": `punkt('admin-kassenbuch.html', 'kassenbuch', 'Kassenbuch')`, und `'kassenbuch'` in die Schlüsselliste der Gruppe aufnehmen.

- [ ] **Schritt 5: Cache-Kennung auf allen betroffenen Seiten hochzählen**

- [ ] **Schritt 6: Syntaxprüfung der Inline-Skripte**

Skriptblöcke aus der HTML-Datei ziehen und `node --check` darüber laufen lassen.

- [ ] **Schritt 7: Commit**

---

## Task 6: Abnahme

- [ ] **Schritt 1: Migration ausführen lassen, dann pushen** — in dieser Reihenfolge.
- [ ] **Schritt 2: Im Browser die echte CSV hochladen.** Erwartet: 31 neue Buchungen, Vorschau vor dem Schreiben.
- [ ] **Schritt 3: Dieselbe Datei erneut hochladen.** Erwartet: „0 neue Buchungen, 31 bereits bekannt", kein Schreibvorgang.
- [ ] **Schritt 4: Umlaute in der Liste prüfen** — „Enrico Schröder", nicht „Schrder".
