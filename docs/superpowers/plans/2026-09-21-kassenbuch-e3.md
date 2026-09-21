# Kassenbuch Etappe 3 — Auswertung, Export, Saldo-Abgleich

**Goal:** Das Kassenbuch beantwortet die drei Fragen der Kassenprüfung: Wofür ist das Geld geflossen (Summen je Kostenart und Sphäre)? Kann ich die Liste mitnehmen (CSV-Export)? Und: Ist wirklich alles erfasst (Saldo-Abgleich gegen den Kontostand)?

**Architecture:** Alle drei Ansichten rechnen im Browser aus den ohnehin geladenen Buchungen — keine neue Abfrage, keine Sicht in der Datenbank. Neu ist nur der Schreibweg für `kontostaende`, die Tabelle steht seit Etappe 1.

---

## Kontext

**Der Saldo-Abgleich braucht einen Anker.** Verglichen wird nicht gegen Null, sondern gegen den ersten erfassten Kontostand: `berechnet(stichtag) = stand(anker) + Summe aller Buchungen nach dem Anker bis zum Stichtag`. Der Anker selbst hat damit immer die Differenz 0 — das ist kein Fehler, sondern die Definition.

**Sphären sind eine Steuerfrage, keine Programmierfrage.** Nur Buchungen mit eigenem Kostenbeleg tragen eine Sphäre. Für Buchungen, die an einer Rechnung oder einem Antrag hängen, wird **keine** Sphäre geraten; sie erscheinen in der Auswertung als eigene Zeilen („Einnahmen aus Rechnungen", „Auszahlungen an Ehrenamtliche"). Die Zuordnung dieser Blöcke gehört in die Steuererklärung, nicht in dieses Portal.

---

## Task 1: Kontostände in app.js

- [ ] `kassenbuchStaende()` — liest `kontostaende`, aufsteigend nach Stichtag.
- [ ] `kassenbuchStandSetzen({ konto_iban, stichtag, stand_cents, notiz })` — `upsert` auf `(konto_iban, stichtag)`, damit ein zweiter Eintrag zum selben Tag den ersten ersetzt statt zu doppeln.
- [ ] `kassenbuchStandLoeschen(id)`.
- [ ] `node --check app.js`, Commit.

## Task 2: Auswertung und Export (Test zuerst)

- [ ] **Test** `scripts/pruefe-kassenbuch-auswertung.mjs`: `auswertung(buchungen)` summiert je Kostenart und je Sphäre, trennt Einnahmen aus Rechnungen von Auszahlungen an Anträge, und zählt Buchungen ohne Beleg. Geprüft wird außerdem, dass `saldoReihe(buchungen, staende)` je Stichtag den berechneten Stand liefert und der Anker die Differenz 0 hat.
- [ ] **Umsetzung** in `kassenbuch-auswertung.js` (ohne DOM, ohne Supabase).
- [ ] CSV-Export im selben Modul: `alsCsv(buchungen)` — Semikolon, deutsche Beträge, Spalten Datum, Gegenpartei, Zweck, Betrag, Zuordnung, Kostenart, Sphäre, Beleg-Link.
- [ ] Test grün, Commit.

## Task 3: Oberfläche

- [ ] Karte „Auswertung <Jahr>": Einnahmen, Auszahlungen, Kosten je Kostenart mit Sphäre.
- [ ] Karte „Saldo-Abgleich": Tabelle der Stichtage mit Stand laut Konto, berechnetem Stand und Differenz; Formular zum Eintragen eines Stichtags.
- [ ] Knopf „Als CSV exportieren" — erzeugt die Datei per Blob-Download, ohne Server.
- [ ] Cache-Kennung hochzählen, Syntaxprüfung, Commit, Push.

## Task 4: Abnahme

- [ ] Anfangsbestand 0,00 € zum 18.08.2026 eintragen (Tag vor der ersten Buchung).
- [ ] Kontostand zum 21.09.2026 eintragen und prüfen, ob die Differenz 0,00 € ist. Erwartet: berechnet 853,28 €.
- [ ] CSV exportieren und die Zeilenzahl prüfen.
