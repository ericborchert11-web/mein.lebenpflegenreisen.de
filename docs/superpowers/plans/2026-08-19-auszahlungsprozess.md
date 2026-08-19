# Auszahlungsprozess — Umsetzungsplan

> **Für agentische Arbeit:** Dieser Plan wird Aufgabe für Aufgabe abgearbeitet
> (`superpowers:subagent-driven-development` oder `superpowers:executing-plans`).
> Schritte sind als Checkboxen geführt.

**Ziel:** Antragseingang, Freigabe und Auszahlung lösen ihre Mails selbst aus —
an finanzen@ mit vorstand@ in Kopie, und nach der Überweisung geht der
Auszahlungsbeleg an das Mitglied.

**Architektur:** Ein Datenbank-Webhook auf `claims` ruft die neue Edge Function
`claim-mails`. Drei Zeitstempel auf `claims` verhindern Doppelversand. Der Beleg
wird aus `abrechnung.html` in die Datei `beleg-vorlage.js` herausgelöst, die
Browser und Edge Function gemeinsam benutzen. Der bisherige Weg (PDF im Browser →
Storage → `send-claim-to-payroll` beim Einreichen) fällt weg.

**Technik:** Vanilla JS mit Inline-Styles wie im ganzen Repo, Supabase
(Postgres + Edge Functions in Deno), Mailversand über die Resend-HTTP-API
(`functions/mailer-resend.ts`).

**Spec:** `docs/superpowers/specs/2026-08-19-auszahlungsprozess-design.md`

**Zwei Konventionen dieses Repos, die hier gelten:**

1. `sql/` und `functions/` sind **gitignoriert** — das Repo ist öffentlich. SQL
   gehört nicht in dieses Dokument; beim Abarbeiten wird jedes SQL-Skript
   **vollständig in den Chat** geschrieben, Eric führt es im Dashboard aus.
2. Es gibt **kein Testframework**. Geprüft wird mit einer Wegwerf-Kopie der Seite
   plus Stubs über `python3 -m http.server` (Muster: der Harness vom 19.08.2026)
   und mit `select`-Abfragen. Jede Aufgabe nennt ihre Prüfung explizit.

---

## Voraussetzungen (vor Task 3 zu klären)

- **finanzen@lebenpflegenreisen.de** existiert als Postfach oder Alias. Ohne das
  laufen zwei der drei Mails ins Leere, ohne dass jemand es merkt — Resend meldet
  eine angenommene Mail auch dann als versendet.
- **vorstand@lebenpflegenreisen.de** empfängt (Kopie-Adresse).
- `RESEND_API_KEY` ist als Secret gesetzt (laut `functions/README-mailversand.md`
  vorhanden) und der Absender liegt auf der **Hauptdomain**, nicht auf `send.`.

## Dateien

| Datei | Rolle |
|---|---|
| `beleg-vorlage.js` (neu) | Baut den Beleg-HTML — einzige Wahrheitsquelle für Bildschirm und Mail |
| `abrechnung.html` | Nutzt die Vorlage; Rückbau von PDF/Upload/Payroll-Aufruf |
| `admin-sitzwachen.html` | Zeigt die Mail-Zeitstempel, Knopf „Mail erneut senden" |
| `app.js` | Neue Spalten in den Selects, `resendClaimMail`, Rückbau zweier Funktionen |
| `functions/claim-mails/index.ts` (neu, außerhalb Git) | Die drei Mails |
| `sql/2026-08-19-j-antragsmails.sql` (neu, außerhalb Git) | Drei Spalten |

---

### Task 1: Spalten für die Zeitstempel

**Dateien:**
- Erstellen: `sql/2026-08-19-j-antragsmails.sql`
- Ändern: `app.js` (Spaltenlisten in `getMyClaims` ~Zeile 1198 und `adminListClaims` ~Zeile 3116)

