# Leistungsvorlagen Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der Vorstand kann jede Rechnungsposition als benannte Vorlage sichern und sie in späteren Rechnungen per Auswahl einfügen, überschreiben und wieder löschen.

**Architecture:** Eine neue Supabase-Tabelle `invoice_item_templates` mit RLS (nur `is_board()`) und einem eindeutigen Index auf `lower(name)`. Im Frontend drei Funktionen im bestehenden Block D von `app.js` und drei Bedienelemente in `rechnung.html` — Einfüge-Auswahl, Sichern-Knopf je Zeile, Pflege-Dialog. Keine neue Seite, kein neuer Menüpunkt.

**Tech Stack:** Statisches HTML/CSS/JS, Supabase (PostgREST), `@supabase/supabase-js@2.45.4` via CDN, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-08-15-leistungsvorlagen-design.md`

---

## Vorbemerkung zur Verifikation

Wie in Etappe 1: keine Testsuite, kein Node-Toolchain. Die Datenbank wird mit
Fail-First-SQL geprüft, der Browser mit Konsolen-Prüfblöcken und benannten
Klick-Pfaden. SQL liegt im gitignorten Ordner `sql/` und wird im
Supabase-Dashboard ausgeführt (Projekt `makvwfznbwpjdzmuegoq` → SQL Editor).

**Zwei Dinge, die in Etappe 1 Zeit gekostet haben und hier vorweggenommen sind:**

1. Fremdschlüssel-Typen nicht raten. Diese Tabelle hat keinen Fremdschlüssel —
   deshalb kann hier nichts wie bei `clinics.id` (text statt uuid) schiefgehen.
2. Der SQL-Editor bringt kein JWT mit, `is_board()` ist deshalb dort `false`.
   Der Test in Task 1 kommt ohne `is_board()` aus; er prüft die Tabelle als
   `postgres` und den Zugriffsschutz über den Browser (Task 5).

---

## Dateiübersicht

| Datei | Verantwortung |
|---|---|
| `sql/2026-08-15-c-leistungsvorlagen.sql` (gitignored) | Tabelle, eindeutiger Index, RLS, Policy |
| `sql/2026-08-15-test-c.sql` (gitignored) | Fail-First-Prüfung: Struktur und Namens-Eindeutigkeit |
| `app.js` | Block D: `listItemTemplates`, `saveItemTemplate`, `deleteItemTemplate` |
| `rechnung.html` | Einfüge-Auswahl, Sichern-Knopf je Position, Pflege-Dialog |

`layout.js` wird **nicht** angefasst — es entsteht kein Menüpunkt.

---

### Task 1: Tabelle, Index, RLS

**Files:**
- Create: `sql/2026-08-15-c-leistungsvorlagen.sql`
- Create: `sql/2026-08-15-test-c.sql`

- [ ] **Step 1: Den Test schreiben**

Datei `sql/2026-08-15-test-c.sql`:

```sql
-- Test C: Tabelle, RLS, Policy und die Namens-Eindeutigkeit.
-- Erwartet nach der Migration: 'ok 1' bis 'ok 3' und ALLE 3 PRUEFUNGEN BESTANDEN.
do $$
declare
  v_rls boolean; v_policies int; v_idx int; v_id uuid; v_ok boolean;
