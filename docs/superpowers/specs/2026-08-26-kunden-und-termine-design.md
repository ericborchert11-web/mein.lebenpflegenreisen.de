# Kunden und Termine — Design

**Stand 26.08.2026.** Anlass ist ein wiederkehrender Fall: Eine Mitwirkende geht
am Samstagabend für eine Stunde zu einem Kunden. Der Termin soll im Portal
sichtbar sein wie eine Sitzwachenbuchung, und der Vorstand muss ihn einer
bestimmten Person zuteilen können.

Dieses Design baut auf
[Privatauftrag Sitzwache](2026-08-21-privatauftrag-sitzwache-design.md) auf und
erweitert es um zwei Dinge, die dort fehlen: **wiederkehrende Kunden als
Stammdaten** und **Einsätze außerhalb einer Klinik**.

## Der Vorbehalt, der über allem steht

Beim Privatauftrag steht bereits die Frage nach § 4 Nr. 18 UStG und § 66 AO
offen, zu klären vor der ersten Privatrechnung. Was hier beschrieben wird,
verschärft sie: nicht mehr ein einzelner privat gezahlter Klinikdienst, sondern
**wiederkehrende, bezahlte Termine bei festen Kunden zu Hause**. Das ähnelt einem
gewerblichen Betreuungsdienst mehr als einem Zweckbetrieb. Dazu kommt die Frage,
ob jemand, der regelmäßig nach Plan zu zahlenden Kunden fährt, noch
nebenberuflich ehrenamtlich im Sinne von § 3 Nr. 26a EStG tätig ist.

**Etappe 1 ist davon unberührt** — sie plant und zeigt, sie rechnet nicht ab.
Etappe 2 und 3 werden entworfen, aber erst nach einer steuerlichen Auskunft
gebaut.

## Die Entscheidung, die das Datenmodell trägt

Der Kunde ist **kein neuer Weg neben dem Auftrag**, sondern ein Stammsatz
darüber. Die Kette lautet:

    Kunde (Stammdaten)  →  Auftrag (ein Anlass)  →  Buchung (ein Termin)

Eine einmalige Anfrage ist ein Auftrag **ohne** Kunden — genau wie heute. Ein
Stammkunde ist ein Auftrag **mit** Kunden, und die Felder sind vorbelegt. Damit
funktioniert der gemischte Betrieb ohne Sonderfall, und die Bedingung in
`bookings` — genau eines von Klinikkonto und Auftrag — bleibt zweiwertig.

Die verworfene Alternative war, `bookings` eine dritte Möglichkeit zu geben
(Klinik, Auftrag **oder** Kunde). Sie hätte die Bedingung dreiwertig gemacht,
ohne etwas zu gewinnen. Die zweite verworfene Alternative war eine eigene
Tabelle `einsaetze`: sauber getrennt, aber die Mitwirkende hätte zwei Listen und
zwei Abläufe — und „wie eine Sitzwachenbuchung" wäre nachgebaut statt wirklich
dasselbe. Nachgebaute Abläufe laufen mit der Zeit auseinander.

## Datenmodell

**Neue Tabelle `kunden`.** Name, Adresse, **Bezirk**, Telefon, Mailadresse,
Hinweise für den Einsatz und ein Aktiv-Kennzeichen. Kein Auth-Konto, kein
Portalzugang — ein Kunde meldet sich nicht an, er wird verwaltet.

Der Bezirk ist ein **eigenes Pflichtfeld**, keine Ableitung aus der Postleitzahl.
Eine Zuordnung von Postleitzahlen zu Berliner Bezirken wäre eigene Arbeit mit
eigenen Fehlern, und der Bezirk ist die einzige Ortsangabe, die ein
ausgeschriebener Termin zeigt (siehe unten) — sie soll gesetzt und geprüft sein,
nicht geraten.

Die Hinweise sind ausdrücklich **nicht-medizinisch**: Klingel, Schlüssel, Hund,
„bitte nicht vor 18 Uhr klingeln". Dieselbe Abgrenzung wie beim Briefing im
Privatauftrag — der Verein erhebt keine Pflegedaten, und ein freies Feld lädt
sonst dazu ein. Der Feldhinweis sagt das.

