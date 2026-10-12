# Sammelrechnung mit Auswahl einzelner Dienste — Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Im Dialog „Sammelrechnung aus Diensten" einzelne Dienste per Häkchen
wählen. Liegengebliebene Dienste aus früheren Wochen nimmt die nächste
Wochenrechnung mit. Der Zeitnachweis prüft genau die Dienste auf der Rechnung.

**Architecture:** Die Regel „abrechenbar" bleibt in `sammelrechnung_dienste`
(Migration AZ ersetzt AY). Neu ist `_rechnung_dienste(invoice)`. Sie liefert
die Dienste einer Rechnung, also die Positionen mit `booking_id` und sonst den
Zeitraum. Diese Menge nutzen Zeitnachweis und Festschreibe-Sperre. Das
Frontend hält die Auswahl als `Set` von booking-ids. Die reine Logik
(Vorbelegung, Summe) liegt DOM-frei in `sammelrechnung.js`.

**Tech Stack:** Supabase/Postgres (plpgsql, RPC über PostgREST), Vanilla-JS,
GitHub Pages. Spec: `docs/superpowers/specs/2026-10-12-sammelrechnung-auswahl-design.md`.

**Dateien**
- Neu (lokal, `sql/` ist gitignored): `sql/2026-10-12-az-sammelrechnung-auswahl.sql`, `sql/test-2026-10-12-az.sql`
- Ändern: `sammelrechnung.js`, `scripts/pruefe-sammelrechnung.mjs`, `app.js` (`sammelrechnungAnlegen`), `admin-rechnungen.html` (Dialog)

---

### Task 1: Reine Logik — Vorbelegung und Summe der Auswahl

**Files:** Modify `sammelrechnung.js`, Test `scripts/pruefe-sammelrechnung.mjs`

- [ ] **Step 1: Failing Test** — vor dem Fehler-Ausgang in `scripts/pruefe-sammelrechnung.mjs` einfügen:

```js
// 6 — Vorbelegung: nur offen und Nachweis vollstaendig (oder kein digitaler Nachweis)
pruefe('vollstaendig ist vorbelegt', SR.vorbelegt({ abgerechnet_auf: null, nachweis: 'vollstaendig' }) === true, '');
pruefe('kein Nachweis noetig ist vorbelegt', SR.vorbelegt({ abgerechnet_auf: null, nachweis: null }) === true, '');
pruefe('unbestaetigt ist nicht vorbelegt', SR.vorbelegt({ abgerechnet_auf: null, nachweis: 'unbestaetigt' }) === false, '');
pruefe('ohne Doku ist nicht vorbelegt', SR.vorbelegt({ abgerechnet_auf: null, nachweis: 'ohne_doku' }) === false, '');
pruefe('abgerechnet ist nie vorbelegt', SR.vorbelegt({ abgerechnet_auf: 'RE-2026-0020', nachweis: 'vollstaendig' }) === false, '');

// 7 — Zusammenfassung mit Auswahl zaehlt nur Gewaehltes
const za = SR.zusammenfassung([
  { booking_id: 'a', stufe: 'T1', preis_cents: 20000, abgerechnet_auf: null },
  { booking_id: 'b', stufe: 'T2', preis_cents: 20000, abgerechnet_auf: null },
  { booking_id: 'c', stufe: 'T2', preis_cents: 20000, abgerechnet_auf: 'RE-2026-0020' }
], new Set(['a', 'c']));
pruefe('Auswahl zaehlt nur Gewaehltes und Offenes', za.anzahl === 1 && za.t1 === 1 && za.summe_cents === 20000, j(za));
```

- [ ] **Step 2:** `node scripts/pruefe-sammelrechnung.mjs` → FAIL (`SR.vorbelegt is not a function`).

- [ ] **Step 3: Implementierung** in `sammelrechnung.js` — `zusammenfassung` bekommt den optionalen Parameter `gewaehlt` (Set), dazu `vorbelegt`:

```js
  /** Vorbelegt ist, was offen ist und keinen fehlenden Zeitnachweis hat. */
  function vorbelegt(d) {
    return !d.abgerechnet_auf && (d.nachweis == null || d.nachweis === 'vollstaendig');
  }

  /** Summe der Vorschau. Abgerechnetes zaehlt nie; mit `gewaehlt` (Set von
   *  booking_id) nur die angehakten Dienste. */
  function zusammenfassung(dienste, gewaehlt) {
    var z = { anzahl: 0, t1: 0, t2: 0, summe_cents: 0 };
    (dienste || []).forEach(function (d) {
      if (d.abgerechnet_auf) return;
      if (gewaehlt && !gewaehlt.has(d.booking_id)) return;
      z.anzahl++;
      if (d.stufe === 'T1') z.t1++; else z.t2++;
      z.summe_cents += Number(d.preis_cents || 0);
    });
    return z;
  }
```
und `vorbelegt: vorbelegt` in das exportierte Objekt aufnehmen.

