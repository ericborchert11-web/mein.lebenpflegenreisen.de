# Rechnungsstellung Etappe 1 — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der Vorstand kann im Portal eine Rechnung mit frei eingegebenen Positionen anlegen, festschreiben, drucken, als bezahlt markieren und stornieren — mit lückenlosem Nummernkreis aus der Datenbank.

**Architecture:** Vier neue Supabase-Tabellen mit RLS (nur `is_board()`), zwei `SECURITY DEFINER`-RPCs für Nummernvergabe und Storno, ein Sperr-Trigger gegen nachträgliche Änderungen. Im Frontend drei neue statische Seiten plus ein API-Block `LPR.billing.*` in `app.js`. Das PDF entsteht über den Browser-Druckdialog aus einem A4-CSS-Layout — keine Bibliothek, kein Build-Schritt.

**Tech Stack:** Statisches HTML/CSS/JS, Supabase (PostgREST + RPC), `@supabase/supabase-js@2.45.4` via CDN, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-08-15-rechnungsstellung-design.md`

---

## Vorbemerkung zur Verifikation

Dieses Repo hat **keine Testsuite** und keinen Node-Toolchain — es ist statisches HTML, das GitHub Pages direkt ausliefert. Eine einzuführen ist nicht Teil dieser Etappe. Stattdessen:

- **Datenbank-Schicht:** echte Fail-First-Tests als SQL. Dort sitzt die Korrektheit (Nummernkreis, Sperre, Summen), und dort sind Tests automatisierbar. Jede SQL-Aufgabe hat einen Testblock, der **vor** der Migration fehlschlägt.
- **Browser-Schicht:** Konsolen-Prüfblöcke mit erwarteter Ausgabe für reine Funktionen, und benannte Klick-Pfade mit erwartetem Ergebnis für die Oberfläche. Vor der Implementierung liefern sie `ReferenceError` bzw. 404 — das ist der Fehlschlag, den du sehen musst.

**Wo SQL liegt:** in einem neuen Ordner `sql/`, der **gitignored** wird. Das LPR-Repo ist öffentlich und liefert jede Datei live aus; welche Policy welche Tabelle bewacht, gehört nicht ins Netz. Die SQL-Dateien sind Arbeitsmaterial für den Supabase-SQL-Editor, kein Repo-Inhalt.

**Wie SQL ausgeführt wird:** Supabase-Dashboard → Projekt `makvwfznbwpjdzmuegoq` → SQL Editor → Inhalt einfügen → *Run*. Es gibt keine CLI-Migration in diesem Projekt.

---

## Dateiübersicht

| Datei | Verantwortung |
|---|---|
| `sql/2026-08-15-a-rechnungen-tabellen.sql` (gitignored) | Enum, 4 Tabellen, Indizes, RLS, Policies |
| `sql/2026-08-15-b-rechnungen-funktionen.sql` (gitignored) | Sperr-Trigger, `issue_invoice`, `cancel_invoice` |
| `sql/2026-08-15-test-*.sql` (gitignored) | Fail-First-Prüfungen zu beiden Migrationen |
| `.gitignore` | Zeile `sql/` |
| `app.js` | Neuer Block „Rechnungsstellung": Vereins-Stammdaten, Geld-Helfer, Adressbuch-API, Rechnungs-API |
| `admin-empfaenger.html` | Adressbuch: Liste, anlegen, bearbeiten, deaktivieren |
| `admin-rechnungen.html` | Rechnungsliste mit Filtern und Kennzahl „offene Forderungen" |
| `rechnung.html` | Einzelrechnung: Editor im Entwurf, Ansicht + Druck ab Festschreibung |
| `layout.js` | Zwei Navigationspunkte im Admin-Block |

`app.js` ist mit 136 KB bereits groß. Der Plan hängt einen klar abgegrenzten Block hinten an und fasst keine bestehende Funktion an — das entspricht dem Aufbau der Datei (Block C, Block C2, Sitzwachen-Einsatzdoku) und ist nicht der Moment, die Datei zu zerlegen.

---

### Task 1: Tabellen, RLS und Policies

**Files:**
- Create: `sql/2026-08-15-a-rechnungen-tabellen.sql`
- Create: `sql/2026-08-15-test-a.sql`
- Modify: `.gitignore`

- [ ] **Step 1: `sql/` von Git ausschließen**

`.gitignore` bekommt eine Zeile dazu. Danach lautet die Datei vollständig:

```gitignore
# Arbeitsdateien des Brainstorming-Begleiters — nie ins oeffentliche Repo
.superpowers/

# Migrations-SQL — das Repo ist oeffentlich, Policies gehoeren nicht ins Netz
sql/
```

- [ ] **Step 2: Den Test schreiben**

Datei `sql/2026-08-15-test-a.sql`:

```sql
-- Test A: Tabellen existieren, RLS ist scharf, Policies sind board-only.
-- Erwartet nach der Migration: 4 Zeilen, alle ok = true.
with soll(tabelle, policies_soll) as (
  values ('billing_recipients', 1), ('invoices', 1), ('invoice_items', 1), ('invoice_counters', 0)
)
select
  s.tabelle,
  c.relrowsecurity                              as rls_an,
  coalesce(p.anzahl, 0)                         as policies_ist,
  s.policies_soll,
  (c.relrowsecurity and coalesce(p.anzahl,0) = s.policies_soll) as ok
from soll s
join pg_class c on c.relname = s.tabelle
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
left join (
  select tablename, count(*) as anzahl from pg_policies
  where schemaname = 'public' and qual like '%is_board%'
  group by tablename
) p on p.tablename = s.tabelle
order by s.tabelle;
```

- [ ] **Step 3: Test laufen lassen, Fehlschlag bestätigen**

Im Supabase-SQL-Editor ausführen.
Erwartet: **0 Zeilen** (die Tabellen gibt es noch nicht, der Join greift ins Leere). Genau das ist der Fehlschlag.

- [ ] **Step 4: Prüfen, dass `is_board()` existiert**

```sql
select proname, prosecdef from pg_proc
where proname = 'is_board' and pronamespace = 'public'::regnamespace;
```

Erwartet: genau eine Zeile. Kommt keine, **stoppen und melden** — der ganze Zugriffsschutz dieses Plans hängt an dieser Funktion, und sie darf nicht neu erfunden werden.

- [ ] **Step 5: Die Migration schreiben**

Datei `sql/2026-08-15-a-rechnungen-tabellen.sql`:

```sql
-- Rechnungsstellung Etappe 1 — Teil A: Tabellen
-- Alle Geldbetraege sind integer in Cent. Grund: app.js:1603 haelt einen
-- Rundungsfehler fest, der von dem abwich, was auf der Rechnung stand.

create type public.invoice_status as enum ('draft', 'issued', 'paid', 'cancelled');

-- Adressbuch ------------------------------------------------------------
create table public.billing_recipients (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  address           text,
  postal_code       text,
  city              text,
  contact_person    text,
  customer_ref      text,
  email             text,
  payment_days      int  not null default 14,
  clinic_id         uuid references public.clinics(id),
  shift_price_cents int,
  active            boolean not null default true,
  created_at        timestamptz not null default now()
);
comment on column public.billing_recipients.shift_price_cents is
  'Sonderpreis je Sitzwachen-Schicht. Leer = Vereins-Standard 20000 Cent.';

-- Rechnungskopf ---------------------------------------------------------
create table public.invoices (
  id                      uuid primary key default gen_random_uuid(),
  invoice_no              text unique,
  status                  public.invoice_status not null default 'draft',
  recipient_id            uuid not null references public.billing_recipients(id),
  recipient_snapshot      jsonb,
  invoice_date            date not null default current_date,
  service_from            date,
  service_to              date,
  due_date                date,
  tax_mode                text not null default 'exempt'
                            check (tax_mode in ('exempt', 'vat')),
  tax_rate                numeric(4,2) not null default 0,
  tax_note                text not null default
    'Diese Leistung ist umsatzsteuerfrei nach § 4 Nr. 18 UStG (eng mit der Wohlfahrtspflege verbundene Leistung).',
  intro_text              text,
  subtotal_cents          int not null default 0,
  tax_cents               int not null default 0,
  total_cents             int not null default 0,
  paid_on                 date,
  cancels_invoice_id      uuid references public.invoices(id),
  cancelled_by_invoice_id uuid references public.invoices(id),
  created_by              uuid references public.profiles(id) default auth.uid(),
  created_at              timestamptz not null default now(),
  issued_at               timestamptz
);
comment on column public.invoices.recipient_snapshot is
  'Eingefrorene Empfaengeranschrift. Zieht der Empfaenger um, aendert das keine verschickte Rechnung.';

create index invoices_status_idx on public.invoices (status, invoice_date desc);
create index invoices_recipient_idx on public.invoices (recipient_id);

-- Positionen ------------------------------------------------------------
create table public.invoice_items (
  id               uuid primary key default gen_random_uuid(),
  invoice_id       uuid not null references public.invoices(id) on delete cascade,
  pos              int  not null,
  quantity         numeric(10,2) not null default 1,
  description      text not null,
  period_text      text,
  unit_price_cents int  not null default 0,
  amount_cents     int  not null default 0
);
create index invoice_items_invoice_idx on public.invoice_items (invoice_id, pos);

-- Nummernkreis ----------------------------------------------------------
create table public.invoice_counters (
  year    int primary key,
  last_no int not null default 0
);

-- RLS -------------------------------------------------------------------
alter table public.billing_recipients enable row level security;
alter table public.invoices           enable row level security;
alter table public.invoice_items      enable row level security;
alter table public.invoice_counters   enable row level security;

create policy billing_recipients_board on public.billing_recipients
  for all to authenticated using (public.is_board()) with check (public.is_board());

create policy invoices_board on public.invoices
  for all to authenticated using (public.is_board()) with check (public.is_board());

create policy invoice_items_board on public.invoice_items
  for all to authenticated using (public.is_board()) with check (public.is_board());

-- invoice_counters bekommt bewusst KEINE Policy: RLS ist an, damit ist die
-- Tabelle fuer jeden Client dicht. Nur issue_invoice() (SECURITY DEFINER)
-- fasst sie an. Niemand soll den Zaehler von Hand verstellen koennen.
```

- [ ] **Step 6: Migration ausführen**

Inhalt in den SQL-Editor, *Run*.
Erwartet: `Success. No rows returned`.

- [ ] **Step 7: Test erneut laufen lassen**

`sql/2026-08-15-test-a.sql` ausführen.
Erwartet: **4 Zeilen**, Spalte `ok` überall `true`.

- [ ] **Step 8: Gegenprobe mit einem Nicht-Vorstand**

Im Portal als `margarete@demo.de` (Ehrenamt) einloggen, Browser-Konsole:

```js
// Der Supabase-Client wird faul erzeugt. Ein LPR-Aufruf legt window.LPRSupabase an:
await LPR.getMyProfile();