begin
  -- 1) Struktur: RLS an, genau eine board-Policy
  select c.relrowsecurity into v_rls
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'invoice_item_templates';
  assert v_rls, 'FEHLER: RLS ist nicht an';

  select count(*) into v_policies from pg_policies
   where schemaname = 'public' and tablename = 'invoice_item_templates'
     and qual like '%is_board%';
  assert v_policies = 1, 'FEHLER: erwartet genau eine board-Policy, gefunden: ' || v_policies;
  raise notice 'ok 1 — RLS an, eine board-Policy';

  -- 2) Eindeutiger Index auf lower(name)
  select count(*) into v_idx from pg_indexes
   where schemaname = 'public' and tablename = 'invoice_item_templates'
     and indexdef ilike '%unique%' and indexdef ilike '%lower(name)%';
  assert v_idx = 1, 'FEHLER: eindeutiger Index auf lower(name) fehlt';
  raise notice 'ok 2 — eindeutiger Index auf lower(name)';

  -- 3) Derselbe Name in anderer Schreibweise wird abgewiesen
  insert into public.invoice_item_templates (name, unit_price_cents)
    values ('TESTVORLAGE Beratung', 15000) returning id into v_id;
  v_ok := false;
  begin
    insert into public.invoice_item_templates (name, unit_price_cents)
      values ('testvorlage beratung', 9900);
  exception when unique_violation then v_ok := true; end;
  assert v_ok, 'FEHLER: zwei Vorlagen mit demselben Namen waren moeglich';
  raise notice 'ok 3 — Name ist eindeutig, unabhaengig von Gross-/Kleinschreibung';

  delete from public.invoice_item_templates where id = v_id;
  raise notice 'ALLE 3 PRUEFUNGEN BESTANDEN';
end $$;
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Im Supabase-SQL-Editor ausführen.
Erwartet: `ERROR: relation "public.invoice_item_templates" does not exist` — die
Tabelle gibt es noch nicht. Genau das ist der Fehlschlag.

- [ ] **Step 3: Die Migration schreiben**

Datei `sql/2026-08-15-c-leistungsvorlagen.sql`:

```sql
-- Leistungsvorlagen — Katalog frei benannter Rechnungspositionen.
-- Betraege sind integer in Cent, wie in der gesamten Rechnungsstellung.

create table public.invoice_item_templates (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (btrim(name) <> ''),
  unit_price_cents int  not null default 0,
  created_at       timestamptz not null default now()
);

-- Ein Name existiert genau einmal. Das ist die technische Form der Zusage
-- "erneutes Sichern unter demselben Namen aktualisiert den Preis".
create unique index invoice_item_templates_name_uidx
  on public.invoice_item_templates (lower(name));

alter table public.invoice_item_templates enable row level security;

create policy invoice_item_templates_board on public.invoice_item_templates
  for all to authenticated using (public.is_board()) with check (public.is_board());
```

- [ ] **Step 4: Migration ausführen**

Inhalt in den SQL-Editor, *Run*.
Erwartet: `Success. No rows returned`.

- [ ] **Step 5: Test erneut laufen lassen**

`sql/2026-08-15-test-c.sql` ausführen.
Erwartet im Reiter *Messages*: `ok 1`, `ok 2`, `ok 3`, `ALLE 3 PRUEFUNGEN BESTANDEN`.
Bricht eine `assert`-Zeile ab, ist ihre Meldung der Fehler — nicht weiterbauen.

- [ ] **Step 6: Kein Commit nötig**

`sql/` ist gitignored; in Task 1 entsteht keine versionierte Datei.

---

### Task 2: API in `app.js`

**Files:**
- Modify: `app.js` — Block D, direkt hinter `markInvoicePaid` (aktuell endet die
  Funktion auf Zeile 3247, `global.LPR = {` beginnt auf Zeile 3249)

- [ ] **Step 1: Den Prüfblock schreiben und scheitern sehen**

Als `vorstand@demo.de` anmelden, Browser-Konsole:

```js
const a = await LPR.listItemTemplates();
console.log('leer:', a.ok, a.templates.length);
const b = await LPR.saveItemTemplate({ name: 'PRUEF Beratung', unit_price_cents: 15000 });
console.log('anlegen:', b.ok, b.updated === false, b.template.unit_price_cents);
const c = await LPR.saveItemTemplate({ name: 'pruef beratung', unit_price_cents: 17000 });
console.log('gleicher Name aktualisiert:', c.ok, c.updated === true, c.template.unit_price_cents);
const d = await LPR.listItemTemplates();
console.log('nur eine Zeile:', d.templates.filter(t => /pruef beratung/i.test(t.name)).length);
const e = await LPR.deleteItemTemplate(c.template.id);
console.log('geloescht:', e.ok, (await LPR.listItemTemplates()).templates.some(t => t.id === c.template.id) === false);
```

