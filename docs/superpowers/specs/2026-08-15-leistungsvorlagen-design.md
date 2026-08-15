# Leistungsvorlagen für die Rechnungsstellung — Design

**Stand:** 2026-08-15
**Baut auf:** `2026-08-15-rechnungsstellung-design.md` (Etappe 1, live seit 2026-08-15)

## Das Problem

Die Positionen einer Rechnung sind schon heute frei eingebbar: Menge,
Bezeichnung, Zeitraum und Einzelpreis. Der Verein rechnet aber nicht nur
Sitzwachen ab, und jede wiederkehrende Leistung wird derzeit jedes Mal neu
getippt — mit dem Risiko, dass dieselbe Leistung mal „Sitzwache Nacht" und mal
„Nachtsitzwache" heißt und der Preis von Hand nachgeschlagen werden muss.

Der einzige gespeicherte Preis ist `billing_recipients.shift_price_cents`, der
Sonderpreis je Sitzwachen-Schicht eines Empfängers. Er löst ein anderes Problem
und bleibt unverändert.

Gesucht ist ein **Leistungskatalog**: frei benannte Positionen, die einmal
angelegt und danach in jede Rechnung eingefügt werden können.

## Entscheidungen

Von Eric am 2026-08-15 freigegeben:

| Frage | Entscheidung |
|---|---|
| Was ist eine Vorlage? | Eine **einzelne Position**, kein ganzes Rechnungsmuster. Mehrere Vorlagen lassen sich in einer Rechnung kombinieren. |
| Preise je Empfänger? | Nein. Eine Vorlage hat **einen** Standardpreis; er ist beim Einfügen nur ein Vorschlag und frei überschreibbar. |
| Wo wird gepflegt? | **Im Rechnungseditor**, kein neuer Menüpunkt und keine eigene Seite. |
| Welche Felder? | **Bezeichnung und Einzelpreis.** Menge und Zeitraum wechseln je Rechnung und bleiben Handarbeit. |
| Speicherung | **Eigene Tabelle** in Supabase, board-only. Nicht aus alten Rechnungen abgeleitet, nicht im Browser. |

Bewusst *nicht* Teil dieser Etappe: Kategorien oder Sortierung des Katalogs,
Mengenrabatte, Preishistorie, Import aus bestehenden Rechnungen.

## Datenmodell

```
public.invoice_item_templates
  id                uuid         Primaerschluessel, gen_random_uuid()
  name              text         nicht leer; steht spaeter als Bezeichnung auf der Rechnung
  unit_price_cents  int          Einzelpreis in Cent, wie ueberall in der Rechnungsstellung
  created_at        timestamptz  default now()
```

Dazu ein eindeutiger Index auf `lower(name)`. Er ist die technische Form der
Zusage „ein erneutes Sichern unter demselben Namen aktualisiert den Preis,
statt eine zweite Zeile anzulegen".

RLS ist an, mit **einer** Policy `for all to authenticated using (is_board())
with check (is_board())` — identisch zu `billing_recipients`. Ehrenamtliche und
Kliniken sehen den Katalog nicht.

Kein `active`-Flag: an einer Vorlage hängt nichts. Die Positionen auf Rechnungen
sind Kopien, nicht Verweise. Eine Vorlage darf deshalb hart gelöscht werden,
ohne dass eine bestehende Rechnung sich ändert.

## API in `app.js` (Block D)

Drei Funktionen, im Stil der übrigen Block-D-Aufrufe (`{ ok, … }` statt
Exceptions):

- `listItemTemplates()` — alle Vorlagen, alphabetisch nach `name`.
- `saveItemTemplate({ name, unit_price_cents })` — legt an oder aktualisiert den
  Preis, wenn der Name (unabhängig von Groß-/Kleinschreibung) schon existiert.
  Gibt zurück, welcher der beiden Fälle eingetreten ist, damit die Oberfläche
  „gesichert" von „aktualisiert" unterscheiden kann.
