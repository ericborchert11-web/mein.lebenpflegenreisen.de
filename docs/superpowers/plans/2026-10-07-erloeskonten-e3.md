# Erlöskonten Etappe 3 — Rechnungshinweise und Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jede neue Rechnung bekommt den Pflichthinweis passend zu ihrem Erlöskonto automatisch, kann ohne Konto nicht festgeschrieben werden, und die Steuerberaterin bekommt je Jahr eine CSV aller Erlöse mit Konto und USt-Kennzeichen.

**Architecture:** Texte und Regeln in einer reinen Datei `rechnung-hinweise.js` (Prüfskript). Der Editor `rechnung.html` wählt das Konto statt Steuermodus/Befreiungsgrund und zeigt den Hinweis nur noch an. Der Export ist eine reine Funktion in `kassenbuch-auswertung.js`, ausgelöst im Kassenbuch. Migration AU stellt nur den Default von `invoices.tax_note` auf leer.

**Tech Stack:** wie Etappe 2. **Gate:** Push erst nach Sonjas Freigabe der Texte (Freigabeblatt als PDF).

---

### Task 1: `rechnung-hinweise.js` + Prüfskript
- Texte 1:1 aus Briefing Abschnitt 5 (`TEXT_19`, `TEXT_45A`).
- `hinweisFuer(konto, ust)`: Klinik → § 19; 45a → 45a-Text; Reisen → 45a-Text wenn `ust === false`, sonst § 19; sonstige → ''; ohne Konto → null.
- `pruefe(inv, items)` → `{ fehler, warnungen }`. Fehler: kein Konto; `tax_mode = 'vat'`; Hinweis enthält „§ 4 Nr. 18“; Klinik-Hinweis enthält „§ 4 Nr. 16“; Klinik-Position mit „Personalgestellung/-überlassung“. Warnung: Klinik-Position beginnt nicht mit „Betreuung des Patienten“/„Betreuung der Patientin“.
- Test zuerst, dann Code, Commit.

### Task 2: Export für die Steuerberaterin
- `erloeseCsv(buchungen, rechnungenNachId, jahr)` in `kassenbuch-auswertung.js`: eine Zeile je Erlös-Kontozeile des Jahres (Datum = Rechnungsdatum oder Buchungstag, Zahlungseingang = Buchungstag) plus festgeschriebene Rechnungen des Jahres ohne Kontozeile (Zahlungseingang leer; Storno-Paare ausgenommen). Spalten: Datum, Zahlungseingang, Belegnr., Beschreibung, Erlöskonto, USt-pflichtig, Betrag, Zahler.
- `kassenbuchVorgaenge` reicht `betreff`, `cancels_invoice_id`, `cancelled_by_invoice_id` durch.
- Knopf „Erlöse für die Steuerberaterin (CSV)“ in der Auswertung.
- Test zuerst, Commit.

### Task 3: Rechnungseditor
- Feld „Erlöskonto“ (Pflicht) + Schalter „vom 45a-Bescheid gedeckt“ bei Reisen; Umsatzsteuer-Auswahl und Freitext-Befreiungsgrund entfallen, der Hinweis wird angezeigt („steht so auf der Rechnung“).
- Beim Öffnen eines Entwurfs mit Konto: Hinweis nachziehen. Leerer Hinweis → kein Kasten im Beleg.
- `issue()`: `pruefe()` vorher; Fehler brechen ab, Warnungen stehen in der Rückfrage.
- `updateInvoiceDraft` speichert `erloeskonto`, `ust_pflichtig`; Reisen-Falle wie im Kassenbuch: einmal nachschreiben.
- Festgeschriebene Rechnung: Konto nur anzeigen.
- Prüfung per Stub-Kopie, Commit.

### Task 4: Migration AU
- `alter table public.invoices alter column tax_note set default ''` (Zwischenablage, ASCII).

### Task 5: Freigabeblatt für Sonja + Abschluss
- PDF mit den Texten und der Zuordnungsregel nach `~/Downloads`.
- Spec, CHANGELOG, Memory. **STOP → Eric/Sonja; Push erst nach Freigabe.**