Erwartet: `TypeError: LPR.listItemTemplates is not a function`.

- [ ] **Step 2: Implementieren**

In `app.js` direkt **hinter** der schließenden Klammer von `markInvoicePaid`
und **vor** `global.LPR = {` einfügen:

```js
  // ── Leistungsvorlagen ──────────────────────────────────────────────────
  // Frei benannte Positionen, die in jede Rechnung eingefuegt werden koennen.
  // Eine Vorlage ist ein Vorschlag: die eingefuegte Position ist danach eine
  // ganz normale Zeile und wird nicht mit der Vorlage verknuepft.

  async function listItemTemplates() {
    try {
      const { data, error } = await (await sb())
        .from('invoice_item_templates')
        .select('id, name, unit_price_cents')
        .order('name', { ascending: true });
      if (error) return { ok: false, error: error.message, templates: [] };
      return { ok: true, templates: data || [] };
    } catch(e) {
      console.error('[LPR] listItemTemplates:', e);
      return { ok: false, error: 'Netzwerkfehler.', templates: [] };
    }
  }

  // Legt an oder aktualisiert den Preis, wenn es den Namen schon gibt.
  // Kein upsert: das loest in supabase-js nur auf echte Spalten auf, nicht auf
  // den Ausdruck lower(name). Und kein ilike-Filter, weil Namen '%' oder '_'
  // enthalten duerfen — die waeren dort Platzhalter. Der Katalog ist klein,
  // also wird er geladen und im Browser verglichen. Der eindeutige Index
  // bleibt als Absicherung gegen zwei gleichzeitige Speicherversuche.
  async function saveItemTemplate(tpl) {
    const name = String((tpl && tpl.name) || '').trim();
    if (!name) return { ok: false, error: 'Name ist Pflicht.' };
    const price = Number(tpl.unit_price_cents) || 0;
    try {
      const client = await sb();
      const list = await listItemTemplates();
      if (!list.ok) return { ok: false, error: list.error };
      const hit = list.templates.find(t => t.name.toLowerCase() === name.toLowerCase());
      const q = hit
        ? client.from('invoice_item_templates')
                .update({ name, unit_price_cents: price }).eq('id', hit.id)
        : client.from('invoice_item_templates')
                .insert({ name, unit_price_cents: price });
      const { data, error } = await q.select().single();
      if (error) {
        if (error.code === '23505') {
          return { ok: false, error: 'Es gibt schon eine Vorlage mit diesem Namen.' };
        }
        return { ok: false, error: error.message };
      }
      return { ok: true, template: data, updated: !!hit };
    } catch(e) {
      console.error('[LPR] saveItemTemplate:', e);
      return { ok: false, error: 'Netzwerkfehler.' };
    }
  }

  // Hart loeschen ist richtig: an einer Vorlage haengt nichts. Positionen auf
  // Rechnungen sind Kopien, keine Verweise.
  async function deleteItemTemplate(id) {
    try {
      const { error } = await (await sb())
        .from('invoice_item_templates').delete().eq('id', id);
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    } catch(e) {
      console.error('[LPR] deleteItemTemplate:', e);
      return { ok: false, error: 'Netzwerkfehler.' };
    }
  }
```

- [ ] **Step 3: Exporte ergänzen**

In `global.LPR = { … }` direkt hinter der Zeile
`deleteInvoiceDraft, issueInvoice, cancelInvoice, markInvoicePaid,` einfügen:

```js
    listItemTemplates, saveItemTemplate, deleteItemTemplate,
```

- [ ] **Step 4: Prüfblock erneut laufen lassen**

Seite hart neu laden (`app.js` hat einen Cache-Parameter), Block aus Step 1
erneut ausführen.
Erwartet:
- `leer: true 0`
- `anlegen: true true 15000`
- `gleicher Name aktualisiert: true true 17000`
- `nur eine Zeile: 1`
- `geloescht: true true`

- [ ] **Step 5: Commit**

```bash
git add app.js
git commit -m "feat(rechnungen): API fuer Leistungsvorlagen"
```

---

