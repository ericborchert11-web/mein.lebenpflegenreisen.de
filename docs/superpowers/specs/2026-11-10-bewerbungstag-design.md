# Bewerbungstag: Montag 15:30 selbst buchen

Stand 10.11.2026 · Entscheidungen von Eric im Gespräch

## Ziel

Bewerbende buchen ihr Kennenlernen (Schritt 2 im Onboarding) selbst, statt
dass der Verein „sich innerhalb von zwei Werktagen meldet". Bewerbungstag ist
**jeden Montag um 15:30** in der **Turmstraße 10, 10559 Berlin**, mit
**höchstens 5 Personen** pro Termin.

## Entscheidungen

| Punkt | Festlegung |
|---|---|
| Wo wird gebucht | Nur im Portal, mit Konto, bei Schritt 2. Auf der Website gibt es nur den Hinweis. |
| Ort | Turmstraße 10, 10559 Berlin |
| Uhrzeit | Montag 15:30 |
| Plätze | höchstens 5 je Montag, die Datenbank setzt die Grenze durch |
| Vorlauf | Montage der nächsten 6 Wochen |
| Feiertage | werden automatisch ausgelassen (siehe unten) |
| Buchungsschluss | Montag 12:00 desselben Tages (Europe/Berlin) |
| Umbuchen/Absagen | selbst bis Montag 12:00, danach fest |
| Pro Person | immer nur eine offene Buchung |
| Erinnerung | Sonntag vor dem Termin |

## Feiertage

Bucht man an einem Feiertag, steht niemand in der Turmstraße. Darum werden
diese Montage gar nicht erst angeboten. Die Regel gilt für die
**gesetzlichen Feiertage in Berlin**, die auf einen Montag fallen können:

- Neujahr (01.01.)
- Internationaler Frauentag (08.03., Berliner Landesfeiertag)
- Ostermontag (beweglich, Ostersonntag + 1)
- Tag der Arbeit (01.05.)
- Pfingstmontag (beweglich, Ostersonntag + 50)
- Tag der Deutschen Einheit (03.10.)
- 1. und 2. Weihnachtstag (25.12., 26.12.)

Zusätzlich werden **Heiligabend (24.12.)** und **Silvester (31.12.)**
ausgelassen. Das sind keine gesetzlichen Feiertage, aber an diesen Tagen kommt
erfahrungsgemäß niemand.

Die Feiertage berechnet eine SQL-Funktion `ist_feiertag_berlin(date)`. Ostern
ergibt sich aus der Gaußschen Osterformel (anonymer gregorianischer
Algorithmus), deshalb muss niemand jedes Jahr eine Liste pflegen. Einmalige
Sonderfeiertage, wie der 08.05.2025 in Berlin, und alle anderen Ausfälle
(Urlaub, Krankheit) sperrt der Vorstand von Hand.

Dieselbe Prüfung gilt beim Buchen in der Datenbank, nicht nur in der Anzeige:
Auch ein manipulierter Aufruf kann keinen Feiertag buchen.

## Aufbau

### Datenbank

- `bewerbungstag_sperren (datum date primary key, grund text, angelegt_von, angelegt_am)`:
  Montage, die der Vorstand absperrt.
- `bewerbungstag_buchungen (id, user_id, datum date, gebucht_am, abgesagt_am, abgesagt_von)`:
  Eine **teilweise eindeutige Bedingung** sorgt dafür, dass jede Person nur eine
  offene Buchung hat (`abgesagt_am is null`).
- RLS ist aktiv. Bewerbende sehen nur ihre eigene Zeile, geschrieben wird nur
  über RPCs (security definer), und anon hat kein Recht.

RPCs:

- `bewerbungstag_freie_termine()` liefert die Montage der nächsten 6 Wochen
  ohne Feiertage und Sperren, nach Buchungsschluss nur noch künftige, jeweils
  mit `frei` = 5 − Buchungen. Andere Namen gibt die Funktion nicht heraus,
  nur die Zahl.