- [ ] **Schritt 1: Prüfen, dass die Spalten fehlen**

Im Dashboard ausführen:

```
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'claims'
  and column_name in ('intake_mail_at','payout_mail_at','submitted_to_payroll_at');
```

Erwartet: nur `submitted_to_payroll_at`.

- [ ] **Schritt 2: Migration schreiben**

`sql/2026-08-19-j-antragsmails.sql` legt `intake_mail_at` und `payout_mail_at` als
`timestamptz` an (nullable, kein Default) und dokumentiert per `comment on column`,
dass `submitted_to_payroll_at` ab jetzt „Zahlungsanweisung an finanzen@ verschickt"
bedeutet. Kein Backfill: bestehende Anträge sollen keine Mails nachträglich
auslösen — die Function sendet nur bei Zustandswechseln, ein leerer Stempel auf
einem alten Antrag bleibt folgenlos, solange sein Status sich nicht ändert.

**Den vollständigen Inhalt beim Abarbeiten in den Chat schreiben, nicht nur den Pfad.**

- [ ] **Schritt 3: Migration ausführen und gegenprüfen**

Abfrage aus Schritt 1 erneut; erwartet: alle drei Spalten.

- [ ] **Schritt 4: Spalten in `app.js` mitnehmen**

In `getMyClaims` die Select-Liste um `intake_mail_at, payout_mail_at` ergänzen,
in `adminListClaims` um `submitted_to_payroll_at, intake_mail_at, payout_mail_at`.

- [ ] **Schritt 5: Commit**

```bash
git add app.js
git commit -m "feat(antraege): Zeitstempel der Prozessmails mitladen"
```

---

### Task 2: Beleg-Vorlage herauslösen

**Dateien:**
- Erstellen: `beleg-vorlage.js`
- Ändern: `abrechnung.html` (Funktion `showBeleg`, Zeilen 1379–1470; `<script>`-Block am Seitenende)

- [ ] **Schritt 1: Vorlage anlegen**

`beleg-vorlage.js` — klassisches Skript ohne Modulsyntax, damit es der Browser per
`<script src>` und Deno per `await import(url)` laden kann. Gerüst:

```js
// Einzige Wahrheitsquelle für den Antrags-/Auszahlungsbeleg.
// Wird zweimal geladen: von abrechnung.html im Browser und von der Edge
// Function claim-mails über die öffentliche URL. Deshalb ohne Modulsyntax,
// ohne DOM-Zugriff und ohne Abhängigkeit auf app.js — alles, was der Beleg
// braucht, kommt als Argument herein.
(function (global) {
  'use strict';

  var FREIBETRAG = { '26': 3300, '26a': 960 };

  function escape(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function eur(n) {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
      .format(Number(n) || 0);
  }
  function datum(iso) {
    return iso ? new Date(iso).toLocaleDateString('de-DE') : '—';
  }
  function maskIban(iban) {
    var s = String(iban || '').replace(/\s+/g, '');
    return s.length < 8 ? '—' : s.slice(0, 4) + ' •••• •••• ' + s.slice(-4);
  }

  /**
   * d = {
   *   claim:      Zeile aus claims (status, amount, pauschale_art, beleg_nr,
   *               paid_at, submitted_at, period_start, period_end,
   *               source_type, amount_breakdown, notes, id),
   *   person:     { full_name, email, iban, personalnummer },
   *   verein:     { name, adresse, register }  — Werte wie LPR.VEREIN in app.js,
   *   jahresSumme: Summe der in diesem Jahr ausgezahlten Beträge gleicher Art,
   *   beschlussDatum: ISO-Datum des Vorstandsbeschlusses
   * }
   */
  function belegHtml(d) { /* Aufbau siehe Schritt 2 */ }

  global.LPRBeleg = { belegHtml: belegHtml, FREIBETRAG: FREIBETRAG };
})(typeof globalThis !== 'undefined' ? globalThis : window);
```