### Task 3: Vorlage einfügen und sichern in `rechnung.html`

**Files:**
- Modify: `rechnung.html`

- [ ] **Step 1: Fehlschlag bestätigen**

Eine Entwurfsrechnung öffnen.
Erwartet: über der Positionstabelle gibt es keine Auswahl „Vorlage einfügen …",
und an den Zeilen steht nur das ×.

- [ ] **Step 2: Zustand und Laden ergänzen**

Die Zeile

```js
let _inv = null, _recipient = null, _items = [], _recipients = [];
```

ersetzen durch:

```js
let _inv = null, _recipient = null, _items = [], _recipients = [], _templates = [];
```

Direkt hinter der Funktion `emptyItem()` einfügen:

```js
async function loadTemplates() {
  const res = await LPR.listItemTemplates();
  if (!res.ok) { LPR.showToast(res.error, 'warn'); return; }
  _templates = res.templates;
}
```

In `init()` die Zeile

```js
  _recipients = (await LPR.listRecipients(true)).recipients || [];
```

ersetzen durch:

```js
  _recipients = (await LPR.listRecipients(true)).recipients || [];
  await loadTemplates();
```

- [ ] **Step 3: Auswahl über der Positionstabelle einsetzen**

In `renderEditor()` **vor** der Zeile `const rows = _items.map(...)` einfügen:

```js
  const tplOpts = _templates.map(t =>
    `<option value="${t.id}">${escapeHtml(t.name)} — ${LPR.centsToEUR(t.unit_price_cents)}</option>`).join('');
```

Im HTML-Block von `renderEditor()` die Zeile

```js
      <table class="it-table">
```

ersetzen durch:

```js
      <div style="display:flex;gap:10px;align-items:center;margin:6px 0 10px;flex-wrap:wrap;">
        <select class="f-in" style="width:auto;min-width:280px;margin:0;"
                onchange="insertTemplate(this.value); this.value='';">
          <option value="">Vorlage einfügen …</option>
          ${tplOpts}
        </select>
        <button class="btn" onclick="openTemplates()">Vorlagen …</button>
      </div>

      <table class="it-table">
```

- [ ] **Step 4: Sichern-Knopf an die Zeilen hängen**

In `renderEditor()` die letzte Zelle jeder Positionszeile

```js
      <td style="width:36px;"><button class="btn" onclick="removeItem(${i})" aria-label="Position entfernen">×</button></td>
```

ersetzen durch:

```js
      <td style="width:86px;white-space:nowrap;">
        <button class="btn" onclick="saveRowAsTemplate(${i})" title="Als Vorlage sichern" aria-label="Als Vorlage sichern">☆</button>
        <button class="btn" onclick="removeItem(${i})" aria-label="Position entfernen">×</button>
      </td>
```

- [ ] **Step 5: Die beiden Funktionen einsetzen**

Direkt hinter `function removeItem(i) { … }` einfügen:

```js
// Fuegt die Vorlage als neue Position an. Ist die Rechnung noch leer (eine
// einzige unausgefuellte Zeile), wird diese ersetzt statt eine zweite anzuhaengen.
function insertTemplate(id) {
  const t = _templates.find(x => x.id === id);
  if (!t) return;
  const row = { quantity: 1, description: t.name, period_text: '', unit_price_cents: t.unit_price_cents };
  const leer = _items.length === 1
            && !String(_items[0].description || '').trim()
            && !Number(_items[0].unit_price_cents);
  if (leer) _items[0] = row; else _items.push(row);
  renderEditor();
}

async function saveRowAsTemplate(i) {
  const it = _items[i];
  const bez = String(it.description || '').trim();
  if (!bez) { LPR.showToast('Erst eine Bezeichnung eintragen.', 'warn'); return; }
  const name = prompt('Name der Vorlage:', bez);
  if (name === null) return;
  const res = await LPR.saveItemTemplate({ name, unit_price_cents: it.unit_price_cents });
  if (!res.ok) { LPR.showToast(res.error, 'warn'); return; }
  await loadTemplates();
  renderEditor();
  LPR.showToast(res.updated ? 'Vorlage aktualisiert ✓' : 'Vorlage gesichert ✓');
}
```

