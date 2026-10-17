# Vereinsauslagen Stufe 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der Vorstand erfasst Auslagen für jedes Mitglied ohne Reise-Anmeldung, optional mit Reise und mit Belegen.

**Architecture:** Neue Herkunft `source_type='verein'` in `claims` plus `trip_id` und `erfasst_von`; Belege im privaten Bucket `auslagen-belege/<claim-id>/`. Die Antrags-ID entsteht im Browser, damit die Belege vor dem INSERT (und damit vor der Zahlungsanweisung des Webhooks) liegen. Mails und Beleg erkennen die neue Herkunft.

**Tech Stack:** Supabase (Postgres, Storage, Edge Function `claim-mails`), Vanilla JS (`app.js`, Seiten-HTML), Node-Prüfskripte unter `scripts/`.

Spec: `docs/superpowers/specs/2026-10-17-vereinsauslagen-design.md`.
SQL (Migration + Test) liegt lokal unter `sql/` (gitignored), Edge Function unter `functions/` (gitignored).

---

### Task 1: Migration und SQL-Test (lokal, `sql/`)

**Files:**
- Create: `sql/2026-10-17-ba1-vereinsauslagen.sql`
- Create: `sql/test-2026-10-17-ba1.sql`

- [ ] Migration: Wächter (bricht ab, wenn `claims_source_chk` nicht genau die drei bekannten Zweige hat), dann `source_type` um `verein` erweitern, `claims_source_chk` um den Zweig `verein` (kind auslage, ohne Anmeldung/Buchung), Spalten `trip_id` (FK trips, nur bei verein) und `erfasst_von` (default `auth.uid()`), Bucket `auslagen-belege` (privat, 10 MB, Bild/PDF), Storage-Policies lesen (Vorstand, Kassenprüfung), ablegen (Vorstand), löschen (Vorstand, Antrag nicht ausgezahlt).
- [ ] Test als grüne Ergebnistabelle: Constraint-Texte, Spalten, Bucket, Policies; dazu DO-Block, der als `authenticated` mit Vorstandsprofil eine Vereinsauslage einfügen kann und mit Mitgliedsprofil keine Belege lesen darf.
- [ ] Kommentarfreie, ASCII-reine Fassung per `pbcopy` an Eric. Erst nach erfolgreichem Lauf weiter mit Task 6 (Deploy).

### Task 2: Beleg-Vorlage (TDD)

**Files:**
- Create: `scripts/pruefe-beleg-vereinsauslage.mjs`
- Modify: `beleg-vorlage.js` (Block `aktivitaet`)

- [ ] Test schreiben: `belegHtml({claim:{kind:'auslage', auslage_art:'beleg', source_type:'verein', status:'paid', …}, reiseTitel:'AWO Rerik'})` enthält „Ausgabe für den Verein" und „Reise „AWO Rerik"", keinen Freibetragsbalken; eine Reise-Auslage ohne `source_type='verein'` enthält „Ausgabe für den Verein" nicht.
- [ ] `node scripts/pruefe-beleg-vereinsauslage.mjs` → FEHLER.
- [ ] `beleg-vorlage.js`: `isVerein = c.source_type === 'verein'`; Untertitel „Ausgabe für den Verein", optional `d.reiseTitel` als Zusatz.
- [ ] Test grün, `node scripts/vorlage-einbetten.mjs`, Commit.

### Task 3: `app.js`

- [ ] `adminCreateVereinsAuslage({user_id, trip_id, period_start, period_end, bezeichnung, amount_cents, notes, files})`: Prüft Vorstand, Betrag, Datum; erzeugt `crypto.randomUUID()`; lädt Dateien nach `auslagen-belege/<id>/`; fügt `claims` mit `id`, `source_type:'verein'`, `kind:'auslage'`, `auslage_art:'beleg'`, `status:'approved'`, `amount_breakdown:[{label, amount}]` ein. Scheitert das Einfügen, werden die hochgeladenen Dateien wieder entfernt.
- [ ] `listAuslageBelege(claimId)`, `uploadAuslageBelege(claimId, files)`, `auslageBelegUrl(pfad)`, `deleteAuslageBeleg(pfad)`; Dateiprüfung `pruefeBelegDatei(file)` (Endung pdf/jpg/jpeg/png/heic, max. 10 MB).
- [ ] `trip_id` in die Select-Listen von `getMyClaims` und `adminListClaims`; `adminListClaims` liefert `trip_title` für Vereinsauslagen und `beleg_anzahl` für Auslagen gegen Beleg.
- [ ] `pruefungDaten`: `source_type`, `auslage_art` mitladen.
- [ ] Export der neuen Funktionen, Commit.

### Task 4: `admin-auszahlungen.html`

- [ ] Art-Auswahl „Ausgabe für den Verein" (`verein`); dabei Reise optional, Person aus allen freigegebenen Mitgliedern, Datum von/bis, Dateiauswahl (mehrfach).
- [ ] `claimHerkunft`: `verein` vor `auslage`; Label „Vereinsauslage".
- [ ] Spalte/Knopf „Belege (n)" bzw. „Beleg fehlt" bei Auslagen gegen Beleg; Dialog mit Liste (signierte Links), Upload, Löschen vor Auszahlung.
- [ ] Commit.

### Task 5: `abrechnung.html` und `pruefung.html`

- [ ] Mitglied: Abzeichen „Auslage", Titel „Ausgabe für den Verein: <Bezeichnung>"; `showBeleg` gibt `reiseTitel` mit.
- [ ] Kassenprüfung: bei Auslagen Knopf „Belege" mit signierten Links.
- [ ] Commit.

### Task 6: Edge Function `claim-mails` (nach erfolgreicher Migration)

- [ ] `CLAIM_COLS` + `trip_id`; `reiseTitel` liest bei `trip_id` direkt `trips.title`; `taetigkeit` für `verein` → „Ausgabe für den Verein" (+ Reise).
- [ ] Zahlungsanweisung und Eingangsmeldung: bei `auslage_art='beleg'` Zeile „Belege im Portal: n" oder „Beleg fehlt".
- [ ] `belegDokument` gibt `reiseTitel` an die Vorlage.
- [ ] Vorlage einbetten, Deploy per CLI, Test über „Mail erneut senden" an einem Testantrag ist NICHT nötig — Abnahme mit Erics echter Flixbus-Auslage.

### Task 7: Merge, Push, Abnahme

- [ ] Alle `scripts/pruefe-*.mjs` grün, `node --check app.js`.
- [ ] Merge nach `main`, Push (GitHub Pages), live prüfen, dass `app.js` die neuen Funktionen hat.
- [ ] Browser-Abnahme durch Eric: Flixbus-Auslage 194,44 € mit Reise Rerik und sechs Belegen.
