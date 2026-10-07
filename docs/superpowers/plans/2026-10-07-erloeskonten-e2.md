# Erlöskonten Etappe 2 — Kassenbuch-UI + Ampel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der Vorstand ordnet im Kassenbuch jedem Eingang ohne Rechnung ein Erlöskonto zu, sieht Konto-Spalte, Konto-Filter und Summen je Konto, und oben im Kassenbuch sowie im Cockpit die Kleinunternehmer-Ampel.

**Architecture:** Die Datenbank (Migration AT, live seit 07.10.2026) liefert Spalten `erloeskonto`/`ust_pflichtig` und die Sicht `v_ust_umsatz`. Neue reine Logik ohne DOM kommt in `ust-ampel.js` (Ampelstand aus einer Sichtzeile) und in die bestehenden `kassenbuch-auswertung.js` (Konto je Buchung, Summen je Konto) und `kassenbuch-zuordnung.js` (Vorzeichen-Fix). Jede davon bekommt ein Node-Prüfskript unter `scripts/`. Die Seiten `admin-kassenbuch.html` und `admin-cockpit.html` rendern nur.

**Tech Stack:** Vanilla JS (UMD-Muster wie `kassenbuch-*.js`), Supabase PostgREST über `app.js`, Prüfskripte `node scripts/*.mjs`, GitHub Pages (Push = Deploy).

Spec: `docs/superpowers/specs/2026-10-07-kassenbuch-erloeskonten.md` · Briefing Abschnitt 3, Etappe 2.

---

## Dateien

| Datei | Aufgabe |
|---|---|
| `ust-ampel.js` (neu) | Kontoliste mit Labels, `stand(zeile)` → Prozent, Farbe, Warnungen |
| `scripts/pruefe-ust-ampel.mjs` (neu) | Prüfskript |
| `kassenbuch-zuordnung.js` | Rechnungsbetrag mit Vorzeichen vergleichen; Gutschrift-Hinweis |
| `scripts/pruefe-kassenbuch-zuordnung.mjs` | Fall „Eingang gegen Gutschrift“ |
| `kassenbuch-auswertung.js` | `kontoVon()`, `jeKonto()`, CSV-Spalten Konto + USt |
| `scripts/pruefe-kassenbuch-auswertung.mjs` | Fälle für Konto und Summen |
| `app.js` | Spalten lesen, Konto schreiben, `ustUmsatz()` |
| `admin-kassenbuch.html` | Ampel-Karte, Konto im Dialog, Spalte, Filter, Summen |
| `admin-cockpit.html` | Kachel „USt-Grenze“ |

Deploy-Reihenfolge: unkritisch, die Spalten sind auf PROD. Push nur mit Erics Freigabe.

---

### Task 1: Vorzeichen-Fix in der Zuordnung

**Files:** Modify `kassenbuch-zuordnung.js` (Rechnungszweig in `vorschlagFuer`), Test `scripts/pruefe-kassenbuch-zuordnung.mjs`

- [ ] **Step 1: Failing test** — vor Abschnitt 8 einfügen:

```js
// 7b — Eingang gegen Gutschrift: gleicher Betrag, anderes Vorzeichen. Genau so
//      hing am 21.09.2026 die Zahlung der Heilpraxis an der Gutschrift 0004.
const mitGutschrift = { rechnungen: rechnungen.concat([
  { id: 'r-04', invoice_no: 'RE-2026-0004', total_cents: -1056900, recipient_name: 'Heilpraxis' }
]), antraege };
v = KZ.vorschlagFuer(buchung(1056900, '2026-0004'), mitGutschrift);
pruefe('Eingang wird keiner Gutschrift zugeordnet', v && v.art === null, JSON.stringify(v));
pruefe('Gutschrift wird benannt', v && /Gutschrift/.test(v.hinweis || ''), JSON.stringify(v));
```

- [ ] **Step 2:** `node scripts/pruefe-kassenbuch-zuordnung.mjs` → FEHLER „Eingang wird keiner Gutschrift zugeordnet“.
- [ ] **Step 3: Implementierung** — im Rechnungszweig `gleicherBetrag(cents, treffer[0].total_cents)` ersetzen:

```js
        // Rechnungen mit Vorzeichen vergleichen: ein Eingang gehoert zu einer
        // Forderung, nie zu einer Gutschrift. Antraege bleiben beim Betrag ohne
        // Vorzeichen — dort ist die Auszahlung negativ, der Antrag positiv.
        if (cents === Number(treffer[0].total_cents)) {
          return { art: 'invoice', id: treffer[0].id, bezeichnung: nummer, hinweis: '' };
        }
        if (gleicherBetrag(cents, treffer[0].total_cents)) {
          return { art: null, id: null, bezeichnung: nummer,
                   hinweis: nummer + ' ist eine Gutschrift — ein Eingang gehört nicht dazu.' };
        }
```

- [ ] **Step 4:** Skript erneut → „alle Pruefungen bestanden“.
- [ ] **Step 5:** Commit `Cash book: never match an incoming payment to a credit note`.

### Task 2: `ust-ampel.js`

**Files:** Create `ust-ampel.js`, `scripts/pruefe-ust-ampel.mjs`

