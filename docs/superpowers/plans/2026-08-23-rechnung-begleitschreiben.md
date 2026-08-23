# Leistungsbeschreibung auf der Rechnung + Begleitschreiben — Umsetzungsplan

> **Für agentische Ausführung:** REQUIRED SUB-SKILL: superpowers:executing-plans.
> Schritte sind Checkboxen.

**Ziel:** Eine Rechnung, die der Empfänger ohne weitere Erklärung bei seiner
Pflegekasse einreichen kann — mit Betreff, Bezug auf den Kostenvoranschlag, einer
Beschreibung je Position und dem Hinweis, welche Belege beiliegen. Der briefliche
Teil (Anrede, Anlagenverzeichnis, Kassenhinweis) wandert in ein Begleitschreiben.

**Anlass:** RE-2026-0007 (Verhinderungspflege § 39 SGB XI, Sobotka/Koitzsch). Das
Portal druckt dort „Mietwagen inkl. Navigationsgerät · 193,79 €". Die Kasse prüft
aber, *wer* betreut wurde, *warum* Ersatzpflege nötig war und *warum* ein Mietwagen
erforderlich war. Diese Sätze existieren bereits — sie stehen bisher nur in einer
Vorlage außerhalb des Portals und werden von Hand nachgetragen.

---

## Die Trennlinie

Sie läuft funktional, nicht nach Textlänge.

**Auf die Rechnung**, weil die Kasse genau das prüft und § 14 Abs. 4 Nr. 5 UStG
„Art und Umfang der Leistung" auf der Rechnung selbst verlangt:

