# Landingpage `/mitmachen/` — Ehrenamtliche Sitzwachen gewinnen

**Stand 10.09.2026.** Öffentliche Landingpage auf der Portal-Domain, die
Bewerbungen von Menschen mit mindestens einem Jahr Pflegeausbildung einsammelt.
Ohne Konto, ohne Passwort, ohne Cookie.

> Dieses Repo ist öffentlich. Migrations-SQL und Edge-Function-Quellen sind
> gitignored und stehen deshalb nicht in diesem Dokument — hier steht, *was*
> geändert wird, nicht die Policies.

## Warum nicht das, was im Briefing stand

Das Briefing sah eine neue Tabelle `volunteer_applications` vor, in die das
Formular per anon-INSERT direkt schreibt. Beides wird nicht gebaut, und zwar
aus einem Grund, der in diesem Repo schon einmal durchdacht wurde.

Der Eingang existiert bereits: Migration M vom 25.08.2026 legt
`ehrenamt_interessenten` an, die Edge Function `ehrenamt-interesse` schreibt
hinein, `admin-ehrenamt-interesse.html` ist die Vorstandsansicht dazu. Die
Migration begründet ausdrücklich, warum anon dort kein Schreibrecht bekommt:
der publishable Key steht in `app.js` und ist damit für jeden lesbar; eine
anon-insert-Policy wäre offenes Schreibrecht auf eine Tabelle mit Klarnamen
und Telefonnummern. Die Spam-Bremse sitzt deshalb in der Function.

Eine zweite Tabelle hätte außerdem einen zweiten Posteingang bedeutet. Der
Vorstand hat einen. Wer sich über `/mitmachen/` bewirbt, soll neben denen
stehen, die sich über die Website gemeldet haben — nicht in einer Parallelwelt,
die jemand zusätzlich im Blick behalten muss.

**Entschieden:** bestehenden Eingang erweitern.

## Datenweg

```
mitmachen/index.html
   │  fetch POST, apikey-Header, kein supabase-js
   ▼
POST /functions/v1/ehrenamt-interesse      (Service-Role, umgeht RLS)
   │
   ├──▶ ehrenamt_interessenten             (eine Zeile)
   ├──▶ Meldung an ehrenamt@…              (reply_to = Bewerber:in)
   └──▶ Eingangsbestätigung an die Person
```

Kein `supabase-js`, kein CDN-Skript — ein `fetch` genügt und hält die Seite
frei von externen Requests. Das Muster folgt `submitClinicApplication()` in
`app.js`, die es für `klinik-anmeldung` genauso macht.

Mitgeerbt und deshalb nicht neu gebaut: Honigtopf serverseitig,
Dubletten-Sperre von 15 Minuten gegen den Doppelklick, Herkunfts-Positivliste
(`mein.lebenpflegenreisen.de` steht bereits darin), beide Mails.

## Was an der Tabelle wächst

Fünf Spalten, alle nullable — die vorhandenen Zeilen aus dem Website-Funnel
haben sie nicht und sollen nicht nachträglich ungültig werden:

| Spalte | Inhalt |
|---|---|
| `hintergrund` | eine von sechs Ausprägungen, per Check gesichert |
| `hintergrund_detail` | Freitext dazu, optional |
| `verfuegbarkeit` | `text[]` aus vormittags/nachmittags/abends/nachts/wochenende |
| `start_ab` | frühester Einstieg, optional |
| `datenschutz_ok` | Einwilligung; die Function weist ohne sie ab |

**Zwei Felder werden bewusst nicht angelegt.** Die Motivation reist in der
vorhandenen Spalte `nachricht` — eine zweite, fast gleiche Textspalte hätte
der Vorstandsansicht nur zwei Kästen statt einem beschert. Und `interesse`
setzt die Seite fest auf `sitzwache`, weil sie nichts anderes fragt.

## Kanal-Messung: eine stille Lücke schließen

`marketing/ehrenamt/PLAN.md` verteilt neun `?src=`-Werte über acht Wochen und
will danach entscheiden, welcher Kanal wiederholt wird. Das funktioniert
bisher nicht: `pfad()` in der Function schneidet die Query ab, die
Website-Formulare schicken ohnehin nur `window.location.pathname`. Jeder
`?src=`-Wert ist bislang stillschweigend verfallen.

`pfad()` behält künftig **genau `src`**, gefiltert auf `[a-z0-9-]` und 40
Zeichen; gespeichert wird `/mitmachen/?src=govolunteer`. Damit greift die
vorhandene Auswertung `ehrenamt_quellen()` sofort pro Kanal, ohne dass eine
RPC angefasst werden muss, deren Definition nicht im Repo liegt. Der
Spaltenkommentar von `quelle` wird auf diese Positivliste nachgezogen.