const { data, error } = await LPRSupabase.from('invoices').select('*');
console.log('lesen:', data, error);
const ins = await LPRSupabase.from('invoices').insert({ recipient_id: crypto.randomUUID() });
console.log('schreiben:', ins.error && ins.error.message);
```

Erwartet: `lesen: [] null` und beim Schreiben ein Fehler (403 bzw. `new row violates row-level security policy`). Kommt beim Lesen etwas anderes als ein leeres Array, **stoppen und melden**.

- [ ] **Step 9: Commit**

```bash
git add .gitignore
git commit -m "chore: SQL-Arbeitsordner aus dem oeffentlichen Repo ausschliessen"
```

---

### Task 2: Nummernvergabe, Sperre und Storno

**Files:**
- Create: `sql/2026-08-15-b-rechnungen-funktionen.sql`
- Create: `sql/2026-08-15-test-b.sql`

- [ ] **Step 1: Den Test schreiben**

Datei `sql/2026-08-15-test-b.sql`. Er legt Testdaten an, prüft fünf Zusagen und räumt am Ende auf:

```sql
-- Test B: Nummernvergabe, Sperre, Storno.
-- Laeuft als postgres im SQL-Editor, also an RLS vorbei — geprueft wird die
-- Logik der Funktionen, nicht der Zugriffsschutz (das war Test A).
do $$
declare
  v_rec uuid; v_a uuid; v_b uuid;
  v_inv public.invoices; v_storno public.invoices;
  v_no_a text; v_no_b text; v_ok boolean;
begin
  insert into public.billing_recipients (name, address, postal_code, city, payment_days)
    values ('TEST Klinik', 'Teststr. 1', '10559', 'Berlin', 14) returning id into v_rec;

  -- Zwei Entwuerfe mit Positionen
  insert into public.invoices (recipient_id, invoice_date) values (v_rec, current_date) returning id into v_a;
  insert into public.invoice_items (invoice_id, pos, quantity, description, unit_price_cents, amount_cents)
    values (v_a, 1, 3, 'Sitzwache', 20000, 60000);
  insert into public.invoices (recipient_id, invoice_date) values (v_rec, current_date) returning id into v_b;
  insert into public.invoice_items (invoice_id, pos, quantity, description, unit_price_cents, amount_cents)
    values (v_b, 1, 1, 'Beratung', 15000, 15000);

  -- 1) Nummern sind fortlaufend und verschieden
  v_inv := public.issue_invoice(v_a); v_no_a := v_inv.invoice_no;
  v_inv := public.issue_invoice(v_b); v_no_b := v_inv.invoice_no;
  assert v_no_a <> v_no_b, 'FEHLER: zwei gleiche Rechnungsnummern';
  assert v_no_a ~ '^RE-\d{4}-\d{4}$', 'FEHLER: Format der Rechnungsnummer: ' || v_no_a;
  assert right(v_no_b, 4)::int = right(v_no_a, 4)::int + 1, 'FEHLER: Nummern nicht fortlaufend';
  raise notice 'ok 1 — Nummern: % und %', v_no_a, v_no_b;

  -- 2) Summen kommen aus der Datenbank
  assert (select total_cents from public.invoices where id = v_a) = 60000, 'FEHLER: Summe falsch';
  assert (select due_date  from public.invoices where id = v_a) = current_date + 14, 'FEHLER: Zahlungsziel falsch';
  raise notice 'ok 2 — Summe und Zahlungsziel';

  -- 3) Snapshot ist eingefroren
  update public.billing_recipients set city = 'Hamburg' where id = v_rec;
  assert (select recipient_snapshot->>'city' from public.invoices where id = v_a) = 'Berlin',
    'FEHLER: Snapshot folgt der Adressaenderung';
  raise notice 'ok 3 — Empfaenger eingefroren';

  -- 4) Festgeschriebenes ist gesperrt
  v_ok := false;
  begin
    update public.invoices set total_cents = 1 where id = v_a;
  exception when others then v_ok := true; end;
  assert v_ok, 'FEHLER: festgeschriebene Rechnung liess sich aendern';
  v_ok := false;
  begin
    update public.invoice_items set amount_cents = 1 where invoice_id = v_a;
  exception when others then v_ok := true; end;
  assert v_ok, 'FEHLER: Position einer festgeschriebenen Rechnung liess sich aendern';
  raise notice 'ok 4 — Sperre haelt';

  -- 5) Storno hebt auf null auf
  v_storno := public.cancel_invoice(v_a, 'Testlauf');
  assert v_storno.total_cents = -60000, 'FEHLER: Storno-Summe falsch';
  assert (select status from public.invoices where id = v_a) = 'cancelled', 'FEHLER: Original nicht storniert';
  assert (select coalesce(sum(total_cents),0) from public.invoices where id in (v_a, v_storno.id)) = 0,
    'FEHLER: Original + Storno ergibt nicht null';
  raise notice 'ok 5 — Storno: %', v_storno.invoice_no;

  -- Aufraeumen
  delete from public.invoices where recipient_id = v_rec;
  delete from public.billing_recipients where id = v_rec;
  delete from public.invoice_counters where year = extract(year from current_date)::int;
  raise notice 'ALLE 5 PRUEFUNGEN BESTANDEN';
end $$;
```

Zwei Dinge, die dieser Aufräum-`delete` mitprüft und die beim Bauen leicht schiefgehen:

1. Der Sperr-Trigger auf dem Kopf ist `before update`, nicht `before delete`. Löschen bleibt dem Vorstand erlaubt — die Sperre schützt vor stiller Änderung, nicht vor bewusstem Aufräumen. Im Alltag ist das unkritisch, weil die Oberfläche „Verwerfen" ausschließlich im Entwurf anbietet.
2. Der Trigger auf den **Positionen** feuert auch beim Kaskaden-Delete. Er muss durchlassen, wenn der Rechnungskopf schon weg ist — sonst lässt sich keine festgeschriebene Rechnung mehr löschen. Genau dafür steht in Task 2 die `if not found`-Zeile. Bricht dieser `delete` mit „Positionen einer festgeschriebenen Rechnung…" ab, fehlt sie.

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Erwartet: `ERROR: function public.issue_invoice(uuid) does not exist`.

- [ ] **Step 3: Die Funktionen schreiben**

Datei `sql/2026-08-15-b-rechnungen-funktionen.sql`:

```sql
-- Rechnungsstellung Etappe 1 — Teil B: Nummernvergabe, Sperre, Storno

-- Sperre auf dem Kopf ---------------------------------------------------
create or replace function public.tg_invoice_locked()
returns trigger language plpgsql as $$
begin
  if OLD.status = 'draft' then
    if NEW.status = 'paid' then
      raise exception 'Ein Entwurf kann nicht als bezahlt markiert werden.' using errcode = '42501';
    end if;
    return NEW;   -- Entwuerfe sind frei aenderbar, auch das Festschreiben laeuft hierdurch
  end if;

  if NEW.status = 'draft' then
    raise exception 'Eine festgeschriebene Rechnung wird nicht wieder zum Entwurf.' using errcode = '42501';
  end if;

  if NEW.invoice_no         is distinct from OLD.invoice_no
  or NEW.recipient_id       is distinct from OLD.recipient_id
  or NEW.recipient_snapshot is distinct from OLD.recipient_snapshot
  or NEW.invoice_date       is distinct from OLD.invoice_date
  or NEW.service_from       is distinct from OLD.service_from
  or NEW.service_to         is distinct from OLD.service_to
  or NEW.due_date           is distinct from OLD.due_date
  or NEW.tax_mode           is distinct from OLD.tax_mode
  or NEW.tax_rate           is distinct from OLD.tax_rate
  or NEW.tax_note           is distinct from OLD.tax_note
  or NEW.intro_text         is distinct from OLD.intro_text
  or NEW.subtotal_cents     is distinct from OLD.subtotal_cents
  or NEW.tax_cents          is distinct from OLD.tax_cents
  or NEW.total_cents        is distinct from OLD.total_cents then
    raise exception 'Festgeschriebene Rechnungen koennen nicht geaendert werden.' using errcode = '42501';
  end if;

  -- Uebrig bleiben: status, paid_on, cancels_invoice_id, cancelled_by_invoice_id
  return NEW;
end $$;

create trigger trg_invoice_locked
  before update on public.invoices
  for each row execute function public.tg_invoice_locked();

-- Sperre auf den Positionen ---------------------------------------------
create or replace function public.tg_invoice_items_locked()
returns trigger language plpgsql as $$
declare v_status public.invoice_status;
begin
  select status into v_status from public.invoices
   where id = coalesce(NEW.invoice_id, OLD.invoice_id);

  -- Kein Kopf mehr da: der Loeschvorgang kommt vom Kaskaden-Delete der Rechnung
  -- selbst. Wuerde hier geblockt, liesse sich keine festgeschriebene Rechnung
  -- mehr loeschen — auch nicht bewusst durch den Vorstand.
  if not found then return coalesce(NEW, OLD); end if;

  if v_status <> 'draft' then
    raise exception 'Positionen einer festgeschriebenen Rechnung koennen nicht geaendert werden.'
      using errcode = '42501';
  end if;
  return coalesce(NEW, OLD);
end $$;

create trigger trg_invoice_items_locked
  before insert or update or delete on public.invoice_items
  for each row execute function public.tg_invoice_items_locked();

-- Festschreiben ---------------------------------------------------------
create or replace function public.issue_invoice(p_id uuid)
returns public.invoices
language plpgsql security definer set search_path = public as $$
declare
  v_inv public.invoices;
  v_rec public.billing_recipients;
  v_year int; v_no int; v_sub int; v_tax int; v_count int;
begin
  if not public.is_board() then
    raise exception 'Nur der Vorstand darf Rechnungen festschreiben.' using errcode = '42501';
  end if;

  select * into v_inv from public.invoices where id = p_id for update;
  if not found then raise exception 'Rechnung nicht gefunden.'; end if;
  if v_inv.status <> 'draft' then
    raise exception 'Nur Entwuerfe koennen festgeschrieben werden.';
  end if;

  select count(*), coalesce(sum(amount_cents), 0) into v_count, v_sub
    from public.invoice_items where invoice_id = p_id;
  if v_count = 0 then raise exception 'Eine Rechnung ohne Positionen wird nicht festgeschrieben.'; end if;

  select * into v_rec from public.billing_recipients where id = v_inv.recipient_id;
  if not found then raise exception 'Empfaenger nicht gefunden.'; end if;

  v_tax := case when v_inv.tax_mode = 'vat'
                then round(v_sub * v_inv.tax_rate / 100.0)::int
                else 0 end;

  -- Zaehler und Nummernvergabe in derselben Transaktion: zwei gleichzeitige
  -- Festschreibungen koennen so nie dieselbe Nummer erhalten.
  v_year := extract(year from v_inv.invoice_date)::int;
  insert into public.invoice_counters (year, last_no) values (v_year, 1)
    on conflict (year) do update set last_no = public.invoice_counters.last_no + 1
    returning last_no into v_no;

  update public.invoices set
    invoice_no         = 'RE-' || v_year || '-' || lpad(v_no::text, 4, '0'),
    status             = 'issued',
    issued_at          = now(),
    recipient_snapshot = to_jsonb(v_rec),
    subtotal_cents     = v_sub,
    tax_cents          = v_tax,
    total_cents        = v_sub + v_tax,
    due_date           = coalesce(v_inv.due_date,
                                  v_inv.invoice_date + coalesce(v_rec.payment_days, 14))
  where id = p_id
  returning * into v_inv;

  return v_inv;
end $$;