`openTemplates()` fehlt noch — sie kommt in Task 4. Bis dahin meldet die Konsole
beim Klick auf „Vorlagen …" einen `ReferenceError`; das ist an dieser Stelle
richtig.

- [ ] **Step 6: Klick-Pfad prüfen**

Als `vorstand@demo.de` eine neue Rechnung anlegen:
1. Erste Zeile: Bezeichnung `Fahrtkosten Pauschale`, Einzelpreis `45,00`.
2. `☆` klicken, Namen bestätigen → Toast „Vorlage gesichert ✓".
3. Seite neu laden, Auswahl öffnen → der Eintrag steht dort als
   `Fahrtkosten Pauschale — 45,00 €`.
4. Auswählen → eine Position mit Menge 1, dieser Bezeichnung und 45,00 € kommt
   dazu; die Summe unter der Tabelle steigt entsprechend.
5. Menge auf `3` ändern → Betrag der Zeile zeigt `135,00 €`, die Vorlage bleibt
   unverändert bei 45,00 €.

- [ ] **Step 7: Commit**

```bash
git add rechnung.html
git commit -m "feat(rechnungen): Vorlagen einfuegen und aus einer Position sichern"
```

---

### Task 4: Vorlagen pflegen

**Files:**
- Modify: `rechnung.html`

- [ ] **Step 1: Fehlschlag bestätigen**

Im Editor auf „Vorlagen …" klicken.
Erwartet: `ReferenceError: openTemplates is not defined` in der Konsole, es
öffnet sich nichts.

- [ ] **Step 2: Dialog ins Markup einsetzen**

In `<main>` direkt **hinter** `<div id="beleg"></div>` einfügen:

```html
  <dialog id="tpl-dlg" class="no-print" style="border:none;border-radius:14px;padding:0;max-width:560px;width:92vw;">
    <div style="padding:26px 28px;">
      <h2 style="font-family:'Bricolage Grotesque',sans-serif;font-size:20px;color:var(--green-deep);margin:0 0 6px;">Vorlagen</h2>
      <p style="font-size:13px;color:var(--muted);margin:0 0 16px;">
        Preis ändern und das Feld verlassen speichert sofort. Gelöschte Vorlagen
        ändern nichts an bereits geschriebenen Rechnungen.</p>
      <div id="tpl-list"></div>
      <div style="display:flex;justify-content:flex-end;margin-top:18px;">
        <button type="button" class="btn" onclick="document.getElementById('tpl-dlg').close()">Schließen</button>
      </div>
    </div>
  </dialog>
```

- [ ] **Step 3: Die Funktionen einsetzen**

Direkt hinter `saveRowAsTemplate` einfügen:

```js
function openTemplates() {
  renderTemplateList();
  document.getElementById('tpl-dlg').showModal();
}

function renderTemplateList() {
  if (!_templates.length) {
    document.getElementById('tpl-list').innerHTML =
      '<p style="color:var(--muted);font-size:14px;margin:0;">Noch keine Vorlage gesichert. ' +
      'Dafür in einer Position auf ☆ klicken.</p>';
    return;
  }
  document.getElementById('tpl-list').innerHTML = `
    <table class="it-table">
      <thead><tr><th>Bezeichnung</th><th class="num">Einzelpreis</th><th></th></tr></thead>
      <tbody>${_templates.map(t => `
        <tr>
          <td>${escapeHtml(t.name)}</td>
          <td style="width:130px;"><input class="num" value="${(t.unit_price_cents/100).toFixed(2).replace('.',',')}"
                 onchange="setTemplatePrice('${t.id}', this.value)"></td>
          <td style="width:44px;"><button class="btn" onclick="deleteTemplate('${t.id}')" aria-label="Vorlage löschen">×</button></td>
        </tr>`).join('')}</tbody>
    </table>`;
}

async function setTemplatePrice(id, value) {
  const t = _templates.find(x => x.id === id);
  if (!t) return;
  const res = await LPR.saveItemTemplate({ name: t.name, unit_price_cents: LPR.eurToCents(value) });
  if (!res.ok) { LPR.showToast(res.error, 'warn'); return; }
  await loadTemplates();
  renderTemplateList();
  renderEditor();
  LPR.showToast('Vorlage aktualisiert ✓');
}

async function deleteTemplate(id) {
  const t = _templates.find(x => x.id === id);
  if (!t || !confirm('Vorlage „' + t.name + '" löschen?')) return;
  const res = await LPR.deleteItemTemplate(id);
  if (!res.ok) { LPR.showToast(res.error, 'warn'); return; }
  await loadTemplates();
  renderTemplateList();
  renderEditor();
}
```

