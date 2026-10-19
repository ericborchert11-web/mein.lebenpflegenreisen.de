# Rechnungen und Zeitnachweise automatisch in Google Drive — Design

Stand 19.10.2026, mit Eric abgestimmt (Weg A: Google-Skript im Konto des
Vorstands holt ab). Zugangsdetails (Schlüssel, Rechte, Tests) stehen lokal unter
`sql/` und `functions/`, nicht hier (öffentliches Repo).

## Ziel

Jede festgeschriebene Rechnung liegt als PDF in Google Drive, bei
Klinik-Empfängern mit Zeitnachweis auch der Zeitnachweis. Ohne Handarbeit, mit
sichtbarer Kontrolle im Portal.

## Entscheidungen (Eric)

- **Alle Rechnungen**, auch Privatkunden und Stornos. Heute entsteht ein PDF nur
  beim Mailversand an Sana/JVK.
- **Weg A:** Ein Google-Apps-Skript im Drive-Konto des Vorstands fragt alle
  15 Minuten im Portal nach neuen Dateien. Kein Google-Cloud-Projekt, kein
  Dienstkonto; die bestehenden Ordner im eigenen Drive bleiben nutzbar.
- **Ordner:**

  | Empfänger | Zielordner | Unterordner |
  |---|---|---|
  | Sana | `Kooperationspartner › 001 Sana › 001 Rechnung & Zeitnachweise` | `MM/JJ › KWnn` |
  | JVK | `Kooperationspartner › 002 JVK › 03 Rechnungen & Zeitnachweise` | `MM/JJ` |
  | alle anderen | `LPR – Vereinsablage › 07 Rechnungen › Ausgangsrechnungen` | `JJJJ` |

  Rechnungen, die in einem Klinikordner liegen, bekommen zusätzlich eine
  Verknüpfung in `Ausgangsrechnungen › JJJJ`. Dort liegen damit alle
  Ausgangsrechnungen eines Jahres beisammen.

## Dateinamen

- Rechnung: `RE-2026-0024 Sana Kliniken Berlin-Brandenburg GmbH.pdf`
- Zeitnachweis: `RE-2026-0024 Zeitnachweis.pdf` (beim Scan die Original-Endung)

## Bausteine

**1. PDF beim Festschreiben (rechnung.html).** Nach `issue_invoice` erzeugt die
Seite das Rechnungs-PDF (wie heute für den Versand), bei digitalem Zeitnachweis
auch dessen PDF, legt beides im privaten Bucket ab und meldet es als
**Ablage-Zeile** an. Beim Papier-Nachweis wird der vorhandene Scan angemeldet.
Der Mailversand verwendet danach dieselben Dateien; nichts wird doppelt
erzeugt.

**2. Ablage-Zeile (neue Tabelle `rechnung_ablage`).** Je Rechnung und Art
(`rechnung` / `zeitnachweis`) eine Zeile: Pfad im Bucket, angelegt am, Drive-Datei
und Link, abgelegt am, Versuche, letzter Fehler. Anmelden nur per RPC durch den
Vorstand und nur für festgeschriebene Rechnungen.

**3. Ordner je Empfänger.** `billing_recipients` bekommt die Drive-Ordner-ID und
die Unterordner-Art (`monat_kw` / `monat` / `jahr`). Leer = Standardordner
`Ausgangsrechnungen` mit `jahr`. Ein neuer Kooperationspartner braucht damit
keine Programmänderung.

**4. Abholstelle (Edge Function `drive-ablage`).** Nur für das Skript, mit
eigenem Schlüssel. Drei Aktionen: offene Dateien auflisten (mit kurzlebigem
Download-Link, Zielordner, Unterordner, Dateiname), als abgelegt melden, Fehler
melden. Kann sonst nichts lesen oder ändern.

**5. Google-Apps-Skript.** Läuft alle 15 Minuten als Vorstandskonto: holt die
Liste, legt Unterordner bei Bedarf an, lädt die Datei herunter, legt sie ab
(gibt es den Namen im Zielordner schon, wird die vorhandene Datei übernommen
statt einer zweiten), setzt die Verknüpfung und meldet zurück.

**Bezugsdatum für Unterordner:** `monat_kw` nimmt den Montag der Woche von
`service_to` (Wochenrechnung KW 42 → `10/26 › KW42`, auch wenn Nachträge
`service_from` nach vorne ziehen). `monat` nimmt `service_to`. `jahr` nimmt das
Rechnungsdatum. Fehlt der Leistungszeitraum, gilt das Rechnungsdatum.

## Kontrolle im Portal

- **Rechnung:** „In Drive abgelegt am … · öffnen“, „wartet auf Ablage“ oder nach
  drei Fehlversuchen der Fehlergrund.
- **PDF fehlt** (Browser beim Festschreiben geschlossen): Die Rechnung zeigt
  „PDF fehlt – jetzt erzeugen“, die Rechnungsliste zählt solche Rechnungen.

## Altbestand

Einmalig: Für bereits versandte Rechnungen werden die versandten PDFs
angemeldet (genau die verschickte Fassung). Für alle übrigen festgeschriebenen
Rechnungen erzeugt die Seite das PDF über denselben Knopf. Von Hand abgelegte
Dateien in Drive bleiben unberührt.

## Fehlerfälle

- Drive oder Portal nicht erreichbar: Zeile bleibt offen, nächster Lauf
  versucht es erneut.
- Rückmeldung nach dem Ablegen geht verloren: Der nächste Lauf findet die Datei
  über den Namen im Zielordner und meldet sie ohne Duplikat.
- Ordner-ID falsch oder ohne Zugriff: Fehler an der Rechnung sichtbar.

## Prüfung

- SQL-Test (DO-Block mit absichtlichem `raise exception 'TEST BESTANDEN…'`):
  Anmelden nur festgeschrieben, nur Vorstand, Pfad zur Rechnung passend, keine
  Doppelzeile; Abholstelle sieht nur offene Zeilen.
- Reine Logik (Dateiname, Unterordner) DOM-frei mit Node-Prüfskript.
- Abnahme: eine Rechnung festschreiben, nach spätestens 15 Minuten liegt sie im
  richtigen Ordner, die Rechnung zeigt den Drive-Link.