- [ ] **Schritt 2: Aufbau übernehmen**

Den Rumpf von `belegHtml` aus `abrechnung.html:1379–1470` übernehmen — Kopfzeile,
Titel („Auszahlungsbeleg" bei `status === 'paid'`, sonst „Antragsbestätigung"),
Empfänger/Verein/Tätigkeit/Zeitraum-Raster, Jahresbalken, Positionstabelle mit
beiden Formaten (`amount_breakdown` alt und neu), Summenzeile, Fußzeile.
Wörtlich übernehmen, mit vier Änderungen:

1. Statt `escape()`/`formatEUR()`/`_profile`/`VEREIN` die lokalen Helfer und
   `d.person` / `d.verein` benutzen.
2. Statt der Jahressumme aus `_claims` den übergebenen Wert `d.jahresSumme`.
3. Kein DOM-Zugriff, kein `document` — die Funktion gibt einen String zurück.
4. Der Erklärungsblock wird ersetzt (Schritt 3).

Fehlt `amount_breakdown` (Nacherfassung von Hand), entfällt die Positionstabelle
und an ihrer Stelle steht eine Zeile:

```js
positionsHtml = '<tr><td>Aufwandsentschädigung (Nacherfassung durch den Vorstand)</td>'
              + '<td class="num">' + eur(c.amount) + '</td></tr>';
```

- [ ] **Schritt 3: Freigegebenen Steuerhinweis einsetzen**

Ersetzt den bisherigen `declBlock` für `status === 'paid'` — der ENTWURF-Vermerk
entfällt (freigegeben von Eric am 19.08.2026):

```js
var limit = FREIBETRAG[art];
var paragraf = art === '26a'
  ? '§ 3 Nr. 26a EStG (Ehrenamtspauschale)'
  : '§ 3 Nr. 26 EStG (Übungsleiterpauschale)';
var anlage = art === '26a' ? 'Anlage N bzw. Anlage S' : 'Anlage N';

declBlock =
  '<div class="beleg-declaration"><h4>Steuerlicher Hinweis</h4><ul>'
+ '<li>Diese Zahlung ist eine Aufwandsentschädigung nach <strong>' + escape(paragraf)
+ '</strong> für eine nebenberufliche, pflegerisch-betreuende Tätigkeit im ideellen '
+ 'Bereich eines gemeinnützigen Vereins. Sie ist <strong>kein Arbeitslohn und kein '
+ 'Honorar</strong>.</li>'
+ '<li>Sie ist <strong>bis ' + eur(limit) + ' im Kalenderjahr steuer- und '
+ 'sozialversicherungsfrei</strong>. Der Freibetrag gilt <strong>einmal pro Person '
+ 'und Jahr über alle Vereine und Auftraggeber hinweg</strong> — ' + escape(d.verein.name)
+ ' kennt nur die hier gezahlten Beträge (in diesem Jahr: ' + eur(d.jahresSumme)
+ ' von ' + eur(limit) + ').</li>'
+ '<li><strong>Gib diese Zahlung in deiner Einkommensteuererklärung an.</strong> '
+ 'Steuerfreie Aufwandsentschädigungen nach ' + escape(paragraf) + ' werden in der '
+ '<strong>' + anlage + '</strong> eingetragen. Steuer fällt nur auf den Teil an, der '
+ 'den Jahresfreibetrag übersteigt. <strong>Bewahre diesen Beleg auf</strong> und lege '
+ 'ihn auf Nachfrage des Finanzamts vor.</li>'
+ '<li>Beträge über dem Freibetrag sind von dir zu versteuern und können '
+ 'sozialversicherungspflichtig sein. Die Auszahlung erfolgt auf Grundlage deiner '
+ 'Selbstauskunft im Antrag; für Richtigkeit und Vollständigkeit bist du selbst '
+ 'verantwortlich.</li>'
+ '<li>Dieser Beleg ersetzt keine Steuerberatung. Der Verein übernimmt keine Haftung '
+ 'für die individuelle steuerliche oder sozialversicherungsrechtliche Behandlung; bei '
+ 'Fragen wende dich an dein Finanzamt oder eine Steuerberatung. Die Antragsunterlagen '
+ 'werden beim Verein zehn Jahre aufbewahrt (§ 147 AO, Art. 6 Abs. 1 lit. c DSGVO).</li>'
+ '</ul>'
+ (c.notes ? '<p class="muted"><strong>Anmerkung:</strong> ' + escape(c.notes) + '</p>' : '')
+ '</div>';
```

