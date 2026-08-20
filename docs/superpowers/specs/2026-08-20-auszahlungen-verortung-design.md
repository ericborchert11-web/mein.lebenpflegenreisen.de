# Anträge verorten: eigener Bereich „Auszahlungen" — Design

**Stand 20.08.2026.** Entscheidung von Eric: zentraler Bereich für den Ablauf,
zusätzlich eine Ansicht je Fachbereich.

## Warum

Die Anträge auf Aufwandsentschädigung liegen heute im Menüpunkt **„Sitzwachen"**,
obwohl fast alle aus **Reisebegleitungen** stammen. Wer dort nachsieht, sucht am
falschen Ort; wer auf einer Reiseseite steht, sieht den Abrechnungsstand nur
halb. Mit den Auslagen kommt eine dritte Herkunft dazu, die in keinen der beiden
Menüpunkte gehört.

## Zuschnitt

**Ein Ort zum Arbeiten:** ein neuer Menüpunkt **„Auszahlungen"** mit allem, was
heute im Tab „Anträge" steckt — Liste, Freigeben, Ablehnen, Als ausgezahlt
markieren, Beleg ansehen, Mailstatus, Nachversand, „Auslage erfassen". Dazu zwei
Filter: Herkunft (Reisebegleitung, Sitzwache, Auslage) und Status.

**Zwei Orte zum Nachsehen:** Die Sitzwachen-Verwaltung zeigt je abgeschlossenem
Dienst, ob er abgerechnet, beantragt oder offen ist. Die Reisen-Verwaltung zeigt
dasselbe je Anmeldung — dort steht die Freibetragsauslastung schon heute, ergänzt
werden die Auslagen. Beide verlinken in den Vorgang.

**Bearbeitet wird nur an einem Ort.** Die Fachbereiche zeigen Zustände und
verlinken; sie ändern nichts. Zwei Stellen, an denen sich ein Antrag freigeben
ließe, wären zwei Wahrheiten darüber, ob er freigegeben ist.

## Was umzieht

Der gesamte Anträge-Teil aus `admin-sitzwachen.html`: Markup des Tabs, die
Belegansicht samt Dialog, der Erfassungsdialog für Auslagen, die Renderfunktionen
und ihre Hilfsfunktionen. Die Seite verliert damit rund ein Drittel ihres Umfangs
— sie ist mit Buchungen, Anträgen, Sätzen und vier Dialogen die größte Datei im
Projekt geworden.

Die Sätze („Sitz-Satz beschließen") bleiben, wo sie sind: Sie betreffen
Sitzwachen und nichts anderes.

## Links

Alle Verweise auf den alten Ort müssen mitziehen — auch die in den drei
Prozessmails der Edge Function. Eine Mail, die auf eine Seite zeigt, auf der der
Vorgang nicht mehr steht, ist schlimmer als keine Verlinkung: Sie schickt den
Vorstand ins Leere und lässt ihn zweifeln, ob der Antrag überhaupt angekommen ist.

## Menü

„Auszahlungen" steht neben „Pauschalen" — das eine ist der Vorgang, das andere
die Jahresübersicht dazu. Beide sind board-only, wie bisher.

## Nicht Teil dieser Etappe

Keine Änderung an Ablauf, Rechten, Belegen oder Mails außer den Links. Kein
Umbau der Sitzwachen-Buchungen selbst. Der Selbstantrag durch Ehrenamtliche
(Auslagen, Etappe 2) bleibt davon unberührt.

## Risiko

Der Umzug ist ein Verschieben von Code, kein Neubau — die Gefahr liegt in
vergessenen Kleinigkeiten: eine Hilfsfunktion, die auf der alten Seite bleibt,
eine ID, die im Markup doppelt vorkommt, ein Dialog, dessen Schließen-Knopf ins
Leere greift. Deshalb bekommt jede Aufgabe eine Prüfung, die die verschobenen
Funktionen am echten Code aufruft, und am Ende steht ein Abgleich, dass keine
Kennung im alten Bestand zurückgeblieben ist.
