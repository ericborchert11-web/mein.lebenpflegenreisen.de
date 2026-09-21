# Kassenbuch Etappe 2 — Zuordnung

**Goal:** Jede importierte Buchung bekommt ihren Beleg: entweder einen Vorgang, den das Portal schon kennt (Rechnung, Antrag), oder einen eigenen Kostenbeleg mit Kostenart, Sphäre und Drive-Link. Was offen bleibt, ist als Arbeitsvorrat sichtbar.

**Architecture:** Die Erkennungsregeln liegen als reine Funktionen in `kassenbuch-zuordnung.js` — ohne DOM, ohne Supabase, damit sie per Node-Skript prüfbar sind. Die Seite lädt Rechnungen und Anträge einmal, schlägt vor, und schreibt erst auf Klick. Geschrieben wird über `LPR.kassenbuchZuordnen`, das genau eine der drei Zuordnungsarten setzt und die jeweils anderen Felder leert.

**Spec:** `docs/superpowers/specs/2026-09-21-kassenbuch-design.md`

---

## Kontext

**Die Beträge stehen in zwei Einheiten.** `bank_buchungen.betrag_cents` und `invoices.total_cents` sind Cent (int), `claims.amount` ist Euro (numeric). Wer das verwechselt, ordnet 150 Cent einem 150-Euro-Antrag zu.

**Vorzeichen:** Eine Einnahme ist auf dem Konto positiv, eine Auszahlung negativ. Rechnungsbeträge stehen positiv (Gutschriften negativ), Antragsbeträge immer positiv. Verglichen wird deshalb der Betrag **ohne Vorzeichen**.

**`escapeHtml` per `textContent → innerHTML` escapt keine Anführungszeichen.** Sobald ein Wert in `value="…"` landet, müssen `"` und `'` mit ersetzt werden.

**Ein `LPR.showToast` aus einem offenen `<dialog>` liegt unter dem Backdrop** und ist unsichtbar. Meldungen gehören in den Dialog.

---

## Task 1: Erkennungsregeln (Test zuerst)

**Files:** Neu: `kassenbuch-zuordnung.js`, `scripts/pruefe-kassenbuch-zuordnung.mjs`

- [ ] **Schritt 1: Test schreiben.** Geprüft wird an erfundenen Daten:
  1. `RE-2026-0014` im Zweck und Betrag passt → Vorschlag auf diese Rechnung.
  2. Nummer gefunden, Betrag weicht ab → **kein** Vorschlag, sondern Hinweis „Betrag weicht ab".
  3. `Antrag 96A9D0D7` → Antrag über die ersten acht Zeichen der ID, Betragsvergleich Euro gegen Cent.
  4. `LPR-AZB-2026-0015` → Antrag über die Belegnummer.
  5. Auszahlung (−150,00) gegen Antrag über 150 € → passt trotz Vorzeichen.
  6. Kein Treffer → `null`, ohne Ausnahme.
  7. Zwei Anträge mit demselben ID-Präfix → kein Vorschlag (mehrdeutig), statt zu raten.
- [ ] **Schritt 2: Test laufen lassen, Fehlschlag sehen.**
- [ ] **Schritt 3: `kassenbuch-zuordnung.js` schreiben** mit `vorschlagFuer(buchung, { rechnungen, antraege })` und der Kostenart-Liste samt Sphären-Vorschlag.
- [ ] **Schritt 4: Test laufen lassen, bestehen sehen.**
- [ ] **Schritt 5: Commit.**

## Task 2: Schreibweg in app.js

**Files:** Ändern: `app.js`

- [ ] `kassenbuchZuordnen(id, zuordnung)` — setzt genau eine Art und leert die anderen Felder, damit nie zwei Zuordnungen nebeneinander stehen. Drei Formen: `{invoice_id}`, `{claim_id}`, `{kostenart, sphaere, beleg_url, notiz}`, dazu `{}` zum Lösen.
- [ ] `kassenbuchVorgaenge()` — lädt Rechnungen und Anträge in der schmalen Form, die die Zuordnung braucht (Nummer, Betrag, Name, Datum).
- [ ] `node --check app.js`, Commit.

## Task 3: Oberfläche

**Files:** Ändern: `admin-kassenbuch.html`

- [ ] Spalte „Beleg" in der Liste: Rechnungsnummer, Antragsnummer, Kostenart — oder „offen".
- [ ] Kopfzeile um den Arbeitsvorrat ergänzen: „N ohne Zuordnung · M ohne Beleg".
- [ ] Filter „alle / offen / zugeordnet".
- [ ] Klick auf eine Zeile öffnet einen `<dialog>` mit dem Vorschlag oben und den drei Wegen darunter.
- [ ] Knopf „Vorschläge übernehmen": wendet alle eindeutigen Treffer auf einmal an und meldet die Zahl.
- [ ] Cache-Kennung hochzählen, Inline-Skript syntaktisch prüfen, Commit.

## Task 4: Abnahme

- [ ] Push, dann im Browser: „Vorschläge übernehmen" auf den 31 Buchungen. Erwartet sind die 19 Anträge mit ID im Zweck, die drei mit Belegnummer und die Rechnungen — nicht aber die sieben Auslagen ohne Vorgang.
- [ ] Eine Buchung von Hand als Kostenbeleg erfassen und nach dem Neuladen wiederfinden.