-- Storno ----------------------------------------------------------------
create or replace function public.cancel_invoice(p_id uuid, p_reason text)
returns public.invoices
language plpgsql security definer set search_path = public as $$
declare
  v_orig public.invoices;
  v_new_id uuid;
  v_res public.invoices;
begin
  if not public.is_board() then
    raise exception 'Nur der Vorstand darf stornieren.' using errcode = '42501';
  end if;

  select * into v_orig from public.invoices where id = p_id for update;
  if not found then raise exception 'Rechnung nicht gefunden.'; end if;
  if v_orig.status not in ('issued', 'paid') then
    raise exception 'Nur festgeschriebene Rechnungen koennen storniert werden.';
  end if;
  if v_orig.cancelled_by_invoice_id is not null then
    raise exception 'Diese Rechnung ist bereits storniert.';
  end if;

  insert into public.invoices (
    recipient_id, invoice_date, service_from, service_to,
    tax_mode, tax_rate, tax_note, intro_text, cancels_invoice_id, due_date
  ) values (
    v_orig.recipient_id, current_date, v_orig.service_from, v_orig.service_to,
    v_orig.tax_mode, v_orig.tax_rate, v_orig.tax_note,
    'Storno zu Rechnung ' || v_orig.invoice_no || coalesce(' — ' || nullif(p_reason, ''), ''),
    v_orig.id, current_date
  ) returning id into v_new_id;

  insert into public.invoice_items
    (invoice_id, pos, quantity, description, period_text, unit_price_cents, amount_cents)
  select v_new_id, pos, quantity, 'Storno: ' || description, period_text,
         -unit_price_cents, -amount_cents
    from public.invoice_items where invoice_id = v_orig.id;

  v_res := public.issue_invoice(v_new_id);

  update public.invoices
     set status = 'cancelled', cancelled_by_invoice_id = v_new_id
   where id = v_orig.id;

  return v_res;
end $$;

