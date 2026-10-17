# Vereinsauslagen (Auslagen ohne Reise-Anmeldung) — Design

Stand 17.10.2026, mit Eric abgestimmt. Rechte, Speicher-Policies und Tests
stehen lokal unter `sql/`, nicht hier (öffentliches Repo).

## Anlass

Eine Auslage hängt heute zwingend an einer bestätigten Reise-Anmeldung
(`claims_source_chk`). Ausgaben, die jemand für den Verein vorstreckt, ohne
selbst auf der Reise angemeldet zu sein, lassen sich deshalb nicht erfassen:
Flixbus-Tickets, die der Vorstand für eine ganze Reisegruppe bucht, Notar,
Versicherung, Porto, Material.

## Entscheidungen (Eric)

- **Empfänger:** jedes Mitglied, nicht nur der Vorstand.
- **Zwei Stufen.** Stufe 1: der Vorstand erfasst. Stufe 2: Mitglieder
  beantragen selbst unter „Mein Bereich" (eigene Plan-Datei, später).
- **Reise optional.** Eine Vereinsauslage kann auf eine Reise verweisen, ohne
  dass die Person dort angemeldet ist.
- **Beleg-Upload freiwillig.** Ohne Beleg lässt sich speichern, die Auslage
  trägt dann sichtbar „Beleg fehlt".
- **Umsetzung als weitere Herkunft in `claims`** (wie der Einarbeitungstag),
  keine eigene Tabelle. Freigabe, Zahlungsanweisung, Belegnummer,
  eingefrorener Auszahlungsbeleg und Kassenbuch-Zuordnung bleiben dieselben.

## Datenmodell (Stufe 1)

- `claims.source_type` bekommt den Wert **`verein`**. Erlaubt nur zusammen mit
  `kind = 'auslage'`, ohne `trip_signup_id` und ohne `booking_id`.
- Neue Spalte **`claims.trip_id`** (optional, Verweis auf `trips`). Nur bei
  `source_type = 'verein'` erlaubt.
- `auslage_art` ist bei Vereinsauslagen immer `beleg` (Erstattung des
  tatsächlich Gezahlten, keine Pauschale).
- Neue Spalte **`claims.erfasst_von`** (Profil, Vorbelegung: wer einfügt). Damit
  sieht die Kassenprüfung, wenn Empfänger und Erfasser dieselbe Person sind.
  Ein Vier-Augen-Prinzip kann das Portal nicht erzwingen: es gibt nur ein
  Vorstandskonto.
- **Privater Speicher `auslagen-belege`**, Ablage je Antrag unter
  `<claim-id>/`. PDF, JPEG, PNG, HEIC, höchstens 10 MB je Datei. Lesen:
  Vorstand und Kassenprüfung. Ablegen: Vorstand. Löschen: Vorstand, solange
  der Antrag nicht ausgezahlt ist.
- Die Antrags-ID wird im Browser erzeugt, die Belege werden **vor** dem
  Einfügen des Antrags hochgeladen. Der Webhook verschickt die
  Zahlungsanweisung beim Einfügen; er soll die Belege dann schon sehen.

## Oberfläche

**`admin-auszahlungen.html`, Dialog „Auslage erfassen":**
- Neue Art **„Ausgabe für den Verein"** neben „Anreise" und „Gegen Beleg".
- Bei dieser Art: Person aus **allen freigegebenen Mitgliedern**, Reise
  optional („— keine —"), Bezeichnung, Betrag, Datum von/bis (vorbelegt mit
  der Reise, sonst heute), Belege (mehrere Dateien), Anmerkung.
- Liste: Herkunft **„Vereinsauslage"** als eigener Filterwert. Bei Auslagen
  gegen Beleg eine Spalte bzw. ein Knopf **„Belege (n)"**; bei null steht
  „Beleg fehlt". Der Knopf öffnet die Belege (signierte Links, 5 Minuten),
  erlaubt weitere hochzuladen und vor der Auszahlung einzelne zu löschen. Das
  gilt auch für die bisherigen Reise-Auslagen gegen Beleg.

**`abrechnung.html` (Mitglied):** Vereinsauslagen erscheinen mit eigenem
Abzeichen „Auslage" und dem Titel „Ausgabe für den Verein" (bzw. mit Reise).

**`pruefung.html` (Kassenprüfung):** Bei Auslagen ein Link auf die Belege.

## Mails und Beleg

- **Zahlungsanweisung / Eingangsmeldung:** Tätigkeit heißt „Ausgabe für den
  Verein" (mit Reise in Klammern). Bei Auslagen gegen Beleg zusätzlich die
  Zeile „Belege im Portal: n" oder fett „Beleg fehlt".
- **Auszahlungsbeleg:** „Erstattete Auslagen", Untertitel „Ausgabe für den
  Verein", optional „Reise „…"". Steuerhinweis wie bei allen Auslagen
  (§ 3 Nr. 50 EStG, zählt nicht gegen den Freibetrag).

## Was nicht dazugehört

- Antrag durch das Mitglied selbst (Stufe 2).
- Abgleich Fahrtkosten Rechnung ↔ Erstattung je Reise (später, die Daten
  dafür entstehen jetzt über `trip_id`).
- Umbau der bestehenden Reise-Auslagen.

## Tests

- SQL: Struktur und Regeln als grüne Ergebnistabelle (Constraint-Texte,
  Spalten, Bucket, Policies), Rechte mit Rollenwechsel und Selbstprüfung.
- Node: `scripts/pruefe-beleg-vereinsauslage.mjs` prüft den Beleg einer
  Vereinsauslage (Titel, Untertitel, Reise, kein Freibetragsbalken).
- Browser-Abnahme durch Eric: Erfassen mit Belegen, Mail, Auszahlung, Beleg.
