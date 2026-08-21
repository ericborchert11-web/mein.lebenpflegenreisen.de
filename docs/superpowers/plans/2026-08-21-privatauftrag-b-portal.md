# Privatauftrag Sitzwache — Etappe B (Portal) — Umsetzungsplan

> **Für agentische Ausführung:** REQUIRED SUB-SKILL: superpowers:executing-plans.
> Schritte sind Checkboxen.

**Ziel:** Der Vorstand kann einen Privatauftrag im Portal anlegen, buchen und den
Familienlink herausgeben — und überall dort, wo bisher der Klinikname am Klinikkonto
hing, steht bei einem Privatauftrag der Klinik-Freitext statt „Klinik".

**Architektur:** Eigene Seite `admin-auftraege.html` statt eines weiteren Tabs in
`admin-sitzwachen.html` — dort wurde am 20.08. gerade ein Drittel herausgelöst, weil die
Datei zu groß geworden war. Die Datenbank ist fertig (Etappe A); B ist reine
Frontend-Arbeit plus eine dünne API-Schicht in `app.js`.

**Werkzeug-Lage:** Vanilla JS, kein Build, keine Testsuite. Geprüft wird deshalb
zweistufig: statische Kontrollen, die hier laufen (doppelte IDs, Zeichenzähler,
Feldnamen gegen die RPC-Signatur), und ein Browser-Smoke, den Eric eingeloggt fährt.

**Grundlage:** `docs/superpowers/specs/2026-08-21-privatauftrag-sitzwache-design.md`

---

## Dateien

- Ändern: `app.js` — API-Schicht (4 Funktionen) und der Klinikname-Rückfall an 3 Stellen
- Anlegen: `admin-auftraege.html` — Vorstands-Oberfläche
- Ändern: `layout.js` — Menüpunkt „Privataufträge" für board
- Ändern: `einsatz.html` — Steckbrief für die Sitzwache
- **Nicht im Repo:** die Edge Function `notify-booking` (Buchungsmail). Siehe Task 6.

---

### Task 1: API-Schicht in app.js

**Dateien:**
- Ändern: `app.js` — neue Funktionen neben den bestehenden Einsatz-Funktionen, Export im
  Rückgabeobjekt ab Zeile 3835

- [ ] **Schritt 1: Funktionen schreiben**