Der Block für noch nicht ausgezahlte Anträge („Erklärungen der/des
Ehrenamtlichen") bleibt unverändert.

- [ ] **Schritt 4: `abrechnung.html` auf die Vorlage umstellen**

Skript einbinden (vor dem Seitenskript, mit Versionsangabe wie bei `app.js`):

```html
<script src="beleg-vorlage.js?v20260819a"></script>
```

`showBeleg` behält seine Aufgabe (Daten sammeln, Container füllen) und ruft für
den Inhalt die Vorlage:

```js
document.getElementById('beleg-content').innerHTML = LPRBeleg.belegHtml({
  claim: c,
  person: _profile || {},
  verein: { name: VEREIN.name, adresse: VEREIN.adresse, register: VEREIN.register },
  jahresSumme: jahresSummeAusgezahlt(c),
  beschlussDatum: BESCHLUSS_DATUM
});
```

`jahresSummeAusgezahlt(c)` ist die bisherige Rechnung aus `showBeleg`: Summe der
`paid`-Anträge gleicher `pauschale_art` im Jahr von `paid_at`.

- [ ] **Schritt 5: Prüfen**

Wegwerf-Kopie von `abrechnung.html` mit Stubs für `LPR.getMyClaims` (je ein
Antrag mit `status: 'submitted'` und einer mit `status: 'paid'`, einer davon ohne
`amount_breakdown`) über `python3 -m http.server` ausliefern, Beleg öffnen.
Erwartet: beide Fassungen wie vorher, beim ausgezahlten der neue Steuerhinweis
ohne ENTWURF-Vermerk, beim nacherfassten die Ersatzzeile statt der
Positionstabelle. Keine Konsolenfehler.

- [ ] **Schritt 6: Commit**

```bash
git add beleg-vorlage.js abrechnung.html
git commit -m "feat(beleg): Vorlage herausgeloest, Steuerhinweis freigegeben"
```

---

### Task 3: Edge Function `claim-mails`

**Dateien:**
- Erstellen: `functions/claim-mails/index.ts` (außerhalb Git)
- Vorhanden nutzen: `functions/mailer-resend.ts`

- [ ] **Schritt 1: Grundgerüst mit Zugangsschutz**

Die Function nimmt zwei Aufrufe entgegen: den Webhook (Payload mit `type`,
`record`, `old_record`) und einen direkten Aufruf mit `{ claim_id, force }`.
Beide müssen den Secret-Header mitbringen (eigenes Secret, nicht das der
bestehenden Function); ohne ihn 401. Ohne gültigen Body 400. Antwort immer
`200 { ok, sent: [...] }`, wenn nichts zu tun ist — ein Fehlerstatus ließe den
Webhook wiederholen und damit Mails doppeln.

- [ ] **Schritt 2: Daten laden**

Mit dem Service-Role-Key (Secret der Function, nicht im Browser) laden:
Antrag aus `claims`, Person aus `profiles` (`full_name, email, iban,
personalnummer`), bei `source_type = 'trip'` Reisetitel über `trip_signups →
trips`, sonst Datum/Schicht aus `bookings`, sowie die Jahressumme der bereits
ausgezahlten Beträge gleicher `pauschale_art` für den Beleg.

- [ ] **Schritt 3: Entscheidungslogik**

```ts
// Genau ein Schritt je Aufruf. Der Stempel wird NACH erfolgreichem Versand
// gesetzt: lieber eine Mail zweimal als eine, die niemand vermisst.
const A = { finanzen: 'finanzen@lebenpflegenreisen.de', vorstand: 'vorstand@lebenpflegenreisen.de' };

if (claim.status === 'submitted' && (!claim.intake_mail_at || force)) {
  await eingangsmeldung();          // an A.finanzen, Kopie A.vorstand
} else if (claim.status === 'approved' && (!claim.submitted_to_payroll_at || force)) {
  await zahlungsanweisung();        // an A.finanzen, Kopie A.vorstand
} else if (claim.status === 'paid' && (!claim.payout_mail_at || force)) {
  await auszahlungsbeleg();         // an die Person
}
```

- [ ] **Schritt 4: Die drei Mails**

Betreffzeilen und Inhalte:

```ts
// 1) Eingangsmeldung
betreff: `Neuer Antrag: ${person.full_name} — ${eur(claim.amount)}`
// Inhalt: Name + Personalnummer, Tätigkeit (Reisebegleitung „<Reisetitel>" bzw.
// Sitzwache am <Datum>), Zeitraum, Betrag, eingereicht am, Link
// https://mein.lebenpflegenreisen.de/admin-sitzwachen.html
// Schlusssatz: „Bitte im Portal freigeben — die Zahlungsanweisung folgt
// automatisch, sobald der Antrag freigegeben ist."

// 2) Zahlungsanweisung
betreff: `Zahlungsanweisung: ${eur(claim.amount)} an ${person.full_name}`
// Inhalt: Empfänger, Personalnummer, IBAN, Betrag,
// Verwendungszweck: `Aufwandsentschädigung ${zeitraum} · Antrag ${kurzId}`,
// freigegeben am. Fehlt die IBAN, steht an ihrer Stelle in Fettschrift:
// „IBAN fehlt im Profil — bitte beim Mitglied nachfordern, Überweisung erst danach."
// Schlusssatz: „Nach der Überweisung im Portal auf ‚Als ausgezahlt markieren'.
// Das verschickt den Auszahlungsbeleg an das Mitglied."

// 3) Auszahlungsbeleg
betreff: `Auszahlungsbeleg ${claim.beleg_nr ?? ''} — Aufwandsentschädigung ${eur(claim.amount)}`
// Inhalt: zwei Sätze Begleittext („Die Aufwandsentschädigung ist überwiesen.
// Der Beleg unten gehört zu deinen Steuerunterlagen."), darunter das Ergebnis
// von LPRBeleg.belegHtml(...) mit maskierter IBAN.
```

Absender ist `ABSENDER.info` aus `mailer-resend.ts` (Hauptdomain — die
`send.`-Subdomain wird von Resend mit 403 abgelehnt). Jede Mail bekommt eine
Textfassung mit denselben Angaben; `sendMail` verlangt sie.

- [ ] **Schritt 5: Beleg-Vorlage laden**

```ts
// Eine Wahrheitsquelle für Bildschirm und Mail. Die Versionsangabe muss beim
// Ändern der Vorlage mitgezogen werden, sonst liefert der Deno-Cache die alte.
await import('https://mein.lebenpflegenreisen.de/beleg-vorlage.js?v20260819a');
const html = (globalThis as any).LPRBeleg.belegHtml({ ... });
```

Der Beleg braucht die Stile aus `abrechnung.html` (`.beleg-*`). Für die Mail
werden sie als `<style>`-Block vorangestellt — Mailprogramme ignorieren externe
Stylesheets. Der Block wird aus `abrechnung.html` übernommen und in der Function
als Konstante gehalten.

- [ ] **Schritt 6: Stempel setzen**

Nach `ok: true` von `sendMail` das jeweilige Feld auf `now()` setzen. Bei
`ok: false` Fehler ins Log (`console.error`) und Stempel **nicht** setzen, damit
der Knopf „Mail erneut senden" greift.

- [ ] **Schritt 7: Ausrollen und einzeln prüfen**

Function im Supabase-Dashboard anlegen und den Code einfügen (kein CLI in diesem
Projekt), Secrets setzen: das eigene Aufruf-Secret und `RESEND_API_KEY` (schon
vorhanden). Prüfung per direktem Aufruf mit `claim_id` eines Testantrags und
`force: true`, einmal je Status. Erwartet: HTTP 200, Mail kommt an, Stempel
gesetzt.

Versandweg gegenprüfen wie gehabt: Testmail an ein Gmail-Konto, dort
„Original anzeigen", `dkim=pass` mit `d=lebenpflegenreisen.de`.

---

### Task 4: Webhook einrichten, alten Zweig abklemmen

- [ ] **Schritt 1: Webhook anlegen**

Im Dashboard unter Database → Webhooks: Tabelle `claims`, Ereignisse INSERT und
UPDATE, Ziel die neue Function, Secret-Header mitgeben.

- [ ] **Schritt 2: `claims`-Zweig in `notify-booking` abklemmen**

Den bestehenden `claims`-Webhook auf `notify-booking` löschen (oder in der
Function den claims-Zweig entfernen). Sonst geht die Auszahlungsmail doppelt raus
— einmal alt, einmal neu.

- [ ] **Schritt 3: Prüfen**

Testantrag im SQL-Editor auf `approved` setzen und wieder zurück. Erwartet: genau
eine Mail an finanzen@ mit Kopie an vorstand@, `submitted_to_payroll_at` gesetzt.
Zweiter identischer Statuswechsel darf **keine** zweite Mail erzeugen.

---

### Task 5: Browser-Weg zurückbauen

**Dateien:**
- Ändern: `abrechnung.html` (Absenden-Ablauf ~Zeilen 1250–1350)
- Ändern: `app.js` (`uploadClaimPdf` ~1869, `sendClaimToPayroll` ~1907, Export-Liste ~3676)

- [ ] **Schritt 1: Ablauf kürzen**

Nach erfolgreichem `submitTripClaim`/`submitSitzClaim` entfallen PDF-Erzeugung,
Storage-Upload, `sendClaimToPayroll` und `showPayrollFallback`. Stattdessen:

```js
showToast('Antrag eingegangen — der Vorstand prüft ihn.', 'success');
await loadAll();
showBeleg(claimId);
```

- [ ] **Schritt 2: Tote Funktionen entfernen**

`uploadClaimPdf` und `sendClaimToPayroll` aus `app.js` und aus der Export-Liste
löschen. Die Edge Function `send-claim-to-payroll` im Dashboard erst löschen,
wenn Task 4 einmal echt durchgelaufen ist — sie ist bis dahin die Rückfallebene.

- [ ] **Schritt 3: Prüfen**

Wegwerf-Kopie mit Stub für `submitTripClaim`; Antrag stellen. Erwartet: Meldung
„Antrag eingegangen", kein Aufruf von `functions.invoke`, keine Konsolenfehler,
Antragsbestätigung wird angezeigt.

- [ ] **Schritt 4: Commit**

```bash
git add abrechnung.html app.js
git commit -m "refactor(antraege): Mailversand raus aus dem Browser"
```

---

### Task 6: Vorstandsliste — Stempel zeigen, Mail nachschicken

**Dateien:**
- Ändern: `admin-sitzwachen.html` (`renderClaims` ~Zeile 540, `onClaimAction` ~Zeile 580)
- Ändern: `app.js` (neue Funktion neben `adminSetClaimStatus` ~Zeile 3110)

- [ ] **Schritt 1: `resendClaimMail` in `app.js`**

```js
// Ruft claim-mails direkt auf, mit force: die Function ueberspringt dann den
// gesetzten Zeitstempel. Fuer den Fall, dass ein Versand stillschweigend
// gescheitert ist.
async function resendClaimMail(claimId) {
  const s = getSession();
  if (!s || s.role !== 'admin') return { ok: false, error: 'Nur für den Vorstand.' };
  try {
    const { data, error } = await (await sb())
      .functions.invoke('claim-mails', { body: { claim_id: claimId, force: true } });
    if (error) return { ok: false, error: error.message };
    if (data && data.error) return { ok: false, error: data.error };
    return { ok: true, sent: data && data.sent };
  } catch(e) {
    console.error('[LPR] resendClaimMail:', e);
    return { ok: false, error: 'Netzwerkfehler.' };
  }
}
```

In die Export-Liste aufnehmen.

- [ ] **Schritt 2: Spalte „Mail" in der Antragsliste**

Je Zeile ein Kürzel aus den drei Stempeln, damit auf einen Blick sichtbar ist,
wo ein Versand hängt:

```js
var mailSpalte = [
  c.intake_mail_at            ? 'Eingang ✓'   : 'Eingang —',
  c.submitted_to_payroll_at   ? 'Finanzen ✓'  : 'Finanzen —',
  c.payout_mail_at            ? 'Beleg ✓'     : 'Beleg —'
].join(' · ');
```

Ist der zum Status passende Stempel leer, zusätzlich der Knopf:

```js
'<button class="as-btn" data-act="resend" data-id="' + c.id + '">Mail erneut senden</button>'
```

- [ ] **Schritt 3: Aktion verdrahten**

In `onClaimAction` den Zweig ergänzen:

```js
if (act === 'resend') {
  btn.disabled = true;
  const res = await LPR.resendClaimMail(id);
  toast(res.ok ? 'Mail verschickt.' : (res.error || 'Versand fehlgeschlagen.'), res.ok ? undefined : 'warn');
  await loadClaims();
  return;
}
```

- [ ] **Schritt 4: Prüfen**

Wegwerf-Kopie mit Stub für `adminListClaims` (je ein Antrag mit gesetztem und
fehlendem Stempel). Erwartet: Spalte zeigt die Häkchen richtig, der Knopf
erscheint nur bei fehlendem Stempel des aktuellen Status.

- [ ] **Schritt 5: Commit**

```bash
git add admin-sitzwachen.html app.js
git commit -m "feat(antraege): Mailstatus sichtbar, Nachversand per Knopf"
```

---

### Task 7: Durchlauf am echten Vorgang

- [ ] **Schritt 1: Testantrag anlegen**

Einen Antrag über einen Testzugang stellen (oder per SQL nachtragen). Erwartet:
Mail „Neuer Antrag" bei finanzen@, Kopie bei vorstand@, `intake_mail_at` gesetzt.

- [ ] **Schritt 2: Freigeben**

Im Portal „Freigeben". Erwartet: Zahlungsanweisung mit IBAN und
Verwendungszweck, `submitted_to_payroll_at` gesetzt.

- [ ] **Schritt 3: Auszahlung markieren**

„Als ausgezahlt markieren". Erwartet: Beleg-Mail beim Mitglied, IBAN maskiert,
Beleg-Nr. und Steuerhinweis vorhanden, `payout_mail_at` gesetzt.

- [ ] **Schritt 4: Beleg vergleichen**

Die gemailte Fassung neben die Portalansicht legen. Erwartet: identischer Inhalt
— beide stammen aus `beleg-vorlage.js`.

- [ ] **Schritt 5: Testdaten aufräumen und dokumentieren**

Testantrag löschen, `PORTAL-STAND.md` bzw. die Doku im Repo ergänzen, Push nach
`main` (GitHub Pages liefert direkt aus — vorher prüfen, dass Task 1 auf PROD
ausgeführt ist; erst Migration, dann Push).