## Die Seite

Route `/mitmachen/`, also `mitmachen/index.html`. Aufbau und Texte wörtlich
nach Briefing 4.1–4.8, Du-Form: dunkelgrüner Hero, „Was ist eine Sitzwache",
Voraussetzungen mit vier Zielgruppen-Ansprachen, „Was du bekommst",
fünfschrittige Timeline, Formular, FAQ, Footer.

**Eigenständiges CSS, kein `shared.css`.** Das ist die Portal-Oberfläche mit
A11y-Leiste, Kartenrastern und `--green:#2D4A3A`; die Landingpage folgt dem CI
mit `#1A3A2A`, so wie das übrige Marketing-Material im Repo. Ein Besucher, der
noch nie eingeloggt war, soll keine Portal-Chrome sehen.

**Fonts self-gehostet** als woff2 unter `mitmachen/fonts/`. Der Rest des Repos
lädt Bricolage Grotesque und Instrument Sans von `fonts.googleapis.com`; diese
Seite tut es bewusst nicht, weil sie öffentlich beworben wird und ohne
Cookie-Banner auskommen soll. Beide Schriften stehen unter der OFL.

Chevron-Icon und Favicon inline als SVG. FAQ als natives `<details>`.
Fehlermeldungen im Klartext neben dem Feld, nicht nur als Browser-Blase.
Sichtbare Fokus-Stile, `prefers-reduced-motion`, echte `<label>`, `lang="de"`,
tragfähig ab 360 px.

Indexierbar — kein `noindex`. Die Freigabe des Kampagnenstarts hängt an
Inseraten und Flyern, nicht an Google, und Suchsichtbarkeit braucht Vorlauf.

## Spam ohne Fremddienste

Drei Schichten, keine davon extern: das versteckte Feld `website`, das die
Function schon auswertet und mit einem freundlichen `ok` quittiert; eine
Zeitsperre von drei Sekunden ab Seitenaufruf im Browser; und die
Dubletten-Sperre der Function. Kein Captcha, kein Analytics, kein CDN.

## Vorstandsansicht

`admin-ehrenamt-interesse.html` zeigt die fünf neuen Felder mit an — rein
additiv, nur Anzeige, kein Eingriff in Login oder `profiles`. Ohne das stünde
im Portal eine Bewerbung ohne Qualifikation und ohne Verfügbarkeit, und der
Vorstand müsste für die entscheidenden Angaben in die Mail wechseln. Eigener
Commit, getrennt vom Rest.

## Reihenfolge beim Ausrollen

Die Function liest nur Felder, die sie kennt, und verwirft den Rest
kommentarlos. Die Seite funktioniert deshalb sofort — verlöre vor der
Migration aber genau die Angaben, wegen derer sie gebaut wird.

1. Migration einspielen (SQL kommt vollständig in den Chat, nicht als Pfad)
2. Function neu deployen
3. Test-Insert mit `TEST – bitte löschen`; anon kann nicht löschen, deshalb die Markierung
4. Erst dann verlinken

## Inhaltliche Sperren

Keine Euro-Beträge zur Aufwandsentschädigung, auch nicht in Meta-Tags oder
Kommentaren — die Freigabe des Finanzvorstands steht aus; qualitativ
(„steuerfrei") ist zulässig. Keine Kliniknamen, nur „Berliner Partnerkliniken";
das ist strenger als `marketing/ehrenamt/README.md`, wo Sana genannt werden
darf, und die strengere Regel gilt. Der Abgrenzungssatz „Sitzwache ist
Begleitung — keine pflegerischen oder medizinischen Tätigkeiten." steht wörtlich
und sichtbar auf der Seite.

## Nicht in diesem Auftrag

Verlinkung von WordPress (läuft über die Bridge), automatische
Bestätigungsmail über eine eigene Function (die Eingangsbestätigung der
bestehenden Function greift ohnehin), Beträge zur Pauschale, Board-Ansicht
neuer Art, jede Änderung an Login oder `profiles`.

`marketing/ehrenamt/landingpage.html` bleibt unangetastet: das ist der
WordPress-Entwurf für `/ehrenamt-sitzwache`, er siezt und richtet sich an eine
breitere Zielgruppe. Zwei Seiten mit unterschiedlicher Ansprache sind hier
Absicht, kein Versehen.

## Was am Ende nicht bewiesen sein wird

Lighthouse wird lokal gegen die Datei gemessen; die Zahlen auf GitHub Pages
können abweichen. Das Ergebnis wird als lokale Messung ausgewiesen, nicht als
Abnahme.