```js
  /* ───────── Privataufträge (board) ─────────
   * Die Familie hat kein Konto. Der Vorstand legt den Auftrag an und bekommt den
   * Zugangsschluessel GENAU EINMAL zurueck — gespeichert ist nur sein Pruefwert.
   * Wer ihn verliert, holt sich per adminAuftragLinkNeu einen neuen; der alte
   * verfaellt dabei.
   */
  async function adminAuftragAnlegen(daten) {
    const s = getSession();
    if (!s) return { ok: false, error: 'Nicht eingeloggt.' };
    try {
      const client = await sb();
      const { data, error } = await client.rpc('auftrag_anlegen', {
        p_name:       daten.name,
        p_email:      daten.email,
        p_phone:      daten.phone || null,
        p_vertretung: daten.vertretung,
        p_vermerk:    daten.vermerk || null,
        p_klinik:     daten.klinik,
        p_datum:      daten.datum,
        p_schicht:    daten.schicht
      });
      if (error) return { ok: false, error: error.message };
      const row = Array.isArray(data) ? data[0] : data;
      return { ok: true, auftragId: row.auftrag_id, token: row.token };
    } catch(e) {
      console.error('[LPR] adminAuftragAnlegen:', e);
      return { ok: false, error: 'Netzwerkfehler.' };
    }
  }

  async function adminAuftragBuchen(auftragId) {
    const s = getSession();
    if (!s) return { ok: false, error: 'Nicht eingeloggt.' };
    try {
      const client = await sb();
      const { data, error } = await client.rpc('auftrag_buchen', { p_auftrag: auftragId });
      if (error) return { ok: false, error: error.message };
      const row = Array.isArray(data) ? data[0] : data;
      return { ok: true, bookingId: row.booking_id, volunteerName: row.volunteer_name };
    } catch(e) {
      console.error('[LPR] adminAuftragBuchen:', e);
      return { ok: false, error: 'Netzwerkfehler.' };
    }
  }

  async function adminAuftragLinkNeu(auftragId) {
    const s = getSession();
    if (!s) return { ok: false, error: 'Nicht eingeloggt.' };
    try {
      const client = await sb();
      const { data, error } = await client.rpc('auftrag_link_neu', { p_auftrag: auftragId });
      if (error) return { ok: false, error: error.message };
      return { ok: true, token: data };
    } catch(e) {
      console.error('[LPR] adminAuftragLinkNeu:', e);
      return { ok: false, error: 'Netzwerkfehler.' };
    }
  }

  // Liste fuer die Vorstandsseite. Liest per Policy (auftraege_select_board),
  // nicht per RPC — Lesen braucht keine Definer-Rechte.
  async function adminListAuftraege() {
    const s = getSession();
    if (!s) return { ok: false, error: 'Nicht eingeloggt.', auftraege: [] };
    try {
      const client = await sb();
      const { data, error } = await client.from('auftraege')
        .select('id, auftraggeber_name, auftraggeber_email, auftraggeber_phone, ' +
                'vertretung, vertretung_vermerk, klinik_name, station, zimmer, ' +
                'patient_name, fallnummer, dienst_datum, dienst_schicht, ' +
                'briefing_bestaetigt_at, token_gueltig_bis, created_at')
        .order('dienst_datum', { ascending: false });
      if (error) return { ok: false, error: error.message, auftraege: [] };
      const rows = data || [];
      const ids = rows.map(a => a.id);
      let bkMap = {};
      if (ids.length) {
        const { data: bks } = await client.from('bookings')
          .select('id, auftrag_id, status, volunteer_id')
          .in('auftrag_id', ids);
        (bks || []).forEach(b => {
          if (['cancelled', 'no_show'].indexOf(b.status) === -1) bkMap[b.auftrag_id] = b;
        });
      }
      return { ok: true, auftraege: rows.map(a => ({ ...a, buchung: bkMap[a.id] || null })) };
    } catch(e) {
      console.error('[LPR] adminListAuftraege:', e);
      return { ok: false, error: 'Netzwerkfehler.', auftraege: [] };
    }
  }

  // Aus dem Zugangsschluessel wird der Link, den die Familie bekommt.
  function auftragLink(token) {
    return location.origin + '/auftrag.html?t=' + encodeURIComponent(token);
  }
```

- [ ] **Schritt 2: Exportieren**

Im Rückgabeobjekt (`app.js`, bei den anderen Einsatz-Exports) ergänzen:

```js
    adminAuftragAnlegen, adminAuftragBuchen, adminAuftragLinkNeu,
    adminListAuftraege, auftragLink,
```

- [ ] **Schritt 3: Statische Kontrolle — Parameternamen gegen die RPC-Signatur**

```bash
grep -oE "p_[a-z_]+:" app.js | sort -u
```

