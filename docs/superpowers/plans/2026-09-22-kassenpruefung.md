# Kassenprüfung — Zusatzrecht und Prüferansicht

**Goal:** Tina Klement kann sich mit ihrem vorhandenen Ehrenamtskonto anmelden und unter „Kassenprüfung" alle Finanzdaten des Vereins einsehen — Kassenbuch, Rechnungen, Auszahlungsanträge, Kontostände — ohne irgendetwas ändern zu können und ohne ihren Ehrenamtszugang zu verlieren.

**Architecture:** Kein neuer Rollenwert. Die Rollen (`volunteer`, `clinic`, `board`) schließen einander aus; Tina ist Ehrenamtliche mit eigenen Anträgen. Stattdessen ein Zusatzrecht `profiles.kassenpruefer` und eine Prüffunktion `is_kassenpruefer()`, die in reinen SELECT-Policies auf den Finanztabellen steht. Die Namen zu den Anträgen kommen über eine eng gefasste Sicht, nicht über ein Leserecht auf `profiles`.

---

## Kontext

**Keine Spalte in die Login-Abfrage.** `pruefeUndSetzeSession` liest ein festes Spaltenset aus `profiles`. Käme `kassenpruefer` dort hinein, wäre zwischen Push und Migration **jeder Login kaputt** — nicht nur die neue Seite. Das Recht wird deshalb per RPC abgefragt, nicht aus der Session gelesen.

**`a_profiles_spaltenschutz` ist eine Erlaubnisliste** und setzt Unerlaubtes still zurück. Eine neue Spalte steht nicht darin — das ist hier erwünscht (niemand kann sich das Recht selbst geben), bedeutet aber: **Gesetzt wird es nur im SQL-Editor**, und der Wert muss danach zurückgelesen werden.

**RLS begrenzt Zeilen, nicht Spalten.** Ein Leserecht auf `profiles` gäbe ihr alle 36 Spalten jeder Person. Deshalb die Sicht `v_pruefung_namen` mit genau zwei Spalten.

---

## Task 1: Migration

- [ ] Spalte `profiles.kassenpruefer boolean not null default false` mit Kommentar, warum es keine Rolle ist.
- [ ] `is_kassenpruefer()` als `stable security definer`, Ausführungsrecht nur für `authenticated`.
- [ ] Je eine **SELECT**-Policy auf `bank_buchungen`, `kontostaende`, `invoices`, `invoice_items`, `billing_recipients`, `claims`. Kein insert/update/delete.
- [ ] Sicht `v_pruefung_namen` (id, full_name), gefiltert auf `is_board() or is_kassenpruefer()`.
- [ ] Test: Funktion liefert für Tina `false` vor und `true` nach dem Setzen; Policies existieren; die Sicht gibt für einen Dritten nichts zurück.
- [ ] Recht für Tina setzen und **zurücklesen**.

## Task 2: app.js

- [ ] `pruefRecht()` — ruft `is_kassenpruefer()` per RPC, Ergebnis für die Sitzung gemerkt.
- [ ] `pruefungDaten()` — lädt Buchungen, Kontostände, Rechnungen, Anträge und Namen parallel. Kein Rollencheck im Frontend: was sie sehen darf, entscheidet RLS.
- [ ] Die Kassenbuch-Leser (`kassenbuchListe`, `kassenbuchStaende`) dürfen nicht mehr auf `role === 'admin'` bestehen, sonst sperrt das Frontend, was die Datenbank erlaubt.

## Task 3: Seite `pruefung.html`

- [ ] Nur lesen: keine Knöpfe zum Ändern, kein Dialog, kein Upload.
- [ ] Kassenbuch mit Kopfzahlen, Saldo-Abgleich und Belegspalte; Auswertung je Kostenart und Sphäre; CSV-Export.
- [ ] Rechnungen und Anträge je als Liste.
- [ ] Menüpunkt „Kassenprüfung" erscheint, wenn `pruefRecht()` wahr ist — und für den Vorstand immer.

## Task 4: Abnahme

- [ ] Als Vorstand: Seite lädt, Zahlen stimmen mit dem Kassenbuch überein.
- [ ] Gegenprobe mit einem Konto ohne das Recht: Seite verweigert, und die Abfragen liefern nichts.
- [ ] Tina meldet sich an und sieht die Seite.