- [ ] **Step 4: Klick-Pfad prüfen**

Im Editor „Vorlagen …" öffnen:
1. Die in Task 3 gesicherte `Fahrtkosten Pauschale` steht mit `45,00` in der Liste.
2. Preis auf `50,00` ändern, Feld verlassen → Toast „Vorlage aktualisiert ✓";
   die Auswahl über der Tabelle zeigt jetzt `— 50,00 €`.
3. `×` → Rückfrage bestätigen → Zeile verschwindet, die Auswahl über der Tabelle
   enthält den Eintrag nicht mehr.
4. Bereits eingefügte Positionen in der offenen Rechnung bleiben unverändert.

- [ ] **Step 5: Commit**

```bash
git add rechnung.html
git commit -m "feat(rechnungen): Vorlagen pflegen und loeschen"
```

---

### Task 5: Abnahme und Zugriffsschutz

**Files:** keine

- [ ] **Step 1: Ende-zu-Ende**

Als `vorstand@demo.de`:

1. Neue Rechnung → Vorlage `Sitzwache Nachtschicht` zu 200,00 € sichern
2. Zweite Vorlage `Beratungsstunde` zu 85,00 € sichern
3. Neue Rechnung anlegen, beide Vorlagen einfügen, bei der ersten Menge `3` und
   Zeitraum `Juli 2026` ergänzen, bei der zweiten den Preis auf `90,00`
   überschreiben
4. Speichern, festschreiben, drucken

Erwartet auf dem Beleg: Position 1 mit 3 × 200,00 € = 600,00 €, Position 2 mit
1 × 90,00 € = 90,00 €. Der Katalog zeigt für `Beratungsstunde` weiterhin
85,00 € — die überschriebene Rechnung hat die Vorlage nicht verändert.

- [ ] **Step 2: Gegenprobe Ehrenamt**

Abmelden, als `margarete@demo.de` anmelden, Konsole:

```js
await LPR.getMyProfile();   // legt window.LPRSupabase an
console.log((await LPR.listItemTemplates()).templates.length, 0);
const w = await LPRSupabase.from('invoice_item_templates').insert({ name: 'HACK', unit_price_cents: 1 });
console.log('schreiben:', w.error && w.error.message);
```

Erwartet: `0 0` und beim Schreiben ein RLS-Fehler. Sieht ein Ehrenamtlicher auch
nur eine Vorlage, **stoppen und melden**.

- [ ] **Step 3: Testdaten aufräumen**

Die in der Abnahme erzeugten Rechnungen verwerfen bzw. stornieren und die
Prüf-Vorlagen im Dialog löschen. Der Nummernkreis wird dabei **nicht**
angefasst — Etappe 1 hat ihn bewusst zum letzten Mal von Hand zurückgesetzt.

- [ ] **Step 4: Branch abschließen**

Nach bestandener Abnahme `feat/leistungsvorlagen` nach `main` mergen und pushen.
Das Repo liefert live aus, der Push ist damit die Veröffentlichung.

---

## Nicht in diesem Plan

Kategorien oder Sortierung des Katalogs, Mengenrabatte, Preishistorie,
empfängerspezifische Preise, Import bestehender Positionen aus alten Rechnungen.
`billing_recipients.shift_price_cents` bleibt unverändert und wird in Etappe 2
für die Sitzwachen-Sammelrechnung gebraucht.
