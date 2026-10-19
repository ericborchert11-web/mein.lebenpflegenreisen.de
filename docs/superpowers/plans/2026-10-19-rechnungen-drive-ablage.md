# Rechnungen in Google Drive — Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jede festgeschriebene Rechnung (und bei Klinik-Empfängern ihr
Zeitnachweis) landet automatisch als PDF im richtigen Drive-Ordner.

**Architecture:** Das Portal erzeugt die PDFs beim Festschreiben im Browser,
legt sie im privaten Bucket `rechnungen` ab und meldet sie in der neuen Tabelle
`rechnung_ablage` an. Ein Google-Apps-Skript im Vorstandskonto holt offene Zeilen
alle 15 Minuten über die Edge Function `drive-ablage` ab, legt sie in Drive ab
und meldet zurück. Die reine Logik (Dateiname, Unterordner) liegt DOM-frei in
`drive-ablage.js` und wird im Skript wiederverwendet (gleicher Quelltext).

**Tech Stack:** Supabase/Postgres (plpgsql, RPC), Deno Edge Function,
Google Apps Script (Advanced Drive Service v3), Vanilla-JS, GitHub Pages.
Spec: `docs/superpowers/specs/2026-10-19-rechnungen-drive-ablage-design.md`.

**Dateien**
- Neu (lokal, gitignored): `sql/2026-10-19-bd-drive-ablage.sql`, `sql/test-2026-10-19-bd.sql`,
  `functions/drive-ablage/index.ts`, `functions/drive-ablage/apps-script.gs`, `functions/drive-ablage/ANLEITUNG.md`
- Neu: `drive-ablage.js`, `scripts/pruefe-drive-ablage.mjs`
- Ändern: `app.js` (Ablage-Funktionen, `rechnungVersenden` nimmt fertige Pfade),
  `rechnung.html` (PDFs beim Festschreiben, Ablage-Box), `admin-rechnungen.html` (Hinweis „PDF fehlt“)

---

### Task 1: Reine Logik `drive-ablage.js` (TDD)

- [ ] Test `scripts/pruefe-drive-ablage.mjs` schreiben: Dateiname
  (`RE-2026-0024 Sana Kliniken Berlin-Brandenburg GmbH.pdf`, unerlaubte Zeichen
  `/\:*?"<>|` werden zu `-`, Zeitnachweis `RE-2026-0024 Zeitnachweis.pdf` bzw.
  `.jpg`), Unterordner (`monat_kw` mit service_to 2026-10-18 → `['10/26','KW42']`,
  Woche über Monatsgrenze service_to 2026-11-01 → `['10/26','KW44']`, `monat`
  2026-09-30 → `['09/26']`, `jahr` → `['2026']` aus invoice_date, fehlender
  Zeitraum → Rechnungsdatum).
- [ ] FAIL prüfen, implementieren (UMD wie `sammelrechnung.js`), PASS, commit.

### Task 2: Migration BD (lokal)

1. Tabelle `rechnung_ablage` (invoice_id, art, pfad, angelegt_am, drive_datei_id,
   drive_link, abgelegt_am, versuche, fehler; unique (invoice_id, art)); RLS an,
   nur Lesen für Vorstand.
2. `billing_recipients.drive_ordner_id text`, `drive_unterordner text` (check
   `monat_kw|monat|jahr`, default `jahr`); Sana/JVK mit den Ordner-IDs füllen.
3. RPC `rechnung_ablage_anmelden(p_invoice, p_art, p_pfad)`: Vorstand,
   Rechnung festgeschrieben (nicht draft), Pfad beginnt mit `<invoice_id>/`,
   Upsert setzt bei neuem Pfad Drive-Felder, Versuche und Fehler zurück.
4. Trigger auf `invoices`: zurück auf `draft` → noch nicht abgelegte Zeilen löschen.
5. `rechnung_ablage_offen(p_limit)` und `rechnung_ablage_melden(...)` nur für
   die Service-Rolle (Edge Function).
6. Altbestand: versandte PDFs aus `rechnung_versand` (status versendet) anmelden.
7. Test BD (Struktur + DO-Block, endet mit `TEST BD BESTANDEN`).

### Task 3: Edge Function `drive-ablage`

`POST` mit Schlüssel-Header (Vergleich gegen Secret `DRIVE_ABLAGE_TOKEN`).
Aktionen `offen` (bis 20 Zeilen mit signiertem Link 10 Min.), `erledigt`,
`fehler`. Deploy per CLI mit `--no-verify-jwt`.

### Task 4: app.js

- `rechnungPdfsSichern(invoiceId, rechnungBlob, nachweisBlob, nachweisPfad)`:
  hochladen, anmelden, liefert `{rechnungPfad, nachweisPfad}`.
- `rechnungVersenden(invoiceId, {rechnungPfad, nachweisPfad})` lädt nicht mehr
  selbst hoch.
- `listRechnungAblage(invoiceId)`, `rechnungenOhneAblage()`.

### Task 5: rechnung.html

- `pdfsSichern()` nach `issue_invoice` für JEDE Rechnung; danach Versand mit
  denselben Pfaden. Knopf „PDF erzeugen“, wenn festgeschrieben und keine Zeile.
- Box „Ablage in Google Drive“: abgelegt am + Link / wartet / Fehler (ab 3 Versuchen).
- Cache-Busting `app.js?v20261019a`, `drive-ablage.js?v20261019a`.

### Task 6: admin-rechnungen.html

Hinweis über der Liste: „Bei n festgeschriebenen Rechnungen fehlt das PDF für
die Drive-Ablage“ mit Links.

### Task 7: Apps Script + Anleitung

`apps-script.gs` (enthält die Logik aus `drive-ablage.js`), Script Properties
`PORTAL_URL`, `ABLAGE_TOKEN`, `STANDARD_ORDNER`; `einrichten()` legt den
15-Minuten-Auslöser an; `ablegen()` mit LockService. Vorhandene Datei gleichen
Namens wird per `Drive.Files.update` inhaltlich ersetzt (Wieder-öffnen-Fall,
verlorene Rückmeldung). Verknüpfung in `Ausgangsrechnungen/JJJJ`, wenn
Zielordner ≠ Standard.

### Task 8: Ausrollen

1. Eric: BD + Test im SQL-Editor; Secret setzen; Function deployen.
2. Merge + Push.
3. Eric: Skript einrichten (Anleitung).
4. Altbestand: fehlende PDFs per Knopf erzeugen (Browser).
5. Abnahme: nach einem Lauf liegen Dateien im richtigen Ordner, Portal zeigt Links.