- [ ] **Step 1: Prüfskript** mit diesen Fällen (Zeile = Sichtzeile `v_ust_umsatz`):
  - 21.291,94 € von 25.000 € → `prozent` 85, `farbe` 'gelb', nicht überschritten.
  - 19.000 € → 'gruen' (76 %); 20.000 € → 'gelb' (genau 80 %); 25.000 € → 'rot', `ueberschritten` true.
  - `vorjahr_steuerpflichtig_cents` null → `vorjahr` null; 2.600.000 Vorjahr bei Grenze 2.500.000 → Farbe 'rot', auch wenn laufend grün.
  - Warnungen: 1 Eingang ohne Konto → Text enthält „1 Eingang ohne Erlöskonto“; 2 offene Rechnungen → „2 Rechnungen ohne Zahlungseingang – nicht in der Summe“.
  - `stand(null)` → `{ leer: true }`.
  - `KONTEN` hat genau die vier Schlüssel; `kontoName('erloes_45a')` = „Erlöse 45a (steuerfrei)“, `kontoName(null)` = „ohne Konto“.
- [ ] **Step 2:** Skript läuft → scheitert, Modul fehlt.
- [ ] **Step 3:** `ust-ampel.js` im UMD-Muster der `kassenbuch-*.js` (siehe Implementierung im Commit).
- [ ] **Step 4:** Skript grün.
- [ ] **Step 5:** Commit `USt traffic light: pure status calculation`.

### Task 3: Konto je Buchung + Summen + CSV

**Files:** Modify `kassenbuch-auswertung.js`, Test `scripts/pruefe-kassenbuch-auswertung.mjs`

- [ ] **Step 1: Fälle** — `kontoVon(b, rechnungenNachId)`: Buchung mit Rechnung → Konto der Rechnung; Eingang ohne Vorgang → eigenes Konto; Ausgang ohne Rechnung → `undefined` (gehört nicht in Erlöse); Eingang mit Antrag → `undefined`. `jeKonto(buchungen, rechnungenNachId)` → vier Konten + `ohne`, Rückzahlung (negativ, mit Rechnung) mindert. CSV-Kopf enthält „Erlöskonto“ und „USt-pflichtig“.
- [ ] **Step 2–4:** rot → implementieren → grün.
- [ ] **Step 5:** Commit `Cash book: revenue account per entry, sums and CSV columns`.

### Task 4: `app.js`

- [ ] `KASSENBUCH_COLS` + `erloeskonto, ust_pflichtig`; `INVOICE_COLS_BASIS` + dieselben; `kassenbuchVorgaenge` reicht beide durch.
- [ ] `kassenbuchZuordnen`: Patch um `erloeskonto` und `ust_pflichtig` erweitern. Fall Reisen + „45a-gedeckt“ beim Wechsel von einem anderen Konto: Der Trigger setzt dann `true` (alter Wert war abgeleitet). Nach dem Zurücklesen einmal nachschreiben, wenn der gewünschte Wert abweicht.
- [ ] Neu `ustUmsatz()` → `{ ok, zeilen }` aus `v_ust_umsatz`, nach Jahr.
- [ ] `node --check app.js`; Commit `API: revenue account columns and USt view`.

### Task 5: Kassenbuch-Seite

- [ ] Ampel-Karte `#ampel-wrap` zwischen Kopf und Upload: Zeile 1 „Steuerpflichtiger Umsatz {Jahr}: X € von G €“, Balken, Zeile 2 Vorjahr (nur wenn vorhanden), Nebenzahl „Davon ausgenommen (steuerfrei 45a/Reisen): Z €“, Warnungen, bei Rot „Grenze überschritten – Steuerberaterin informieren“.
- [ ] Dialog: Block „Erlöskonto“ nur bei Eingängen; Auswahl der vier Konten, Schalter „vom 45a-Bescheid gedeckt“ nur bei Reisen. Rechnung und Konto schließen einander aus. Eingang ohne Rechnung verlangt ein Konto.
- [ ] `istZugeordnet`: Eingang ohne Vorgang ist erst mit Konto zugeordnet.
- [ ] Tabelle: Spalte „Konto“; Filter `#f-konto` (alle / vier Konten / ohne Konto); Auswertung bekommt Tabelle „Einnahmen nach Erlöskonto“.
- [ ] Script-Versionen hochziehen (`?v20261007a`).
- [ ] Prüfung ohne Login: Wegwerf-Kopie mit LPR-Stub, `python3 -m http.server`, Screenshot in Chrome (Desktop + 390 px).
- [ ] Commit `Cash book: revenue accounts in dialog, list, filter and USt traffic light`.

### Task 6: Cockpit-Kachel

- [ ] `laden()` holt zusätzlich `LPR.ustUmsatz()`; `zeichneZahlen()` hängt Kachel „USt-Grenze {Jahr}“ mit „85 %“ an, Klasse `alarm` bei Rot, neue Klasse `gelb` bei Gelb; Klick → `admin-kassenbuch.html`.
- [ ] Commit `Cockpit: USt threshold tile`.

### Task 7: Abschluss

- [ ] Alle Prüfskripte grün; Spec-Abschnitt Etappe 2; CHANGELOG-Eintrag; Memory.
- [ ] **STOP → Review Eric, Push nur nach Freigabe.**
