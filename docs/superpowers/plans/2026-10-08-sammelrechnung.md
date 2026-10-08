# Sammelrechnung aus Diensten — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der Vorstand legt für eine Klinik und eine Woche (Mo–So) mit zwei Klicks einen Rechnungsentwurf an: eine Position je erledigtem, noch nicht abgerechnetem Dienst, mit Station und Stufe T1/T2.

**Architecture:** Die Regel „was ist abrechenbar“ steht genau einmal in der Datenbank: `sammelrechnung_dienste()` (Vorschau, auch bereits abgerechnete mit Rechnungsnummer) und `sammelrechnung_anlegen()` (legt den Entwurf an, nutzt dieselbe Funktion). Abgerechnet = Position mit `booking_id` auf einer nicht stornierten Rechnung (Migration AX). Wochenrechnung im Browser in `sammelrechnung.js` (rein, Prüfskript). Dialog in `admin-rechnungen.html`.

**Tech Stack:** Postgres (plpgsql/sql, security definer, `is_board()`), Vanilla JS, Node-Prüfskript, PGlite für den SQL-Nachbau.

---

### Task 1: `sammelrechnung.js` + `scripts/pruefe-sammelrechnung.mjs`
- `vorwoche(heuteIso)` → `{ von, bis }` (Montag/Sonntag der Vorwoche, lokal, nie `toISOString`).
- `wocheVon(datumIso)` → `{ von, bis, kw }` (ISO-Kalenderwoche).
- `verschiebe(woche, tage)`.
- `zusammenfassung(dienste)` → `{ anzahl, t1, t2, summe_cents }` (nur nicht abgerechnete).
- Fälle: Mittwoch 08.10.2026 → Vorwoche 28.09.–04.10., KW 40; Montag → Vorwoche bleibt die davor; Jahreswechsel (KW 53/1); Zusammenfassung ignoriert abgerechnete.

### Task 2: Migration AY (`sql/2026-10-08-ay-sammelrechnung.sql`)
- `sammelrechnung_dienste(recipient, von, bis)` — `language sql`, `security definer`, Filter `is_board()`; Spalten booking_id, datum, schicht, station, stufe, preis_cents, abgerechnet_auf.
- `sammelrechnung_anlegen(recipient, von, bis)` → uuid; Fehler ohne Klinik-Zuordnung, ohne abrechenbare Dienste, bei bis vor von. Betreff „Sitzwachen KW n (…)“ bei Mo–So, sonst Zeitraum; Einleitung mit T1/T2-Zählung; Konto Klinik, § 19-Hinweis (Text = `TEXT_19`).
- ASCII, ohne select-into; PGlite: zweimal anlegen → zweites Mal „keine abrechenbaren Dienste“.

### Task 3: API + Dialog
- `LPR.sammelrechnungDienste()`, `LPR.sammelrechnungAnlegen()`.
- Knopf „Sammelrechnung aus Diensten“ neben „+ Neue Rechnung“; Dialog: Empfänger (nur mit Klinik), Zeitraum (Vorwoche vorbelegt, ‹ ›), Vorschau-Tabelle, Summe mit T1/T2, „Entwurf anlegen“ → Editor.
- Stub-Prüfung im Browser.

### Task 4: Ausrollen
- AY in die Zwischenablage, erst danach Push (sonst 404 auf die RPC — Dialog meldet das, Seite bleibt heil).