Erwartet für die drei neuen Aufrufe genau: `p_auftrag:`, `p_datum:`, `p_email:`,
`p_klinik:`, `p_name:`, `p_phone:`, `p_schicht:`, `p_vermerk:`, `p_vertretung:`.
Ein Tippfehler hier ergibt zur Laufzeit `PGRST202` („function … does not exist"), nicht
etwa einen Fehler beim Speichern — deshalb vorab prüfen.

- [ ] **Schritt 4: Commit**

```bash
git add app.js
git commit -m "feat(auftraege): API-Schicht fuer privat beauftragte Dienste"
```

---

### Task 2: Klinikname-Rückfall

Bei einem Privatauftrag ist `clinic_id` leer. An drei Stellen im Repo hängt der
Klinikname daran; ohne Rückfall steht dort stumm „Klinik" oder „—".

**Dateien:**
- Ändern: `app.js:1172` und `app.js:1180` (`getMyBookings`)
- Ändern: `app.js:1443`, `app.js:1457`, `app.js:1478` (`getEinsatzKontext`)
- Ändern: `app.js:3033` und `app.js:3050` (`adminListBookings`)

- [ ] **Schritt 1: `getMyBookings`**

In der Select-Liste `auftrag_id, auftraege(klinik_name)` ergänzen:

```js
        .select('id, request_id, clinic_id, auftrag_id, date, shift, hours, compensation_eur, status, station, fallnummer, patient_room, patient_flags, patient_notes, created_at, station_phone, unterwegs_ts, eta_ts, profiles!bookings_clinic_id_fkey(full_name), auftraege(klinik_name)')
```

Und in der Zuordnung:

```js
        clinic_id: b.clinic_id,
        auftrag_id: b.auftrag_id,
        // Klinikkonto oder Privatauftrag — fuer die Anzeige ist beides „die Klinik".
        clinic_name: (b.profiles && b.profiles.full_name)
                  || (b.auftraege && b.auftraege.klinik_name)
                  || null,
```

- [ ] **Schritt 2: `getEinsatzKontext`**

Beide Select-Listen um `auftraege(klinik_name)` ergänzen (Zeilen 1443 und 1457), und in
der Funktion `map`:

```js
      const map = b => ({
        id: b.id, date: b.date, shift: b.shift, status: b.status,
        station: b.station, fallnummer: b.fallnummer,
        klinik: (b.profiles && b.profiles.full_name)
             || (b.auftraege && b.auftraege.klinik_name)
             || 'Klinik'
      });
```

- [ ] **Schritt 3: `adminListBookings`**

`auftrag_id` in die Select-Liste aufnehmen, dann neben `clinic_details` auch die
Auftragsnamen laden:

```js
      const volIds = [...new Set(rows.map(b => b.volunteer_id).filter(Boolean))];
      const cliIds = [...new Set(rows.map(b => b.clinic_id).filter(Boolean))];
      const aufIds = [...new Set(rows.map(b => b.auftrag_id).filter(Boolean))];
      const [profRes, cdRes, aufRes] = await Promise.all([
        volIds.length ? client.from('profiles').select('id, full_name').in('id', volIds) : Promise.resolve({ data: [] }),
        cliIds.length ? client.from('clinic_details').select('id, clinic_name').in('id', cliIds) : Promise.resolve({ data: [] }),
        aufIds.length ? client.from('auftraege').select('id, klinik_name').in('id', aufIds) : Promise.resolve({ data: [] })
      ]);
      const volMap = {}; (profRes.data || []).forEach(p => { volMap[p.id] = p.full_name; });
      const cliMap = {}; (cdRes.data  || []).forEach(c => { cliMap[c.id] = c.clinic_name; });
      const aufMap = {}; (aufRes.data || []).forEach(a => { aufMap[a.id] = a.klinik_name; });
      return { ok: true, bookings: rows.map(b => ({
        ...b,
        volunteer_name: volMap[b.volunteer_id] || '—',
        clinic_name:    cliMap[b.clinic_id] || aufMap[b.auftrag_id] || '—',
        privat:         !!b.auftrag_id
      })) };
```

- [ ] **Schritt 4: Statische Kontrolle**

```bash
grep -c "auftraege(klinik_name)" app.js   # erwartet: 3
grep -n "clinic_name:" app.js             # jede Zeile muss einen Rueckfall haben
```

- [ ] **Schritt 5: Commit**

```bash
git add app.js
git commit -m "fix(buchungen): Klinikname faellt auf den Privatauftrag zurueck"
```

---

### Task 3: Vorstands-Oberfläche `admin-auftraege.html`

Eigene Seite, board-only, nach dem Muster von `admin-rechnungen.html`: `shared.css`,
`LPR_Layout.init()` mit Navigation, Tabelle plus ein Dialog zum Anlegen.

**Inhalt der Liste je Auftrag:** Datum und Schicht, Klinik-Freitext, Auftraggeber,
Vertretungsgrundlage, ob das Briefing da ist, ob gebucht ist und wer den Dienst hat.
**Drei Aktionen:** „Buchen", „Link anzeigen" (nur direkt nach dem Anlegen bzw. nach
„Link ersetzen"), „Link ersetzen".

- [ ] **Schritt 1: Seite anlegen**

Kopfbereich, Tabelle und Dialog. Wichtig sind drei Dinge, an denen dieses Projekt schon
einmal Zeit verloren hat:

1. **Der Link wird genau einmal angezeigt.** Nach dem Anlegen steht er in einem
   Hinweisfeld mit „Kopieren"-Knopf und dem Satz, dass er nicht wieder abrufbar ist.
   Kein `localStorage`, keine zweite Anzeige.
2. **Zeichenzähler im Code klemmen**, nicht nur `maxlength` setzen — `maxlength` bremst
   nur Tastatureingaben.
3. **Jede ID im Dokument genau einmal.** Prüfung in Schritt 3.

```html
<!-- Kern der Seite; Kopf, Styles und LPR_Layout.init wie in admin-rechnungen.html -->
<section class="karte">
  <div class="kopfzeile">
    <h1>Privataufträge</h1>
    <button class="btn" id="neu-oeffnen">Auftrag anlegen</button>
  </div>
  <div id="link-hinweis" class="hinweis" hidden>
    <strong>Link für die Familie</strong>
    <code id="link-wert"></code>
    <button class="btn" id="link-kopieren">Kopieren</button>
    <p class="muted">Dieser Link wird nur jetzt angezeigt. Später lässt er sich nur
      ersetzen, nicht erneut abrufen.</p>
  </div>
  <div id="liste" class="liste" aria-live="polite">Wird geladen …</div>
</section>

<dialog id="neu-dialog">
  <form method="dialog" id="neu-form">
    <h2>Privatauftrag anlegen</h2>
    <label>Auftraggeber<input id="f-name" required maxlength="120"></label>
    <label>E-Mail<input id="f-email" type="email" required maxlength="120"></label>
    <label>Telefon<input id="f-phone" maxlength="40"></label>
    <label>Vertretungsgrundlage
      <select id="f-vertretung" required>
        <option value="patient_selbst">Patient willigt selbst ein</option>
        <option value="vollmacht">Vorsorgevollmacht</option>
        <option value="betreuung">Gesetzliche Betreuung</option>
      </select>
    </label>
    <label>Wie wurde die Vertretung belegt?
      <input id="f-vermerk" maxlength="200">
      <span class="muted" id="f-vermerk-zaehler">200</span>
    </label>
    <label>Klinik<input id="f-klinik" required maxlength="120"></label>
    <label>Datum<input id="f-datum" type="date" required></label>
    <label>Schicht
      <select id="f-schicht" required>
        <option value="morning">Frühdienst 06–14</option>
        <option value="afternoon">Spätdienst 14–22</option>
        <option value="night">Nachtdienst 22–06</option>
      </select>
    </label>
    <div class="dialog-fuss">
      <button type="button" class="btn" id="neu-abbrechen">Abbrechen</button>
      <button type="button" class="btn primary" id="neu-ok">Anlegen</button>
    </div>
  </form>
</dialog>
```

- [ ] **Schritt 2: Verhalten**

```js
const $ = id => document.getElementById(id);

// Vertretungsgrundlage steuert, ob der Vermerk Pflicht ist — dieselbe Regel wie
// in der Datenbank (auftraege_vertretungsgrundlage_belegt_check).
function vermerkPflicht() {
  return $('f-vertretung').value !== 'patient_selbst';
}
$('f-vertretung').addEventListener('change', () => {
  $('f-vermerk').required = vermerkPflicht();
});

// maxlength bremst nur Tastatureingaben — Zaehler zusaetzlich im Code klemmen.
$('f-vermerk').addEventListener('input', e => {
  if (e.target.value.length > 200) e.target.value = e.target.value.slice(0, 200);
  $('f-vermerk-zaehler').textContent = String(200 - e.target.value.length);
});

$('neu-ok').addEventListener('click', async () => {
  const vermerk = $('f-vermerk').value.trim();
  if (vermerkPflicht() && vermerk.length < 5) {
    LPR.showToast('Bitte festhalten, wie die Vertretung belegt wurde.', 'warn');
    return;
  }
  $('neu-ok').disabled = true;
  const res = await LPR.adminAuftragAnlegen({
    name: $('f-name').value.trim(),
    email: $('f-email').value.trim(),
    phone: $('f-phone').value.trim(),
    vertretung: $('f-vertretung').value,
    vermerk: vermerk,
    klinik: $('f-klinik').value.trim(),
    datum: $('f-datum').value,
    schicht: $('f-schicht').value
  });
  $('neu-ok').disabled = false;
  if (!res.ok) { LPR.showToast(res.error, 'warn'); return; }
  $('neu-dialog').close();
  linkZeigen(res.token);
  await listeLaden();
});

function linkZeigen(token) {
  $('link-wert').textContent = LPR.auftragLink(token);
  $('link-hinweis').hidden = false;
}
$('link-kopieren').addEventListener('click', async () => {
  await navigator.clipboard.writeText($('link-wert').textContent);
  LPR.showToast('Link kopiert.');
});
```

Buchen und Link ersetzen hängen an der Liste (Ereignis-Delegation, damit keine
Zuhörer je Zeile entstehen):

```js
$('liste').addEventListener('click', async ev => {
  const btn = ev.target.closest('button[data-aktion]');
  if (!btn) return;
  const id = btn.dataset.id;
  btn.disabled = true;
  if (btn.dataset.aktion === 'buchen') {
    const res = await LPR.adminAuftragBuchen(id);
    LPR.showToast(res.ok ? ('Gebucht: ' + res.volunteerName) : res.error,
                  res.ok ? undefined : 'warn');
  } else if (btn.dataset.aktion === 'link-neu') {
    const res = await LPR.adminAuftragLinkNeu(id);
    if (res.ok) linkZeigen(res.token); else LPR.showToast(res.error, 'warn');
  }
  btn.disabled = false;
  await listeLaden();
});
```

- [ ] **Schritt 3: Statische Kontrollen**

```bash
# Doppelte IDs — der Fehler, der beim Storno-Dialog sieben Mal zuschlug
grep -oE 'id="[^"]+"' admin-auftraege.html | sort | uniq -d
# erwartet: keine Ausgabe

# showToast kennt nur 'warn' als zweiten Wert
grep -oE "showToast\([^)]*\)" admin-auftraege.html | grep -v "'warn'" | grep ","
# erwartet: keine Ausgabe
```

- [ ] **Schritt 4: Commit**

```bash
git add admin-auftraege.html
git commit -m "feat(auftraege): Vorstandsseite fuer privat beauftragte Dienste"
```

---

### Task 4: Menüpunkt

**Dateien:**
- Ändern: `layout.js` — board-Menü

- [ ] **Schritt 1: Eintrag ergänzen**

„Privataufträge" neben „Sitzwachen" einhängen, board-only, nach demselben Muster wie die
übrigen Vorstandspunkte.

- [ ] **Schritt 2: Gegenprobe, dass es board-only ist**

```bash
grep -n "Privatauftr" layout.js
```

Der Eintrag muss im selben Block stehen wie die anderen board-Punkte — steht er im
allgemeinen Teil, sieht ihn jede Ehrenamtliche und läuft in eine leere Seite.

- [ ] **Schritt 3: Commit**

```bash
git add layout.js
git commit -m "feat(nav): Menuepunkt Privatauftraege fuer den Vorstand"
```

---

### Task 5: Steckbrief in `einsatz.html`

Die Sitzwache soll das Briefing beim Start sehen. Die Policy dafür steht
(`auftraege_select_volunteer` über `user_has_auftrag`).

**Dateien:**
- Ändern: `app.js` — `getEinsatzKontext` liefert das Briefing mit
- Ändern: `einsatz.html` — Anzeige auf dem Startbildschirm

- [ ] **Schritt 1: Briefing mitliefern**

In beiden Select-Listen von `getEinsatzKontext` statt nur `klinik_name` die
Briefing-Felder holen:

```js
'auftraege(klinik_name, ansprache, sprache, brille, hoergeraet, beruhigt, beunruhigt, biografie, themen_gut, themen_meiden, nachts_anrufbar, station_phone)'
```

und in `map` als `briefing: b.auftraege || null` durchreichen.

- [ ] **Schritt 2: Anzeige**

Ein Block „Zur Person" auf dem Startbildschirm, nur sichtbar wenn `briefing` gesetzt ist.
Reine Anzeige, kein Eingabefeld: die Sitzwache ändert das Briefing nicht.

```js
function steckbriefZeigen(briefing) {
  const box = $('steckbrief');
  if (!briefing) { box.hidden = true; return; }
  const zeilen = [
    ['Ansprache', briefing.ansprache],
    ['Sprache', briefing.sprache],
    ['Hilfsmittel', [briefing.brille ? 'Brille' : null,
                     briefing.hoergeraet ? 'Hörgerät' : null].filter(Boolean).join(', ')],
    ['Beruhigt', briefing.beruhigt],
    ['Beunruhigt', briefing.beunruhigt],
    ['Zur Person', briefing.biografie],
    ['Gute Themen', briefing.themen_gut],
    ['Besser meiden', briefing.themen_meiden],
    ['Nachts erreichbar', briefing.nachts_anrufbar]
  ].filter(z => z[1]);
  if (!zeilen.length) { box.hidden = true; return; }
  box.innerHTML = '<h3>Zur Person</h3>' + zeilen.map(z =>
    '<p><strong>' + LPR.escape(z[0]) + ':</strong> ' + LPR.escape(z[1]) + '</p>').join('');
  box.hidden = false;
}
```

- [ ] **Schritt 3: Commit**

```bash
git add app.js einsatz.html
git commit -m "feat(einsatz): Steckbrief aus dem Familien-Briefing"
```

---

### Task 6: Buchungsmail — nur benennen, nicht ändern

Die Edge Function `notify-booking` liegt **nicht im Repo** (`functions/` ist gitignored
und enthält lokal nur `claim-mails` und `send-push`). Sie baut die Buchungsmail an die
Sitzwache und löst den Kliniknamen serverseitig auf.

- [ ] **Schritt 1: Im Supabase-Dashboard nachsehen**, woher `notify-booking` den
  Klinikname nimmt (`profiles` über `clinic_id` oder `clinic_details`).

- [ ] **Schritt 2: Befund festhalten und entscheiden.** Steht dort ein
  Klinikkonto-Zugriff ohne Rückfall, bekommt eine Sitzwache bei einem Privatauftrag eine
  Mail ohne Ortsangabe. Der Umbau ist dann ein eigener kleiner Schritt mit Redeploy —
  bewusst nicht Teil dieses Plans, weil die Quelle außerhalb des Repos gepflegt wird.

---

### Task 7: Browser-Smoke durch Eric

Ohne Login geht das nicht; Claude kann sich weder anmelden noch Konten anlegen.

- [ ] Als Vorstand `admin-auftraege.html` öffnen, Auftrag anlegen → Link erscheint genau
  einmal, Kopieren funktioniert.
- [ ] „Buchen" → eine Sitzwache wird zugeteilt, die Zeile zeigt den Namen.
- [ ] Zweites „Buchen" auf demselben Auftrag → Meldung „bereits eine Buchung", keine
  zweite Zeile.
- [ ] „Link ersetzen" → neuer Link erscheint; der alte darf danach nicht mehr
  funktionieren (Prüfung erst in Etappe C, wenn `auftrag.html` existiert).
- [ ] Vertretungsgrundtyp „Betreuung" ohne Vermerk → Formular blockt, bevor der Server
  ablehnt.
- [ ] In `admin-sitzwachen.html` steht bei der neuen Buchung der Klinik-Freitext, nicht
  „—".
- [ ] Als zugeteilte Sitzwache: Buchungskarte zeigt den Klinik-Freitext, `einsatz.html`
  zeigt den Steckbrief.
- [ ] Postfach der Sitzwache: **eine** Buchungsmail zur neuen Buchung, danach beim
  Bearbeiten des Auftrags keine weitere.

---

## Nicht Teil dieser Etappe

`auftrag.html` (Etappe C) und der Einsatzbericht per Mail (Etappe D). Ohne C kann die
Familie das Briefing noch nicht ausfüllen — der Vorstand trägt Station, Zimmer und
Fallnummer bis dahin selbst nach oder lässt sie leer; die Sitzwache erfragt sie wie
bisher vor Ort.
