# Privat beauftragte Sitzwache: Briefing und Bericht — Design

**Stand 21.08.2026.** Anlass ist eine Anfrage über einen Acht-Stunden-Dienst in
einer Klinik, den nicht die Klinik, sondern die Familie bezahlt. Entscheidung von
Eric: Träger bleibt der Verein, der Weg wird richtig gebaut statt improvisiert.

## Die Entscheidung, die alles andere trägt

Es gibt **keine Pflegeanamnese**. Eine Anamnese ist ein pflegefachlicher Akt, und
die Dokumentationspflicht nach § 630f BGB liegt bei der Klinik als Behandelnder.
Erhebt eine ehrenamtliche Sitzwache eine Anamnese und schreibt sie fort, tritt der
Verein faktisch als Pflegeleistungserbringer auf — mit Übernahmeverschulden, mit
Haftungsfragen und mit einem schriftlichen Beleg dafür, dass die Tätigkeit eben
nicht bloß Anwesenheit und Zuwendung war. Genau diese Abgrenzung trägt aber die
Pauschale nach § 3 Nr. 26a EStG.

An ihre Stelle tritt ein **Einsatz-Briefing**: schmal, nicht-medizinisch, von der
Familie vor dem Dienst ausgefüllt. Und an die Stelle eines Zugangs zur laufenden
Dokumentation tritt ein **Einsatzbericht** nach dem Dienst.

| statt | heißt es | warum |
|---|---|---|
| Pflegeanamnese | Einsatz-Briefing | keine Diagnosen, nur was für Anwesenheit und Zuwendung nötig ist |
| Zugang zur Doku | Einsatzbericht | die Familie bekommt ein Ergebnis, keinen Live-Blick in die Laufkarte |
| Klinikbuchung | Privatauftrag | Auftraggeber ist die Familie, die Klinik ist nur Ort |

## Weg durch das Portal

Der Vorstand legt den Auftrag an, weil die Anfrage per Telefon oder Mail kommt.
Das Portal schickt der Familie einen Link zum Briefing. Was die Familie dort
einträgt, schreibt Station, Stationstelefon, Zimmer und Fallnummer direkt auf die
Buchung. Die Zuteilung läuft über dieselbe Fairness-Regel wie bei Kliniken. Die
Sitzwache sieht das Briefing beim Start als Steckbrief, schließt den Dienst wie
gewohnt mit der Unterschrift der Station ab, und der Abschluss löst den Bericht an
die Familie aus. Die Rechnung entsteht im bestehenden Rechnungsmodul.

## Datenmodell

Neue Tabelle `auftraege`: Auftraggeber mit Name, Mail und Telefon; die
**Vertretungsgrundlage** als Aufzählung aus `patient_selbst`, `vollmacht` und
`betreuung` samt Vermerk, wie sie belegt wurde; Klinik als Freitext, dazu Station,
Stationstelefon, Zimmer, Patientenname und Fallnummer; die Briefing-Felder; der
Zugangsschlüssel für den Familienlink.

`bookings` bekommt einen Verweis auf den Auftrag, und eine Bedingung stellt sicher,
dass **genau eines** von Klinikkonto und Auftrag gesetzt ist. Ein Privatauftrag ist
damit kein getarntes Klinikkonto — das ist Absicht: ein Schein-Klinikkonto bekäme
über die bestehende Klinikprüfung Leserechte auf fremde Buchungen, die ein privater
Auftraggeber nicht haben darf.

Die Vertretungsgrundlage ist Pflichtfeld. Sie ist die Antwort darauf, dass mal die
Patientin selbst einwilligt und mal ein Angehöriger mit Vollmacht oder Betreuung
handelt: nicht zwei Wege durch das System, sondern ein Feld, das festhält, worauf
der Familienzugang im Einzelfall beruht.

## Der Familienlink

Ein Link, drei Gesichter, kein Konto. Vor dem Dienst ist er das Briefing-Formular.
Während des Dienstes zeigt er den Anreisestatus — „unterwegs seit 21:40", „vor Ort
seit 21:55" —, der im Bestand schon erfasst wird und den bisher nur die Klinik zu
sehen bekam. Das ist die eine Live-Auskunft, die Angehörige nachts wirklich
brauchen. Nach dem Abschluss ist derselbe Link die Abholseite für den Bericht.