- `bewerbungstag_buchen(p_datum)` prüft: Ist es ein Montag, innerhalb von
  6 Wochen, vor dem Buchungsschluss, kein Feiertag, nicht gesperrt? Gehört die
  Person zum Ehrenamt im Onboarding, Schritt 2? Danach setzt sie
  `pg_advisory_xact_lock` je Datum, zählt die Plätze und bricht bei 5 ab.
  Eine bestehende offene Buchung wird dabei abgesagt (Umbuchen). Zum Schluss
  setzt sie `onboarding.kennenlernen_am`.
- `bewerbungstag_absagen()` sagt die eigene Buchung ab, solange der
  Buchungsschluss nicht vorbei ist, und leert `kennenlernen_am`, wenn es noch
  auf diesen Termin zeigt.
- Für den Vorstand (`is_board()`): `bewerbungstag_uebersicht()`,
  `bewerbungstag_sperren_setzen(p_datum, p_grund)` /
  `bewerbungstag_sperre_aufheben(p_datum)` und
  `bewerbungstag_eintragen(p_user, p_datum)` (umgeht Buchungsschluss und
  Platzgrenze nicht).

Der Schritt „Kennenlernen" gilt weiter erst dann als erledigt, wenn der Tag
gekommen ist **und** der BZR-Antrag vermerkt ist. Diese Regel steht schon in
`onboarding_schritt`, die Buchung allein schiebt also niemanden weiter.

### Mails (vorhandene `notification_outbox` + `notify`)

- `bewerbungstag.gebucht.<buchung>` an die Person: Datum, 15:30,
  Turmstraße 10, „Personalausweis mitbringen", Hinweis, wie man umbucht.
- `bewerbungstag.abgesagt.<buchung>` an die Person (auch wenn der Vorstand
  den Montag sperrt, dann mit der Bitte, neu zu buchen).
- `bewerbungstag.erinnerung.<buchung>` am Sonntag davor. Das erledigt der
  vorhandene Tageslauf (pg_cron) mit, kein neuer Job.
- `bewerbungstag.vorstand.<buchung>.<gebucht|abgesagt>` an ehrenamt@.

### Portal

- `onboarding.html` Schritt 2: der Satz zum Bewerbungstag, die Liste der
  Montage mit „noch N Plätze" / „ausgebucht", ein Knopf zum Buchen. Nach der
  Buchung: Termin, Ort, „Umbuchen" und „Absagen" (bis Montag 12:00).
- `onboarding-schritte.js`: Der Text für Schritt 2 ohne Termin lautet nicht
  mehr „Wir melden uns …", sondern lädt zur Buchung ein.
- `admin-onboarding.html`: Abschnitt „Bewerbungstage" mit den nächsten
  Montagen, den Gebuchten und den freien Plätzen. Feiertage stehen grau mit
  ihrem Namen in der Liste. Dazu Sperren/Aufheben und Person eintragen.

### Website /mitmachen/

Absatz: „Jeden Montag um 15:30 ist Bewerbungstag in der Turmstraße 10,
10559 Berlin. Nach der Registrierung buchst du deinen Platz direkt im Portal,
höchstens 5 Personen je Termin. An Feiertagen findet kein Bewerbungstag statt."
(WordPress-Seite über REST, siehe Website-Baukasten.)

## Nicht enthalten

Buchen ohne Konto, frei wählbare Uhrzeiten, ICS-Datei, Warteliste.

## Tests (SQL, DO-Blöcke wie bisher)

- `ist_feiertag_berlin`: Ostermontag 2027 (29.03.), Pfingstmontag 2027
  (17.05.), 08.03.2027 (Montag), 03.10.2033 (Montag), 24.12.2029 (Montag)
  ergeben wahr, ein normaler Montag ergibt falsch.
- Ein Feiertag taucht nicht in `bewerbungstag_freie_termine` auf, und
  `bewerbungstag_buchen` lehnt ihn ab.
- Die 6. Buchung auf denselben Montag scheitert.
- Eine zweite Buchung derselben Person bucht um, statt eine doppelte offene
  Buchung anzulegen.
- Kein Montag, mehr als 6 Wochen im Voraus, nach dem Buchungsschluss,
  gesperrt: alles abgelehnt.
- Klinik-Konto oder schon freigegebenes Mitglied: abgelehnt.
- anon: 42501 auf alle RPCs.
- Jeder Testfall sucht sich seine Voraussetzung selbst oder bricht ab, er
  überspringt nie still.