**`auftraege` wird erweitert** um einen optionalen Verweis auf den Kunden und um
den **Einsatzort** als Aufzählung aus `klinik` und `zuhause`. Bei `klinik` gilt
alles wie bisher. Bei `zuhause` kommt die Adresse aus dem Kunden, und Station,
Stationstelefon, Zimmer und Fallnummer bleiben leer.

**`bookings` bleibt strukturell wie es ist.** Zwei Ergänzungen:

- `shift` bekommt den zusätzlichen Wert `termin`
- neue Spalte `beginn_zeit`, Pflicht wenn `shift = 'termin'`, sonst leer

Die vorhandene Spalte `hours` trägt die Dauer bereits; eine Stunde ist kein
Sonderfall. Bestehende Zeilen bleiben unberührt. Ein Termin ist damit eine
Buchung wie jede andere und erscheint ohne weiteres Zutun in „Meine Einsätze",
einschließlich Unterwegs- und Ankunftsmeldung.

## Weg durch das Portal

Der Vorstand legt den Kunden einmal an. Für einen Termin wählt er Kunde, Datum,
Uhrzeit und Dauer und entscheidet dann zwischen zwei Wegen:

- **direkt zuteilen** — die Buchung ist sofort besetzt, die Person findet sie in
  ihrer Liste, ohne etwas annehmen zu müssen
- **ausschreiben** — die Buchung erscheint wie eine offene Sitzwache zur
  Selbstmeldung

Beide Wege müssen nebeneinander bestehen; welcher passt, entscheidet der Anlass.

Die Mitwirkende meldet sich unterwegs wie gewohnt und schließt nach dem Termin
mit **„Beendet"** ab. Start und Ende werden festgehalten, **niemand
unterschreibt**. Weicht die tatsächliche Zeit von der geplanten ab, kann sie sie
korrigieren; die geplante bleibt daneben sichtbar, damit später erkennbar ist,
was vereinbart und was geleistet wurde.

Die Unterschrift der Station entfällt bewusst. Sie ist bei der Sitzwache der
Nachweis gegenüber der Klinik; in einer Privatwohnung gibt es niemanden mit
dieser Rolle, und eine Unterschriftenprozedur wäre bei einem Ein-Stunden-Termin
aufwendiger als der Termin selbst.

## Wer sieht die Adresse — und ab wann

Ein **ausgeschriebener** Termin zeigt weder Namen noch Adresse. Sichtbar sind
Datum, Uhrzeit, Dauer und der **Bezirk**. Alles Weitere — Name, genaue Adresse,
Telefon, Hinweise — erscheint erst, wenn die Person zugeteilt ist oder sich
gemeldet hat.

Der Grund ist nicht formal: Ohne diese Grenze sieht jede Mitwirkende im Portal,
wo eine pflegebedürftige Person am Samstagabend allein zu Hause ist. Das ist eine
Angabe, die man nicht in eine offene Liste stellt.

Bei direkter Zuteilung sieht ausschließlich die zugeteilte Person die vollen
Daten. Der Vorstand sieht alles. Durchgesetzt wird das in der Datenbank, nicht in
der Oberfläche.

## Etappen

**Etappe 1 — Planung und Sichtbarkeit.** Kunden anlegen und pflegen, Termine
setzen, zuteilen oder ausschreiben, Abschluss durch die Mitwirkende. Danach ist
der Samstagabend-Fall vollständig abgebildet.

**Etappe 2 — Abrechnung an den Kunden.** Stundensatz je Kunde; aus den
abgeschlossenen Terminen entsteht eine Rechnung über das bestehende
Rechnungsmodul. Gebaut nach der steuerlichen Auskunft.

**Etappe 3 — Aufwandsentschädigung.** Was jemand für eine Stunde bekommt, passt
nicht in die Schichtpauschale. Das braucht eine eigene Regel und voraussichtlich
einen Vorstandsbeschluss — vergleichbar der offenen Vergaberegel bei den
Sitzwachen.

## Was dieses Design nicht tut

Es legt keine Kundenkonten an, es erhebt keine Pflegedaten, es bildet keine
Serientermine ab (ein wiederkehrender Samstagstermin wird zunächst als mehrere
Einzeltermine gesetzt), und es ändert nichts an der Vergabe von Sitzwachen. Ob
Serientermine gebraucht werden, zeigt sich nach den ersten Wochen im Betrieb.