- `deleteItemTemplate(id)`.

Eine Falle für den Implementierungsplan: `upsert` von supabase-js kann nur auf
echte Spalten auflösen, nicht auf den Ausdruck `lower(name)`. `saveItemTemplate`
sucht deshalb erst per `ilike` nach dem Namen und entscheidet dann zwischen
`update` und `insert`. Der eindeutige Index bleibt trotzdem nötig — er ist die
Absicherung gegen zwei gleichzeitige Speicherversuche, nicht der Weg dorthin.

## Oberfläche — `rechnung.html`

Alles Folgende gilt **nur im Entwurf**. Ab `issued` verschwindet der Editor
ohnehin; festgeschriebene Rechnungen sind unberührt.

**Einfügen.** Über der Positionstabelle ein Dropdown *Vorlage einfügen …*,
Einträge in der Form „Sitzwache Nachtschicht — 200,00 €". Eine Auswahl hängt
eine neue Position an: Menge 1, Bezeichnung und Einzelpreis aus der Vorlage,
Zeitraum leer. Danach ist die Zeile eine ganz normale Position — die Vorlage ist
ein Vorschlag, keine Bindung. Das Dropdown springt auf den Platzhalter zurück.

**Sichern.** An jeder Positionszeile neben dem × ein zweiter kleiner Knopf
*Als Vorlage sichern*. Er nimmt Bezeichnung und Einzelpreis der Zeile und fragt
nach dem Namen, vorbelegt mit der Bezeichnung. Ist die Bezeichnung leer, weist
ein Hinweis darauf hin, statt eine namenlose Vorlage anzulegen. Existiert der
Name bereits, wird der Preis aktualisiert; die Rückmeldung lautet dann
„Vorlage aktualisiert" statt „Vorlage gesichert".

**Pflegen.** Ein `<select>` kann keine Löschknöpfe enthalten. Daneben steht
deshalb ein unauffälliger Knopf *Vorlagen …*, der einen Dialog öffnet: Liste
aller Vorlagen, Preis je Zeile änderbar, Löschen je Zeile. Das ist die gesamte
Verwaltung — kein Menüpunkt, keine eigene Seite.

## Was sich nicht ändert

- `billing_recipients.shift_price_cents` bleibt. Er ist der empfängerspezifische
  Sonderpreis und wird für die Sitzwachen-Sammelrechnung in Etappe 2 gebraucht.
- Beleg, Druck-CSS, Nummernkreis, Festschreiben und Storno bleiben unangetastet.
- Die Positionen selbst behalten ihre Struktur; es kommt keine Spalte hinzu, die
  auf eine Vorlage verweist.

## Verifikation

Das Repo hat keine Testsuite (statisches HTML auf GitHub Pages). Wie in
Etappe 1 gilt deshalb:

1. **SQL-Test**, fail-first im Supabase-SQL-Editor: Tabelle existiert, RLS ist
   an, genau eine board-Policy; zweimaliges Sichern desselben Namens ergibt eine
   Zeile mit dem neuen Preis; unterschiedliche Groß-/Kleinschreibung gilt als
   derselbe Name.
2. **Konsolen-Prüfblock** für `listItemTemplates`, `saveItemTemplate`
   (beide Fälle) und `deleteItemTemplate`.
3. **Klickpfad** im Editor: Position tippen → als Vorlage sichern → neue
   Rechnung → einfügen → Menge und Zeitraum ergänzen → Preis überschreiben →
   festschreiben. Die festgeschriebene Rechnung zeigt die überschriebenen Werte,
   nicht die der Vorlage.
4. **Gegenprobe** als Ehrenamt: `invoice_item_templates` liefert ein leeres
   Array, Schreiben scheitert an der Policy.

## Nicht in dieser Etappe

Sammelrechnung aus Sitzwachen (`invoice_bookings`, Doppelabrechnungsschutz),
Familien- und Reiserechnungen, Drive-Upload, E-Mail-Versand.