- Betreffzeile („Verhinderungspflege gem. § 39 SGB XI — begleitete Fahrt Berlin–…")
- Bezug auf den Kostenvoranschlag (Datum) im Kopf
- Beschreibung je Position (Fließtext)
- Nachweis-Hinweis je Position („Endabrechnung lt. beigefügten Belegen: …")

**Ins Begleitschreiben**, weil es kein Rechnungsbestandteil ist:

- Anschriftfeld und Anrede
- ein bis zwei Sätze zum Vorgang
- Anlagenverzeichnis (Mietwagen-, Tank-, Parkbelege, Fahrschein)
- Hinweis „zur Vorlage bei Ihrer Pflegekasse" und Ansprechpartner

Der Grund für die Aufteilung: bei der Kasse wird geheftet, kopiert und gescannt.
Was nur im Begleitschreiben steht, ist im Zweifel weg — die Rechnung muss allein
tragen. Umgekehrt gehört eine Anrede nicht auf einen Buchungsbeleg.

**Steuerhinweis bleibt § 4 Nr. 18 UStG** (Entscheidung Eric, 23.08.2026). Die
Vorlage außerhalb des Portals nennt § 19 UStG (Kleinunternehmer) — das ist ein
anderer Rechtsgrund und wird *nicht* übernommen. `tax_note` bleibt frei editierbar.

---

## Architektur

**Ein Druckvorgang, zwei Blätter.** Das Begleitschreiben wird in `rechnung.html`
mitgerendert und steht im Druck *vor* der Rechnung (`page-break-after: always`).
Grund: der Versand ist ein Vorgang. Zwei getrennte Dokumente heißen zwei
Druckdialoge, zwei PDFs und die reale Gefahr, dass eines fehlt. Wer nur die
Rechnung braucht — etwa für die Ablage —, nimmt das Häkchen heraus.

**Der Brieftext wird gespeichert, nicht generiert.** Er ist je Vorgang anders, und
was rausgegangen ist, muss zehn Jahre nachvollziehbar bleiben. Ein Textbaustein als
Vorbelegung beim ersten Öffnen ist Komfort, keine Wahrheitsquelle.

**Bestandsrechnungen bleiben unverändert.** Alle neuen Spalten sind NULL-bar ohne
Default (Ausnahme `mit_brief`, das braucht `false`). Eine Rechnung ohne die neuen
Felder druckt exakt wie heute.

**Nur im Entwurf editierbar**, wie alle anderen Rechnungsfelder auch. Für
RE-2026-0007 heißt das: über „Rechnung wieder öffnen" (Migration f vom 17.08.) in
den Entwurf zurück, Texte ergänzen, neu festschreiben. Die Rechnungsnummer bleibt.

**Auto-Fit nur für die Rechnung, nie für den Brief.** `druck-anpassen.js` skaliert
den Beleg; beim Brief würde derselbe Zoom die Anschrift aus dem Kuvertfenster
schieben (Faktor 0,92 heißt 3,6 mm zu hoch). Mit den Beschreibungen wird die
Rechnung länger; dass sie dann auf zwei Seiten geht, ist in Ordnung und kein Fehler
(unter Faktor 0,8 wird nicht gequetscht).

**Der Brieftext wird gespeichert, nicht bei jedem Öffnen neu erzeugt.** Die
Bausteine liefern die Vorbelegung, danach gilt, was in `invoices.brief` steht — was
rausgegangen ist, muss zehn Jahre nachvollziehbar bleiben.

---

## Dateien

- **Datenbank:** neue Migration, SQL steht in Etappe A (Eric führt sie im Dashboard aus)
- Ändern: `app.js` — `INVOICE_COLS`, Whitelist in `updateInvoiceDraft`,
  Feldliste in `saveInvoiceItems`, `listItemTemplates`/`saveItemTemplate`
- Ändern: `rechnung.html` — Editor (Betreff, KV-Datum, zwei Textfelder je Position,
  Brief-Block), `renderBeleg()`, neues `renderBrief()`, Druck-CSS
- Ändern: `druck-anpassen.js` — nur falls der Aufruf für zwei Blöcke etwas braucht;
  die Funktion ist bereits parametrisiert

---

## Etappe A — Datenbank

**Ziel:** Felder da, Altbestand unberührt.

- [ ] **Schritt 1:** SQL im Supabase-Dashboard ausführen (Eric). Es steht im Chat und
      hier in `docs/superpowers/specs/` nicht doppelt — eine Kopie, die niemand pflegt,
      ist schlimmer als keine.
- [ ] **Schritt 2:** Gegenprobe: `select` auf eine bestehende Rechnung; alle neuen
      Spalten NULL bzw. `mit_brief = false`, Beträge unverändert.
- [ ] **Schritt 3:** Rechnung im Portal öffnen — sie muss unverändert aussehen und
      drucken, obwohl die Spalten schon da sind.

**Spalten:**

| Tabelle | Spalte | Typ | Zweck |
|---|---|---|---|
| `invoices` | `betreff` | text | Betreffzeile über dem Einleitungstext |
| `invoices` | `kv_datum` | date | „Kostenvoranschlag vom" im Kopf |
| `invoices` | `mit_brief` | boolean not null default false | Begleitschreiben mitdrucken |
| `invoices` | `brief` | jsonb | Begleitschreiben-Baukasten: Kicker, Überschrift, Bausteine, Anlagen |
| `invoice_items` | `detail_text` | text | Beschreibung der Position |
| `invoice_items` | `nachweis_text` | text | „Endabrechnung lt. beigefügten Belegen: …" |
| `invoice_item_templates` | `detail_text` | text | Vorbelegung für wiederkehrende Positionen |

---

## Etappe B — Rechnung

**Ziel:** Betreff, KV-Bezug und die Positionstexte stehen auf dem Beleg.

- [x] **Schritt 1: `app.js`** — `INVOICE_COLS` um `betreff, kv_datum, mit_brief, brief` erweitern; dieselben Namen in die Whitelist von
      `updateInvoiceDraft`; `detail_text`/`nachweis_text` in die Zeilen von
      `saveInvoiceItems` und in das `select` der Positionen; `detail_text` in
      `listItemTemplates`/`saveItemTemplate`.
      **Falle:** PostgREST liefert nur, was in `select` steht — fehlt eine Spalte
      dort, ist sie im Browser still `undefined` und der Beleg druckt sie nie.
- [x] **Schritt 2: Editor** — Betreff und KV-Datum in den Kopfbereich; je Position
      zwei mehrzeilige Felder unter der Beschreibung. Die Positionstabelle wird
      dadurch hoch; die beiden Felder deshalb schmal (2 Zeilen) und mit
      Platzhaltertext, der zeigt, was gemeint ist.
- [x] **Schritt 3: `renderBeleg()`** — Betreff als eigene Zeile unter „Rechnung";
      KV-Datum als viertes Feld im Meta-Block, nur wenn gesetzt; `detail_text` unter
      der Beschreibung, `nachweis_text` darunter kursiv und kleiner. Alles nur
      rendern, wenn gefüllt — sonst sieht eine schlichte Rechnung anders aus als heute.
- [x] **Schritt 4: Nachmessen** — RE-2026-0006 (ohne neue Texte) muss unverändert
      auf einer Seite bleiben; RE-2026-0007 mit Texten gegen den Druck prüfen.

---

## Etappe C — Begleitschreiben-Baukasten

**Ziel:** Das Begleitschreiben entsteht im Portal aus Bausteinen, passt ins
Fensterkuvert und sieht aus wie die Website.

### Fensterkuvert zuerst — es setzt das Raster

DIN 5008 Form B, Kuvert DIN lang mit Fenster links. Die Maße sind nicht
Geschmackssache, sie entscheiden, ob die Anschrift im Fenster steht:

| Element | Position ab Blattkante |
|---|---|
| Anschriftfeld | 45 mm von oben, 20 mm von links, 85 × 45 mm |
| Rücksendeangabe (klein, einzeilig) | oberste Zeile im Anschriftfeld |
| Textspiegel | 25 mm links, 20 mm rechts |
| Informationsblock rechts (Rechnungs-Nr., Datum, Betrag, Frist) | ab 45 mm oben |
| Betreff/Überschrift | ab 98 mm |

**Falle:** `@page` hat oben 6 mm Rand (die Regel gegen Chromes Kopfzeilen). Alle
Positionen im Brief sind deshalb *6 mm kleiner* als die Blattmaße oben — der
Brief-Container beginnt an der Kante des Seitenkastens, nicht an der Blattkante.

**Der Brief wird nie gezoomt.** `druck-anpassen.js` bleibt für ihn aus: ein Faktor
von 0,92 verschiebt die Anschrift um 3,6 mm nach oben, und dann steht sie nicht
mehr im Fenster. Wird der Brief zu lang, wird er gekürzt — nicht gequetscht. Die
Rechnung dahinter wird weiterhin angepasst.

### Design

Wie auf der Website: Kicker in Grün, gesperrt und in Versalien; darunter die
Überschrift in Bricolage Grotesque, extrafett, dunkelgrün, mit **einem** Wort in
einem limettenen Kasten und kursiv.

- Kicker: `BEGLEITSCHREIBEN · RE-2026-0007`
- Überschrift: „*Mehr* als eine Rechnung." — Highlight auf „Mehr"
- Vorspann: „Mit Ihrer Überweisung ermöglichen Sie uns, mehr Gutes zu tun."

Beides im Baukasten änderbar; die Vorbelegung kommt aus dem Motto.

### Die Bausteine („klassischer Inhalt")

Jeder Baustein ist einzeln an-/abschaltbar und im Text änderbar. Vorbelegt wird aus
den Rechnungsdaten — Nummer, Betrag, Frist, Kostenvoranschlag, IBAN stehen schon da
und sollen nicht abgetippt werden.

| Baustein | Vorbelegung |
|---|---|
| Anrede | aus Ansprechpartner bzw. Empfängername |
| Dank / Einleitung | Rechnungsnummer, Betrag, Betreff |
| Abrechnungsgrundlage | Kostenvoranschlag vom …, Endabrechnung nach Belegen |
| Anlagen | Verzeichnis, eine Anlage je Zeile |
| Pflegekasse | Hinweis zur Vorlage bei der Kasse |
| Zahlung | Frist, IBAN, Verwendungszweck |
| Motto | „Mehr als eine Rechnung …" — der gemeinnützige Absatz |
| Rückfragen | Ansprechpartner mit Telefon und Mail |
| Grußformel | fest, mit Vorstand |

### Schritte

- [x] **Schritt 1: Baukasten-Definition** — Bausteine als Liste an einer Stelle
      (Reihenfolge, Vorgabetext, welche Rechnungsdaten er einsetzt). Nicht über die
      Datei verstreut: sonst weiß später niemand, welche Texte es gibt.
- [x] **Schritt 2: Editor** — Häkchen „Begleitschreiben", darunter je Baustein ein
      Schalter und ein Textfeld; Kicker und Überschrift als eigene Felder.
      Gespeichert wird in `invoices.brief` als jsonb.
- [x] **Schritt 3: `renderBrief()`** — Briefkopf, Rücksendeangabe, Anschriftfeld,
      Infoblock, Kicker, Überschrift mit Highlight, Bausteine, Anlagenliste,
      Grußformel, Fußzeile. Kein Steuerhinweis, keine Summen: der Brief ist kein Beleg.
- [x] **Schritt 4: Druck-CSS** — Brief nur bei `mit_brief`, danach
      `page-break-after: always`; Anschriftfeld absolut in Millimetern; kein Zoom.
- [x] **Schritt 5: Nachmessen** — headless drucken und die Anschrift gegen das
      Fenster prüfen (Position in mm aus dem PDF), Brief 1 Seite, Rechnung wie in B.

---

## Prüfung

Vanilla JS, kein Build, keine Testsuite. Geprüft wird deshalb zweistufig:

1. **Hier:** Druckmessung headless gegen Chrome (der Aufbau aus dem Scratchpad vom
   23.08. rendert Rechnung und Beleg aus den echten Repo-Dateien und zählt Seiten),
   dazu statische Kontrollen: Feldnamen gegen die Spaltenliste, keine doppelten IDs.
2. **Eric (offen):** eingeloggter Browser-Smoke an RE-2026-0007 — wieder öffnen, Texte
   ergänzen, festschreiben, drucken.

---

## Offen / bewusst nicht drin

- **Anschriftfeld auf der Rechnung** (DIN 5008, Fensterkuvert): bleibt beim
  bestehenden zweispaltigen Block Rechnungssteller/-empfänger. Das Fensterkuvert
  bedient das Begleitschreiben.
- **§ 19 vs. § 4 Nr. 18 UStG:** entschieden für § 4 Nr. 18. Die Frage, ob das für
  privat bezahlte Leistungen trägt, hängt an derselben Klärung wie beim
  Privatauftrag (§ 66 AO) und ist hier nicht Gegenstand.
- **Automatischer Vergleich mit dem Kostenvoranschlag** (die Zeile „geringfügige
  Abweichung gegenüber dem Kostenvoranschlag"): bleibt Freitext im `tax_note`- bzw.
  Einleitungsfeld. Ein gerechneter Abgleich bräuchte den Kostenvoranschlag als
  eigenen Datensatz — eigene Etappe, wenn überhaupt.