revoke all on function public.issue_invoice(uuid)         from public, anon;
revoke all on function public.cancel_invoice(uuid, text)  from public, anon;
grant execute on function public.issue_invoice(uuid)        to authenticated;
grant execute on function public.cancel_invoice(uuid, text) to authenticated;
```

- [ ] **Step 4: Migration ausführen**

Erwartet: `Success. No rows returned`.

- [ ] **Step 5: Test erneut laufen lassen**

`sql/2026-08-15-test-b.sql` ausführen.
Erwartet in der Ausgabe: `ok 1` bis `ok 5` und abschließend `ALLE 5 PRUEFUNGEN BESTANDEN`. Bricht eine `assert`-Zeile ab, ist die Meldung der Fehler — nicht weiterbauen.

- [ ] **Step 6: Gegenprobe Ehrenamt**

Als `margarete@demo.de` in der Browser-Konsole:

```js
await LPR.getMyProfile();   // legt window.LPRSupabase an
const r = await LPRSupabase.rpc('issue_invoice', { p_id: crypto.randomUUID() });
console.log(r.error && r.error.message);
```

Erwartet: `Nur der Vorstand darf Rechnungen festschreiben.`

---

### Task 3: Vereins-Stammdaten und Geld-Helfer in `app.js`

**Files:**
- Modify: `app.js` — neuer Block direkt vor `global.LPR = {` (aktuell Zeile 2977)

- [ ] **Step 1: Den Prüfblock schreiben und scheitern sehen**

Portal im Browser öffnen (`admin-pauschalen.html` genügt), Konsole:

```js
console.log(LPR.eurToCents('1.234,56'), 123456);
console.log(LPR.eurToCents('200'),      20000);
console.log(LPR.eurToCents(''),         0);
console.log(LPR.itemAmountCents(3, 20000), 60000);
console.log(LPR.itemAmountCents(0.5, 15001), 7501);   // kaufmaennisch gerundet
console.log(LPR.centsToEUR(60000), '600,00 €');
console.log(LPR.VEREIN.iban, 'DE14 1005 0000 0191 6497 83');
```

Erwartet: `TypeError: LPR.eurToCents is not a function`.

- [ ] **Step 2: Den Block einfügen**

In `app.js` direkt **vor** der Zeile `global.LPR = {` einfügen:

```js
  // ── Block D: Rechnungsstellung ─────────────────────────────────────────
  // Wahrheitsquelle fuer Nummern und Summen ist die Datenbank (issue_invoice).
  // Im Browser wird nur zur Anzeige gerechnet.

  const VEREIN = {
    name:         'Leben Pflegen Reisen e.V.',
    strasse:      'Stephanstr. 46',
    ort:          '10559 Berlin',
    register:     'Amtsgericht Charlottenburg, VR 42682 B',
    // TODO Eric: Steuernummer vom Finanzamt fuer Koerperschaften eintragen.
    // Solange leer, zeigt rechnung.html eine nicht druckbare Warnung — § 14
    // UStG verlangt Steuernummer oder USt-IdNr., letztere hat der Verein nicht.
    steuernummer: '',
    ustidnr:      'nicht erteilt',
    iban:         'DE14 1005 0000 0191 6497 83',
    bic:          'BELADEBEXXX',
    bank:         'Berliner Sparkasse',
    email:        'info@lebenpflegenreisen.de',
    web:          'lebenpflegenreisen.de',
    vorstand:     'Eric Borchert · Sonja Vogl · Simeon Frommholz',
    claim:        'Menschen begleiten. Würde bewahren. Teilhabe ermöglichen.'
  };

  const BILLING_DEFAULT_SHIFT_CENTS = 20000;   // 200 € je Sitzwachen-Schicht

  function centsToEUR(c) { return formatEUR((Number(c) || 0) / 100); }

  // Nimmt deutsche Eingaben ('1.234,56', '200', '19,5') und liefert Cent.
  function eurToCents(v) {
    if (typeof v === 'number') return Math.round(v * 100);
    const s = String(v ?? '').trim().replace(/\./g, '').replace(',', '.').replace(/[^\d.\-]/g, '');
    if (!s) return 0;
    return Math.round((parseFloat(s) || 0) * 100);
  }

  function itemAmountCents(quantity, unitPriceCents) {
    return Math.round((Number(quantity) || 0) * (Number(unitPriceCents) || 0));
  }

  function invoiceSubtotalCents(items) {
    return (items || []).reduce((sum, i) => sum + (Number(i.amount_cents) || 0), 0);
  }

  // 'issued' und faellig in der Vergangenheit. Bewusst eine Anzeigeregel und
  // kein gespeicherter Status — sonst muesste nachts jemand umstempeln.
  function invoiceIsOverdue(inv) {
    if (!inv || inv.status !== 'issued' || !inv.due_date) return false;
    return inv.due_date < dateKey(new Date());
  }
```

- [ ] **Step 3: Exporte ergänzen**

In `global.LPR = { … }` hinter der Zeile `getRates, getRate,` einfügen:

```js
    // Block D: Rechnungsstellung
    VEREIN, BILLING_DEFAULT_SHIFT_CENTS,
    centsToEUR, eurToCents, itemAmountCents, invoiceSubtotalCents, invoiceIsOverdue,
```

- [ ] **Step 4: Prüfblock erneut laufen lassen**

Seite neu laden (Hard-Reload, `app.js` hat einen Cache-Parameter), Block aus Step 1 erneut ausführen.
Erwartet: jede Zeile zeigt zweimal denselben Wert.

- [ ] **Step 5: Commit**

```bash
git add app.js
git commit -m "feat(rechnungen): Vereins-Stammdaten und Geld-Helfer"
```

---

### Task 4: Adressbuch-API

**Files:**
- Modify: `app.js` — im Block D hinter `invoiceIsOverdue`

- [ ] **Step 1: Den Prüfblock schreiben und scheitern sehen**

Als `vorstand@demo.de` einloggen, Konsole:

```js
const a = await LPR.listRecipients();
console.log('leer:', a.ok, a.recipients.length);
const b = await LPR.saveRecipient({ name: 'PRUEF GmbH', address: 'Teststr. 1', postal_code: '10559', city: 'Berlin', payment_days: 14 });
console.log('anlegen:', b.ok, b.recipient && b.recipient.name);
const c = await LPR.saveRecipient({ id: b.recipient.id, name: 'PRUEF GmbH', city: 'Hamburg' });
console.log('aendern:', c.ok, c.recipient.city);
const d = await LPR.setRecipientActive(b.recipient.id, false);
const e = await LPR.listRecipients();
console.log('deaktiviert nicht mehr in der Liste:', e.recipients.some(r => r.id === b.recipient.id) === false);
```

Erwartet: `TypeError: LPR.listRecipients is not a function`.

- [ ] **Step 2: Implementieren**

```js
  async function listRecipients(includeInactive) {
    try {
      let q = (await sb())
        .from('billing_recipients')
        .select('id, name, address, postal_code, city, contact_person, customer_ref, email, payment_days, clinic_id, shift_price_cents, active')
        .order('name', { ascending: true });
      if (!includeInactive) q = q.eq('active', true);
      const { data, error } = await q;
      if (error) return { ok: false, error: error.message, recipients: [] };
      return { ok: true, recipients: data || [] };
    } catch(e) {
      console.error('[LPR] listRecipients:', e);
      return { ok: false, error: 'Netzwerkfehler.', recipients: [] };
    }
  }

  // Ein Aufruf fuer Anlegen und Aendern: mit id wird aktualisiert, ohne angelegt.
  async function saveRecipient(rec) {
    if (!rec || !String(rec.name || '').trim()) {
      return { ok: false, error: 'Name ist Pflicht.' };
    }
    const row = {
      name:           String(rec.name).trim(),
      address:        rec.address || null,
      postal_code:    rec.postal_code || null,
      city:           rec.city || null,
      contact_person: rec.contact_person || null,
      customer_ref:   rec.customer_ref || null,
      email:          rec.email || null,
      payment_days:   Number(rec.payment_days) > 0 ? Number(rec.payment_days) : 14,
      clinic_id:      rec.clinic_id || null,
      shift_price_cents: (rec.shift_price_cents === '' || rec.shift_price_cents == null)
                            ? null : Number(rec.shift_price_cents)
    };
    try {
      const client = await sb();
      const q = rec.id
        ? client.from('billing_recipients').update(row).eq('id', rec.id)
        : client.from('billing_recipients').insert(row);
      const { data, error } = await q.select().single();
      if (error) return { ok: false, error: error.message };
      return { ok: true, recipient: data };
    } catch(e) {
      console.error('[LPR] saveRecipient:', e);
      return { ok: false, error: 'Netzwerkfehler.' };
    }
  }

  // Empfaenger werden nie geloescht — an ihnen haengen Rechnungen.
  async function setRecipientActive(id, active) {
    try {
      const { error } = await (await sb())
        .from('billing_recipients').update({ active: !!active }).eq('id', id);
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    } catch(e) {
      console.error('[LPR] setRecipientActive:', e);
      return { ok: false, error: 'Netzwerkfehler.' };
    }
  }
```

Exporte ergänzen, hinter der Zeile aus Task 3 Step 3:

```js
    listRecipients, saveRecipient, setRecipientActive,
```

- [ ] **Step 3: Prüfblock erneut laufen lassen**

Erwartet: `leer: true 0` (oder eine bereits vorhandene Zahl), `anlegen: true PRUEF GmbH`, `aendern: true Hamburg`, `deaktiviert nicht mehr in der Liste: true`.

- [ ] **Step 4: Testdatensatz entfernen**

```sql
delete from public.billing_recipients where name = 'PRUEF GmbH';
```

- [ ] **Step 5: Commit**

```bash
git add app.js
git commit -m "feat(rechnungen): Adressbuch-API"
```

---

### Task 5: `admin-empfaenger.html`

**Files:**
- Create: `admin-empfaenger.html`

- [ ] **Step 1: Fehlschlag bestätigen**

`https://mein.lebenpflegenreisen.de/admin-empfaenger.html` bzw. lokal öffnen.
Erwartet: 404.

- [ ] **Step 2: Seitengerüst anlegen**

Kopiere `admin-pauschalen.html` nach `admin-empfaenger.html` und ändere:
- Zeile 12: `<title>Empfänger · Leben Pflegen Reisen e.V.</title>`
- Im `<style>`-Block das Präfix `ap-` durch `emp-` ersetzen; die Regeln selbst bleiben, sie sind das Kartenlayout aller Admin-Seiten.
- Den kompletten Inhalt von `<main>` und den Seiten-`<script>`-Block ersetzen durch die folgenden Schritte.

- [ ] **Step 3: Markup einsetzen**

Inhalt von `<main>`:

```html
<main id="main">
<div class="emp-wrap">
  <a href="admin-rechnungen.html" class="back-link">← Rechnungen</a>

  <div id="login-view" hidden>
    <div class="emp-card" style="padding:28px;">
      <p>Dieser Bereich ist dem Vorstand vorbehalten.</p>
    </div>
  </div>

  <div id="admin-view" hidden>
    <div class="emp-header">
      <div>
        <h1>Rechnungsempfänger</h1>
        <p>Anschriften für die Rechnungsstellung. Die Anschrift wird beim Festschreiben
           in die Rechnung kopiert — spätere Änderungen hier verändern keine
           bereits verschickte Rechnung.</p>
      </div>
      <button class="btn btn-primary" onclick="openForm()">+ Neuer Empfänger</button>
    </div>

    <div class="emp-card" id="table-wrap"></div>

    <dialog id="form-dlg" style="border:none;border-radius:14px;padding:0;max-width:560px;width:92vw;">
      <form method="dialog" id="rec-form" style="padding:26px 28px;">
        <h2 style="font-family:'Bricolage Grotesque',sans-serif;font-size:20px;color:var(--green-deep);margin:0 0 16px;">
          <span id="form-title">Neuer Empfänger</span></h2>
        <input type="hidden" id="f-id">
        <label class="f-lbl">Name / Firmierung *<input class="f-in" id="f-name" required></label>
        <label class="f-lbl">Straße und Hausnummer<input class="f-in" id="f-address"></label>
        <div style="display:flex;gap:12px;">
          <label class="f-lbl" style="flex:0 0 120px;">PLZ<input class="f-in" id="f-plz"></label>
          <label class="f-lbl" style="flex:1;">Ort<input class="f-in" id="f-city"></label>
        </div>
        <label class="f-lbl">Ansprechpartner<input class="f-in" id="f-contact"></label>
        <label class="f-lbl">Kunden-/Aktenzeichen<input class="f-in" id="f-ref"></label>
        <label class="f-lbl">E-Mail<input class="f-in" id="f-email" type="email"></label>
        <div style="display:flex;gap:12px;">
          <label class="f-lbl" style="flex:1;">Zahlungsziel (Tage)<input class="f-in" id="f-days" type="number" min="1" value="14"></label>
          <label class="f-lbl" style="flex:1;">Preis je Schicht (€)<input class="f-in" id="f-shift" placeholder="200,00"></label>
        </div>
        <p style="font-size:12px;color:var(--muted);margin:2px 0 16px;">
          Preis je Schicht leer lassen = Vereins-Standard 200,00 €.</p>
        <div style="display:flex;gap:10px;justify-content:flex-end;">
          <button type="button" class="btn" onclick="document.getElementById('form-dlg').close()">Abbrechen</button>
          <button type="button" class="btn btn-primary" onclick="saveForm()">Speichern</button>
        </div>
      </form>
    </dialog>
  </div>
</div>
</main>
```

Im `<style>`-Block ergänzen:

```css
.f-lbl { display:block; font-size:13px; font-weight:600; color:var(--muted); margin-bottom:12px; }
.f-in  { display:block; width:100%; margin-top:5px; font-family:inherit; font-size:14px;
         padding:9px 11px; border:1.5px solid var(--border); border-radius:8px; background:#fff; color:var(--text); }
.emp-inactive td { opacity:.5; }
```

- [ ] **Step 4: Seiten-Skript einsetzen**

```html
<script src="app.js?v20260815a"></script>
<script src="layout.js"></script>
<script>
'use strict';

LPR_Layout.init({ page: 'empfaenger-admin' });

let _recipients = [];

function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; }

async function init() {
  const session = LPR.getSession();
  if (!session) { location.href = 'login.html?next=admin-empfaenger.html'; return; }
  if (session.role !== 'admin') { document.getElementById('login-view').hidden = false; return; }
  document.getElementById('admin-view').hidden = false;
  await loadData();
}

async function loadData() {
  const res = await LPR.listRecipients(true);
  if (!res.ok) {
    document.getElementById('table-wrap').innerHTML =
      '<div style="padding:24px;">Fehler beim Laden: ' + escapeHtml(res.error) + '</div>';
    return;
  }
  _recipients = res.recipients;
  renderTable();
}

function renderTable() {
  if (!_recipients.length) {
    document.getElementById('table-wrap').innerHTML =
      '<div style="padding:28px;color:var(--muted);">Noch kein Empfänger angelegt.</div>';
    return;
  }
  const rows = _recipients.map(r => `
    <tr class="${r.active ? '' : 'emp-inactive'}">
      <td><strong>${escapeHtml(r.name)}</strong>${r.customer_ref ? '<br><span style="font-size:12px;color:var(--muted);">Zeichen: ' + escapeHtml(r.customer_ref) + '</span>' : ''}</td>
      <td>${escapeHtml(r.address || '—')}<br><span style="font-size:12px;color:var(--muted);">${escapeHtml((r.postal_code || '') + ' ' + (r.city || ''))}</span></td>
      <td>${escapeHtml(r.contact_person || '—')}</td>
      <td class="num">${r.payment_days} Tage</td>
      <td class="num">${r.shift_price_cents == null ? '<span style="color:var(--muted);">Standard</span>' : LPR.centsToEUR(r.shift_price_cents)}</td>
      <td style="white-space:nowrap;">
        <button class="btn" onclick="openForm('${r.id}')">Bearbeiten</button>
        <button class="btn" onclick="toggleActive('${r.id}', ${r.active ? 'false' : 'true'})">${r.active ? 'Deaktivieren' : 'Aktivieren'}</button>
      </td>
    </tr>`).join('');
  document.getElementById('table-wrap').innerHTML = `
    <table class="emp-table">
      <thead><tr>
        <th>Name</th><th>Anschrift</th><th>Ansprechpartner</th>
        <th class="num">Zahlungsziel</th><th class="num">Preis je Schicht</th><th></th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function openForm(id) {
  const r = id ? _recipients.find(x => x.id === id) : null;
  document.getElementById('form-title').textContent = r ? 'Empfänger bearbeiten' : 'Neuer Empfänger';
  document.getElementById('f-id').value      = r ? r.id : '';
  document.getElementById('f-name').value    = r ? (r.name || '') : '';
  document.getElementById('f-address').value = r ? (r.address || '') : '';
  document.getElementById('f-plz').value     = r ? (r.postal_code || '') : '';
  document.getElementById('f-city').value    = r ? (r.city || '') : '';
  document.getElementById('f-contact').value = r ? (r.contact_person || '') : '';
  document.getElementById('f-ref').value     = r ? (r.customer_ref || '') : '';
  document.getElementById('f-email').value   = r ? (r.email || '') : '';
  document.getElementById('f-days').value    = r ? r.payment_days : 14;
  document.getElementById('f-shift').value   = (r && r.shift_price_cents != null)
    ? (r.shift_price_cents / 100).toFixed(2).replace('.', ',') : '';
  document.getElementById('form-dlg').showModal();
}

async function saveForm() {
  const shiftRaw = document.getElementById('f-shift').value.trim();
  const res = await LPR.saveRecipient({
    id:             document.getElementById('f-id').value || null,
    name:           document.getElementById('f-name').value,
    address:        document.getElementById('f-address').value,
    postal_code:    document.getElementById('f-plz').value,
    city:           document.getElementById('f-city').value,
    contact_person: document.getElementById('f-contact').value,
    customer_ref:   document.getElementById('f-ref').value,
    email:          document.getElementById('f-email').value,
    payment_days:   document.getElementById('f-days').value,
    shift_price_cents: shiftRaw === '' ? null : LPR.eurToCents(shiftRaw)
  });
  if (!res.ok) { LPR.showToast(res.error, 'warn'); return; }
  document.getElementById('form-dlg').close();
  LPR.showToast('Gespeichert ✓');
  await loadData();
}

async function toggleActive(id, active) {
  const res = await LPR.setRecipientActive(id, active);
  if (!res.ok) { LPR.showToast(res.error, 'warn'); return; }
  await loadData();
}

init();
</script>
```

- [ ] **Step 5: Klick-Pfad prüfen**

Als `vorstand@demo.de` `admin-empfaenger.html` öffnen:
1. „+ Neuer Empfänger", Name `Sana Klinikum Lichtenberg`, Straße `Fanningerstr. 32`, PLZ `10365`, Ort `Berlin`, Zahlungsziel `14`, Preis je Schicht leer → Speichern.
2. Erwartet: Toast „Gespeichert ✓", Zeile in der Tabelle, Spalte „Preis je Schicht" zeigt `Standard`.
3. „Bearbeiten", Preis je Schicht `210,00` → Speichern. Erwartet: Spalte zeigt `210,00 €`.
4. „Deaktivieren". Erwartet: Zeile wird blass, Knopf heißt jetzt „Aktivieren".

- [ ] **Step 6: Commit**

```bash
git add admin-empfaenger.html
git commit -m "feat(rechnungen): Adressbuch-Seite"
```

---

### Task 6: Rechnungs-API

**Files:**
- Modify: `app.js` — im Block D hinter `setRecipientActive`

- [ ] **Step 1: Den Prüfblock schreiben und scheitern sehen**

Als `vorstand@demo.de`, Konsole:

```js
const r  = (await LPR.listRecipients()).recipients[0];
const cr = await LPR.createInvoice({ recipient_id: r.id });
console.log('Entwurf:', cr.ok, cr.invoice.status, cr.invoice.invoice_no);
await LPR.saveInvoiceItems(cr.invoice.id, [
  { pos: 1, quantity: 3, description: 'Sitzwache Nachtschicht', period_text: 'Juli 2026', unit_price_cents: 20000 }
]);
const g1 = await LPR.getInvoice(cr.invoice.id);
console.log('Position gespeichert:', g1.items.length, g1.items[0].amount_cents);
const iss = await LPR.issueInvoice(cr.invoice.id);
console.log('festgeschrieben:', iss.ok, iss.invoice.invoice_no, iss.invoice.total_cents);
const again = await LPR.issueInvoice(cr.invoice.id);
console.log('zweimal geht nicht:', again.ok === false, again.error);
const paid = await LPR.markInvoicePaid(cr.invoice.id, '2026-08-20');
console.log('bezahlt:', paid.ok);
const st = await LPR.cancelInvoice(cr.invoice.id, 'Prueflauf');
console.log('storniert:', st.ok, st.invoice.total_cents);
```

Erwartet: `TypeError: LPR.createInvoice is not a function`.

- [ ] **Step 2: Implementieren**

```js
  const INVOICE_COLS = 'id, invoice_no, status, recipient_id, recipient_snapshot, invoice_date, ' +
    'service_from, service_to, due_date, tax_mode, tax_rate, tax_note, intro_text, ' +
    'subtotal_cents, tax_cents, total_cents, paid_on, cancels_invoice_id, cancelled_by_invoice_id, ' +
    'created_at, issued_at';

  async function listInvoices(filter) {
    const f = filter || {};
    try {
      let q = (await sb())
        .from('invoices')
        .select(INVOICE_COLS + ', billing_recipients(name)')
        .order('invoice_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (f.year)        q = q.gte('invoice_date', f.year + '-01-01').lte('invoice_date', f.year + '-12-31');
      if (f.status)      q = q.eq('status', f.status);
      if (f.recipientId) q = q.eq('recipient_id', f.recipientId);
      const { data, error } = await q;
      if (error) return { ok: false, error: error.message, invoices: [] };
      const invoices = (data || []).map(i => ({
        ...i,
        recipient_name: (i.billing_recipients && i.billing_recipients.name) || '—'
      }));
      return { ok: true, invoices };
    } catch(e) {
      console.error('[LPR] listInvoices:', e);
      return { ok: false, error: 'Netzwerkfehler.', invoices: [] };
    }
  }

  async function getInvoice(id) {
    try {
      const client = await sb();
      const [invRes, itemRes] = await Promise.all([
        client.from('invoices').select(INVOICE_COLS + ', billing_recipients(*)').eq('id', id).maybeSingle(),
        client.from('invoice_items')
              .select('id, pos, quantity, description, period_text, unit_price_cents, amount_cents')
              .eq('invoice_id', id).order('pos', { ascending: true })
      ]);
      if (invRes.error)  return { ok: false, error: invRes.error.message };
      if (!invRes.data)  return { ok: false, error: 'Rechnung nicht gefunden.' };
      if (itemRes.error) return { ok: false, error: itemRes.error.message };
      const inv = invRes.data;
      // Ab 'issued' gilt der eingefrorene Snapshot, vorher die Live-Anschrift.
      const recipient = inv.recipient_snapshot || inv.billing_recipients || null;
      return { ok: true, invoice: inv, recipient, items: itemRes.data || [] };
    } catch(e) {
      console.error('[LPR] getInvoice:', e);
      return { ok: false, error: 'Netzwerkfehler.' };
    }
  }

  async function createInvoice(patch) {
    if (!patch || !patch.recipient_id) return { ok: false, error: 'Empfänger fehlt.' };
    try {
      const { data, error } = await (await sb())
        .from('invoices')
        .insert({
          recipient_id: patch.recipient_id,
          invoice_date: patch.invoice_date || dateKey(new Date()),
          intro_text:   patch.intro_text || null
        })
        .select(INVOICE_COLS).single();
      if (error) return { ok: false, error: error.message };
      return { ok: true, invoice: data };
    } catch(e) {
      console.error('[LPR] createInvoice:', e);
      return { ok: false, error: 'Netzwerkfehler.' };
    }
  }

  async function updateInvoiceDraft(id, patch) {
    const allowed = ['recipient_id','invoice_date','service_from','service_to','due_date',
                     'tax_mode','tax_rate','tax_note','intro_text'];
    const row = {};
    allowed.forEach(k => { if (patch && k in patch) row[k] = patch[k] === '' ? null : patch[k]; });
    if (!Object.keys(row).length) return { ok: true };
    try {
      const { data, error } = await (await sb())
        .from('invoices').update(row).eq('id', id).select(INVOICE_COLS).single();
      if (error) return { ok: false, error: error.message };
      return { ok: true, invoice: data };
    } catch(e) {
      console.error('[LPR] updateInvoiceDraft:', e);
      return { ok: false, error: 'Netzwerkfehler.' };
    }
  }

  // Positionen werden als Ganzes ersetzt. Das haelt die Reihenfolge sauber und
  // spart eine Differenzlogik im Browser; es sind nie viele Zeilen.
  async function saveInvoiceItems(invoiceId, items) {
    try {
      const client = await sb();
      const { error: delErr } = await client.from('invoice_items').delete().eq('invoice_id', invoiceId);
      if (delErr) return { ok: false, error: delErr.message };
      const rows = (items || []).map((it, idx) => ({
        invoice_id:       invoiceId,
        pos:              idx + 1,
        quantity:         Number(it.quantity) || 0,
        description:      String(it.description || '').trim(),
        period_text:      it.period_text || null,
        unit_price_cents: Number(it.unit_price_cents) || 0,
        amount_cents:     itemAmountCents(it.quantity, it.unit_price_cents)
      })).filter(r => r.description);
      if (!rows.length) return { ok: true, items: [] };
      const { data, error } = await client.from('invoice_items').insert(rows).select();
      if (error) return { ok: false, error: error.message };
      return { ok: true, items: data || [] };
    } catch(e) {
      console.error('[LPR] saveInvoiceItems:', e);
      return { ok: false, error: 'Netzwerkfehler.' };
    }
  }

  async function deleteInvoiceDraft(id) {
    try {
      const { error } = await (await sb()).from('invoices').delete().eq('id', id).eq('status', 'draft');
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    } catch(e) {
      console.error('[LPR] deleteInvoiceDraft:', e);
      return { ok: false, error: 'Netzwerkfehler.' };
    }
  }

  async function issueInvoice(id) {
    try {
      const { data, error } = await (await sb()).rpc('issue_invoice', { p_id: id });
      if (error) return { ok: false, error: error.message };
      return { ok: true, invoice: data };
    } catch(e) {
      console.error('[LPR] issueInvoice:', e);
      return { ok: false, error: 'Netzwerkfehler.' };
    }
  }

  async function cancelInvoice(id, reason) {
    try {
      const { data, error } = await (await sb())
        .rpc('cancel_invoice', { p_id: id, p_reason: reason || '' });
      if (error) return { ok: false, error: error.message };
      return { ok: true, invoice: data };
    } catch(e) {
      console.error('[LPR] cancelInvoice:', e);
      return { ok: false, error: 'Netzwerkfehler.' };
    }
  }

  async function markInvoicePaid(id, paidOn) {
    try {
      const { error } = await (await sb())
        .from('invoices')
        .update({ status: 'paid', paid_on: paidOn || dateKey(new Date()) })
        .eq('id', id).eq('status', 'issued');
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    } catch(e) {
      console.error('[LPR] markInvoicePaid:', e);
      return { ok: false, error: 'Netzwerkfehler.' };
    }
  }
```

Exporte ergänzen:

```js
    listInvoices, getInvoice, createInvoice, updateInvoiceDraft, saveInvoiceItems,
    deleteInvoiceDraft, issueInvoice, cancelInvoice, markInvoicePaid,
```

- [ ] **Step 3: Prüfblock erneut laufen lassen**

Erwartet:
- `Entwurf: true draft null`
- `Position gespeichert: 1 60000`
- `festgeschrieben: true RE-2026-000X 60000`
- `zweimal geht nicht: true Nur Entwuerfe koennen festgeschrieben werden.`
- `bezahlt: true`
- `storniert: true -60000`

- [ ] **Step 4: Testdaten entfernen**

```sql
delete from public.invoices where recipient_id in
  (select id from public.billing_recipients where name = 'Sana Klinikum Lichtenberg');
delete from public.invoice_counters where year = extract(year from current_date)::int;
```

Der zweite `delete` setzt den Nummernkreis zurück, damit die erste echte Rechnung `RE-2026-0001` wird. **Das ist der einzige Moment, in dem der Zähler von Hand angefasst werden darf** — danach nie wieder.

- [ ] **Step 5: Commit**

```bash
git add app.js
git commit -m "feat(rechnungen): Rechnungs-API"
```

---

### Task 7: `admin-rechnungen.html` — Liste

**Files:**
- Create: `admin-rechnungen.html`

- [ ] **Step 1: Fehlschlag bestätigen**

`admin-rechnungen.html` öffnen. Erwartet: 404.

- [ ] **Step 2: Gerüst anlegen**

Kopiere `admin-empfaenger.html` nach `admin-rechnungen.html`, ändere den Titel auf `Rechnungen · Leben Pflegen Reisen e.V.`, ersetze im `<style>` das Präfix `emp-` durch `inv-` und tausche `<main>` sowie den Seiten-Skriptblock gegen die folgenden Schritte.

- [ ] **Step 3: Markup einsetzen**

```html
<main id="main">
<div class="inv-wrap">
  <div id="login-view" hidden>
    <div class="inv-card" style="padding:28px;"><p>Dieser Bereich ist dem Vorstand vorbehalten.</p></div>
  </div>

  <div id="admin-view" hidden>
    <div class="inv-header">
      <div>
        <h1>Rechnungen</h1>
        <p>Rechnungen des Vereins. Nummern vergibt die Datenbank beim Festschreiben —
           lückenlos und nicht nachträglich änderbar.</p>
      </div>
      <div style="text-align:right;">
        <div style="font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;font-weight:700;">Offene Forderungen</div>
        <div id="kpi-open" style="font-family:'Bricolage Grotesque',sans-serif;font-size:26px;font-weight:800;color:var(--green-deep);">—</div>
        <div style="margin-top:10px;display:flex;gap:8px;justify-content:flex-end;">
          <a class="btn" href="admin-empfaenger.html">Empfänger</a>
          <button class="btn btn-primary" onclick="newInvoice()">+ Neue Rechnung</button>
        </div>
      </div>
    </div>

    <div class="inv-card" style="padding:16px 20px;margin-bottom:14px;display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end;">
      <label style="font-size:13px;font-weight:600;color:var(--muted);">Jahr<br>
        <select id="f-year" class="f-in" style="width:120px;" onchange="loadData()"></select></label>
      <label style="font-size:13px;font-weight:600;color:var(--muted);">Status<br>
        <select id="f-status" class="f-in" style="width:170px;" onchange="loadData()">
          <option value="">alle</option>
          <option value="draft">Entwurf</option>
          <option value="issued">offen</option>
          <option value="paid">bezahlt</option>
          <option value="cancelled">storniert</option>
        </select></label>
      <label style="font-size:13px;font-weight:600;color:var(--muted);">Empfänger<br>
        <select id="f-recipient" class="f-in" style="width:260px;" onchange="loadData()"></select></label>
    </div>

    <div class="inv-card" id="table-wrap"></div>
  </div>
</div>
</main>
```

- [ ] **Step 4: Seiten-Skript einsetzen**

```html
<script src="app.js?v20260815a"></script>
<script src="layout.js"></script>
<script>
'use strict';

LPR_Layout.init({ page: 'rechnungen-admin' });

let _recipients = [];

function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; }
function deDate(iso) { return iso ? iso.slice(8,10) + '.' + iso.slice(5,7) + '.' + iso.slice(0,4) : '—'; }

const STATUS_LABEL = { draft: 'Entwurf', issued: 'offen', paid: 'bezahlt', cancelled: 'storniert' };

async function init() {
  const session = LPR.getSession();
  if (!session) { location.href = 'login.html?next=admin-rechnungen.html'; return; }
  if (session.role !== 'admin') { document.getElementById('login-view').hidden = false; return; }
  document.getElementById('admin-view').hidden = false;

  const year = new Date().getFullYear();
  document.getElementById('f-year').innerHTML =
    [year + 1, year, year - 1, year - 2].map(y =>
      `<option value="${y}"${y === year ? ' selected' : ''}>${y}</option>`).join('');

  const rres = await LPR.listRecipients(true);
  _recipients = rres.recipients || [];
  document.getElementById('f-recipient').innerHTML =
    '<option value="">alle</option>' +
    _recipients.map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('');

  await loadData();
}

async function loadData() {
  const res = await LPR.listInvoices({
    year:        document.getElementById('f-year').value,
    status:      document.getElementById('f-status').value,
    recipientId: document.getElementById('f-recipient').value
  });
  if (!res.ok) {
    document.getElementById('table-wrap').innerHTML =
      '<div style="padding:24px;">Fehler beim Laden: ' + escapeHtml(res.error) + '</div>';
    return;
  }
  renderTable(res.invoices);
}

function renderTable(invoices) {
  const offen = invoices.filter(i => i.status === 'issued')
                        .reduce((s, i) => s + (i.total_cents || 0), 0);
  document.getElementById('kpi-open').textContent = LPR.centsToEUR(offen);

  if (!invoices.length) {
    document.getElementById('table-wrap').innerHTML =
      '<div style="padding:28px;color:var(--muted);">Keine Rechnung in dieser Auswahl.</div>';
    return;
  }

  const rows = invoices.map(i => {
    const overdue = LPR.invoiceIsOverdue(i);
    const badge = overdue
      ? '<span style="background:#C85B30;color:#fff;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700;">überfällig</span>'
      : '<span style="background:#EFEDE8;color:#4A4A46;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700;">' +
        STATUS_LABEL[i.status] + '</span>';
    return `<tr onclick="location.href='rechnung.html?id=${i.id}'" style="cursor:pointer;">
      <td><strong>${escapeHtml(i.invoice_no || 'Entwurf')}</strong></td>
      <td>${deDate(i.invoice_date)}</td>
      <td>${escapeHtml(i.recipient_name)}</td>
      <td class="num">${LPR.centsToEUR(i.total_cents)}</td>
      <td>${badge}</td>
      <td>${i.status === 'issued' ? deDate(i.due_date) : (i.paid_on ? 'bezahlt ' + deDate(i.paid_on) : '—')}</td>
    </tr>`;
  }).join('');

  document.getElementById('table-wrap').innerHTML = `
    <table class="inv-table">
      <thead><tr>
        <th>Nummer</th><th>Datum</th><th>Empfänger</th>
        <th class="num">Betrag</th><th>Status</th><th>Fällig</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

async function newInvoice() {
  const aktive = _recipients.filter(r => r.active);
  if (!aktive.length) {
    LPR.showToast('Erst einen Empfänger anlegen.', 'warn');
    location.href = 'admin-empfaenger.html';
    return;
  }
  const res = await LPR.createInvoice({ recipient_id: aktive[0].id });
  if (!res.ok) { LPR.showToast(res.error, 'warn'); return; }
  location.href = 'rechnung.html?id=' + res.invoice.id;
}

init();
</script>
```

- [ ] **Step 5: Klick-Pfad prüfen**

Als `vorstand@demo.de` `admin-rechnungen.html` öffnen.
Erwartet: Kennzahl `0,00 €`, Meldung „Keine Rechnung in dieser Auswahl.", die drei Filter sind gefüllt. „+ Neue Rechnung" leitet auf `rechnung.html?id=…` weiter — dort steht noch 404, das ist an dieser Stelle richtig.

- [ ] **Step 6: Commit**

```bash
git add admin-rechnungen.html
git commit -m "feat(rechnungen): Rechnungsliste mit Filtern und offener Forderungssumme"
```

---

### Task 8: `rechnung.html` — Editor

**Files:**
- Create: `rechnung.html`

- [ ] **Step 1: Fehlschlag bestätigen**

Der in Task 7 erzeugte Link `rechnung.html?id=…` liefert 404.

- [ ] **Step 2: Gerüst und Editor-Markup anlegen**

Neue Datei `rechnung.html`. `<head>` wie in `admin-empfaenger.html` (Favicons, Manifest, Fonts, `shared.css`, `theme-color`, `robots noindex`), Titel `Rechnung · Leben Pflegen Reisen e.V.`.

`<style>`-Block (Editor-Teil; das Druck-CSS kommt in Task 9 dazu):

```css
.re-wrap { max-width: 900px; margin: 28px auto 60px; padding: 0 20px; }
.back-link { display:inline-flex; gap:6px; margin:0 0 14px; font-size:14px; font-weight:600; color:#1A3A2A; text-decoration:none; }
.re-bar { background:#fff; border:1px solid var(--border); border-radius:var(--radius);
          padding:16px 20px; margin-bottom:16px; display:flex; gap:12px; align-items:center; flex-wrap:wrap; }
.re-bar .spacer { flex:1; }
.re-warn { background:#FDF0E8; border:1px solid #C85B30; color:#8A3A18; border-radius:10px;
           padding:12px 16px; margin-bottom:14px; font-size:14px; font-weight:600; }
.f-lbl { display:block; font-size:13px; font-weight:600; color:var(--muted); margin-bottom:12px; }
.f-in  { display:block; width:100%; margin-top:5px; font-family:inherit; font-size:14px;
         padding:9px 11px; border:1.5px solid var(--border); border-radius:8px; background:#fff; color:var(--text); }
.it-table { width:100%; border-collapse:collapse; font-size:14px; }
.it-table th { text-align:left; font-size:11px; font-weight:700; text-transform:uppercase;
               letter-spacing:.06em; color:var(--muted); padding:10px 8px; border-bottom:1.5px solid var(--border); }
.it-table td { padding:6px 8px; border-bottom:1px solid #EFEDE8; vertical-align:top; }
.it-table .num, .it-table th.num { text-align:right; }
.it-table input { width:100%; font-family:inherit; font-size:14px; padding:7px 9px;
                  border:1.5px solid var(--border); border-radius:7px; }
.it-sum { display:flex; justify-content:flex-end; gap:28px; padding:14px 8px 0; font-size:15px; }
.it-sum strong { font-family:'Bricolage Grotesque',sans-serif; font-size:19px; color:var(--green-deep); }
```

`<main>`:

```html
<main id="main">
<div class="re-wrap">
  <a href="admin-rechnungen.html" class="back-link no-print">← Rechnungen</a>
  <div id="login-view" hidden><p>Dieser Bereich ist dem Vorstand vorbehalten.</p></div>
  <div id="warn-steuernr" class="re-warn no-print" hidden>
    Steuernummer des Vereins fehlt — die Rechnung ist nach § 14 UStG unvollständig.
    Sie steht in <code>app.js</code> unter <code>VEREIN.steuernummer</code>.
  </div>
  <div class="re-bar no-print" id="action-bar"></div>
  <div id="editor" hidden></div>
  <div id="beleg"></div>
</div>
</main>
```

- [ ] **Step 3: Editor-Skript einsetzen**

```html
<script src="app.js?v20260815a"></script>
<script src="layout.js"></script>
<script>
'use strict';

LPR_Layout.init({ page: 'rechnungen-admin' });

const INV_ID = new URLSearchParams(location.search).get('id');
let _inv = null, _recipient = null, _items = [], _recipients = [];

function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; }
function deDate(iso) { return iso ? iso.slice(8,10) + '.' + iso.slice(5,7) + '.' + iso.slice(0,4) : '—'; }

async function init() {
  const session = LPR.getSession();
  if (!session) { location.href = 'login.html?next=admin-rechnungen.html'; return; }
  if (session.role !== 'admin') { document.getElementById('login-view').hidden = false; return; }
  if (!LPR.VEREIN.steuernummer) document.getElementById('warn-steuernr').hidden = false;
  if (!INV_ID) { location.href = 'admin-rechnungen.html'; return; }

  _recipients = (await LPR.listRecipients(true)).recipients || [];
  await reload();
}

async function reload() {
  const res = await LPR.getInvoice(INV_ID);
  if (!res.ok) { LPR.showToast(res.error, 'warn'); location.href = 'admin-rechnungen.html'; return; }
  _inv = res.invoice; _recipient = res.recipient; _items = res.items;
  if (!_items.length && _inv.status === 'draft') _items = [emptyItem()];
  render();
}

function emptyItem() {
  return { quantity: 1, description: '', period_text: '', unit_price_cents: 0 };
}

function render() {
  renderBar();
  const isDraft = _inv.status === 'draft';
  document.getElementById('editor').hidden = !isDraft;
  if (isDraft) renderEditor();
  renderBeleg();       // in Task 9 definiert
}

function renderBar() {
  const s = _inv.status;
  const bits = [`<strong style="font-family:'Bricolage Grotesque',sans-serif;font-size:18px;color:var(--green-deep);">
     ${escapeHtml(_inv.invoice_no || 'Entwurf')}</strong>`, '<span class="spacer"></span>'];
  if (s === 'draft') {
    bits.push('<button class="btn" onclick="saveDraft()">Speichern</button>');
    bits.push('<button class="btn" onclick="removeDraft()">Verwerfen</button>');
    bits.push('<button class="btn btn-primary" onclick="issue()">Festschreiben</button>');
  } else {
    bits.push('<button class="btn btn-primary" onclick="printInvoice()">Drucken / Als PDF sichern</button>');
    if (s === 'issued') bits.push('<button class="btn" onclick="markPaid()">Als bezahlt markieren</button>');
    if (s === 'issued' || s === 'paid') bits.push('<button class="btn" onclick="storno()">Stornieren</button>');
  }
  document.getElementById('action-bar').innerHTML = bits.join(' ');
}

function renderEditor() {
  const opts = _recipients.filter(r => r.active || r.id === _inv.recipient_id)
    .map(r => `<option value="${r.id}"${r.id === _inv.recipient_id ? ' selected' : ''}>${escapeHtml(r.name)}</option>`).join('');
  const rows = _items.map((it, i) => `
    <tr>
      <td style="width:70px;"><input value="${escapeHtml(String(it.quantity))}" oninput="setItem(${i},'quantity',this.value)"></td>
      <td><input value="${escapeHtml(it.description)}" placeholder="Leistung" oninput="setItem(${i},'description',this.value)"></td>
      <td style="width:150px;"><input value="${escapeHtml(it.period_text || '')}" placeholder="z. B. Juli 2026" oninput="setItem(${i},'period_text',this.value)"></td>
      <td style="width:120px;"><input class="num" value="${(it.unit_price_cents/100).toFixed(2).replace('.',',')}" oninput="setItem(${i},'unit_price_cents',LPR.eurToCents(this.value))"></td>
      <td class="num" style="width:110px;padding-top:14px;">${LPR.centsToEUR(LPR.itemAmountCents(it.quantity, it.unit_price_cents))}</td>
      <td style="width:36px;"><button class="btn" onclick="removeItem(${i})" aria-label="Position entfernen">×</button></td>
    </tr>`).join('');

  document.getElementById('editor').innerHTML = `
    <div style="background:#fff;border:1px solid var(--border);border-radius:var(--radius);padding:22px 24px;margin-bottom:16px;">
      <div style="display:flex;gap:14px;flex-wrap:wrap;">
        <label class="f-lbl" style="flex:2;min-width:260px;">Empfänger
          <select class="f-in" onchange="setField('recipient_id', this.value)">${opts}</select></label>
        <label class="f-lbl" style="flex:1;min-width:150px;">Rechnungsdatum
          <input class="f-in" type="date" value="${_inv.invoice_date || ''}" onchange="setField('invoice_date', this.value)"></label>
        <label class="f-lbl" style="flex:1;min-width:150px;">Zahlungsziel
          <input class="f-in" type="date" value="${_inv.due_date || ''}" onchange="setField('due_date', this.value)"></label>
      </div>
      <div style="display:flex;gap:14px;flex-wrap:wrap;">
        <label class="f-lbl" style="flex:1;min-width:150px;">Leistung von
          <input class="f-in" type="date" value="${_inv.service_from || ''}" onchange="setField('service_from', this.value)"></label>
        <label class="f-lbl" style="flex:1;min-width:150px;">Leistung bis
          <input class="f-in" type="date" value="${_inv.service_to || ''}" onchange="setField('service_to', this.value)"></label>
        <label class="f-lbl" style="flex:2;min-width:220px;">Umsatzsteuer
          <select class="f-in" onchange="setTaxMode(this.value)">
            <option value="exempt"${_inv.tax_mode === 'exempt' ? ' selected' : ''}>steuerfrei</option>
            <option value="vat"${_inv.tax_mode === 'vat' ? ' selected' : ''}>steuerpflichtig</option>
          </select></label>
      </div>
      <label class="f-lbl">${_inv.tax_mode === 'vat' ? 'Steuersatz in Prozent' : 'Befreiungsgrund (steht so auf der Rechnung)'}
        ${_inv.tax_mode === 'vat'
          ? `<input class="f-in" value="${_inv.tax_rate}" onchange="setField('tax_rate', this.value)">`
          : `<input class="f-in" value="${escapeHtml(_inv.tax_note)}" onchange="setField('tax_note', this.value)">`}</label>
      <label class="f-lbl">Einleitungssatz (optional)
        <input class="f-in" value="${escapeHtml(_inv.intro_text || '')}" onchange="setField('intro_text', this.value)"></label>

      <table class="it-table">
        <thead><tr><th>Menge</th><th>Leistung</th><th>Zeitraum</th><th class="num">Einzelpreis</th><th class="num">Betrag</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <button class="btn" style="margin-top:10px;" onclick="addItem()">+ Position</button>
      <div class="it-sum"><span>Summe</span><strong>${LPR.centsToEUR(currentSubtotal())}</strong></div>
    </div>`;
}

function currentSubtotal() {
  return _items.reduce((s, it) => s + LPR.itemAmountCents(it.quantity, it.unit_price_cents), 0);
}

function setField(key, value) { _inv[key] = value; }
function setTaxMode(mode) { _inv.tax_mode = mode; renderEditor(); }
function setItem(i, key, value) {
  _items[i][key] = value;
  if (key === 'quantity' || key === 'unit_price_cents') renderEditor();
}
function addItem() { _items.push(emptyItem()); renderEditor(); }
function removeItem(i) { _items.splice(i, 1); if (!_items.length) _items = [emptyItem()]; renderEditor(); }

async function saveDraft(silent) {
  const a = await LPR.updateInvoiceDraft(INV_ID, _inv);
  if (!a.ok) { LPR.showToast(a.error, 'warn'); return false; }
  const b = await LPR.saveInvoiceItems(INV_ID, _items);
  if (!b.ok) { LPR.showToast(b.error, 'warn'); return false; }
  if (!silent) LPR.showToast('Gespeichert ✓');
  return true;
}

async function removeDraft() {
  if (!confirm('Diesen Entwurf verwerfen?')) return;
  const res = await LPR.deleteInvoiceDraft(INV_ID);
  if (!res.ok) { LPR.showToast(res.error, 'warn'); return; }
  location.href = 'admin-rechnungen.html';
}

async function issue() {
  if (!_items.some(i => String(i.description || '').trim())) {
    LPR.showToast('Mindestens eine Position mit Beschreibung.', 'warn'); return;
  }
  if (!confirm('Festschreiben? Danach ist die Rechnung nicht mehr änderbar — Korrekturen laufen über eine Storno-Rechnung.')) return;
  if (!await saveDraft(true)) return;
  const res = await LPR.issueInvoice(INV_ID);
  if (!res.ok) { LPR.showToast(res.error, 'warn'); return; }
  LPR.showToast('Festgeschrieben als ' + res.invoice.invoice_no);
  await reload();
}

async function markPaid() {
  const heute = new Date().toISOString().slice(0,10);
  const d = prompt('Zahlungseingang am (JJJJ-MM-TT):', heute);
  if (!d) return;
  const res = await LPR.markInvoicePaid(INV_ID, d);
  if (!res.ok) { LPR.showToast(res.error, 'warn'); return; }
  await reload();
}

async function storno() {
  const grund = prompt('Grund für den Storno:');
  if (grund === null) return;
  const res = await LPR.cancelInvoice(INV_ID, grund);
  if (!res.ok) { LPR.showToast(res.error, 'warn'); return; }
  LPR.showToast('Storno ' + res.invoice.invoice_no + ' erstellt');
  location.href = 'rechnung.html?id=' + res.invoice.id;
}

function printInvoice() {
  const alt = document.title;
  document.title = (_inv.invoice_no || 'Rechnung') + ' ' + ((_recipient && _recipient.name) || '');
  window.print();
  setTimeout(() => { document.title = alt; }, 1000);
}

init();
</script>
```

`renderBeleg()` fehlt noch — sie kommt in Task 9. Bis dahin ist die Seite absichtlich unvollständig.

- [ ] **Step 4: Zwischenstand prüfen**

`admin-rechnungen.html` → „+ Neue Rechnung".
Erwartet: Editor erscheint mit Empfänger-Auswahl, Datumsfeldern und einer leeren Position. In der Konsole steht `ReferenceError: renderBeleg is not defined` — das ist an dieser Stelle richtig und wird in Task 9 behoben. Fülle eine Position aus, „Speichern" → Toast „Gespeichert ✓". Seite neu laden: die Position ist noch da.

- [ ] **Step 5: Commit**

```bash
git add rechnung.html
git commit -m "feat(rechnungen): Editor fuer Rechnungsentwuerfe"
```

---

### Task 9: `rechnung.html` — Beleg und Druckansicht

**Files:**
- Modify: `rechnung.html`

- [ ] **Step 1: Fehlschlag bestätigen**

Eine Rechnung öffnen, Konsole zeigt `ReferenceError: renderBeleg is not defined`, der Bereich `#beleg` ist leer.

- [ ] **Step 2: Druck-CSS ergänzen**

Ans Ende des `<style>`-Blocks in `rechnung.html`:

```css
/* Beleg — Bildschirm wie Druck dasselbe Layout, damit die Vorschau ehrlich ist.
   KEINE box-shadow: Chrome exportiert Schatten als Soft-Mask, Vorschau und
   Keynote zeichnen daraus harte graue Kaesten. Rahmen statt Schatten. */
.beleg { background:#fff; border:1px solid var(--border); border-radius:var(--radius);
         padding:38px 42px; color:#1A1A18; font-size:13px; line-height:1.5; }
.beleg-claim { font-family:'Bricolage Grotesque',sans-serif; font-size:13px; font-style:italic;
               color:#1A3A2A; border-bottom:3px solid #C8F135; padding-bottom:10px; margin-bottom:22px; }
.beleg h1 { font-family:'Bricolage Grotesque',sans-serif; font-size:26px; font-weight:800;
            color:#1A3A2A; margin:0 0 18px; letter-spacing:-.02em; }
.beleg-parties { display:flex; gap:36px; margin-bottom:22px; }
.beleg-parties > div { flex:1; }
.beleg-lbl { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.07em;
             color:#6B6B65; margin-bottom:5px; }
.beleg-meta { display:flex; gap:26px; border-top:1px solid #E4E2DC; border-bottom:1px solid #E4E2DC;
              padding:11px 0; margin-bottom:22px; }
.beleg-meta div { flex:1; }
.beleg-table { width:100%; border-collapse:collapse; margin-bottom:16px; }
.beleg-table th { text-align:left; font-size:10px; font-weight:700; text-transform:uppercase;
                  letter-spacing:.06em; color:#6B6B65; border-bottom:1.5px solid #1A3A2A; padding:7px 6px; }
.beleg-table td { padding:8px 6px; border-bottom:1px solid #EFEDE8; vertical-align:top; }
.beleg-table .num, .beleg-table th.num { text-align:right; font-variant-numeric:tabular-nums; }
.beleg-sum { margin-left:auto; width:290px; }
.beleg-sum tr td { padding:6px 6px; }
.beleg-sum .total td { border-top:2px solid #1A3A2A; font-weight:800; font-size:15px;
                       font-family:'Bricolage Grotesque',sans-serif; }
.beleg-tax { background:#F6F8F0; border-left:3px solid #C8F135; padding:11px 14px; margin:18px 0; }
.beleg-pay { margin:18px 0; }
.beleg-foot { border-top:1px solid #E4E2DC; margin-top:26px; padding-top:12px;
              font-size:10.5px; line-height:1.55; color:#6B6B65; }
.beleg-storno { color:#8A3A18; font-weight:700; }

@media print {
  @page { size: A4; margin: 16mm 14mm; }
  html, body { background:#fff !important; }
  .re-wrap { max-width:none; margin:0; padding:0; }
  .beleg { border:none; border-radius:0; padding:0; font-size:11.5pt; }
  .beleg h1 { font-size:22pt; }
  .beleg-table { page-break-inside:auto; }
  .beleg-table tr { page-break-inside:avoid; }
  a { text-decoration:none; color:inherit; }
}
```

`shared.css` blendet über `.no-print` bereits A11y-Leiste, Header, Footer und alles mit dieser Klasse aus — Aktionsleiste und Zurück-Link tragen sie schon.

- [ ] **Step 3: `renderBeleg()` einsetzen**

Im Seiten-Skript hinter `renderEditor()`:

```js
// Der Beleg ist die Rechnung selbst — am Bildschirm und im Druck identisch.
// Aufbau folgt der Vorlage "01 Rechnungsvorlage (§14 UStG)" aus dem Drive.
function renderBeleg() {
  const V = LPR.VEREIN;
  const r = _recipient || {};
  const items = _items;
  const sub   = (_inv.status === 'draft') ? currentSubtotal() : _inv.subtotal_cents;
  const tax   = (_inv.status === 'draft')
    ? (_inv.tax_mode === 'vat' ? Math.round(sub * (Number(_inv.tax_rate) || 0) / 100) : 0)
    : _inv.tax_cents;
  const total = (_inv.status === 'draft') ? sub + tax : _inv.total_cents;

  const leistung = _inv.service_from
    ? deDate(_inv.service_from) + (_inv.service_to && _inv.service_to !== _inv.service_from
        ? ' – ' + deDate(_inv.service_to) : '')
    : deDate(_inv.invoice_date);

  const rows = items.map((it, i) => `
    <tr>
      <td>${i + 1}</td>
      <td class="num">${escapeHtml(String(it.quantity))}</td>
      <td>${escapeHtml(it.description)}</td>
      <td>${escapeHtml(it.period_text || '—')}</td>
      <td class="num">${LPR.centsToEUR(it.unit_price_cents)}</td>
      <td class="num">${LPR.centsToEUR(it.amount_cents != null ? it.amount_cents
                          : LPR.itemAmountCents(it.quantity, it.unit_price_cents))}</td>
    </tr>`).join('');

  const steuerBlock = (_inv.tax_mode === 'vat')
    ? `<table class="beleg-sum">
         <tr><td>Nettoentgelt</td><td class="num">${LPR.centsToEUR(sub)}</td></tr>
         <tr><td>zzgl. Umsatzsteuer ${escapeHtml(String(_inv.tax_rate))} %</td><td class="num">${LPR.centsToEUR(tax)}</td></tr>
         <tr class="total"><td>Rechnungsbetrag</td><td class="num">${LPR.centsToEUR(total)}</td></tr>
       </table>`
    : `<div class="beleg-tax">${escapeHtml(_inv.tax_note)}</div>
       <table class="beleg-sum">
         <tr class="total"><td>Rechnungsbetrag</td><td class="num">${LPR.centsToEUR(total)}</td></tr>
       </table>`;

  const stornoHinweis = _inv.status === 'cancelled'
    ? '<p class="beleg-storno">Diese Rechnung wurde storniert.</p>' : '';

  document.getElementById('beleg').innerHTML = `
  <div class="beleg">
    <div class="beleg-claim">${escapeHtml(V.claim)}</div>
    <h1>${_inv.cancels_invoice_id ? 'Storno-Rechnung' : 'Rechnung'}</h1>
    ${stornoHinweis}

    <div class="beleg-parties">
      <div>
        <div class="beleg-lbl">Rechnungssteller</div>
        <strong>${escapeHtml(V.name)}</strong><br>
        ${escapeHtml(V.strasse)}<br>${escapeHtml(V.ort)}<br>
        ${escapeHtml(V.register)}<br>
        Steuernummer: ${escapeHtml(V.steuernummer || '—')}<br>
        USt-IdNr.: ${escapeHtml(V.ustidnr)}
      </div>
      <div>
        <div class="beleg-lbl">Rechnungsempfänger</div>
        <strong>${escapeHtml(r.name || '—')}</strong><br>
        ${r.contact_person ? escapeHtml(r.contact_person) + '<br>' : ''}
        ${escapeHtml(r.address || '')}<br>
        ${escapeHtml(((r.postal_code || '') + ' ' + (r.city || '')).trim())}
        ${r.customer_ref ? '<br>Zeichen: ' + escapeHtml(r.customer_ref) : ''}
      </div>
    </div>

    <div class="beleg-meta">
      <div><div class="beleg-lbl">Rechnungsnummer</div><strong>${escapeHtml(_inv.invoice_no || 'Entwurf — noch nicht festgeschrieben')}</strong></div>
      <div><div class="beleg-lbl">Rechnungsdatum</div>${deDate(_inv.invoice_date)}</div>
      <div><div class="beleg-lbl">Leistungsdatum</div>${leistung}</div>
    </div>

    ${_inv.intro_text ? '<p>' + escapeHtml(_inv.intro_text) + '</p>' : ''}

    <table class="beleg-table">
      <thead><tr>
        <th>Pos.</th><th class="num">Menge</th><th>Leistung / Beschreibung</th>
        <th>Leistungszeitraum</th><th class="num">Einzelbetrag</th><th class="num">Gesamtbetrag</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>

    ${steuerBlock}

    <div class="beleg-pay">
      <div class="beleg-lbl">Zahlung</div>
      Bitte überweisen Sie den Rechnungsbetrag ohne Abzug bis zum
      <strong>${deDate(_inv.due_date)}</strong> auf folgendes Konto:<br>
      Kontoinhaber: ${escapeHtml(V.name)} · IBAN: ${escapeHtml(V.iban)} · BIC: ${escapeHtml(V.bic)} · Bank: ${escapeHtml(V.bank)}<br>
      Verwendungszweck: Rechnungsnummer ${escapeHtml(_inv.invoice_no || '—')}
      ${_inv.paid_on ? '<br><strong>Zahlungseingang am ' + deDate(_inv.paid_on) + '</strong>' : ''}
    </div>

    <div class="beleg-foot">
      <strong>${escapeHtml(V.name)}</strong> · ${escapeHtml(V.strasse)} · ${escapeHtml(V.ort)} ·
      ${escapeHtml(V.email)} · ${escapeHtml(V.web)}<br>
      Vereinsregister: ${escapeHtml(V.register)} · Gemeinnütziger Verein (§ 52 AO) · USt-IdNr. ${escapeHtml(V.ustidnr)}<br>
      Vorstand (einzelvertretungsberechtigt): ${escapeHtml(V.vorstand)} ·
      Bankverbindung: ${escapeHtml(V.iban)} · ${escapeHtml(V.bic)} · ${escapeHtml(V.bank)}
    </div>
  </div>`;
}
```

- [ ] **Step 4: Beleg am Bildschirm prüfen**

Rechnung öffnen.
Erwartet: kein Konsolenfehler mehr; unter dem Editor steht der vollständige Beleg und aktualisiert sich beim Tippen; solange nicht festgeschrieben, steht in der Nummer „Entwurf — noch nicht festgeschrieben".

- [ ] **Step 5: Festschreiben und drucken**

Festschreiben → Editor verschwindet, Nummer erscheint. „Drucken / Als PDF sichern".
Erwartet im Druckdialog:
- Dateiname-Vorschlag lautet `RE-2026-0001 <Empfängername>`
- eine Seite, ohne Navigation, ohne A11y-Leiste, ohne Knöpfe
- Kopf, Positionstabelle, Steuerabsatz, Zahlungsblock und Fußzeile stehen wie in der Vorlage

Als PDF sichern.

- [ ] **Step 6: PDF auf Soft-Masks prüfen**

```bash
grep -c /SMask ~/Downloads/RE-2026-0001*.pdf
```

Erwartet: `0`. Kommt eine andere Zahl, ist irgendwo ein `box-shadow` im Druckpfad — er muss raus, sonst zeichnen Vorschau und Keynote graue Kästen um die Blöcke.

Zusätzlich das PDF in der macOS-Vorschau öffnen und ansehen — der Chrome-Screenshot zeigt diesen Fehler nicht.

- [ ] **Step 7: Commit**

```bash
git add rechnung.html
git commit -m "feat(rechnungen): Beleg-Ansicht und A4-Druck nach Vereinsvorlage"
```

---

### Task 10: Navigation und Abnahme

**Files:**
- Modify: `layout.js:82-92` (Admin-Navigationsblock)

- [ ] **Step 1: Fehlschlag bestätigen**

Als `vorstand@demo.de` in die Kopfnavigation schauen.
Erwartet: kein Punkt „Rechnungen" — die neuen Seiten sind nur über die Adresszeile erreichbar.

- [ ] **Step 2: Navigationspunkt einfügen**

In `layout.js` im `else if (session.role === 'admin')`-Zweig, direkt **hinter** der Zeile mit `admin-sitzwachen.html`:

```js
          <li><a href="admin-rechnungen.html" class="${c('rechnungen-admin')}">Rechnungen</a></li>
```

Das Adressbuch bekommt bewusst keinen eigenen Navigationspunkt — es ist über den Knopf „Empfänger" auf der Rechnungsliste erreichbar und würde die ohnehin lange Admin-Leiste weiter füllen.

- [ ] **Step 3: Navigation prüfen**

Neu laden.
Erwartet: „Rechnungen" steht zwischen „Sitzwachen" und „Fördermittel", ist anklickbar und auf `admin-rechnungen.html` hervorgehoben.

- [ ] **Step 4: Ende-zu-Ende-Abnahme**

Als `vorstand@demo.de`, in dieser Reihenfolge:

1. Rechnungen → Empfänger → neuen Empfänger anlegen
2. Rechnungen → „+ Neue Rechnung" → Empfänger wählen, zwei Positionen erfassen, speichern
3. Festschreiben → Nummer erscheint, Editor verschwindet
4. Drucken → PDF sichern → `grep -c /SMask` ergibt `0`
5. „Als bezahlt markieren" mit heutigem Datum → Liste zeigt Status „bezahlt", die Kennzahl „Offene Forderungen" sinkt um den Betrag
6. Stornieren mit Grund → es entsteht eine zweite Rechnung mit eigener Nummer und negativem Betrag; die Liste zeigt das Original als „storniert"
7. Filter auf „Entwurf" stellen → die Liste ist leer

- [ ] **Step 5: Zugriffsschutz gegenprüfen**

Abmelden, als `margarete@demo.de` (Ehrenamt) anmelden:

1. Kopfnavigation zeigt keinen Punkt „Rechnungen"
2. `admin-rechnungen.html` direkt aufrufen → „Dieser Bereich ist dem Vorstand vorbehalten."
3. Konsole:

```js
console.log((await LPR.listInvoices({})).invoices.length, 0);
console.log((await LPR.listRecipients()).recipients.length, 0);
const w = await LPRSupabase.from('billing_recipients').insert({ name: 'HACK' });
console.log('schreiben:', w.error && w.error.message);
```

Erwartet: beide Zählungen `0`, beim Schreiben ein RLS-Fehler. Sieht ein Ehrenamtlicher auch nur eine Rechnung, **stoppen und melden**.

Dasselbe mit `charite@demo.de` (Klinik) wiederholen — auch dort muss alles leer sein.

- [ ] **Step 6: Testdaten aufräumen**

Alle in der Abnahme erzeugten Rechnungen und Empfänger löschen, dann den Zähler zurücksetzen:

```sql
delete from public.invoices;
delete from public.billing_recipients;
delete from public.invoice_counters;
```

Danach beginnt die erste echte Rechnung bei `RE-2026-0001`. **Ab hier wird `invoice_counters` nie wieder von Hand angefasst.**

- [ ] **Step 7: Commit**

```bash
git add layout.js
git commit -m "feat(rechnungen): Menuepunkt Rechnungen im Admin-Bereich"
```

---

## Offener Punkt für Eric

`VEREIN.steuernummer` in `app.js` ist leer. Solange sie fehlt, zeigt `rechnung.html` eine nicht druckbare Warnung, und auf dem Beleg steht bei Steuernummer ein Gedankenstrich. § 14 UStG verlangt Steuernummer oder USt-IdNr.; letztere hat der Verein nicht. **Vor der ersten echten Rechnung eintragen.**

## Nicht in dieser Etappe

Sammelrechnung aus Sitzwachen, `invoice_bookings` und der Doppelabrechnungsschutz — das ist Etappe 2 und bekommt einen eigenen Plan. Familien-/Reiserechnungen, Drive-Upload und E-Mail-Versand sind Etappe 3 und werden nicht vorbereitet.