Der Schlüssel ist zufällig und wird nur als Prüfwert gespeichert. **Geschrieben**
werden kann das Briefing bis zum Ende des Dienstes, **gelesen** werden kann der
Link noch vierzehn Tage darüber hinaus — danach ist er tot. Der Vorstand kann
einen verlorenen Link ersetzen; der alte verfällt dabei. Gelesen und geschrieben wird ausschließlich
über zwei eng geschnittene Funktionen, die nichts außer diesem einen Auftrag
herausgeben — kein Zugriff auf Einsätze, Ereignisse oder andere Buchungen. In der
Adresse steht kein Name.

Bewusst kein Familien-Login: eine vierte Rolle hieße Rechteregeln an jeder
bestehenden Tabelle und einen dauerhaften Zugang zu einem Bestand an
Gesundheitsdaten. Ein Link, der mit dem Dienst abläuft, ist die kleinere Angriffs-
und die kleinere Datenschutzfläche.

## Briefing: was abgefragt wird

**Organisatorisch, verpflichtend:** Station, Stationstelefon, Zimmer, Name des
Patienten, Fallnummer soweit bekannt. Damit ist beim Privatauftrag auch die alte
Schwachstelle erledigt, dass die Fallnummer notfalls die Sitzwache vor Ort erfragt.

**Zur Person, freiwillig, in kurzen Feldern mit hartem Zeichenlimit:** wie die
Person angesprochen werden möchte, ihre Sprache, ob Brille und Hörgerät vorhanden
sind, was sie beruhigt, was sie beunruhigt, drei Stichworte zur Biografie, Themen
die guttun oder die man meiden sollte, und wer nachts angerufen werden darf.

**Was ausdrücklich nicht abgefragt wird:** Diagnosen, Medikamente, Allergien,
Sturz-, Delir- oder Fixierungsstatus, Wunden, Trinkmengen. Nicht aus Bequemlichkeit,
sondern weil die Sitzwache danach ohnehin nicht handeln darf — sie ruft in jedem
dieser Fälle die Pflege. Ein Feld, dessen Inhalt keine Handlung ändert, erzeugt nur
Haftung und eine zweite Halde von Gesundheitsdaten neben der Kurve der Station.

**Zum Schluss ein Pflichthaken der Familie** über das, was die Sitzwache *nicht*
tut: keine pflegerischen Handlungen, keine Medikamente anreichen, kein Mobilisieren
oder Transfer, keine Auskunft zu Befunden. Der Text stammt aus den bestehenden
Sitzwachen-Rechtstexten. Er ist der eigentliche Grund für das Formular:
Erwartungssteuerung vor dem Dienst statt Streit danach.

## Bericht: was mitgeht

Kopf mit Datum, Schicht und Station. Die Zeiten mit Beginn, Ende, Pausen und
Nettodauer. Die angehakten Tätigkeiten aus der bestehenden Positivliste. Die
Übergaben an die Pflege mit Uhrzeit und Kategorie. Und wer den Dienst bestätigt hat.

Zwei bewusste Auslassungen. Das **freie Stichwort** einer Übergabe geht nicht mit:
es ist eine ungeprüfte Notiz der Sitzwache an die Pflege und kann Gesundheitsangaben
enthalten. Und bei einem Abschluss ohne Unterschrift geht nur die **Kategorie** mit,
nicht der Vermerk — denn der kann beschreiben, warum eine bestimmte Pflegekraft
nicht unterschrieben hat. Beides ist keine neue Regel, sondern genau die Trennung,
die die Klinikansicht schon fährt. Ebenfalls nicht im Bericht: die
Patientenkennzeichen und freien Notizen aus der Buchung.

Dazu ein Fußtext: die Behandlungsdokumentation führt die Klinik und ist dort
einzusehen. Dieser Bericht weist einen beauftragten Dienst nach, er ist keine
Krankenakte.

Der Name der Sitzwache erscheint als Vorname mit erstem Buchstaben des Nachnamens —
so, wie Kliniken es auf Namensschildern halten.

