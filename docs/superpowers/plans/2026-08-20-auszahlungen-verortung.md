# Anträge verorten — Umsetzungsplan

> **Für agentische Arbeit:** Aufgabe für Aufgabe, Prüfung je Aufgabe.

**Ziel:** Ein eigener Bereich „Auszahlungen" für alle Anträge; Sitzwachen und
Reisen zeigen nur noch ihren eigenen Abrechnungsstand und verlinken dorthin.

**Spec:** `docs/superpowers/specs/2026-08-20-auszahlungen-verortung-design.md`

**Konventionen:** `functions/` ist gitignored (Deploy von Hand im Dashboard);
kein Testframework — geprüft wird mit Node-Skripten im Scratchpad, die die
Funktionen per Textsuche aus dem echten HTML ziehen und mit `new Function`
ausführen (Muster: `nachbesserung-test.mjs`, `auslage-test.mjs`).

---

### Task 1: Neue Seite `admin-auszahlungen.html`

**Dateien:** `admin-auszahlungen.html` (neu), `admin-sitzwachen.html`, `layout.js`

- [ ] **Schritt 1: Bestand aufnehmen.** Alle IDs, Funktionen und CSS-Regeln
  auflisten, die zum Anträge-Teil gehören (Tab-Markup, Belegdialog, Auslagen-
  Dialog, `renderClaims`, `onClaimAction`, `mailTeile`, `mailSpalteHtml`,
  `mailNachversandNoetig`, `claimArtZelle`, `yearSum`, `blOeffnen`, `au*`).
  Die Liste ist der Prüfmaßstab für Schritt 5.

- [ ] **Schritt 2: Neue Seite anlegen** mit demselben Gerüst wie
  `admin-sitzwachen.html` (Kopf, `LPR_Layout.init`, Rollenprüfung `admin`,
  Login-Hinweis, `shared.css`). Titel „Auszahlungen", Überschrift „Auszahlungen",
  darunter ein Satz, was hier passiert.

- [ ] **Schritt 3: Anträge-Teil hierher verschieben** — Markup, Dialoge, JS,
  CSS. Wörtlich übernehmen, nichts umbenennen; der Umzug soll nachvollziehbar
  bleiben.

- [ ] **Schritt 4: Zwei Filter ergänzen.** Herkunft (alle / Reisebegleitung /
  Sitzwache / Auslage — aus `kind` und `source_type`) und Status (alle /
  eingereicht / freigegeben / ausgezahlt / abgelehnt). Vorbelegung: alle
  Herkünfte, Status „offen" im Sinne von eingereicht + freigegeben, weil das die
  Arbeitsliste ist.

- [ ] **Schritt 5: Alte Seite aufräumen.** Tab „Anträge" und alles aus Schritt 1
  aus `admin-sitzwachen.html` entfernen. Danach per grep belegen, dass keine der
  Kennungen dort mehr vorkommt und die Seite ohne sie syntaktisch heil ist.

- [ ] **Schritt 6: Menü.** In `layout.js` „Auszahlungen" neben „Pauschalen"
  eintragen, mit demselben board-only-Verhalten.

- [ ] **Schritt 7: Prüfen.** Inline-Skripte beider Seiten mit `node --check`;
  Prüfskript, das `renderClaims` und die Filterlogik aus der **neuen** Datei
  zieht und mit gemischten Testdaten aufruft (Reise-Pauschale, Sitzwachen-
  Pauschale, Auslage/Anreise, Auslage/Beleg, abgelehnt): Filter „Sitzwache"
  zeigt genau die Sitzwachen-Zeile, Filter „Auslage" genau die zwei Auslagen,
  Status „offen" blendet ausgezahlt und abgelehnt aus. Ausgabe „5/5 bestanden".
  Dazu alle vorhandenen Skripte laufen lassen.

- [ ] **Schritt 8: Committen**

```bash
git add admin-auszahlungen.html admin-sitzwachen.html layout.js
git commit -m "refactor(antraege): eigener Bereich Auszahlungen"
```

---

### Task 2: Abrechnungsstand in der Sitzwachen-Verwaltung

**Dateien:** `admin-sitzwachen.html`, `app.js`

- [ ] **Schritt 1:** Die Buchungsliste lädt zusätzlich die Anträge zu diesen
  Buchungen (`claims` mit `booking_id` in der Liste der angezeigten Buchungen) —
  eine Abfrage für alle, nicht eine je Zeile.

- [ ] **Schritt 2:** Je abgeschlossenem Dienst eine Kennzeichnung: „ausgezahlt"
  (mit Datum), „beantragt", „freigegeben" oder „offen". Nur bei
  `status = 'completed'` sinnvoll — vorher gibt es nichts abzurechnen.

- [ ] **Schritt 3:** Die Kennzeichnung verlinkt auf `admin-auszahlungen.html`.
  Kein Bearbeiten hier.

- [ ] **Schritt 4: Prüfen** mit einem Skript, das die Zuordnungsfunktion am
  echten Code aufruft: Buchung mit ausgezahltem Antrag → „ausgezahlt"; mit
  eingereichtem → „beantragt"; ohne Antrag → „offen"; nicht abgeschlossene
  Buchung → keine Kennzeichnung. Ausgabe „4/4 bestanden".

- [ ] **Schritt 5: Committen**

```bash
git add admin-sitzwachen.html app.js
git commit -m "feat(sitzwachen): Abrechnungsstand je Dienst"
```

---

### Task 3: Auslagen und Link in der Reisen-Verwaltung

**Dateien:** `admin-reisen.html`

- [ ] **Schritt 1:** Die Zeile je Anmeldung zeigt heute „beantragt/abgerechnet"
  und die Freibetragsauslastung. Ergänzen: erfasste **Auslagen** zu dieser Reise
  und Person, getrennt ausgewiesen und **nicht** in die Freibetragszahl gerechnet.

- [ ] **Schritt 2:** Link auf `admin-auszahlungen.html` je Anmeldung.

- [ ] **Schritt 3: Prüfen:** Skript, das die Berechnung der Zeile am echten Code
  aufruft — eine Person mit 600 € Pauschale und 100 € Auslage muss „600,00 €
  abgerechnet" und „100,00 € Auslagen" getrennt zeigen, nicht 700 €.

- [ ] **Schritt 4: Committen**

```bash
git add admin-reisen.html
git commit -m "feat(reisen): Auslagen je Anmeldung sichtbar"
```

---

### Task 4: Links in den Mails

**Dateien:** `functions/claim-mails/index.ts` (außerhalb Git)

- [ ] **Schritt 1:** Alle Verweise auf `admin-sitzwachen.html` auf
  `admin-auszahlungen.html` umstellen (drei Mails).
- [ ] **Schritt 2:** Prüfskript ergänzen: keine der drei Mails enthält noch
  `admin-sitzwachen`, alle drei enthalten `admin-auszahlungen`.
- [ ] **Schritt 3:** `node scripts/vorlage-einbetten.mjs`, Datei in die
  Zwischenablage, im Dashboard deployen.

---

### Task 5: Durchsehen im Browser

- [ ] „Auszahlungen" öffnen: Liste vollständig, Filter greifen, Beleg lässt sich
  öffnen und drucken, „Auslage erfassen" funktioniert.
- [ ] „Sitzwachen" öffnen: kein Anträge-Tab mehr, Buchungen zeigen den
  Abrechnungsstand.
- [ ] „Reisen" öffnen: Auslagen sichtbar, Link führt zum Vorgang.
- [ ] Eine Mail auslösen (Nachversand) und den Link darin anklicken.
- [ ] Push nach `main`.