- [ ] **Step 4:** `node scripts/pruefe-sammelrechnung.mjs` → „alle Pruefungen bestanden".
- [ ] **Step 5:** Commit `Sammelrechnung: Vorbelegung und Summe der Auswahl`.

### Task 2: Migration AZ

**Files:** Create `sql/2026-10-12-az-sammelrechnung-auswahl.sql` (lokal).

Inhalt, vollständig:
1. `_dienst_nachweis(booking uuid) returns text`: `ohne_doku` / `vollstaendig` / `unbestaetigt`, mit derselben Regel wie `_zeitnachweis_status`. Ausführung nur intern (revoke von public, anon, authenticated).
2. `drop function sammelrechnung_anlegen(uuid,date,date)` und `drop function sammelrechnung_dienste(uuid,date,date)`, weil sich der Rückgabetyp ändert. Danach neu `sammelrechnung_dienste` mit den Spalten `nachweis` und `nachtrag`. Nachträge gibt es erst ab dem `service_from` der ersten nicht stornierten Rechnung des Empfängers mit `booking_id`-Position. Auf Klinik-Buchungen (`kunde_id is null`) begrenzt, wie im Zeitnachweis.
3. `sammelrechnung_anlegen(uuid, date, date, uuid[])`. Sie prüft jede id gegen `sammelrechnung_dienste` und bricht bei leerer Liste, doppelten, fremden oder schon abgerechneten ids ab. `service_from` ist das Minimum aus Woche und Auswahl. Bei Nachträgen nennt der Einleitungstext die KW.
4. `_rechnung_dienste(invoice uuid) returns setof uuid`: Positionen mit `booking_id`, sonst Zeitraum (alte Regel).
5. `_zeitnachweis_status` und `zeitnachweis_fuer_rechnung` neu auf Basis von `_rechnung_dienste`. Die Ausgabe bleibt gleich.
6. Rechte, `notify pgrst, 'reload schema'`, Kontrollabfrage.

(Der SQL-Text steht in der Datei. Er bleibt bewusst nicht im öffentlichen Repo.)

- [ ] **Step 1:** Datei schreiben.
- [ ] **Step 2:** Gegenlesen gegen ZN1/RV1. Der Funktionsrumpf muss bis auf die Dienstmenge identisch sein.

### Task 3: SQL-Test AZ

**Files:** Create `sql/test-2026-10-12-az.sql` (lokal). Teil A: Struktur (Signaturen, anon ohne execute, Helfer nicht für authenticated). Teil B: Ein DO-Block holt sich die Vorstandsrolle per JWT-Trick. Er legt 3 erledigte Testbuchungen in zwei fernen Wochen an und setzt den Empfänger in der Transaktion auf `digital`. Dann prüft er:
1. Die Auswahl [b1] legt eine Rechnung mit genau einer Position an.
2. In der Folgewoche erscheinen b2 als Nachtrag und b3 regulär. b1 erscheint nicht.
3. b1 noch einmal anzulegen wird abgelehnt.
4. Eine leere Liste wird abgelehnt, eine fremde id ebenfalls.
5. [b2,b3] ergibt `service_from` = Datum b2, 2 Positionen und „früheren Wochen" im Text.
6. Der Zeitnachweis-Status von Rechnung 1 zählt 1 Dienst, obwohl b2 im Zeitraum liegt.
7. Die Festschreibe-Sperre greift weiter, weil b1 ohne Einsatzdoku ist.

Ende mit `raise exception 'TEST AZ BESTANDEN …'`. Dadurch wird alles zurückgerollt.

### Task 4: app.js

`sammelrechnungAnlegen(recipientId, von, bis, bookingIds)` übergibt `p_booking_ids: bookingIds`. Commit.

### Task 5: Dialog

`admin-rechnungen.html`:
- Zustand `_srAuswahl = new Set()` und `_srDienste = []`.
- Zwei Tabellen: „Noch offen aus früheren Wochen" (`nachtrag`) und die Woche.
- Erste Spalte Häkchen (abgerechnet: keins), neue Spalte Zeitnachweis.
- `srUmschalten(id, an)` aktualisiert Set und Summe.
- `srAnlegen` übergibt `[..._srAuswahl]`.
- Cache-Busting: `sammelrechnung.js?v20261012a`, `app.js?v20261012a`.

Der Druck bleibt unberührt.

### Task 6: Ausrollen

1. Eric führt AZ im SQL-Editor aus, danach Test A und B (B muss mit „TEST AZ BESTANDEN" enden).
2. Erst dann Merge nach `main` und Push.
3. Browser-Abnahme: Dialog öffnen, einen Dienst abhaken, Entwurf anlegen, Zeitnachweis-Box auf dem Entwurf prüfen. Eine Woche weiter muss der Dienst unter „Noch offen" stehen.