Zugestellt wird der Bericht nach dem Muster des Auszahlungsbelegs: ein Auslöser auf
dem Abschluss ruft eine Versandfunktion, die das Schreiben serverseitig aus einer
Vorlage baut. Die Vorlage lebt als eigene Datei und wird mit dem vorhandenen
Einbett-Skript in die Funktion kopiert, nie von Hand nachgepflegt.

## Was unverändert bleibt

Die **Pflege-Unterschrift** funktioniert auch ohne Klinikkonto, weil sie auf dem
Handy der Sitzwache gezeichnet wird. Der Abschluss braucht deshalb keine Änderung,
und auch der Fall „Abschluss ohne Unterschrift" bleibt so, wie er ist.

Die **Rechnung** an eine Familie geht heute schon: das Adressbuch der
Rechnungsstellung erlaubt Empfänger ohne Klinikbezug samt eigener Anschrift und
eigenem Schichtpreis. Dafür ist keine Zeile Code nötig.

## Kein Tablet am Bett

Dokumentiert wird weiter auf dem Handy der Sitzwache; die Einsatzseite ist dafür
gebaut. Ein fremdes Gerät am Bett hieße: der Bettnachbar liest mit, es braucht
Wischdesinfektion, Klinik-WLAN und eine Freigabe der Klinik-IT, und ein Verlust
träfe Gesundheitsdaten. Vor allem aber führt die Klinik ihre eigene Kurve. Eine
Parallel-Dokumentation, die dort niemand liest, erzeugt genau die Widersprüche, die
im Streitfall gegen den Verein verwendet werden.

## Ehrliche Kosten

Bei einem Privatauftrag bleibt das Klinikkonto an der Buchung leer. Der Klinikname
hängt heute aber an sechs Stellen an diesem Verweis: am Einsatzkontext, an den
eigenen Buchungen, an den Klinikbuchungen, an der Sitzwachen-Verwaltung, an der
Buchungsmail und am Anreisestatus. Jede dieser Stellen braucht den Rückfall auf den
Klinik-Freitext des Auftrags, sonst steht dort stumm „Klinik". Das ist der Preis
dafür, Privataufträge sauber getrennt zu halten, und er ist geringer als der
Preis eines getarnten Klinikkontos mit falschen Leserechten.

## Vorbedingungen außerhalb der Software

Die Rechnungsvorlage trägt fest die Umsatzsteuerbefreiung nach § 4 Nr. 18 UStG. Bei
einem privat zahlenden Auftraggeber hängt die Befreiung daran, dass das Entgelt
hinter dem gewerblicher Anbieter zurückbleibt; die Gemeinnützigkeit hängt daran,
dass der Dienst nicht „des Erwerbs wegen" erfolgt (§ 66 AO). Das ist keine
Programmierfrage. Es gehört einmal von der Steuerberatung bestätigt, bevor die
erste Privatrechnung hinausgeht, und gilt hier als offene Vorbedingung, nicht als
gelöst.

Ebenfalls außerhalb der Software: die Vertretungsgrundlage muss beim Anlegen des
Auftrags tatsächlich erfragt und belegt werden. Das Feld erzwingt die Frage, nicht
die Wahrheit der Antwort.

## Nicht Teil dieser Etappe

Kein Live-Blick der Familie in die laufende Laufkarte. Kein Familien-Konto und
keine vierte Rolle. Keine Änderung an Klinikbuchungen, an der Einsatzdoku selbst,
an Abschluss, Pauschalen oder Anträgen. Kein neuer Rechnungsweg — nur ein neuer
Empfänger im bestehenden.

## Brücke für den akuten Dienst

Bis das gebaut ist, läuft der angefragte Dienst ohne Portalunterstützung: Auftrag
und Briefing nimmt der Vorstand auf und gibt der Sitzwache ein Blatt mit denselben
Feldern mit; der Dienst wird als Buchung mit dem Klinikkonto oder von Hand angelegt;
der Bericht an die Familie wird aus der Einsatzansicht abgeschrieben; die Rechnung
läuft über einen neu angelegten Empfänger. Die inhaltlichen Regeln dieses Entwurfs
gelten dabei bereits — insbesondere die Grenze, was das Briefing abfragt und was
der Bericht enthält.
