// ───────────────────────────────────────────────────────
// LPR · Shared App Module · app.js
// Phase 2: Auth läuft gegen Supabase (Frankfurt-Region)
// ───────────────────────────────────────────────────────

(function(global) {
  'use strict';

  const KEYS = {
    session:      'lpr-session-v2',
    signups:      'lpr-schichtplan-v1',
    availability: 'lpr-sitzwachen-avail-v1',
    bookings:     'lpr-sitzwachen-book-v1',
    clinics:      'lpr-sitzwachen-clinics-v1',
    clinicSession:'lpr-sw-clinic-session-v1',
    claims:       'lpr-claims-v1',
    textSize:     'lpr-text-size',
    contrast:     'lpr-contrast',
    ls:           'lpr-ls'
  };

  function load(key, def) {
    try { return JSON.parse(localStorage.getItem(key)) ?? def; } catch(e) { return def; }
  }
  function save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch(e) { console.error('Storage full', e); return false; }
  }
  function del(key) { try { localStorage.removeItem(key); } catch(e) {} }

  function escape(s) {
    const d = document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML;
  }
  function formatEUR(n) {
    return new Intl.NumberFormat('de-DE', {style:'currency', currency:'EUR'}).format(n);
  }
  function dateKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function keyToDate(k) {
    const [y,m,d] = k.split('-').map(Number);
    return new Date(y, m-1, d);
  }
  function formatDateRange(s, e) {
    const a = new Date(s).toLocaleDateString('de-DE', {day:'2-digit', month:'short'});
    const b = new Date(e).toLocaleDateString('de-DE', {day:'2-digit', month:'short', year:'numeric'});
    return `${a} – ${b}`;
  }

  const ROLE_FE_TO_BE = { ehrenamt: 'volunteer', klinik: 'clinic', admin: 'board' };
  const ROLE_BE_TO_FE = { volunteer: 'ehrenamt', clinic: 'klinik', board: 'admin' };

  async function sb() {
    if (global.LPRSupabase) return global.LPRSupabase;
    return await ensureSupabaseReady();
  }

  const SUPABASE_URL = 'https://makvwfznbwpjdzmuegoq.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_xF5YO04FE3Xjtl-133cLKw_C9fVs3Y3';

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) return resolve();
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Failed to load ' + src));
      document.head.appendChild(s);
    });
  }

  let _readyPromise = null;
  function ensureSupabaseReady() {
    if (_readyPromise) return _readyPromise;
    _readyPromise = (async () => {
      if (!global.supabase || !global.supabase.createClient) {
        await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js');
      }
      if (!global.LPRSupabase) {
        global.LPRSupabase = global.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            storageKey: 'lpr-auth-session'
          }
        });
        console.log('[LPR] Supabase-Client initialisiert (dynamisch)');
      }
      return global.LPRSupabase;
    })();
    return _readyPromise;
  }

  function getSession() { return load(KEYS.session, null); }

  // Cross-Subdomain Hint-Cookie auf .lebenpflegenreisen.de
  // KEIN Auth-Token — nur ein UX-Hinweis für die WordPress-Seite,
  // damit sie eingeloggte Besucher als solche erkennt und einen
  // "Mein Bereich"-Button statt "Anmelden" anzeigen kann.
  // Format: lpr_hint=<role>:<firstname>; max-age=30 Tage
  function setHintCookie(role, name) {
    try {
      const host = window.location.hostname;
      // Nur produktiv setzen (nicht auf localhost o. ä.)
      if (!host.endsWith('lebenpflegenreisen.de')) return;
      const firstName = (name || '').split(' ')[0].slice(0, 40);
      const value = encodeURIComponent((role || '') + ':' + firstName);
      const maxAge = 60 * 60 * 24 * 30; // 30 Tage
      document.cookie = 'lpr_hint=' + value
        + '; domain=.lebenpflegenreisen.de'
        + '; path=/'
        + '; max-age=' + maxAge
        + '; SameSite=Lax'
        + (location.protocol === 'https:' ? '; Secure' : '');
    } catch(e) { console.warn('[LPR] setHintCookie:', e); }
  }
  function clearHintCookie() {
    try {
      const host = window.location.hostname;
      if (!host.endsWith('lebenpflegenreisen.de')) return;
      document.cookie = 'lpr_hint=; domain=.lebenpflegenreisen.de; path=/; max-age=0; SameSite=Lax'
        + (location.protocol === 'https:' ? '; Secure' : '');
    } catch(e) {}
  }

  function setSession(profile, supabaseSession) {
    if (!profile || !supabaseSession) { clearSession(); return null; }
    const s = {
      id:             profile.id,
      email:          (profile.email || '').toLowerCase(),
      name:           profile.full_name || null,
      role:           ROLE_BE_TO_FE[profile.role] || 'ehrenamt',
      status:         profile.status || 'pending',
      personalnummer: profile.personalnummer || null,      vereinsnummer:  profile.vereinsnummer  || null,
      loginAt:        new Date().toISOString()
    };
    save(KEYS.session, s);
    setHintCookie(s.role, s.name);
    return s;
  }

  function clearSession() { del(KEYS.session); del(KEYS.clinicSession); clearHintCookie(); }

  async function refreshSessionCache() {
    try {
      const { data: { session: sbSession } } = await (await sb()).auth.getSession();
      if (!sbSession) { clearSession(); return null; }
      const { data: profile, error } = await (await sb())
        .from('profiles')
        .select('id, email, full_name, role, status, personalnummer, vereinsnummer')
        .eq('id', sbSession.user.id)
        .single();
      if (error || !profile) { clearSession(); return null; }
      return setSession(profile, sbSession);
    } catch(e) {
      console.warn('[LPR] refreshSessionCache failed:', e);
      return null;
    }
  }

  async function logout() {
    try { await (await sb()).auth.signOut(); } catch(e) { console.warn('signOut:', e); }
    clearSession();
  }

  function getUser(email) {
    const s = getSession();
    if (s && s.email === (email || '').toLowerCase()) return s;
    return null;
  }

  async function register({ email, password, name, role, extra }) {
    email = (email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'Bitte gültige E-Mail eingeben.' };
    if (!password || password.length < 8) return { ok: false, error: 'Passwort muss mindestens 8 Zeichen lang sein.' };
    if (!name || name.trim().length < 2) return { ok: false, error: 'Bitte Namen eingeben.' };
    if (!['ehrenamt','klinik','admin'].includes(role)) return { ok: false, error: 'Ungültige Rolle.' };

    // Klinik: Standard-Auth-Flow wie Ehrenamt. Klinik-Stammdaten (Adresse,
    // Ansprechpartner, Telefon) werden NACH dem ersten Login auf
    // kliniken.html im Onboarding-Form abgefragt. Grund: Beim ersten signUp
    // ist die E-Mail-Bestätigung noch ausstehend, der User ist nicht
    // authentifiziert → RLS-Insert in clinic_details würde fehlschlagen.
    // Zweistufiger Flow ist robuster.

    const beRole = ROLE_FE_TO_BE[role];

    try {
      const { data, error } = await (await sb()).auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: name.trim(),
            role: beRole
          },
          emailRedirectTo: window.location.origin + '/login.html'
        }
      });

      if (error) {
        if (error.message && error.message.toLowerCase().includes('already')) {
          return { ok: false, error: 'Ein Konto mit dieser E-Mail existiert bereits. Bitte einloggen.' };
        }
        return { ok: false, error: error.message || 'Registrierung fehlgeschlagen.' };
      }

      /*
       * BEREITS REGISTRIERT — und Supabase sagt es nicht.
       *
       * Bei einer schon vorhandenen, bestaetigten Adresse liefert signUp
       * KEINEN Fehler. Das ist Absicht: sonst koennte jeder durchprobieren,
       * welche Adressen ein Konto haben. Erkennbar ist der Fall nur daran,
       * dass der zurueckgegebene Benutzer eine LEERE identities-Liste hat.
       *
       * Ohne diese Pruefung lief der Ablauf auf die Bestaetigungsseite und
       * versprach eine Freigabe "innerhalb von 1-2 Werktagen" — fuer ein Konto,
       * das es laengst gibt und das niemand freischalten wird. Am 25.08.2026
       * beim Webhook-Test aufgefallen: die Erfolgsseite erschien, in profiles
       * stand aber ein Eintrag vom 11.06.
       *
       * Der Schutz gegen das Ausspaehen von Adressen wird damit aufgegeben.
       * Bewusst: Bei einem Verein mit vierzig Mitgliedern wiegt eine stille
       * Sackgasse fuer die betroffene Person schwerer als die Auskunft, dass
       * eine Adresse hier ein Konto hat.
       */
      const identitaeten = data && data.user && data.user.identities;
      if (Array.isArray(identitaeten) && identitaeten.length === 0) {
        return {
          ok: false,
          error: 'Für diese E-Mail gibt es bereits ein Konto. Bitte melden Sie sich an — oder setzen Sie Ihr Passwort zurück, falls Sie es nicht mehr wissen.'
        };
      }

      return {
        ok: true,
        pending: true,
        message: 'Registrierung erfolgreich eingereicht. Sie erhalten eine Bestätigungs-E-Mail. Anschließend prüft der Vorstand Ihre Anfrage und schaltet Ihr Konto frei.'
      };
    } catch(e) {
      console.error('[LPR] register failed:', e);
      return { ok: false, error: 'Netzwerkfehler. Bitte erneut versuchen.' };
    }
  }

  /**
   * Passwort zuruecksetzen — ohne Umweg ueber den Vorstand.
   *
   * Vorher stand unter dem Anmeldefeld "Passwort vergessen? — Schreib uns kurz,
   * wir setzen es zurueck." Das ist Handarbeit an einer Stelle, an der Supabase
   * den Weg fertig mitbringt, und es liest sich als Bastelloesung genau dort,
   * wo man gerade Kontodaten anvertrauen soll.
   *
   * MELDET IMMER ERFOLG, auch wenn es die Adresse nicht gibt. Eine ehrliche
   * Fehlermeldung waere hier ein Auskunftsdienst darueber, wer ein Konto hat.
   */
  async function requestPasswordReset(email) {
    email = (email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { ok: false, error: 'Bitte gültige E-Mail eingeben.' };
    }
    try {
      await (await sb()).auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/passwort-neu.html'
      });
      return { ok: true };
    } catch (e) {
      console.error('[LPR] requestPasswordReset:', e);
      return { ok: false, error: 'Netzwerkfehler. Bitte erneut versuchen.' };
    }
  }

  /**
   * Neues Passwort setzen. Laeuft nur, wenn der Link aus der Mail eine gueltige
   * Recovery-Sitzung hergestellt hat — sonst gibt updateUser einen Fehler.
   */
  async function setNewPassword(password) {
    if (!password || password.length < 8) {
      return { ok: false, error: 'Passwort muss mindestens 8 Zeichen lang sein.' };
    }
    try {
      const { error } = await (await sb()).auth.updateUser({ password });
      if (error) {
        return { ok: false, error: 'Der Link ist abgelaufen oder wurde schon benutzt. Bitte fordern Sie einen neuen an.' };
      }
      return { ok: true };
    } catch (e) {
      console.error('[LPR] setNewPassword:', e);
      return { ok: false, error: 'Netzwerkfehler. Bitte erneut versuchen.' };
    }
  }

  async function loginWithPassword({ email, password }) {
    email = (email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'Bitte gültige E-Mail eingeben.' };

    try {
      const { data: authData, error: authError } = await (await sb()).auth.signInWithPassword({ email, password });
      if (authError) {
        if (authError.message && authError.message.toLowerCase().includes('email not confirmed')) {
          return { ok: false, error: 'Bitte bestätigen Sie zuerst Ihre E-Mail-Adresse über den Link, den wir Ihnen geschickt haben.' };
        }
        return { ok: false, error: 'E-Mail oder Passwort falsch.' };
      }

      const { data: profile, error: profileError } = await (await sb())
        .from('profiles')
        .select('id, email, full_name, role, status, personalnummer, vereinsnummer')
        .eq('id', authData.user.id)
        .single();

      if (profileError || !profile) {
        await (await sb()).auth.signOut();
        return { ok: false, error: 'Profil konnte nicht geladen werden. Bitte wenden Sie sich an vorstand@lebenpflegenreisen.de.' };
      }

      if (profile.role !== 'board') {
        if (profile.status === 'pending') {
          await (await sb()).auth.signOut();
          return { ok: false, error: 'Ihr Konto wurde noch nicht vom Vorstand freigeschaltet. Die Freischaltung erfolgt in der Regel innerhalb von 1–2 Werktagen.' };
        }
        if (profile.status === 'rejected') {
          // Kliniken dürfen mit rejected-Status einloggen, damit sie ihre
          // Daten korrigieren und erneut zur Prüfung einreichen können.
          // (kliniken.html zeigt einen Reject-Banner + "Daten anpassen"-Knopf.)
          // Ehrenamtliche bleiben geblockt — für sie gibt es keinen Resubmit-Pfad.
          // profile.role kommt aus der DB als englisch ('clinic'), nicht aus dem
          // Frontend-Mapping ('klinik').
          if (profile.role !== 'clinic') {
            await (await sb()).auth.signOut();
            return { ok: false, error: 'Ihre Registrierung wurde nicht angenommen. Bitte wenden Sie sich an vorstand@lebenpflegenreisen.de.' };
          }
        }
        if (profile.status === 'suspended') {
          await (await sb()).auth.signOut();
          return { ok: false, error: 'Ihr Konto ist derzeit deaktiviert. Bitte wenden Sie sich an vorstand@lebenpflegenreisen.de.' };
        }
      }

      const session = setSession(profile, authData.session);
      return { ok: true, user: { email: profile.email, name: profile.full_name, role: ROLE_BE_TO_FE[profile.role] }, session };
    } catch(e) {
      console.error('[LPR] login failed:', e);
      return { ok: false, error: 'Netzwerkfehler. Bitte erneut versuchen.' };
    }
  }

  function requireRole(role, redirectTo) {
    const s = getSession();
    if (!s || s.role !== role) {
      if (redirectTo) window.location.href = redirectTo;
      return false;
    }
    return true;
  }

  async function listUsersByStatus(status) {
    try {
      let query = (await sb())
        .from('profiles')
        .select('id, email, full_name, role, status, personalnummer, vereinsnummer, phone, created_at, approved_at, approved_by, rejected_at, rejected_reason')
        .order('created_at', { ascending: true });
      if (status) query = query.eq('status', status);
      const { data, error } = await query;
      if (error) { console.error('[LPR] listUsersByStatus:', error); return []; }
      return (data || []).map(p => ({
        email: p.email, name: p.full_name, role: ROLE_BE_TO_FE[p.role] || p.role,
        status: p.status, personalnummer: p.personalnummer, vereinsnummer: p.vereinsnummer, phone: p.phone,
        registeredAt: p.created_at, approvedAt: p.approved_at, approvedBy: p.approved_by,
        rejectedAt: p.rejected_at, rejectedReason: p.rejected_reason, _id: p.id
      }));
    } catch(e) { console.error('[LPR] listUsersByStatus failed:', e); return []; }
  }

  async function approveUser(email) {
    email = (email || '').trim().toLowerCase();
    try {
      const { data: target, error: findErr } = await (await sb())
        .from('profiles').select('id, status').eq('email', email).single();
      if (findErr || !target) return { ok: false, error: 'Benutzer nicht gefunden.' };
      if (target.status === 'approved') return { ok: false, error: 'Benutzer ist bereits freigeschaltet.' };
      const session = getSession();
      const approvedBy = session ? session.id : null;
      const { data, error } = await (await sb())
        .from('profiles')
        .update({ status: 'approved', approved_by: approvedBy, rejected_reason: null, rejected_at: null })
        .eq('id', target.id)
        .select('id, email, full_name, role, status, personalnummer')
        .single();
      if (error) return { ok: false, error: error.message };
      return { ok: true, user: { email: data.email, name: data.full_name, role: ROLE_BE_TO_FE[data.role], status: data.status, personalnummer: data.personalnummer } };
    } catch(e) { console.error('[LPR] approveUser:', e); return { ok: false, error: 'Netzwerkfehler.' }; }
  }

  async function rejectUser(email, reason) {
    email = (email || '').trim().toLowerCase();
    try {
      const { data: target, error: findErr } = await (await sb())
        .from('profiles').select('id').eq('email', email).single();
      if (findErr || !target) return { ok: false, error: 'Benutzer nicht gefunden.' };
      const { data, error } = await (await sb())
        .from('profiles')
        .update({ status: 'rejected', rejected_reason: reason || null, rejected_at: new Date().toISOString() })
        .eq('id', target.id)
        .select('id, email, full_name, status, rejected_reason')
        .single();
      if (error) return { ok: false, error: error.message };
      return { ok: true, user: { email: data.email, name: data.full_name, status: data.status, rejectedReason: data.rejected_reason } };
    } catch(e) { console.error('[LPR] rejectUser:', e); return { ok: false, error: 'Netzwerkfehler.' }; }
  }

  /**
   * Wartende oder abgelehnte Registrierung endgueltig loeschen.
   *
   * Laeuft ueber die RPC registrierung_loeschen, weil an einer Registrierung
   * ein Konto in auth.users haengt: Wuerde nur die profiles-Zeile verschwinden,
   * bliebe das Konto zurueck und die Person liefe beim Anmelden in "Profil
   * konnte nicht geladen werden". An auth.users kommt der Browser mit dem
   * oeffentlichen Schluessel ohnehin nicht heran.
   *
   * Die Grenze auf pending/rejected sitzt in der Datenbank, nicht hier — eine
   * Pruefung im Browser waere eine Bitte, keine Regel.
   */
  async function deleteRegistration(email) {
    email = (email || '').trim().toLowerCase();
    if (!email) return { ok: false, error: 'Keine Adresse angegeben.' };
    try {
      const { data, error } = await (await sb())
        .rpc('registrierung_loeschen', { p_email: email });
      if (error) return { ok: false, error: error.message };
      return { ok: true, name: data && data.name, status: data && data.status };
    } catch(e) {
      console.error('[LPR] deleteRegistration:', e);
      return { ok: false, error: 'Netzwerkfehler.' };
    }
  }

  // ── Kunden (Vorstand) ─────────────────────────────────────────────────────

  /** Alle Kunden, aktive zuerst, dann alphabetisch. */
  async function listKunden(nurAktive) {
    try {
      let q = (await sb())
        .from('kunden')
        .select('id, name, strasse, plz, ort, bezirk, telefon, email, hinweise, aktiv')
        .order('aktiv', { ascending: false })
        .order('name');
      if (nurAktive) q = q.eq('aktiv', true);
      const { data, error } = await q;
      if (error) return { ok: false, error: error.message, kunden: [] };
      return { ok: true, kunden: data || [] };
    } catch(e) {
      console.error('[LPR] listKunden:', e);
      return { ok: false, error: 'Netzwerkfehler.', kunden: [] };
    }
  }

  /**
   * Anlegen oder aendern. Ohne id wird angelegt, mit id geaendert.
   * Der Bezirk ist Pflicht — er ist die einzige Ortsangabe, die vor der
   * Zuteilung sichtbar wird.
   */
  async function saveKunde(k) {
    // Die Meldung nennt das Feld so, wie es im Formular beschriftet ist — nicht
    // den Spaltennamen. "Bitte bezirk ausfuellen." liest sich wie ein Fehler
    // der Software, nicht wie eine Bitte an den Menschen davor.
    const pflicht = [
      ['name',    'den Namen'],
      ['strasse', 'die Straße'],
      ['plz',     'die Postleitzahl'],
      ['bezirk',  'den Bezirk']
    ];
    for (const [feld, beschriftung] of pflicht) {
      if (!k || !String(k[feld] || '').trim()) {
        return { ok: false, error: 'Bitte ' + beschriftung + ' ausfüllen.' };
      }
    }
    if (!/^[0-9]{5}$/.test(String(k.plz).trim())) {
      return { ok: false, error: 'Die Postleitzahl braucht fünf Ziffern.' };
    }
    const satz = {
      name:     String(k.name).trim(),
      strasse:  String(k.strasse).trim(),
      plz:      String(k.plz).trim(),
      ort:      String(k.ort || 'Berlin').trim(),
      bezirk:   String(k.bezirk).trim(),
      telefon:  String(k.telefon || '').trim() || null,
      email:    String(k.email || '').trim() || null,
      hinweise: String(k.hinweise || '').trim() || null
    };
    try {
      const client = await sb();
      const { data, error } = k.id
        ? await client.from('kunden').update(satz).eq('id', k.id).select('id').single()
        : await client.from('kunden').insert(satz).select('id').single();
      if (error) return { ok: false, error: error.message };
      return { ok: true, id: data.id };
    } catch(e) {
      console.error('[LPR] saveKunde:', e);
      return { ok: false, error: 'Netzwerkfehler.' };
    }
  }

  /** Kunden stilllegen statt loeschen — an ihm haengen Termine. */
  async function setKundeAktiv(id, aktiv) {
    try {
      const { error } = await (await sb())
        .from('kunden').update({ aktiv: !!aktiv }).eq('id', id);
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    } catch(e) {
      console.error('[LPR] setKundeAktiv:', e);
      return { ok: false, error: 'Netzwerkfehler.' };
    }
  }

  // ── Termine ───────────────────────────────────────────────────────────────

  /**
   * Termin beim Kunden anlegen und direkt zuteilen.
   *
   * Der Bezirk wird vom Kunden auf die Buchung kopiert: Eine Terminliste soll
   * ohne Leserecht auf kunden auskommen.
   */
  async function createTermin({ kunde_id, volunteer_id, datum, beginn, stunden }) {
    if (!kunde_id || !volunteer_id || !datum || !beginn) {
      return { ok: false, error: 'Kunde, Person, Datum und Uhrzeit sind Pflicht.' };
    }
    const dauer = Number(stunden);
    if (!(dauer > 0) || dauer > 12) {
      return { ok: false, error: 'Die Dauer muss zwischen 0 und 12 Stunden liegen.' };
    }
    try {
      const client = await sb();
      const { data: kunde, error: kErr } = await client
        .from('kunden').select('bezirk, aktiv').eq('id', kunde_id).single();
      if (kErr || !kunde) return { ok: false, error: 'Kunde nicht gefunden.' };
      if (!kunde.aktiv)   return { ok: false, error: 'Dieser Kunde ist stillgelegt.' };

      const { data, error } = await client.from('bookings').insert({
        kunde_id:     kunde_id,
        volunteer_id: volunteer_id,
        date:         datum,
        shift:        'termin',
        beginn_zeit:  beginn,
        hours:          dauer,
        stunden_geplant: dauer,
        bezirk:         kunde.bezirk,
        status:         'planned'
      }).select('id').single();
      if (error) return { ok: false, error: error.message };
      return { ok: true, id: data.id };
    } catch(e) {
      console.error('[LPR] createTermin:', e);
      return { ok: false, error: 'Netzwerkfehler.' };
    }
  }

  /**
   * Termine fuer die Vorstandsansicht — wahlweise zu einem Kunden.
   *
   * Der Vorstand konnte Termine anlegen und danach nirgends sehen: Sie tauchten
   * nur in der Liste der zugeteilten Person auf. Wer etwas anlegt, muss
   * nachsehen koennen, ob es richtig angelegt ist.
   *
   * Die Namen der zugeteilten Personen kommen ueber eine zweite Abfrage statt
   * ueber einen Join: Der Fremdschluesselname muesste sonst geraten werden, und
   * ein falsch geratener Join laesst die ganze Liste scheitern statt nur die
   * Namen fehlen.
   */
  async function listTermine(kundeId) {
    try {
      const client = await sb();
      let q = client
        .from('bookings')
        .select('id, kunde_id, volunteer_id, date, beginn_zeit, hours, stunden_geplant, status')
        .eq('shift', 'termin')
        .order('date', { ascending: false })
        .order('beginn_zeit', { ascending: false });
      if (kundeId) q = q.eq('kunde_id', kundeId);

      const { data, error } = await q;
      if (error) return { ok: false, error: error.message, termine: [] };
      const termine = data || [];
      if (!termine.length) return { ok: true, termine: [] };

      const ids = [...new Set(termine.map(t => t.volunteer_id).filter(Boolean))];
      const namen = {};
      if (ids.length) {
        const { data: p } = await client
          .from('profiles').select('id, full_name').in('id', ids);
        (p || []).forEach(x => { namen[x.id] = x.full_name; });
      }
      termine.forEach(t => { t.person = namen[t.volunteer_id] || '(unbekannt)'; });
      return { ok: true, termine };
    } catch(e) {
      console.error('[LPR] listTermine:', e);
      return { ok: false, error: 'Netzwerkfehler.', termine: [] };
    }
  }

  /**
   * Termin absagen. Kein Loeschen: Eine abgesagte Zuteilung ist eine
   * Information — die Person hat den Abend womoeglich schon freigehalten.
   */
  async function cancelTermin(bookingId) {
    try {
      const { error } = await (await sb())
        .from('bookings').update({ status: 'cancelled' }).eq('id', bookingId);
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    } catch(e) {
      console.error('[LPR] cancelTermin:', e);
      return { ok: false, error: 'Netzwerkfehler.' };
    }
  }

  /**
   * Abschluss durch die Mitwirkende. Niemand unterschreibt — in einer
   * Privatwohnung gibt es keine Station, die gegenzeichnet.
   *
   * LAEUFT UEBER EINE FUNKTION, NICHT UEBER EIN UPDATE. Die Policy
   * bookings_update_own_volunteer erlaubt als Zielstatus nur 'planned' und
   * 'cancelled' — ein direktes update auf 'confirmed' prallt ab. Das ist
   * Absicht: Eine Sitzwache soll ihren Dienst nicht selbst abschliessen
   * koennen, dort ist die Unterschrift der Station der Nachweis. Die Policy
   * dafuer aufzuweiten haette genau diesen Schutz ausgehebelt. Die Funktion
   * termin_abschliessen gilt deshalb nur fuer shift = 'termin' und prueft die
   * Eigentuemerschaft dort, wo sie sich nicht umgehen laesst.
   *
   * Geaendert wird nur `hours` (die geleistete Dauer). `stunden_geplant` bleibt
   * unangetastet — sonst waere spaeter nicht mehr erkennbar, was vereinbart und
   * was geworden ist. Etappe 2 braucht beides.
   */
  async function finishTermin(bookingId, tatsaechlicheStunden) {
    const s = getSession();
    if (!s) return { ok: false, error: 'Nicht eingeloggt.' };
    const stunden = Number(tatsaechlicheStunden);
    try {
      const { data, error } = await (await sb()).rpc('termin_abschliessen', {
        p_booking: bookingId,
        p_stunden: (stunden > 0 && stunden <= 12) ? stunden : null
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true, geplant: data && data.geplant };
    } catch(e) {
      console.error('[LPR] finishTermin:', e);
      return { ok: false, error: 'Netzwerkfehler.' };
    }
  }

  async function getMyCompliance() {
    const s = getSession();
    if (!s) return { ok: false, error: 'Nicht eingeloggt.', records: [] };
    try {
      const { data, error } = await (await sb())
        .from('compliance_records')
        .select('id, document_type, status, submitted_at, approved_at, valid_until, filename_reference')
        .eq('user_id', s.id);
      if (error) return { ok: false, error: error.message, records: [] };
      return { ok: true, records: data || [] };
    } catch(e) { console.error('[LPR] getMyCompliance:', e); return { ok: false, error: 'Netzwerkfehler.', records: [] }; }
  }

  async function getComplianceForUser(userId) {
    try {
      const { data, error } = await (await sb())
        .from('compliance_records')
        .select('id, document_type, status, submitted_at, approved_at, approved_by, valid_until, filename_reference')
        .eq('user_id', userId);
      if (error) return { ok: false, error: error.message, records: [] };
      return { ok: true, records: data || [] };
    } catch(e) { console.error('[LPR] getComplianceForUser:', e); return { ok: false, error: 'Netzwerkfehler.', records: [] }; }
  }

  async function setComplianceStatus(recordId, updates) {
    try {
      const session = getSession();
      const patch = {};
      if (updates.status) patch.status = updates.status;
      if (updates.valid_until !== undefined) patch.valid_until = updates.valid_until;
      if (updates.filename_reference !== undefined) patch.filename_reference = updates.filename_reference;
      if (updates.status === 'submitted' && !patch.submitted_at) patch.submitted_at = new Date().toISOString();
      if (updates.status === 'approved') {
        patch.approved_at = new Date().toISOString();
        patch.approved_by = session ? session.id : null;
      }
      const { data, error } = await (await sb())
        .from('compliance_records').update(patch).eq('id', recordId).select().single();
      if (error) return { ok: false, error: error.message };
      return { ok: true, record: data };
    } catch(e) { console.error('[LPR] setComplianceStatus:', e); return { ok: false, error: 'Netzwerkfehler.' }; }
  }

  async function isComplianceComplete(userId) {
    const id = userId || (getSession() && getSession().id);
    if (!id) return { ok: false, complete: false, missing: [] };
    const REQUIRED = ['fuehrungszeugnis','ifsg43','erste_hilfe','dsgvo','schweigepflicht'];
    try {
      const { data, error } = await (await sb())
        .from('compliance_records').select('document_type, status, valid_until').eq('user_id', id);
      if (error) return { ok: false, complete: false, missing: [] };
      const approved = new Set((data || []).filter(r => r.status === 'approved' && (!r.valid_until || new Date(r.valid_until).setHours(0,0,0,0) >= new Date().setHours(0,0,0,0))).map(r => r.document_type));
      const missing = REQUIRED.filter(t => !approved.has(t));
      return { ok: true, complete: missing.length === 0, missing };
    } catch(e) { return { ok: false, complete: false, missing: [] }; }
  }

  function setTextSize(size) {
    document.body.classList.remove('text-l', 'text-xl');
    if (size) document.body.classList.add('text-' + size);
    document.querySelectorAll('.a11y-btn[data-size]').forEach(b => {
      b.setAttribute('aria-pressed', b.dataset.size === size ? 'true' : 'false');
    });
    try { localStorage.setItem(KEYS.textSize, size); } catch(e) {}
  }
  function toggleContrast() {
    const on = document.body.classList.toggle('contrast');
    const btn = document.getElementById('btn-contrast');
    if (btn) btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    try { localStorage.setItem(KEYS.contrast, on ? '1' : '0'); } catch(e) {}
  }
  const _lsOrig = new WeakMap();
  function toggleLS(force) {
    const shouldOn = force !== undefined ? force : !document.body.classList.contains('ls');
    document.body.classList.toggle('ls', shouldOn);
    const btn = document.getElementById('btn-ls');
    if (btn) btn.setAttribute('aria-pressed', shouldOn ? 'true' : 'false');
    document.querySelectorAll('[data-ls]').forEach(el => {
      if (shouldOn) {
        if (!_lsOrig.has(el)) _lsOrig.set(el, el.innerHTML);
        el.innerHTML = el.getAttribute('data-ls');
      } else {
        if (_lsOrig.has(el)) el.innerHTML = _lsOrig.get(el);
      }
    });
    try { localStorage.setItem(KEYS.ls, shouldOn ? '1' : '0'); } catch(e) {}
  }
  function applyA11ySettings() {
    try {
      const size = localStorage.getItem(KEYS.textSize);
      if (size) setTextSize(size);
      if (localStorage.getItem(KEYS.contrast) === '1') {
        document.body.classList.add('contrast');
        const btn = document.getElementById('btn-contrast');
        if (btn) btn.setAttribute('aria-pressed', 'true');
      }
      if (localStorage.getItem(KEYS.ls) === '1') setTimeout(() => toggleLS(true), 50);
    } catch(e) {}
  }

  let toastTimer;
  function showToast(msg, type = 'ok') {
    let t = document.getElementById('lpr-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'lpr-toast';
      t.setAttribute('role', 'status');
      t.setAttribute('aria-live', 'polite');
      t.style.cssText = `position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(80px);background:#1E3127;color:#fff;padding:14px 22px;border-radius:8px;box-shadow:0 6px 24px rgba(0,0,0,.2);font-weight:600;font-size:14px;opacity:0;transition:all .25s;z-index:10000;max-width:calc(100vw - 32px);font-family:'Instrument Sans',sans-serif;`;
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.background = (type === 'warn') ? '#C85B30' : '#1E3127';
    t.style.opacity = '1';
    t.style.transform = 'translateX(-50%) translateY(0)';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      t.style.opacity = '0';
      t.style.transform = 'translateX(-50%) translateY(80px)';
    }, 4500);
  }

  function roleTarget(role) {
    if (role === 'klinik') return 'kliniken.html';
    if (role === 'admin')  return 'admin-mitwirkende.html';
    return 'mein-bereich.html';
  }

  // ───────────────────────────────────────────────────────
  // Block C — APIs für Reisen, Verfügbarkeit, Buchungen, Abrechnung
  // ───────────────────────────────────────────────────────

  // --- Tarife ---
  let _ratesCache = null;
  async function getRates(force) {
    if (_ratesCache && !force) return _ratesCache;
    try {
      const { data, error } = await (await sb())
        .from('compensation_rates')
        .select('rate_key, amount, unit, description, effective_from')
        .order('effective_from', { ascending: false });
      if (error || !data) return {};
      // Letzte (aktuelle) Rate pro Key behalten
      const latest = {};
      for (const r of data) {
        if (!latest[r.rate_key]) latest[r.rate_key] = r;
      }
      _ratesCache = latest;
      return latest;
    } catch(e) { console.error('[LPR] getRates:', e); return {}; }
  }
  async function getRate(key) {
    const all = await getRates();
    return all[key] || null;
  }

  // ── Reise-Besetzung: Tages- und Halbtagsregel ──
  // Ein Reisetag gilt erst als besetzt, wenn Vormittag UND Nachmittag von einer
  // bestaetigten Anmeldung abgedeckt sind. Die Regel stand frueher nur in
  // admin-reisen.html; seit der Jahreskalender dieselbe Zahl anzeigt, lebt sie
  // hier, damit beide Seiten nicht auseinanderlaufen koennen.
  // Alles hier sind reine Funktionen: kein Netzzugriff, kein Zustand.

  // Alle Tage einer Reise als 'YYYY-MM-DD'. Unplausible Zeitraeume (Ende vor
  // Start) liefern den Starttag, damit die Oberflaeche nicht leer bleibt.
  function enumTripDays(start, end) {
    if (!start) return [];
    const out = [];
    const sd = new Date(start + 'T00:00:00Z');
    const ed = new Date((end || start) + 'T00:00:00Z');
    if (isNaN(sd) || isNaN(ed) || ed < sd) return [start];
    for (let d = new Date(sd); d <= ed; d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0,10));
    return out;
  }

  // '2026-08-15' -> 'Sa 15.08.'
  function formatTripDay(iso) {
    const d = new Date(iso + 'T00:00:00Z');
    const wd = ['So','Mo','Di','Mi','Do','Fr','Sa'][d.getUTCDay()];
    return wd + ' ' + String(d.getUTCDate()).padStart(2,'0') + '.' + String(d.getUTCMonth()+1).padStart(2,'0') + '.';
  }

  // Ohne eigene Tageseintraege gilt eine Anmeldung fuer die ganze Reise.
  function signupEffectiveDays(s, allDays) {
    return (s.days && s.days.length) ? s.days : allDays;
  }

  // Tageshaelfte einer Anmeldung: 'full' | 'am' (Vormittag) | 'pm' (Nachmittag).
  function signupEffectiveHalf(s, day) {
    return (s.dayHalves && s.dayHalves[day]) || 'full';
  }

  function signupCoversHalf(s, day, half) {
    const h = signupEffectiveHalf(s, day);
    return h === 'full' || h === half;
  }

  // Offene Haelften eines Tages, z. B. ['pm'] oder ['am','pm'].
  function tripDayGaps(signups, trip, day) {
    const allDays = enumTripDays(trip.start_date, trip.end_date);
    const onDay = s => signupEffectiveDays(s, allDays).indexOf(day) !== -1;
    const conf = (signups || []).filter(s => s.status === 'confirmed' && onDay(s));
    return ['am', 'pm'].filter(h => !conf.some(s => signupCoversHalf(s, day, h)));
  }

  // { total, uncovered } ueber die ganze Reise.
  function tripCoverage(signups, trip) {
    const allDays = enumTripDays(trip.start_date, trip.end_date);
    let uncovered = 0;
    allDays.forEach(day => { if (tripDayGaps(signups, trip, day).length) uncovered++; });
    return { total: allDays.length, uncovered: uncovered };
  }

  // --- Reisen (trips) ---

  /**
   * Vorstand: Listet ALLE Reisen, unabhängig vom Status (auch 'draft').
   */
  async function listAllTripsAdmin() {
    try {
      const { data, error } = await (await sb())
        .from('trips')
        .select('id, title, location, start_date, end_date, partner, description, max_spots, status, rate_override_per_day, created_at, anreise_vergleich_cents, anreise_vergleich_notiz')
        .order('start_date', { ascending: false });
      if (error) return { ok: false, error: error.message, trips: [] };
      return { ok: true, trips: data || [] };
    } catch(e) { console.error('[LPR] listAllTripsAdmin:', e); return { ok: false, error: 'Netzwerkfehler.', trips: [] }; }
  }
  
  async function createTrip(payload) {
    const s = getSession();
    if (!s) return { ok: false, error: 'Nicht eingeloggt.' };
    if (!payload || typeof payload !== 'object') return { ok: false, error: 'Keine Daten übergeben.' };
    const title = (payload.title || '').trim();
    const location = (payload.location || '').trim();
    const start_date = payload.start_date;
    const end_date = payload.end_date;
    const max_spots = parseInt(payload.max_spots, 10);
    if (!title) return { ok: false, error: 'Titel fehlt.' };
    if (!location) return { ok: false, error: 'Ort fehlt.' };
    if (!start_date || !/^\d{4}-\d{2}-\d{2}$/.test(start_date)) return { ok: false, error: 'Startdatum ungültig.' };
    if (!end_date || !/^\d{4}-\d{2}-\d{2}$/.test(end_date)) return { ok: false, error: 'Enddatum ungültig.' };
    if (end_date < start_date) return { ok: false, error: 'Enddatum darf nicht vor Startdatum liegen.' };
    if (!Number.isFinite(max_spots) || max_spots < 1) return { ok: false, error: 'Anzahl Begleiter:innen muss mindestens 1 sein.' };
    const vergleichspreis = parseVergleichspreisCents(payload.anreise_vergleich_eur);
    if (!vergleichspreis.ok) return { ok: false, error: vergleichspreis.error };
    const insertData = {
      title, location, start_date, end_date, max_spots,
      status: payload.status || 'open',
      partner: (payload.partner || '').trim() || null,
      description: (payload.description || '').trim() || null,
      description_ls: (payload.description_ls || '').trim() || null,
      rate_override_per_day: payload.rate_override_per_day != null && payload.rate_override_per_day !== '' ? Number(payload.rate_override_per_day) : null,
      anreise_vergleich_cents: vergleichspreis.cents,
      anreise_vergleich_notiz: (payload.anreise_vergleich_notiz || '').trim() || null,
      created_by: s.id
    };
    try {
      const { data, error } = await (await sb()).from('trips').insert(insertData).select().single();
      if (error) return { ok: false, error: 'Anlegen fehlgeschlagen: ' + error.message };
      return { ok: true, trip: data };
    } catch(e) { console.error('[LPR] createTrip:', e); return { ok: false, error: 'Netzwerkfehler beim Anlegen.' }; }
  }
  
  async function updateTrip(tripId, patch) {
    if (!tripId) return { ok: false, error: 'tripId fehlt.' };
    if (!patch || typeof patch !== 'object') return { ok: false, error: 'Kein Patch übergeben.' };
    const allowedKeys = ['title','location','start_date','end_date','partner','description','description_ls','max_spots','status','rate_override_per_day','anreise_vergleich_eur','anreise_vergleich_notiz'];
    const filtered = {};
    for (const k of allowedKeys) { if (k in patch) filtered[k] = patch[k]; }
    if (Object.keys(filtered).length === 0) return { ok: false, error: 'Nichts zu aktualisieren.' };
    if ('max_spots' in filtered) {
      const n = parseInt(filtered.max_spots, 10);
      if (!Number.isFinite(n) || n < 1) return { ok: false, error: 'max_spots ungültig.' };
      filtered.max_spots = n;
    }
    if ('start_date' in filtered && filtered.start_date && !/^\d{4}-\d{2}-\d{2}$/.test(filtered.start_date)) return { ok: false, error: 'start_date ungültig.' };
    if ('end_date' in filtered && filtered.end_date && !/^\d{4}-\d{2}-\d{2}$/.test(filtered.end_date)) return { ok: false, error: 'end_date ungültig.' };
    if ('status' in filtered && !['draft','open','closed','completed','cancelled'].includes(filtered.status)) return { ok: false, error: 'status ungültig.' };
    
    // Normalisiere optionale Strings/Numbers: leere Strings -> null
    for (const k of ['partner','description','description_ls','anreise_vergleich_notiz']) {
      if (k in filtered) {
        const v = (filtered[k] || '').trim();
        filtered[k] = v || null;
      }
    }
    if ('rate_override_per_day' in filtered) {
      const v = filtered.rate_override_per_day;
      if (v === '' || v == null) {
        filtered.rate_override_per_day = null;
      } else {
        const n = Number(v);
        if (!Number.isFinite(n) || n < 0) return { ok: false, error: 'rate_override_per_day ungueltig.' };
        filtered.rate_override_per_day = n;
      }
    }
    // anreise_vergleich_eur ist kein DB-Feld, sondern die rohe Formular-Eingabe
    // in Euro; parseVergleichspreisCents() ist die EINE Stelle, die daraus Cent
    // fuer die Spalte anreise_vergleich_cents macht (siehe dort: leer -> null,
    // nicht 0).
    if ('anreise_vergleich_eur' in filtered) {
      const vergleichspreis = parseVergleichspreisCents(filtered.anreise_vergleich_eur);
      if (!vergleichspreis.ok) return { ok: false, error: vergleichspreis.error };
      delete filtered.anreise_vergleich_eur;
      filtered.anreise_vergleich_cents = vergleichspreis.cents;
    }
    try {
      const { data, error } = await (await sb()).from('trips').update(filtered).eq('id', tripId).select().single();
      if (error) return { ok: false, error: 'Aktualisieren fehlgeschlagen: ' + error.message };
      return { ok: true, trip: data };
    } catch(e) { console.error('[LPR] updateTrip:', e); return { ok: false, error: 'Netzwerkfehler beim Aktualisieren.' }; }
  }
  
  async function deleteTrip(tripId) {
    if (!tripId) return { ok: false, error: 'tripId fehlt.' };
    try {
      const sRes = await getTripSignups(tripId);
      const active = (sRes.signups || []).filter(x => x.status !== 'cancelled');
      if (active.length > 0) {
        return { ok: false, error: `Reise hat ${active.length} aktive Anmeldung(en). Bitte stattdessen den Status auf "Abgesagt" setzen.` };
      }
      const { error } = await (await sb()).from('trips').delete().eq('id', tripId);
      if (error) return { ok: false, error: 'Löschen fehlgeschlagen: ' + error.message };
      return { ok: true };
    } catch(e) { console.error('[LPR] deleteTrip:', e); return { ok: false, error: 'Netzwerkfehler beim Löschen.' }; }
  }
  
  async function listTrips(filter) {
    try {
      let q = (await sb())
        .from('trips')
        .select('id, title, location, start_date, end_date, partner, description, description_ls, max_spots, status, rate_override_per_day')
        .order('start_date', { ascending: true });
      if (filter && filter.status) q = q.eq('status', filter.status);
      else q = q.in('status', ['open','closed','completed']);
      const { data, error } = await q;
      if (error) return { ok: false, error: error.message, trips: [] };
      return { ok: true, trips: data || [] };
    } catch(e) { console.error('[LPR] listTrips:', e); return { ok: false, error: 'Netzwerkfehler.', trips: [] }; }
  }
  async function getTrip(tripId) {
    try {
      const { data, error } = await (await sb())
        .from('trips')
        .select('id, title, location, start_date, end_date, partner, description, description_ls, max_spots, status, rate_override_per_day')
        .eq('id', tripId)
        .single();
      if (error) return { ok: false, error: error.message, trip: null };
      return { ok: true, trip: data };
    } catch(e) { console.error('[LPR] getTrip:', e); return { ok: false, error: 'Netzwerkfehler.', trip: null }; }
  }
  async function getTripSignups(tripId) {
    try {
      const { data, error } = await (await sb())
        .from('trip_signups')
        .select('id, user_id, position, status, signed_at, note')
        .eq('trip_id', tripId)
        .order('position', { ascending: true });
      if (error) return { ok: false, error: error.message, signups: [] };
      return { ok: true, signups: data || [] };
    } catch(e) { console.error('[LPR] getTripSignups:', e); return { ok: false, error: 'Netzwerkfehler.', signups: [] }; }
  }
  // Vorstand: alle Reise-Anmeldungen inkl. Namen (fuer admin-reisen.html)
  async function getAllTripSignupsAdmin() {
    const s = getSession();
    if (!s || (s.role !== 'admin' && s.role !== 'board')) {
      return { ok: false, error: 'Nur fuer den Vorstand.', signups: [] };
    }
    try {
      const client = await sb();
      const { data: signups, error: e1 } = await client
        .from('trip_signups')
        .select('id, trip_id, user_id, position, status, signed_at, note')
        .order('trip_id', { ascending: true })
        .order('position', { ascending: true });
      if (e1) return { ok: false, error: e1.message, signups: [] };
      const rows = signups || [];
      const ids = [...new Set(rows.map(r => r.user_id).filter(Boolean))];
      const nameById = {};
      if (ids.length) {
        const { data: profs, error: e2 } = await client
          .from('profiles')
          .select('id, full_name, email, vereinsnummer')
          .in('id', ids);
        if (e2) return { ok: false, error: e2.message, signups: [] };
        (profs || []).forEach(p => { nameById[p.id] = p; });
      }
      // Tage je Anmeldung laden (Teil-Reisen) inkl. Tageshälfte
      const daysBySignup = {};
      const halvesBySignup = {};
      const signupIds = rows.map(r => r.id);
      if (signupIds.length) {
        const { data: dayRows, error: e3 } = await selectDayRows(
          cols => client
            .from('trip_signup_days')
            .select(cols)
            .in('signup_id', signupIds)
            .order('day', { ascending: true }),
          'signup_id, day, half', 'signup_id, day');
        if (!e3) {
          (dayRows || []).forEach(d => {
            (daysBySignup[d.signup_id] = daysBySignup[d.signup_id] || []).push(d.day);
            (halvesBySignup[d.signup_id] = halvesBySignup[d.signup_id] || {})[d.day] = d.half || 'full';
          });
        } else {
          console.warn('[LPR] getAllTripSignupsAdmin days:', e3.message);
        }
      }
      const enriched = rows.map(r => {
        const p = nameById[r.user_id] || {};
        return Object.assign({}, r, {
          full_name: p.full_name || null,
          email: p.email || null,
          vereinsnummer: p.vereinsnummer || null,
          days: daysBySignup[r.id] || [],
          dayHalves: halvesBySignup[r.id] || {}
        });
      });
      return { ok: true, signups: enriched };
    } catch(e) {
      console.error('[LPR] getAllTripSignupsAdmin:', e);
      return { ok: false, error: 'Netzwerkfehler.', signups: [] };
    }
  }
  /**
   * Vorstand: Pauschalen-Übersicht (Übungsleiterpauschale § 3 Nr. 26 EStG)
   * je Mitglied für ein Kalenderjahr. Nutzt die SECURITY-DEFINER-RPC
   * admin_pauschale_overview in Supabase (RLS auf claims erlaubt sonst nur
   * eigene Zeilen). Liefert je user_id:
   *  - claimed  = Summe genehmigt/ausgezahlt (approved, paid)
   *  - pending  = Summe eingereicht (submitted)
   *  - claimed_signup_ids = trip_signup_ids mit bereits vorhandenem Antrag
   */
  async function getPauschaleOverviewAdmin(year) {
    const s = getSession();
    if (!s || (s.role !== 'admin' && s.role !== 'board')) {
      return { ok: false, error: 'Nur fuer den Vorstand.', rows: [] };
    }
    try {
      const client = await sb();
      const { data, error } = await client.rpc('admin_pauschale_overview', { p_year: year });
      if (error) return { ok: false, error: error.message, rows: [] };
      return { ok: true, rows: data || [] };
    } catch(e) {
      console.error('[LPR] getPauschaleOverviewAdmin:', e);
      return { ok: false, error: 'Netzwerkfehler.', rows: [] };
    }
  }
  async function getMySignup(tripId) {
    const s = getSession();
    if (!s) return { ok: false, error: 'Nicht eingeloggt.', signup: null };
    try {
      const { data, error } = await (await sb())
        .from('trip_signups')
        .select('id, position, status, signed_at, note')
        .eq('trip_id', tripId)
        .eq('user_id', s.id)
        .maybeSingle();
      if (error) return { ok: false, error: error.message, signup: null };
      return { ok: true, signup: data };
    } catch(e) { console.error('[LPR] getMySignup:', e); return { ok: false, error: 'Netzwerkfehler.', signup: null }; }
  }
  async function signupForTrip(tripId, note, days) {
    const s = getSession();
    if (!s) return { ok: false, error: 'Nicht eingeloggt.' };
    const cc = await isComplianceComplete(s.id); if (!cc.complete) return { ok: false, error: 'Compliance unvollständig oder abgelaufen. Bitte Vorstand kontaktieren.', missing: cc.missing };
    try {
      // 1. Trip prüfen, max_spots ermitteln
      const tripRes = await getTrip(tripId);
      if (!tripRes.ok || !tripRes.trip) return { ok: false, error: 'Reise nicht gefunden.' };
      if (tripRes.trip.status !== 'open') return { ok: false, error: 'Diese Reise nimmt aktuell keine Anmeldungen entgegen.' };

      // 2. Bestehende signups holen, Position bestimmen
      const sRes = await getTripSignups(tripId);
      const active = (sRes.signups || []).filter(x => x.status !== 'cancelled');
      const nextPos = active.length + 1;
      const status = nextPos <= tripRes.trip.max_spots ? 'confirmed' : 'waitlist';

      // 3. Bestehende Anmeldung? (auch stornierte) -> reaktivieren statt 23505-Fehler
      const existing = await getMySignup(tripId);
      let data, error;
      if (existing.ok && existing.signup) {
        if (existing.signup.status !== 'cancelled') {
          return { ok: false, error: 'Sie sind bereits für diese Reise eingetragen.' };
        }
        const upd = await (await sb())
          .from('trip_signups')
          .update({ status, position: nextPos, note: note || null, cancelled_at: null, cancellation_reason: null })
          .eq('id', existing.signup.id)
          .select()
          .single();
        data = upd.data; error = upd.error;
        if (!error) { await (await sb()).from('trip_signup_days').delete().eq('trip_id', tripId).eq('user_id', s.id); }
      } else {
        const ins = await (await sb())
          .from('trip_signups')
          .insert({ trip_id: tripId, user_id: s.id, position: nextPos, status, note: note || null })
          .select()
          .single();
        data = ins.data; error = ins.error;
      }
      if (error) {
        if (error.code === '23505') return { ok: false, error: 'Sie sind bereits für diese Reise eingetragen.' };
        return { ok: false, error: error.message };
      }
      // 4. Tage anlegen (Teil-Reisen). Keine Auswahl = ganze Reise.
      const allDays = enumerateDays(tripRes.trip.start_date, tripRes.trip.end_date);
      let chosen = normalizeDaySelection(days, allDays);
      if (!chosen.length) chosen = allDays.map(day => ({ day, half: 'full' }));
      let daysError = null;
      if (chosen.length) {
        const dayRows = chosen.map(c => ({ signup_id: data.id, trip_id: tripId, user_id: s.id, day: c.day, half: c.half }));
        const { error: dErr } = await insertDayRows(await sb(), dayRows);
        if (dErr) { console.error('[LPR] signupForTrip days:', dErr); daysError = dErr.message; }
      }
      const chosenDays = chosen.map(c => c.day);
      const chosenHalves = {}; chosen.forEach(c => { chosenHalves[c.day] = c.half; });
      return { ok: true, signup: data, waitlist: status === 'waitlist', days: chosenDays, dayHalves: chosenHalves, daysError };
    } catch(e) { console.error('[LPR] signupForTrip:', e); return { ok: false, error: 'Netzwerkfehler.' }; }
  }
  // ── Tageshälften (Vormittag / Nachmittag) ──
  // trip_signup_days.half: 'full' | 'am' | 'pm'. Eine Tagesauswahl darf als reines
  // Datums-Array (['2026-08-12', …]) oder als [{day, half}, …] übergeben werden;
  // ein reiner String bedeutet immer den ganzen Tag. Die Halbtags-Information ist
  // reine Planung – die Abrechnung (computeCompensation, Reise-Pfad) zählt weiter
  // nur Tage und bleibt davon unberührt.
  const DAY_HALVES = ['full', 'am', 'pm'];
  function normalizeDaySelection(days, allDays) {
    const out = [];
    const seen = {};
    (Array.isArray(days) ? days : []).forEach(entry => {
      const day = (typeof entry === 'string') ? entry : (entry && entry.day);
      if (!day || seen[day]) return;
      if (allDays && allDays.indexOf(day) === -1) return;
      const raw = (typeof entry === 'string') ? 'full' : (entry && entry.half);
      seen[day] = true;
      out.push({ day, half: DAY_HALVES.indexOf(raw) !== -1 ? raw : 'full' });
    });
    out.sort((a, b) => a.day < b.day ? -1 : (a.day > b.day ? 1 : 0));
    return out;
  }
  // Lesen/Schreiben mit Rückfall auf das Schema ohne half-Spalte, falls die
  // Migration noch nicht ausgeführt wurde: dann verhält sich alles wie bisher.
  function isMissingHalfColumn(error) {
    return !!error && /half/i.test(error.message || '');
  }
  async function selectDayRows(build, cols, colsFallback) {
    const res = await build(cols);
    if (isMissingHalfColumn(res.error)) {
      console.warn('[LPR] trip_signup_days.half fehlt – Migration noch nicht ausgeführt?');
      return await build(colsFallback);
    }
    return res;
  }
  async function insertDayRows(client, rows) {
    const res = await client.from('trip_signup_days').insert(rows);
    if (isMissingHalfColumn(res.error)) {
      const plain = rows.map(r => { const c = Object.assign({}, r); delete c.half; return c; });
      return await client.from('trip_signup_days').insert(plain);
    }
    return res;
  }
  // Tage zwischen zwei ISO-Daten (YYYY-MM-DD) inkl. beider Enden
  function enumerateDays(start, end) {
    if (!start) return [];
    const out = [];
    const sd = new Date(start + 'T00:00:00Z');
    const ed = new Date((end || start) + 'T00:00:00Z');
    if (isNaN(sd) || isNaN(ed) || ed < sd) return [start];
    for (let d = new Date(sd); d <= ed; d.setUTCDate(d.getUTCDate() + 1)) {
      out.push(d.toISOString().slice(0, 10));
    }
    return out;
  }
  // Eigene gewählte Tage für eine Reise
  async function getMySignupDays(tripId) {
    const s = getSession();
    if (!s) return { ok: false, error: 'Nicht eingeloggt.', days: [], dayHalves: {} };
    try {
      const client = await sb();
      const { data, error } = await selectDayRows(
        cols => client
          .from('trip_signup_days')
          .select(cols)
          .eq('trip_id', tripId)
          .eq('user_id', s.id)
          .order('day', { ascending: true }),
        'day, half', 'day');
      if (error) return { ok: false, error: error.message, days: [], dayHalves: {} };
      const halves = {};
      (data || []).forEach(r => { halves[r.day] = r.half || 'full'; });
      return { ok: true, days: (data || []).map(r => r.day), dayHalves: halves };
    } catch(e) { console.error('[LPR] getMySignupDays:', e); return { ok: false, error: 'Netzwerkfehler.', days: [], dayHalves: {} }; }
  }
  // Eigene Tage ersetzen (nachträglich anpassen)
  async function setMySignupDays(tripId, days) {
    const s = getSession();
    if (!s) return { ok: false, error: 'Nicht eingeloggt.' };
    try {
      const mine = await getMySignup(tripId);
      if (!mine.ok || !mine.signup) return { ok: false, error: 'Keine Anmeldung für diese Reise gefunden.' };
      const tripRes = await getTrip(tripId);
      if (!tripRes.ok || !tripRes.trip) return { ok: false, error: 'Reise nicht gefunden.' };
      const allDays = enumerateDays(tripRes.trip.start_date, tripRes.trip.end_date);
      const chosen = normalizeDaySelection(days, allDays);
      if (!chosen.length) return { ok: false, error: 'Bitte mindestens einen Tag wählen.' };
      const client = await sb();
      const { error: delErr } = await client.from('trip_signup_days').delete().eq('trip_id', tripId).eq('user_id', s.id);
      if (delErr) return { ok: false, error: delErr.message };
      const rows = chosen.map(c => ({ signup_id: mine.signup.id, trip_id: tripId, user_id: s.id, day: c.day, half: c.half }));
      const { error: insErr } = await insertDayRows(client, rows);
      if (insErr) return { ok: false, error: insErr.message };
      const halves = {}; chosen.forEach(c => { halves[c.day] = c.half; });
      return { ok: true, days: chosen.map(c => c.day), dayHalves: halves };
    } catch(e) { console.error('[LPR] setMySignupDays:', e); return { ok: false, error: 'Netzwerkfehler.' }; }
  }
  // Vorstand: zuteilbare Mitglieder (freigegebene Ehrenamtliche)
  async function listVolunteersAdmin() {
    const s = getSession();
    if (!s || (s.role !== 'admin' && s.role !== 'board')) return { ok: false, error: 'Nur für den Vorstand.', members: [] };
    try {
      const { data, error } = await (await sb())
        .from('profiles')
        .select('id, full_name, vereinsnummer, email, role, status')
        .eq('role', 'volunteer')
        .eq('status', 'approved')
        .order('full_name', { ascending: true });
      if (error) return { ok: false, error: error.message, members: [] };
      return { ok: true, members: data || [] };
    } catch(e) { console.error('[LPR] listVolunteersAdmin:', e); return { ok: false, error: 'Netzwerkfehler.', members: [] }; }
  }
  // Vorstand: Mitglied manuell zu einer Reise eintragen (board policy)
  async function addSignupAdmin(tripId, userId, note) {
    const s = getSession();
    if (!s || (s.role !== 'admin' && s.role !== 'board')) return { ok: false, error: 'Nur für den Vorstand.' };
    if (!tripId || !userId) return { ok: false, error: 'Ungültige Parameter.' };
    try {
      const tripRes = await getTrip(tripId);
      if (!tripRes.ok || !tripRes.trip) return { ok: false, error: 'Reise nicht gefunden.' };
      const client = await sb();
      const { data: ex, error: exErr } = await client
        .from('trip_signups')
        .select('id, status')
        .eq('trip_id', tripId)
        .eq('user_id', userId)
        .maybeSingle();
      if (exErr) return { ok: false, error: exErr.message };
      if (ex && ex.status !== 'cancelled') return { ok: false, error: 'Diese Person ist bereits eingetragen.' };
      const sRes = await getTripSignups(tripId);
      const active = (sRes.signups || []).filter(x => x.status !== 'cancelled');
      const nextPos = active.length + 1;
      let signup;
      if (ex) {
        const { data, error } = await client.from('trip_signups')
          .update({ status: 'confirmed', position: nextPos, note: note || null, cancelled_at: null, cancellation_reason: null })
          .eq('id', ex.id).select().single();
        if (error) return { ok: false, error: error.message };
        signup = data;
      } else {
        const { data, error } = await client.from('trip_signups')
          .insert({ trip_id: tripId, user_id: userId, position: nextPos, status: 'confirmed', note: note || null })
          .select().single();
        if (error) return { ok: false, error: error.message };
        signup = data;
      }
      return { ok: true, signup };
    } catch(e) { console.error('[LPR] addSignupAdmin:', e); return { ok: false, error: 'Netzwerkfehler.' }; }
  }
  // Vorstand: Tage einer Anmeldung final zuteilen/anpassen (board policy)
  async function setSignupDaysAdmin(signupId, tripId, userId, days) {
    const s = getSession();
    if (!s || (s.role !== 'admin' && s.role !== 'board')) return { ok: false, error: 'Nur für den Vorstand.' };
    if (!signupId || !tripId || !userId) return { ok: false, error: 'Ungültige Parameter.' };
    try {
      const tripRes = await getTrip(tripId);
      if (!tripRes.ok || !tripRes.trip) return { ok: false, error: 'Reise nicht gefunden.' };
      const allDays = enumerateDays(tripRes.trip.start_date, tripRes.trip.end_date);
      const chosen = normalizeDaySelection(days, allDays);
      const client = await sb();
      const { error: delErr } = await client.from('trip_signup_days').delete().eq('trip_id', tripId).eq('user_id', userId);
      if (delErr) return { ok: false, error: delErr.message };
      if (chosen.length) {
        const rows = chosen.map(c => ({ signup_id: signupId, trip_id: tripId, user_id: userId, day: c.day, half: c.half }));
        const { error: insErr } = await insertDayRows(client, rows);
        if (insErr) return { ok: false, error: insErr.message };
      }
      const halves = {}; chosen.forEach(c => { halves[c.day] = c.half; });
      return { ok: true, days: chosen.map(c => c.day), dayHalves: halves };
    } catch(e) { console.error('[LPR] setSignupDaysAdmin:', e); return { ok: false, error: 'Netzwerkfehler.' }; }
  }
  // Vorstand: Mitglied von einer Reise entfernen (Storno durch Vorstand, board policy).
  // Soft-Cancel statt DELETE: Historie bleibt erhalten, Reaktivierung über
  // addSignupAdmin/signupForTrip funktioniert weiterhin (cancelled-Pfad).
  async function removeSignupAdmin(signupId, tripId, userId, reason) {
    const s = getSession();
    if (!s || (s.role !== 'admin' && s.role !== 'board')) return { ok: false, error: 'Nur für den Vorstand.' };
    if (!signupId || !tripId || !userId) return { ok: false, error: 'Ungültige Parameter.' };
    try {
      const client = await sb();
      const { error } = await client
        .from('trip_signups')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancellation_reason: (reason || '').trim() || 'Vom Vorstand entfernt' })
        .eq('id', signupId);
      if (error) return { ok: false, error: error.message };
      // Zugeteilte Tage aufräumen, damit Abdeckung/Pauschalen-Planung stimmen
      const { error: dErr } = await client.from('trip_signup_days').delete().eq('trip_id', tripId).eq('user_id', userId);
      if (dErr) console.warn('[LPR] removeSignupAdmin days:', dErr.message);
      return { ok: true };
    } catch(e) { console.error('[LPR] removeSignupAdmin:', e); return { ok: false, error: 'Netzwerkfehler.' }; }
  }
  async function cancelSignup(tripId, reason) {
    const s = getSession();
    if (!s) return { ok: false, error: 'Nicht eingeloggt.' };
    try {
      const { error } = await (await sb())
        .from('trip_signups')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancellation_reason: (reason || '').trim() || null })
        .eq('trip_id', tripId)
        .eq('user_id', s.id);
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    } catch(e) { console.error('[LPR] cancelSignup:', e); return { ok: false, error: 'Netzwerkfehler.' }; }
  }

  // --- Verfügbarkeit (availabilities) ---
  // Tabelle: availabilities (user_id, date, shift, note)
  // shift_slot ENUM: 'morning' | 'afternoon' | 'night'
  async function getMyAvailability(monthIso) {
    // monthIso optional: '2026-05' filtert auf den Monat
    const s = getSession();
    if (!s) return { ok: false, error: 'Nicht eingeloggt.', availabilities: [] };
    try {
      let q = (await sb())
        .from('availabilities')
        .select('id, date, shift, note')
        .eq('user_id', s.id);
      if (monthIso) {
        const start = monthIso + '-01';
        const [y, m] = monthIso.split('-').map(Number);
        const next = new Date(y, m, 1);
        const end = next.toISOString().slice(0,10);
        q = q.gte('date', start).lt('date', end);
      }
      q = q.order('date', { ascending: true });
      const { data, error } = await q;
      if (error) return { ok: false, error: error.message, availabilities: [] };
      return { ok: true, availabilities: data || [] };
    } catch(e) { console.error('[LPR] getMyAvailability:', e); return { ok: false, error: 'Netzwerkfehler.', availabilities: [] }; }
  }
  async function setAvailability(date, shift, note) {
    const s = getSession();
    if (!s) return { ok: false, error: 'Nicht eingeloggt.' };
    if (!['morning','afternoon','night'].includes(shift)) return { ok: false, error: 'Ungültige Schicht.' };
    const cc = await isComplianceComplete(s.id); if (!cc.complete) return { ok: false, error: 'Compliance unvollständig oder abgelaufen. Bitte Vorstand kontaktieren.', missing: cc.missing };
    try {
      const { data, error } = await (await sb())
        .from('availabilities')
        .insert({ user_id: s.id, date, shift, note: note || null })
        .select()
        .single();
      if (error) {
        if (error.code === '23505') return { ok: false, error: 'Diese Verfügbarkeit existiert bereits.' };
        return { ok: false, error: error.message };
      }
      return { ok: true, availability: data };
    } catch(e) { console.error('[LPR] setAvailability:', e); return { ok: false, error: 'Netzwerkfehler.' }; }
  }
  async function removeAvailability(date, shift) {
    const s = getSession();
    if (!s) return { ok: false, error: 'Nicht eingeloggt.' };
    try {
      const { error } = await (await sb())
        .from('availabilities')
        .delete()
        .eq('user_id', s.id)
        .eq('date', date)
        .eq('shift', shift);
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    } catch(e) { console.error('[LPR] removeAvailability:', e); return { ok: false, error: 'Netzwerkfehler.' }; }
  }
  // --- Reise-Anmeldungen (signups) ---
    // Tabelle: signups (id, user_id, trip_id, position, status, signed_at, note)
    // Mit Join auf trips für Reise-Details
    async function getMySignups(filter) {
          const s = getSession();
          if (!s) return { ok: false, error: 'Nicht eingeloggt.', signups: [] };
          try {
                  let q = (await sb())
                    .from('trip_signups')
                    .select('id, trip_id, position, status, signed_at, note, trips(id, title, location, start_date, end_date, rate_override_per_day, status)')
                    .eq('user_id', s.id)
                    .order('start_date', { ascending: false, foreignTable: 'trips' });
                  if (filter && filter.status) q = q.eq('status', filter.status);
                  const { data, error } = await q;
                  if (error) return { ok: false, error: error.message, signups: [] };
                  const rows = data || [];
                  // Individuelle Tage (Teil-Reisen) je Anmeldung mitladen
                  const daysBySignup = {};
                  const halvesBySignup = {};
                  const ids = rows.map(r => r.id);
                  if (ids.length) {
                    const client = await sb();
                    const { data: dayRows, error: dErr } = await selectDayRows(
                      cols => client
                        .from('trip_signup_days')
                        .select(cols)
                        .in('signup_id', ids)
                        .order('day', { ascending: true }),
                      'signup_id, day, half', 'signup_id, day');
                    if (!dErr) {
                      (dayRows || []).forEach(d => {
                        (daysBySignup[d.signup_id] = daysBySignup[d.signup_id] || []).push(d.day);
                        (halvesBySignup[d.signup_id] = halvesBySignup[d.signup_id] || {})[d.day] = d.half || 'full';
                      });
                    } else {
                      console.warn('[LPR] getMySignups days:', dErr.message);
                    }
                  }
                  return { ok: true, signups: rows.map(r => Object.assign({}, r, { days: daysBySignup[r.id] || [], dayHalves: halvesBySignup[r.id] || {} })) };
          } catch(e) { console.error('[LPR] getMySignups:', e); return { ok: false, error: 'Netzwerkfehler.', signups: [] }; }
    }

  
  // --- Sitzwachen-Buchungen (bookings) ---
  // Tabelle: bookings (volunteer_id, request_id, date, shift, hours, compensation_eur, status)
  async function getMyBookings(filter) {
    const s = getSession();
    if (!s) return { ok: false, error: 'Nicht eingeloggt.', bookings: [] };
    try {
      let q = (await sb())
        .from('bookings')
        .select('id, request_id, clinic_id, date, shift, hours, compensation_eur, status, station, fallnummer, patient_room, patient_flags, patient_notes, patient_count, created_at, station_phone, unterwegs_ts, eta_ts, beginn_zeit, stunden_geplant, kunde_id, profiles!bookings_clinic_id_fkey(full_name)')
        .eq('volunteer_id', s.id)
        .order('date', { ascending: false });
      if (filter && filter.status) q = q.eq('status', filter.status);
      const { data, error } = await q;
      if (error) return { ok: false, error: error.message, bookings: [] };
      const bookings = (data || []).map(b => ({
        id: b.id,
        request_id: b.request_id,
        clinic_id: b.clinic_id,
        clinic_name: b.profiles && b.profiles.full_name || null,
        date: b.date,
        shift: b.shift,
        hours: b.hours,
        compensation_eur: b.compensation_eur,
        status: b.status,
        station: b.station,
        fallnummer: b.fallnummer,
        patient_room: b.patient_room,
        patient_flags: b.patient_flags || [],
        patient_notes: b.patient_notes,
        patient_count: b.patient_count || 1,
        created_at: b.created_at,
        station_phone: b.station_phone,
        unterwegs_ts: b.unterwegs_ts,
        eta_ts: b.eta_ts
      }));
      return { ok: true, bookings };
    } catch(e) { console.error('[LPR] getMyBookings:', e); return { ok: false, error: 'Netzwerkfehler.', bookings: [] }; }
  }

  // --- Abrechnung (claims) ---
  // Ein claim entsteht ausschliesslich dadurch, dass die/der Ehrenamtliche
  // selbst einen Antrag stellt (submitTripClaim/submitSitzClaim) — weder der
  // Abschluss einer Reise noch der einer Sitzwache erzeugt automatisch einen.
  async function getMyClaims(filter) {
    const s = getSession();
    if (!s) return { ok: false, error: 'Nicht eingeloggt.', claims: [] };
    try {
      let q = (await sb())
        .from('claims')
        .select('id, source_type, trip_signup_id, booking_id, amount, amount_breakdown, period_start, period_end, status, submitted_at, approved_at, paid_at, rejected_reason, notes, beleg_nr, pauschale_art, submitted_to_payroll_at, intake_mail_at, payout_mail_at, kind, auslage_art, nachweis_pfad, mitfahrer_ids')
        .eq('user_id', s.id)
        .order('submitted_at', { ascending: false });
      if (filter && filter.status) q = q.eq('status', filter.status);
      const { data, error } = await q;
      if (error) return { ok: false, error: error.message, claims: [] };
      return { ok: true, claims: data || [] };
    } catch(e) { console.error('[LPR] getMyClaims:', e); return { ok: false, error: 'Netzwerkfehler.', claims: [] }; }
  }

  // Freibetrag § 3 Nr. 26 EStG (zentral, statt mehrfach hartkodiert)
  const PAUSCHALE_LIMIT = 3300;
  const PAUSCHALE_WARN  = 2800;

  /**
   * Jahres-Stand der eigenen Antraege. Vorstandsregel: Als abgerechnet bzw.
   * ausgezahlt gilt ein Betrag ERST, wenn die Auszahlung angewiesen wurde
   * (status 'paid'). Eingereichte und genehmigte Antraege sind "offen",
   * Entwuerfe und abgelehnte zaehlen nirgends mit.
   *  - paid    → Jahr der Anweisung (paid_at = Zufluss, steuerlich massgeblich)
   *  - pending → Jahr der Einreichung (submitted_at)
   */
  function claimTotals(claims, year) {
    const y = Number(year);
    const num = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
    const yearOf = (...candidates) => {
      for (let i = 0; i < candidates.length; i++) {
        if (!candidates[i]) continue;
        const d = new Date(candidates[i]);
        if (!isNaN(d.getTime())) return d.getFullYear();
      }
      return null;
    };
    let paid = 0, pending = 0;
    (claims || []).forEach(c => {
      if (!c) return;
      // Auslagenersatz (§ 3 Nr. 50 EStG) ist steuerfrei und zaehlt nicht gegen
      // den Uebungsleiterfreibetrag (§ 3 Nr. 26 EStG) — nur Pauschalen zaehlen.
      if (c.kind === 'auslage') return;
      if (c.status === 'paid') {
        if (yearOf(c.paid_at, c.approved_at, c.submitted_at, c.created_at) === y) paid += num(c.amount);
      } else if (c.status === 'submitted' || c.status === 'approved') {
        if (yearOf(c.submitted_at, c.created_at) === y) pending += num(c.amount);
      }
    });
    const total = paid + pending;
    return { paid, pending, total, rest: PAUSCHALE_LIMIT - total };
  }

  function _diffDays(startIso, endIso) {
    const a = new Date(startIso); const b = new Date(endIso);
    return Math.round((b - a) / (1000 * 60 * 60 * 24)) + 1; // inkl. beider Tage
  }

  async function calculatePay(ctx) {
    try {
      const role = ctx.role || 'ehrenamt';
      const client = await sb();
      
      // 1) Basisbetrag bestimmen
      let baseAmount, baseSource;
      if (ctx.override_amount != null && !isNaN(Number(ctx.override_amount))) {
        baseAmount = Number(ctx.override_amount);
        baseSource = 'override';
      } else {
        const { data: rateRow, error: rateErr } = await client
          .from('compensation_rates')
          .select('amount')
          .eq('activity', ctx.activity)
          .eq('shift_type', ctx.shift_type)
          .eq('role', role)
          .is('effective_to', null)
          .maybeSingle();
        if (rateErr) return { ok: false, error: 'Tarif konnte nicht geladen werden: ' + rateErr.message };
        if (!rateRow) return { ok: false, error: 'Kein gültiger Tarif für ' + ctx.activity + '/' + ctx.shift_type + '/' + role + ' hinterlegt.' };
        baseAmount = Number(rateRow.amount);
        baseSource = 'tariff';
      }
      
      // 2) Reise-Pfad
      if (ctx.activity === 'reise') {
        // Individuelle Tage (Teil-Reise, ctx.days) haben Vorrang; sonst gesamter
        // Reisezeitraum. Der 0,5-Faktor gilt für den PERSÖNLICHEN An- und
        // Abreisetag der Person (Vorstandsbeschluss 15.04.2026) – auch bei
        // An-/Abreise mitten in der Reise.
        let dayList = null;
        if (Array.isArray(ctx.days) && ctx.days.length) {
          dayList = ctx.days.slice().sort();
        } else {
          if (!ctx.start_date || !ctx.end_date) return { ok: false, error: 'Reise braucht start_date und end_date' };
          const n = Math.round((new Date(ctx.end_date) - new Date(ctx.start_date)) / 86400000) + 1;
          if (n < 1) return { ok: false, error: 'Ungültige Reisedauer' };
          dayList = [];
          const t0 = Date.parse(ctx.start_date + 'T00:00:00Z');
          for (let i = 0; i < n; i++) dayList.push(new Date(t0 + i * 86400000).toISOString().slice(0, 10));
        }
        const days = dayList.length;
        const halfAmount = Number((baseAmount / 2).toFixed(2));
        const breakdown = [];
        let total = 0;
        if (days === 1) {
          breakdown.push({ label: 'Reisetag', date: dayList[0], base: baseAmount, factor: 1, amount: baseAmount });
          total = baseAmount;
        } else {
          breakdown.push({ label: 'Anreisetag (halber Tag)', date: dayList[0], base: baseAmount, factor: 0.5, amount: halfAmount });
          total += halfAmount;
          const midDays = days - 2;
          if (midDays > 0) {
            const midAmount = Number((midDays * baseAmount).toFixed(2));
            breakdown.push({ label: 'Volltage', count: midDays, base: baseAmount, factor: 1, amount: midAmount });
            total += midAmount;
          }
          breakdown.push({ label: 'Abreisetag (halber Tag)', date: dayList[days - 1], base: baseAmount, factor: 0.5, amount: halfAmount });
          total += halfAmount;
        }
        total = Number(total.toFixed(2));
        return { ok: true, base_source: baseSource, base_amount: baseAmount, supplements_applied: [], breakdown, total, currency: 'EUR', period_start: dayList[0], period_end: dayList[days - 1], days_count: days };
      }
      
      // 3) Sitzwache-Pfad
      if (ctx.activity === 'sitzwache') {
        const shiftLabels = { morning: 'Frühdienst (06:00–14:00)', afternoon: 'Spätdienst (14:00–22:00)', night: 'Nachtdienst (22:00–06:00)' };
        const label = shiftLabels[ctx.shift_type] || 'Sitzwache';
        
        // Zuschlaege laden
        const today = new Date().toISOString().split('T')[0];
        const { data: supps } = await client
          .from('pay_supplements')
          .select('*')
          .eq('active', true)
          .lte('effective_from', today);
        
        const applicable = [];
        const dateObj = ctx.date ? new Date(ctx.date) : new Date();
        const weekday = dateObj.getDay() === 0 ? 7 : dateObj.getDay();
        
        for (const s of (supps || [])) {
          if (s.effective_to && new Date(s.effective_to) < dateObj) continue;
          if (s.applies_to_activity && s.applies_to_activity !== 'sitzwache' && s.applies_to_activity !== '*') continue;
          if (s.applies_to_shift_type && s.applies_to_shift_type !== ctx.shift_type) continue;
          if (s.applies_to_role && s.applies_to_role !== role) continue;
          let matches = false;
          if (s.condition_type === 'always') matches = true;
          else if (s.condition_type === 'weekday') {
            const days = (s.condition_value && s.condition_value.days) || [];
            matches = days.includes(weekday);
          } else if (s.condition_type === 'date_range') {
            const cv = s.condition_value || {};
            const from = cv.from ? new Date(cv.from) : null;
            const to = cv.to ? new Date(cv.to) : null;
            matches = (!from || dateObj >= from) && (!to || dateObj <= to);
          }
          if (matches) applicable.push(s);
        }
        
        let suppTotal = 0;
        const suppDetails = [];
        for (const s of applicable) {
          const v = Number(s.bonus_value || 0);
          const amt = s.bonus_type === 'percent' ? Number((baseAmount * v / 100).toFixed(2)) : v;
          suppTotal += amt;
          suppDetails.push({ name: s.name, type: s.bonus_type, value: v, amount: amt });
        }
        
        const breakdown = [{ label: 'Sitzwache ' + label, date: ctx.date, base: baseAmount, factor: 1, amount: baseAmount }];
        for (const sd of suppDetails) {
          breakdown.push({ label: 'Zuschlag: ' + sd.name + ' (' + (sd.type === 'percent' ? sd.value + ' %' : '+' + sd.value + ' €') + ')', amount: sd.amount });
        }
        const total = Number((baseAmount + suppTotal).toFixed(2));
        
        return { ok: true, base_source: baseSource, base_amount: baseAmount, supplements_applied: suppDetails, breakdown, total, currency: 'EUR' };
      }
      
      return { ok: false, error: 'Unbekannte Aktivität: ' + ctx.activity };
    } catch(e) {
      console.error('[LPR] calculatePay:', e);
      return { ok: false, error: 'Netzwerkfehler bei Tarif-Berechnung.' };
    }
  }

  /**
   * §11a-Riegel: Vorstandsmitglieder duerfen Einsaetze fahren, aber solange die
   * Satzungsfrage offen ist keine Pauschale beantragen. Der Schalter ist
   * profiles.pauschale_berechtigt — ein UPDATE macht die Sperre wieder auf.
   *
   * Gesperrt wird nur bei explizitem false. Fehlt die Spalte im Profil-Read,
   * soll niemand versehentlich ausgesperrt werden.
   *
   * Liefert null (frei) oder den Text, der der Person angezeigt wird.
   */
  function pauschaleGesperrt(profile) {
    if (!profile || profile.pauschale_berechtigt !== false) return null;
    return 'Für Vorstandsmitglieder sind Aufwandsentschädigungen derzeit ausgesetzt, '
         + 'bis die Satzungsfrage nach § 11a geklärt ist. Dein Einsatz ist vollständig '
         + 'erfasst und bleibt es — der Antrag lässt sich nachholen, sobald die Sperre '
         + 'aufgehoben wird. Bei Fragen bitte im Vereinsbüro melden.';
  }

  // ════════════════════════════════════════════════════════════════════════
  // Sitzwachen-Einsatzdoku
  //
  // Geschrieben wird ausschliesslich ueber RPCs — auf einsaetze,
  // einsatz_ereignisse und einsatz_abschluss gibt es bewusst keine
  // Schreib-Policies. Die Funktionen hier sind nur Zustellung; jede Regel
  // (Compliance, Pausen-Paarung, Unterschriftspflicht, GoBD) steht in der
  // Datenbank und gilt auch dann, wenn dieser Client sich irrt.
  // ════════════════════════════════════════════════════════════════════════

  const EINSATZ_PUFFER = 'lpr-einsatz-puffer-v1';

  /**
   * Was heute ansteht. Liefert einen bereits laufenden Einsatz (der hat immer
   * Vorrang) und die Buchungen, zu denen sich einer starten laesst.
   *
   * Fenster ist heute ±1 Tag, weil der Nachtdienst ueber Mitternacht laeuft —
   * dieselbe Spanne, die einsatz_starten serverseitig akzeptiert.
   */
  async function getEinsatzKontext() {
    const s = getSession();
    if (!s) return { ok: false, error: 'Nicht eingeloggt.' };
    try {
      const client = await sb();
      const heute = new Date();
      const tag = d => new Date(heute.getFullYear(), heute.getMonth(), heute.getDate() + d)
        .toLocaleDateString('sv-SE'); // sv-SE liefert YYYY-MM-DD

      const [einsRes, bkRes] = await Promise.all([
        client.from('einsaetze')
          .select('id, booking_id, station, fallnummer, fallnummer_quelle, beginn_ts, ende_ts, status, offline_sync')
          .eq('volunteer_id', s.id).eq('status', 'laufend').limit(1),
        client.from('bookings')
          .select('id, date, shift, status, station, fallnummer, clinic_id, profiles!bookings_clinic_id_fkey(full_name)')
          .eq('volunteer_id', s.id)
          .gte('date', tag(-1)).lte('date', tag(1))
          .in('status', ['planned', 'confirmed'])
          .order('date')
      ]);

      if (einsRes.error) return { ok: false, error: einsRes.error.message };
      if (bkRes.error)   return { ok: false, error: bkRes.error.message };

      const laufend = (einsRes.data || [])[0] || null;
      let laufendeBuchung = null;
      if (laufend) {
        const { data } = await client.from('bookings')
          .select('id, date, shift, station, fallnummer, profiles!bookings_clinic_id_fkey(full_name)')
          .eq('id', laufend.booking_id).maybeSingle();
        laufendeBuchung = data || null;
      }

      const map = b => ({
        id: b.id, date: b.date, shift: b.shift, status: b.status,
        station: b.station, fallnummer: b.fallnummer,
        klinik: (b.profiles && b.profiles.full_name) || 'Klinik'
      });

      return {
        ok: true,
        laufend,
        laufendeBuchung: laufendeBuchung ? map(laufendeBuchung) : null,
        buchungen: (bkRes.data || []).map(map)
      };
    } catch(e) {
      console.error('[LPR] getEinsatzKontext:', e);
      return { ok: false, error: 'Netzwerkfehler.' };
    }
  }

  /**
   * Zu einer Liste von Buchungen: welche Einsaetze haengen daran und wurde
   * unterschrieben? Getrennte Abfrage statt PostgREST-Verschachtelung, damit
   * es nicht an Beziehungsnamen haengt.
   *
   * RLS entscheidet, wer was sieht: der Vorstand alles, die Klinik nur die
   * Einsaetze zu ihren eigenen Buchungen. Der Vermerk kommt nur mit, wenn die
   * abfragende Rolle ihn ohnehin lesen darf.
   *
   * Liefert ein Objekt { <booking_id>: { status, kategorie, vermerk } }.
   */
  async function getEinsatzInfoFuerBuchungen(bookingIds) {
    const ids = (bookingIds || []).filter(Boolean);
    if (!ids.length) return { ok: true, info: {} };
    try {
      const client = await sb();
      const { data: eins, error: e1 } = await client
        .from('einsaetze')
        .select('id, booking_id, status, beginn_ts')
        .in('booking_id', ids)
        .neq('status', 'storniert');
      if (e1) return { ok: false, error: e1.message, info: {} };
      if (!eins || !eins.length) return { ok: true, info: {} };

      const { data: absch, error: e2 } = await client
        .from('einsatz_abschluss')
        .select('einsatz_id, unterschrift_status, keine_unterschrift_kategorie, keine_unterschrift_vermerk')
        .in('einsatz_id', eins.map(e => e.id));
      if (e2) return { ok: false, error: e2.message, info: {} };

      const proEinsatz = {};
      (absch || []).forEach(a => { proEinsatz[a.einsatz_id] = a; });

      const info = {};
      eins.forEach(e => {
        const a = proEinsatz[e.id];
        info[e.booking_id] = {
          einsatz_id: e.id,
          einsatz_status: e.status,
          beginn_ts: e.beginn_ts,
          unterschrift_status: a ? a.unterschrift_status : null,
          kategorie: a ? a.keine_unterschrift_kategorie : null,
          vermerk:   a ? a.keine_unterschrift_vermerk : null
        };
      });
      return { ok: true, info };
    } catch(e) {
      console.error('[LPR] getEinsatzInfoFuerBuchungen:', e);
      return { ok: false, error: 'Netzwerkfehler.', info: {} };
    }
  }

  /** Anzeigetexte fuer den Grund — an einer Stelle, damit sie ueberall gleich lauten. */
  const KEINE_UNTERSCHRIFT_LABEL = {
    notfall_station: 'Notfall auf der Station',
    schichtwechsel:  'Schichtwechsel — niemand verfügbar',
    abgelehnt:       'Pflegekraft lehnt Unterschrift ab',
    sonstiges:       'Anderer Grund'
  };

  async function einsatzStarten(bookingId, fallnummer, clientTs) {
    try {
      const { data, error } = await (await sb()).rpc('einsatz_starten', {
        p_booking_id: bookingId,
        p_fallnummer: fallnummer || null,
        p_client_ts:  clientTs || null
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true, einsatz: Array.isArray(data) ? data[0] : data };
    } catch(e) { return { ok: false, error: 'Netzwerkfehler.' }; }
  }

  async function einsatzEreignis(einsatzId, typ, kategorie, stichwort, clientTs) {
    try {
      const { data, error } = await (await sb()).rpc('einsatz_ereignis', {
        p_einsatz_id: einsatzId,
        p_typ:        typ,
        p_kategorie:  kategorie || null,
        p_stichwort:  stichwort || null,
        p_client_ts:  clientTs || new Date().toISOString()
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true, ereignis: Array.isArray(data) ? data[0] : data };
    } catch(e) { return { ok: false, error: 'Netzwerkfehler.' }; }
  }

  async function getEinsatzEreignisse(einsatzId) {
    try {
      const { data, error } = await (await sb())
        .from('einsatz_ereignisse')
        .select('id, typ, server_ts, client_ts, kategorie, stichwort')
        .eq('einsatz_id', einsatzId)
        .order('server_ts');
      if (error) return { ok: false, error: error.message, ereignisse: [] };
      return { ok: true, ereignisse: data || [] };
    } catch(e) { return { ok: false, error: 'Netzwerkfehler.', ereignisse: [] }; }
  }

  /**
   * Unterschrift in den privaten Bucket. Pfad {user_id}/{einsatz_id}.png —
   * dieselbe Konvention wie claim-pdfs, und einsatz_abschliessen prueft
   * serverseitig, dass der Pfad im eigenen Ordner liegt.
   */
  async function uploadUnterschrift(einsatzId, blob) {
    const s = getSession();
    if (!s) return { ok: false, error: 'Nicht eingeloggt.' };
    try {
      const pfad = s.id + '/' + einsatzId + '.png';
      const { error } = await (await sb()).storage
        .from('einsatz-unterschriften')
        .upload(pfad, blob, { contentType: 'image/png', upsert: false });
      if (error) return { ok: false, error: 'Unterschrift konnte nicht gespeichert werden: ' + error.message };
      return { ok: true, pfad };
    } catch(e) { return { ok: false, error: 'Netzwerkfehler beim Hochladen.' }; }
  }

  /**
   * Zwei Wege, beide serverseitig geprueft:
   *   'geleistet'      → Unterschrift Pflicht, kein Grund
   *   'nicht_geleistet' → keine Unterschrift, Kategorie Pflicht
   * Die RPC lehnt jede andere Kombination ab; diese Funktion stellt nur zu.
   */
  async function einsatzAbschliessen(einsatzId, taetigkeiten, unterschriftPfad, pflegeName, clientTs, ohneUnterschrift) {
    try {
      const o = ohneUnterschrift || null;
      const { data, error } = await (await sb()).rpc('einsatz_abschliessen', {
        p_einsatz_id:        einsatzId,
        p_taetigkeiten:      taetigkeiten || [],
        p_unterschrift_path: o ? null : unterschriftPfad,
        p_pflege_name:       o ? null : (pflegeName || null),
        p_client_ts:         clientTs || null,
        p_unterschrift_status:          o ? 'nicht_geleistet' : 'geleistet',
        p_keine_unterschrift_kategorie: o ? o.kategorie : null,
        p_keine_unterschrift_vermerk:   o ? (o.vermerk || null) : null
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true, einsatz: Array.isArray(data) ? data[0] : data };
    } catch(e) { return { ok: false, error: 'Netzwerkfehler.' }; }
  }

  /**
   * Netto-Minuten aus der Datenbank. Dieselbe Funktion, aus der auch
   * bookings.hours entsteht — damit zeigt der Abschluss-Bildschirm exakt das,
   * was spaeter auf der Rechnung steht. Die Rundung im Browser wich davon ab.
   */
  async function einsatzNettoMinuten(einsatzId) {
    try {
      const { data, error } = await (await sb()).rpc('einsatz_netto_minuten', { p_einsatz_id: einsatzId });
      if (error) return { ok: false, error: error.message };
      return { ok: true, minuten: Number(data) };
    } catch(e) { return { ok: false, error: 'Netzwerkfehler.' }; }
  }

  // ── Vorstands-Aktionen auf Einsaetzen ────────────────────────────────────
  // Alle drei sind board-only; die Pruefung sitzt in der jeweiligen RPC, nicht
  // hier. Diese Funktionen stellen nur zu.

  async function einsatzStornieren(einsatzId, grund) {
    try {
      const { data, error } = await (await sb()).rpc('einsatz_stornieren', {
        p_einsatz_id: einsatzId, p_grund: grund
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true, einsatz: Array.isArray(data) ? data[0] : data };
    } catch(e) { return { ok: false, error: 'Netzwerkfehler.' }; }
  }

  async function einsatzReaktivieren(einsatzId, grund) {
    try {
      const { data, error } = await (await sb()).rpc('einsatz_reaktivieren', {
        p_einsatz_id: einsatzId, p_grund: grund
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true, einsatz: Array.isArray(data) ? data[0] : data };
    } catch(e) { return { ok: false, error: 'Netzwerkfehler.' }; }
  }

  /**
   * Papier-Stundenzettel nachtragen. beginn/ende als ISO-Zeitstempel,
   * pausenMinuten als ganze Zahl. Die RPC prueft Plausibilitaet (Ende nach
   * Beginn, nicht in der Zukunft, Pause kuerzer als der Einsatz).
   */
  async function einsatzNacherfassen(bookingId, beginnIso, endeIso, taetigkeiten,
                                     pausenMinuten, pflegeName, fallnummer) {
    try {
      const { data, error } = await (await sb()).rpc('einsatz_nacherfassen', {
        p_booking_id:     bookingId,
        p_beginn_ts:      beginnIso,
        p_ende_ts:        endeIso,
        p_taetigkeiten:   taetigkeiten || [],
        p_pausen_minuten: pausenMinuten || 0,
        p_pflege_name:    pflegeName || null,
        p_fallnummer:     fallnummer || null
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true, einsatz: Array.isArray(data) ? data[0] : data };
    } catch(e) { return { ok: false, error: 'Netzwerkfehler.' }; }
  }

  /** Anzeigetexte der Positivliste — an einer Stelle fuer alle Oberflaechen. */
  const TAETIGKEIT_LABEL = {
    anwesenheit_sichtkontakt: 'Anwesenheit & Sichtkontakt',
    gespraech:                'Gespräche geführt',
    vorgelesen:               'Vorgelesen',
    orientierung:             'Orientierung gegeben',
    beruhigt:                 'Beruhigt',
    mahlzeit_gesellschaft:    'Gesellschaft bei der Mahlzeit'
  };

  /**
   * Kleines Sicherheitsnetz gegen Reload, Absturz und kurze Funkloecher:
   * der Stand des laufenden Einsatzes liegt zusaetzlich lokal. Das ersetzt
   * KEINEN echten Offline-Betrieb — es sorgt nur dafuer, dass ein
   * geschlossener Browser nicht die Arbeit einer Nachtschicht kostet.
   */
  function einsatzPufferLesen() {
    try { return JSON.parse(localStorage.getItem(EINSATZ_PUFFER) || 'null'); }
    catch(e) { return null; }
  }
  function einsatzPufferSchreiben(zustand) {
    try { localStorage.setItem(EINSATZ_PUFFER, JSON.stringify(zustand || {})); } catch(e) {}
  }
  function einsatzPufferLeeren() {
    try { localStorage.removeItem(EINSATZ_PUFFER); } catch(e) {}
  }

  async function submitTripClaim(signupId, notes) {
    try {
      const session = getSession();
      if (!session) return { ok: false, error: 'Nicht eingeloggt.' };
      
      const profileResp = await getMyProfile();
      if (!profileResp.ok) return { ok: false, error: 'Profil konnte nicht geladen werden.' };
      const gesperrt = pauschaleGesperrt(profileResp.profile);
      if (gesperrt) return { ok: false, error: gesperrt };
      if (!profileResp.profile.iban) return { ok: false, error: 'Bitte erst IBAN im Profil hinterlegen.' };
      
      const client = await sb();
      const { data: signup, error: suErr } = await client
        .from('trip_signups')
        .select('id, status, user_id, trip_id, trips(id, title, start_date, end_date, rate_override_per_day)')
        .eq('id', signupId)
        .maybeSingle();
      if (suErr || !signup) return { ok: false, error: 'Signup nicht gefunden.' };
      if (signup.user_id !== session.id) return { ok: false, error: 'Dieser Signup gehört nicht dir.' };
      if (signup.status !== 'confirmed') return { ok: false, error: 'Signup nicht bestätigt (Status: ' + signup.status + ').' };
      if (!signup.trips) return { ok: false, error: 'Reise-Daten fehlen.' };
      const trip = signup.trips;
      
      const { data: existingClaims } = await client
        .from('claims')
        .select('id, status')
        .eq('trip_signup_id', signupId);
      const blocking = (existingClaims || []).find(c => c.status !== 'rejected' && c.status !== 'draft');
      if (blocking) return { ok: false, error: 'Für diese Reise existiert bereits ein Antrag (Status: ' + blocking.status + ').' };
      
      // Individuelle Tage der Anmeldung laden (Teil-Reise). Ohne Einträge in
      // trip_signup_days gilt der gesamte Reisezeitraum.
      const { data: dayRows, error: dayErr } = await client
        .from('trip_signup_days')
        .select('day')
        .eq('signup_id', signupId)
        .order('day', { ascending: true });
      if (dayErr) return { ok: false, error: 'Reisetage konnten nicht geladen werden: ' + dayErr.message };
      const personalDays = (dayRows || []).map(r => r.day);
      
      const calc = await calculatePay({
        activity: 'reise',
        shift_type: 'day',
        role: 'ehrenamt',
        override_amount: trip.rate_override_per_day,
        start_date: trip.start_date,
        end_date: trip.end_date,
        days: personalDays
      });
      if (!calc.ok) return { ok: false, error: calc.error };
      
      const { data: claim, error: insErr } = await client
        .from('claims')
        .insert({
          user_id: session.id,
          source_type: 'trip',
          trip_signup_id: signupId,
          amount: calc.total,
          amount_breakdown: calc.breakdown,
          period_start: calc.period_start || trip.start_date,
          period_end: calc.period_end || trip.end_date,
          status: 'submitted',
          notes: notes || null
        })
        .select()
        .single();
      if (insErr) return { ok: false, error: 'Antrag konnte nicht gespeichert werden: ' + insErr.message };
      
      return { ok: true, claim };
    } catch(e) {
      console.error('[LPR] submitTripClaim:', e);
      return { ok: false, error: 'Netzwerkfehler.' };
    }
  }

  async function submitSitzClaim(bookingId, notes) {
    try {
      const session = getSession();
      if (!session) return { ok: false, error: 'Nicht eingeloggt.' };
      
      const profileResp = await getMyProfile();
      if (!profileResp.ok) return { ok: false, error: 'Profil konnte nicht geladen werden.' };
      const gesperrt = pauschaleGesperrt(profileResp.profile);
      if (gesperrt) return { ok: false, error: gesperrt };
      if (!profileResp.profile.iban) return { ok: false, error: 'Bitte erst IBAN im Profil hinterlegen.' };
      
      const client = await sb();
      const { data: booking, error: bkErr } = await client
        .from('bookings')
        .select('*')
        .eq('id', bookingId)
        .maybeSingle();
      if (bkErr || !booking) return { ok: false, error: 'Buchung nicht gefunden.' };
      if (booking.volunteer_id !== session.id) return { ok: false, error: 'Diese Buchung gehört nicht dir.' };
      if (booking.status !== 'completed') return { ok: false, error: 'Buchung nicht abgeschlossen (Status: ' + booking.status + ').' };
      
      const { data: existingClaims } = await client
        .from('claims')
        .select('id, status')
        .eq('booking_id', bookingId);
      const blocking = (existingClaims || []).find(c => c.status !== 'rejected' && c.status !== 'draft');
      if (blocking) return { ok: false, error: 'Für diese Buchung existiert bereits ein Antrag (Status: ' + blocking.status + ').' };
      
      const calc = await calculatePay({
        activity: 'sitzwache',
        shift_type: booking.shift,
        role: 'ehrenamt',
        override_amount: booking.compensation_eur,
        date: booking.date
      });
      if (!calc.ok) return { ok: false, error: calc.error };
      
      const { data: claim, error: insErr } = await client
        .from('claims')
        .insert({
          user_id: session.id,
          source_type: 'sitzwache',
          booking_id: bookingId,
          amount: calc.total,
          amount_breakdown: calc.breakdown,
          period_start: booking.date,
          period_end: booking.date,
          status: 'submitted',
          notes: notes || null
        })
        .select()
        .single();
      if (insErr) return { ok: false, error: 'Antrag konnte nicht gespeichert werden: ' + insErr.message };
      
      return { ok: true, claim };
    } catch(e) {
      console.error('[LPR] submitSitzClaim:', e);
      return { ok: false, error: 'Netzwerkfehler.' };
    }
  }

  async function getMyProfile() {
    const s = getSession();
    if (!s) return { ok: false, error: 'Nicht eingeloggt.' };
    try {
      const { data, error } = await (await sb())
        .from('profiles')
        .select('id, email, full_name, phone, role, status, personalnummer, vereinsnummer, iban, iban_updated_at, pauschale_berechtigt')
        .eq('id', s.id)
        .single();
      if (error) return { ok: false, error: error.message };
      return { ok: true, profile: data };
    } catch(e) { console.error('[LPR] getMyProfile:', e); return { ok: false, error: 'Netzwerkfehler.' }; }
  }

  async function updateMyIban(rawIban) {
    const s = getSession();
    if (!s) return { ok: false, error: 'Nicht eingeloggt.' };
    // Normalisieren: Leerzeichen weg, uppercase
    const iban = (rawIban || '').replace(/\s+/g, '').toUpperCase();
    // Validierung: leer (zum Löschen) oder DE + 20 Ziffern
    if (iban !== '' && !/^DE[0-9]{20}$/.test(iban)) {
      return { ok: false, error: 'Bitte eine gültige deutsche IBAN angeben (DE + 20 Ziffern).' };
    }
    try {
      const { data, error } = await (await sb())
        .from('profiles')
        .update({ iban: iban || null, iban_updated_at: new Date().toISOString() })
        .eq('id', s.id)
        .select('iban, iban_updated_at')
        .single();
      if (error) return { ok: false, error: error.message };
      return { ok: true, iban: data.iban, iban_updated_at: data.iban_updated_at };
    } catch(e) { console.error('[LPR] updateMyIban:', e); return { ok: false, error: 'Netzwerkfehler.' }; }
  }

  // ───────────────────────────────────────────────────────
  // Präferenzen & Kliniken
  // ───────────────────────────────────────────────────────

  /**
   * Lädt die Klinik-Stammdaten (alle aktiven, sortiert).
   */
  async function listClinics() {
    try {
      const { data, error } = await (await sb())
        .from('clinics')
        .select('id, name, plz, city, sort_order')
        .eq('active', true)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });
      if (error) return { ok: false, error: error.message, clinics: [] };
      return { ok: true, clinics: data || [] };
    } catch(e) {
      console.error('[LPR] listClinics:', e);
      return { ok: false, error: 'Netzwerkfehler.', clinics: [] };
    }
  }

  // ── Klinik-Stammdaten (Vorstand) ──────────────────────────────────────────
  //
  // Ein clinics-Eintrag entstand bisher nur als Nebenwirkung: wenn der Vorstand
  // ein Klinikkonto freigab und dabei "neue ID anlegen" waehlte. Fuer eine
  // Praeferenz muss die Klinik aber im Katalog stehen — auch wenn sie nie ein
  // Konto hatte und nie eines haben wird.

  /** Alle Kliniken, auch die stillgelegten. Nur fuer den Vorstand sinnvoll. */
  async function listAllClinics() {
    try {
      const { data, error } = await (await sb())
        .from('clinics')
        .select('id, name, plz, city, sort_order, active, notification_cc')
        .order('active', { ascending: false })
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });
      if (error) return { ok: false, error: error.message, clinics: [] };
      return { ok: true, clinics: data || [] };
    } catch(e) {
      console.error('[LPR] listAllClinics:', e);
      return { ok: false, error: 'Netzwerkfehler.', clinics: [] };
    }
  }

  /**
   * Vorschlag fuer die ID aus dem Namen. Sie ist Text und taucht in
   * Praeferenzen und Verknuepfungen auf — sie soll lesbar sein, nicht zufaellig.
   */
  function clinicIdVorschlag(name) {
    return String(name || '')
      .toLowerCase()
      // Erst die deutschen Umlaute ausschreiben — sie werden zu zwei Buchstaben.
      .replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss')
      // Dann alle uebrigen Akzente abtrennen: é wird zu e, ñ zu n. Ohne diesen
      // Schritt verschwand der Buchstabe ganz — aus "Charité" wurde "charit".
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/[^a-z0-9]+/g,'-')
      .replace(/^-+|-+$/g,'')
      .slice(0, 40);
  }

  /** Anlegen oder aendern. Ohne vorhandene id wird angelegt. */
  async function saveClinic(k, istNeu) {
    const id   = String((k && k.id) || '').trim();
    const name = String((k && k.name) || '').trim();
    if (!id)   return { ok: false, error: 'Bitte eine Kennung angeben.' };
    if (!/^[a-z0-9-]+$/.test(id)) {
      return { ok: false, error: 'Die Kennung darf nur Kleinbuchstaben, Ziffern und Bindestriche enthalten.' };
    }
    if (name.length < 2) return { ok: false, error: 'Bitte den Namen der Klinik angeben.' };

    // Sammelpostfach der Klinik. Leer ist ausdruecklich erlaubt: nicht jede
    // Klinik hat eins, und ein Pflichtfeld waere hier eine erfundene Anforderung.
    const cc = String((k && k.notification_cc) || '').trim();
    if (cc && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cc)) {
      return { ok: false, error: 'Das Sammelpostfach ist keine gültige E-Mail-Adresse.' };
    }

    const satz = {
      name:       name,
      plz:        String((k && k.plz) || '').trim() || null,
      city:       String((k && k.city) || '').trim() || null,
      sort_order: Number(k && k.sort_order) || 999,
      notification_cc: cc || null
    };
    try {
      const client = await sb();
      const { error } = istNeu
        ? await client.from('clinics').insert({ id, active: true, ...satz })
        : await client.from('clinics').update(satz).eq('id', id);
      if (error) {
        if (error.code === '23505') return { ok: false, error: 'Diese Kennung ist schon vergeben.' };
        return { ok: false, error: error.message };
      }
      return { ok: true, id };
    } catch(e) {
      console.error('[LPR] saveClinic:', e);
      return { ok: false, error: 'Netzwerkfehler.' };
    }
  }

  /**
   * Abteilung und Zustellwuensche eines Klinikkontos.
   *
   * WARUM DAS NOETIG IST: Ein Klinikkonto ist ein profiles-Satz mit einem
   * clinic_details daneben. Mehrere Abteilungsleitungen derselben Klinik sind
   * mehrere Konten mit demselben linked_clinic_id — welche Abteilung dahinter
   * steht, stand bisher nirgends. Ohne die Angabe bekaeme entweder jede
   * Abteilung alles oder nur die buchende Person etwas.
   *
   * notify_all_departments ist fuer die Pflegedienstleitung: sie will alles
   * sehen, nicht nur ihre eigene Station.
   */
  async function setClinicNotifySettings(accountId, opts) {
    const s = getSession();
    if (!s || (s.role !== 'admin' && s.role !== 'board')) {
      return { ok: false, error: 'Nur der Vorstand kann das ändern.' };
    }
    try {
      const { error } = await (await sb())
        .from('clinic_details')
        .update({
          department:             String((opts && opts.department) || '').trim() || null,
          notify_email:           !!(opts && opts.notify_email),
          notify_all_departments: !!(opts && opts.notify_all_departments)
        })
        .eq('id', accountId);
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    } catch(e) {
      console.error('[LPR] setClinicNotifySettings:', e);
      return { ok: false, error: 'Netzwerkfehler.' };
    }
  }

  /**
   * Zustellstand der Benachrichtigungen zu einer Buchung.
   *
   * Liest die Sicht, nicht die Outbox: dort stehen Mailadressen aus vielen
   * Buchungen nebeneinander, und der Vorstand braucht nur die Frage
   * "ist es rausgegangen?".
   */
  async function getBookingNotifications(bookingIds) {
    if (!Array.isArray(bookingIds) || !bookingIds.length) return { ok: true, nach: {} };
    try {
      const { data, error } = await (await sb())
        .from('v_booking_notifications')
        .select('booking_id, event, recipient_role, status, error, sent_at')
        .in('booking_id', bookingIds);
      if (error) return { ok: false, error: error.message, nach: {} };
      const nach = {};
      (data || []).forEach(z => {
        const e = nach[z.booking_id] || (nach[z.booking_id] = { gesendet: 0, offen: 0, fehler: 0 });
        if (z.status === 'sent')        e.gesendet++;
        else if (z.status === 'failed') e.fehler++;
        else if (z.status === 'pending') e.offen++;
      });
      return { ok: true, nach };
    } catch(e) {
      console.error('[LPR] getBookingNotifications:', e);
      return { ok: false, error: 'Netzwerkfehler.', nach: {} };
    }
  }

  /** Stilllegen oder wieder aufnehmen. listClinics zeigt nur aktive. */
  async function setClinicActive(id, active) {
    try {
      const { error } = await (await sb())
        .from('clinics').update({ active: !!active }).eq('id', id);
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    } catch(e) {
      console.error('[LPR] setClinicActive:', e);
      return { ok: false, error: 'Netzwerkfehler.' };
    }
  }

  /**
   * Was haengt an dieser Klinik?
   *
   * DAS IST DER GRUND, WARUM NICHT EINFACH GELOESCHT WIRD. Die Fremdschluessel
   * verhalten sich unterschiedlich: billing_recipients und unstaffed_requests
   * blockieren ein Loeschen, clinic_details wird auf NULL gesetzt (das Konto
   * bliebe stehen und zeigte ins Leere) — und clinic_preferences haengt an
   * CASCADE. Ein Loeschversuch wuerde dort also NICHT scheitern, sondern die
   * Praeferenzen aller Mitarbeitenden stillschweigend mitnehmen. Genau die
   * Daten, wegen derer man den Katalog ueberhaupt pflegt.
   *
   * Ein Fehler beim Zaehlen gilt als "in Gebrauch". Lieber einmal zu viel
   * stillgelegt als einmal zu viel geloescht.
   */
  async function clinicUsage(id) {
    const tabellen = [
      ['clinic_preferences', 'clinic_id', 'Präferenzen'],
      ['clinic_details',     'linked_clinic_id', 'verknüpfte Konten'],
      ['billing_recipients', 'clinic_id', 'Rechnungsempfänger'],
      ['unstaffed_requests', 'clinic_id', 'offene Anfragen']
    ];
    const teile = [];
    let unklar = false;
    try {
      const client = await sb();
      for (const [tabelle, spalte, bezeichnung] of tabellen) {
        const { count, error } = await client
          .from(tabelle).select('*', { count: 'exact', head: true }).eq(spalte, id);
        if (error) { unklar = true; continue; }
        if (count > 0) teile.push(count + ' ' + bezeichnung);
      }
      return { ok: true, inGebrauch: teile.length > 0 || unklar, teile, unklar };
    } catch(e) {
      console.error('[LPR] clinicUsage:', e);
      return { ok: false, error: 'Netzwerkfehler.', inGebrauch: true, teile: [], unklar: true };
    }
  }

  /**
   * Loescht nur, wenn nichts daran haengt. Sonst wird stillgelegt und gesagt,
   * woran es lag — statt still Geschichte zu zerreissen.
   */
  async function deleteClinic(id) {
    const nutzung = await clinicUsage(id);
    if (nutzung.inGebrauch) {
      const still = await setClinicActive(id, false);
      if (!still.ok) return still;
      return {
        ok: true,
        geloescht: false,
        grund: nutzung.unklar
          ? 'Es liess sich nicht sicher feststellen, was an dieser Klinik haengt.'
          : 'Daran hängen noch: ' + nutzung.teile.join(', ') + '.'
      };
    }
    try {
      const { error } = await (await sb()).from('clinics').delete().eq('id', id);
      if (error) return { ok: false, error: error.message };
      return { ok: true, geloescht: true };
    } catch(e) {
      console.error('[LPR] deleteClinic:', e);
      return { ok: false, error: 'Netzwerkfehler.' };
    }
  }

  /**
   * Lädt das vollständige Präferenz-Bündel des aktuellen Users:
   * - profile-Felder (qualifications, activity_types, preferred_shifts, home_plz, max_km)
   * - clinic_preferences (Map clinic_id → 'pref'|'neutral'|'avoid')
   */
  async function getMyPreferences() {
    const s = getSession();
    if (!s) return { ok: false, error: 'Nicht eingeloggt.' };
    try {
      const client = await sb();
      const [profileRes, prefsRes] = await Promise.all([
        client.from('profiles')
          .select('qualifications, activity_types, preferred_shifts, home_plz, max_km')
          .eq('id', s.id)
          .single(),
        client.from('clinic_preferences')
          .select('clinic_id, preference')
          .eq('user_id', s.id)
      ]);
      if (profileRes.error) return { ok: false, error: profileRes.error.message };
      if (prefsRes.error)   return { ok: false, error: prefsRes.error.message };

      const clinicPrefs = {};
      (prefsRes.data || []).forEach(r => { clinicPrefs[r.clinic_id] = r.preference; });

      return {
        ok: true,
        preferences: {
          qualifications:   profileRes.data.qualifications   || [],
          activityTypes:    profileRes.data.activity_types   || [],
          preferredShifts:  profileRes.data.preferred_shifts || [],
          homePlz:          profileRes.data.home_plz || '',
          maxKm:            profileRes.data.max_km != null ? String(profileRes.data.max_km) : '',
          clinicPrefs
        }
      };
    } catch(e) {
      console.error('[LPR] getMyPreferences:', e);
      return { ok: false, error: 'Netzwerkfehler.' };
    }
  }

  /**
   * Speichert die WEICHEN Präferenzen (Schichten, PLZ, Max-KM).
   * Qualifikationen + Tätigkeiten kann der User NICHT selbst ändern — nur Vorstand.
   */
  async function updateMySoftPreferences(payload) {
    const s = getSession();
    if (!s) return { ok: false, error: 'Nicht eingeloggt.' };
    if (!payload || typeof payload !== 'object') return { ok: false, error: 'Keine Daten übergeben.' };

    // Schichten: nur erlaubte Werte
    const ALLOWED_SHIFTS = ['frueh','spaet','nacht'];
    let preferred_shifts = Array.isArray(payload.preferredShifts)
      ? payload.preferredShifts.filter(x => ALLOWED_SHIFTS.includes(x))
      : null;
    if (preferred_shifts && preferred_shifts.length === 0) {
      // Niemand sollte ALLE Schichten abwählen — sonst sieht er nichts mehr.
      // Wir erlauben es trotzdem, geben aber Hinweis im UI.
    }

    // PLZ: 5 Ziffern oder leer
    const plzRaw = (payload.homePlz || '').trim();
    if (plzRaw !== '' && !/^\d{5}$/.test(plzRaw)) {
      return { ok: false, error: 'PLZ muss aus 5 Ziffern bestehen oder leer sein.' };
    }

    // max_km: positive Zahl oder leer
    let max_km = null;
    if (payload.maxKm !== '' && payload.maxKm != null) {
      const n = parseInt(payload.maxKm, 10);
      if (!Number.isFinite(n) || n < 1 || n > 500) {
        return { ok: false, error: 'Max. Anfahrt muss zwischen 1 und 500 km liegen.' };
      }
      max_km = n;
    }

    const patch = {
      home_plz: plzRaw || null,
      max_km
    };
    if (preferred_shifts !== null) patch.preferred_shifts = preferred_shifts;

    try {
      const { data, error } = await (await sb())
        .from('profiles')
        .update(patch)
        .eq('id', s.id)
        .select('preferred_shifts, home_plz, max_km')
        .single();
      if (error) return { ok: false, error: error.message };
      return { ok: true, profile: data };
    } catch(e) {
      console.error('[LPR] updateMySoftPreferences:', e);
      return { ok: false, error: 'Netzwerkfehler.' };
    }
  }

  /**
   * Setzt die Präferenz für eine einzelne Klinik (upsert).
   * value: 'pref' | 'neutral' | 'avoid'
   * Bei 'neutral' wird der Eintrag gelöscht (Default).
   */
  async function setClinicPreference(clinicId, value) {
    const s = getSession();
    if (!s) return { ok: false, error: 'Nicht eingeloggt.' };
    if (!clinicId) return { ok: false, error: 'Keine Klinik-ID.' };
    if (!['pref','neutral','avoid'].includes(value)) {
      return { ok: false, error: 'Ungültiger Wert.' };
    }
    try {
      const client = await sb();
      if (value === 'neutral') {
        // Eintrag löschen — neutral ist der implizite Default
        const { error } = await client
          .from('clinic_preferences')
          .delete()
          .eq('user_id', s.id)
          .eq('clinic_id', clinicId);
        if (error) return { ok: false, error: error.message };
        return { ok: true, preference: 'neutral' };
      } else {
        // Upsert: bei Konflikt (PK user_id+clinic_id) Update
        const { error } = await client
          .from('clinic_preferences')
          .upsert({
            user_id:    s.id,
            clinic_id:  clinicId,
            preference: value
          }, { onConflict: 'user_id,clinic_id' });
        if (error) return { ok: false, error: error.message };
        return { ok: true, preference: value };
      }
    } catch(e) {
      console.error('[LPR] setClinicPreference:', e);
      return { ok: false, error: 'Netzwerkfehler.' };
    }
  }

  /**
   * VORSTAND-FUNKTION: Setzt die HARTEN Präferenzen eines Users
   * (Qualifikationen + Tätigkeiten). Nur durch Board-Rolle aufrufbar.
   * Wird von admin-mitwirkende.html benutzt.
   */
  async function setUserHardPreferences(userId, payload) {
    const s = getSession();
    if (!s) return { ok: false, error: 'Nicht eingeloggt.' };
    if (s.role !== 'admin' && s.role !== 'board') {
      return { ok: false, error: 'Nur der Vorstand kann diese Werte ändern.' };
    }
    if (!userId) return { ok: false, error: 'Keine User-ID.' };

    const patch = {};
    if (Array.isArray(payload.qualifications)) {
      patch.qualifications = payload.qualifications.filter(x => typeof x === 'string');
    }
    if (Array.isArray(payload.activityTypes)) {
      patch.activity_types = payload.activityTypes.filter(x => typeof x === 'string');
    }
    if (Object.keys(patch).length === 0) {
      return { ok: false, error: 'Nichts zu speichern.' };
    }

    try {
      const { data, error } = await (await sb())
        .from('profiles')
        .update(patch)
        .eq('id', userId)
        .select('qualifications, activity_types')
        .single();
      if (error) return { ok: false, error: error.message };
      return { ok: true, profile: data };
    } catch(e) {
      console.error('[LPR] setUserHardPreferences:', e);
      return { ok: false, error: 'Netzwerkfehler.' };
    }
  }

  /**
   * VORSTAND-FUNKTION: Lädt das vollständige Präferenz-Bündel eines anderen Users.
   * Gleiches Format wie getMyPreferences().
   */
  async function getUserPreferences(userId) {
    const s = getSession();
    if (!s) return { ok: false, error: 'Nicht eingeloggt.' };
    if (s.role !== 'admin' && s.role !== 'board') {
      return { ok: false, error: 'Nur Vorstand.' };
    }
    if (!userId) return { ok: false, error: 'Keine User-ID.' };
    try {
      const client = await sb();
      const [profileRes, prefsRes] = await Promise.all([
        client.from('profiles')
          .select('qualifications, activity_types, preferred_shifts, home_plz, max_km')
          .eq('id', userId)
          .single(),
        client.from('clinic_preferences')
          .select('clinic_id, preference')
          .eq('user_id', userId)
      ]);
      if (profileRes.error) return { ok: false, error: profileRes.error.message };
      if (prefsRes.error)   return { ok: false, error: prefsRes.error.message };

      const clinicPrefs = {};
      (prefsRes.data || []).forEach(r => { clinicPrefs[r.clinic_id] = r.preference; });

      return {
        ok: true,
        preferences: {
          qualifications:   profileRes.data.qualifications   || [],
          activityTypes:    profileRes.data.activity_types   || [],
          preferredShifts:  profileRes.data.preferred_shifts || [],
          homePlz:          profileRes.data.home_plz || '',
          maxKm:            profileRes.data.max_km != null ? String(profileRes.data.max_km) : '',
          clinicPrefs
        }
      };
    } catch(e) {
      console.error('[LPR] getUserPreferences:', e);
      return { ok: false, error: 'Netzwerkfehler.' };
    }
  }

  /**
   * VORSTAND-FUNKTION: Setzt die WEICHEN Präferenzen eines anderen Users.
   * Gleiche Validierung wie updateMySoftPreferences.
   */
  async function setUserSoftPreferences(userId, payload) {
    const s = getSession();
    if (!s) return { ok: false, error: 'Nicht eingeloggt.' };
    if (s.role !== 'admin' && s.role !== 'board') {
      return { ok: false, error: 'Nur Vorstand.' };
    }
    if (!userId) return { ok: false, error: 'Keine User-ID.' };
    if (!payload || typeof payload !== 'object') return { ok: false, error: 'Keine Daten übergeben.' };

    const ALLOWED_SHIFTS = ['frueh','spaet','nacht'];
    let preferred_shifts = Array.isArray(payload.preferredShifts)
      ? payload.preferredShifts.filter(x => ALLOWED_SHIFTS.includes(x))
      : null;

    const plzRaw = (payload.homePlz || '').trim();
    if (plzRaw !== '' && !/^\d{5}$/.test(plzRaw)) {
      return { ok: false, error: 'PLZ muss aus 5 Ziffern bestehen oder leer sein.' };
    }

    let max_km = null;
    if (payload.maxKm !== '' && payload.maxKm != null) {
      const n = parseInt(payload.maxKm, 10);
      if (!Number.isFinite(n) || n < 1 || n > 500) {
        return { ok: false, error: 'Max. Anfahrt muss zwischen 1 und 500 km liegen.' };
      }
      max_km = n;
    }

    const patch = {
      home_plz: plzRaw || null,
      max_km
    };
    if (preferred_shifts !== null) patch.preferred_shifts = preferred_shifts;

    try {
      const { data, error } = await (await sb())
        .from('profiles')
        .update(patch)
        .eq('id', userId)
        .select('preferred_shifts, home_plz, max_km')
        .single();
      if (error) return { ok: false, error: error.message };
      return { ok: true, profile: data };
    } catch(e) {
      console.error('[LPR] setUserSoftPreferences:', e);
      return { ok: false, error: 'Netzwerkfehler.' };
    }
  }

  /**
   * VORSTAND-FUNKTION: Setzt eine einzelne Klinik-Präferenz für einen anderen User.
   * RLS für clinic_preferences erlaubt Vorstand das Schreiben über die "cp_admin_all"-Policy.
   * Falls die fehlt, muss sie ergänzt werden — siehe Migration unten.
   */
  async function setUserClinicPreference(userId, clinicId, value) {
    const s = getSession();
    if (!s) return { ok: false, error: 'Nicht eingeloggt.' };
    if (s.role !== 'admin' && s.role !== 'board') {
      return { ok: false, error: 'Nur Vorstand.' };
    }
    if (!userId) return { ok: false, error: 'Keine User-ID.' };
    if (!clinicId) return { ok: false, error: 'Keine Klinik-ID.' };
    if (!['pref','neutral','avoid'].includes(value)) {
      return { ok: false, error: 'Ungültiger Wert.' };
    }
    try {
      const client = await sb();
      if (value === 'neutral') {
        const { error } = await client
          .from('clinic_preferences')
          .delete()
          .eq('user_id', userId)
          .eq('clinic_id', clinicId);
        if (error) return { ok: false, error: error.message };
        return { ok: true, preference: 'neutral' };
      } else {
        const { error } = await client
          .from('clinic_preferences')
          .upsert({
            user_id:    userId,
            clinic_id:  clinicId,
            preference: value
          }, { onConflict: 'user_id,clinic_id' });
        if (error) return { ok: false, error: error.message };
        return { ok: true, preference: value };
      }
    } catch(e) {
      console.error('[LPR] setUserClinicPreference:', e);
      return { ok: false, error: 'Netzwerkfehler.' };
    }
  }

  // ───────────────────────────────────────────────────────
  // Klinik-Self-Service (Etappe 1)
  // Onboarding: Klinik registriert sich → kliniken.html zeigt Onboarding-Form
  // → status=pending → Vorstand prüft → approve(linked_clinic_id) | reject
  // ───────────────────────────────────────────────────────

  /**
   * Eigene Klinik-Daten lesen.
   * Returns: { ok, details: {...} | null }
   * details=null wenn noch nicht onboarded → Frontend zeigt Onboarding-Form.
   */
  async function getMyClinic() {
    const s = getSession();
    if (!s) return { ok: false, error: 'Nicht eingeloggt.' };
    if (s.role !== 'klinik') return { ok: false, error: 'Nur für Klinik-Konten.' };

    try {
      const client = await sb();
      const { data, error } = await client
        .from('clinic_details')
        .select('id, clinic_name, address, postal_code, city, contact_person, phone, status, linked_clinic_id, rejection_reason, created_at, approved_at')
        .eq('id', s.id)
        .maybeSingle();
      if (error) return { ok: false, error: error.message };
      return { ok: true, details: data || null };
    } catch(e) {
      console.error('[LPR] getMyClinic:', e);
      return { ok: false, error: 'Netzwerkfehler.' };
    }
  }

  /**
   * Eigene Klinik-Daten beim Onboarding einreichen oder eigene Stammdaten korrigieren.
   * Wird zweimal genutzt:
   *   - Onboarding: Erster Insert (status default 'pending')
   *   - Self-Update: Klinik korrigiert eigene Daten (Adresse, Telefon)
   *     → status/linked_clinic_id/approved_* sind via Trigger geschützt
   */
  async function submitMyClinic(payload) {
    const s = getSession();
    if (!s) return { ok: false, error: 'Nicht eingeloggt.' };
    if (s.role !== 'klinik') return { ok: false, error: 'Nur für Klinik-Konten.' };

    const clinic_name = (payload.clinicName || '').trim();
    if (clinic_name.length < 2) return { ok: false, error: 'Bitte den Klinik-Namen angeben.' };

    const phone = (payload.phone || '').trim();
    if (phone.length < 4) return { ok: false, error: 'Bitte eine Telefonnummer angeben.' };

    const contact_person = (payload.contactPerson || '').trim();
    if (contact_person.length < 2) return { ok: false, error: 'Bitte einen Ansprechpartner angeben.' };

    const postal_code = (payload.postalCode || '').trim();
    if (postal_code !== '' && !/^\d{5}$/.test(postal_code)) {
      return { ok: false, error: 'PLZ muss aus 5 Ziffern bestehen oder leer sein.' };
    }

    const row = {
      id:               s.id,
      clinic_name,
      address:          (payload.address || '').trim() || null,
      postal_code:      postal_code || null,
      city:             (payload.city || '').trim() || null,
      contact_person,
      phone
    };

    try {
      const client = await sb();

      // Vor dem Upsert prüfen: Gibt es bereits einen Eintrag, und ist er 'rejected'?
      // Falls ja, setzen wir bei diesem erneuten Einreichen explizit status='pending'
      // und löschen die alte Begründung — die Klinik kommt dann wieder in die
      // Pending-Queue für die erneute Vorstandsprüfung.
      const { data: existing } = await client
        .from('clinic_details')
        .select('status')
        .eq('id', s.id)
        .maybeSingle();

      if (existing && existing.status === 'rejected') {
        row.status = 'pending';
        row.rejection_reason = null;
      }

      // Upsert: Beim ersten Mal Insert (status default 'pending'),
      // danach Update. Bei rejected→pending wird der Status explizit
      // mitgesendet (siehe oben). Bei pending/approved schützt der DB-Trigger
      // den Status — die Klinik kann also nicht selbst auf 'approved' wechseln.
      const { data, error } = await client
        .from('clinic_details')
        .upsert(row, { onConflict: 'id' })
        .select('id, clinic_name, status, address, postal_code, city, contact_person, phone, rejection_reason')
        .single();
      if (error) return { ok: false, error: error.message };

      // Konsistenz: Bei rejected→pending auch profiles.status zurücksetzen,
      // damit die Klinik wieder als pending sichtbar ist.
      if (existing && existing.status === 'rejected') {
        await client.from('profiles').update({ status: 'pending' }).eq('id', s.id);
      }

      return { ok: true, details: data };
    } catch(e) {
      console.error('[LPR] submitMyClinic:', e);
      return { ok: false, error: 'Netzwerkfehler.' };
    }
  }

  /**
   * VORSTAND: Liste aller Kliniken nach Status (pending/approved/rejected).
   * Returns: { ok, clinics: [{...}] } — angereichert mit profiles.email
   */
  async function listClinicsByStatus(status) {
    const s = getSession();
    if (!s) return { ok: false, error: 'Nicht eingeloggt.' };
    if (s.role !== 'admin' && s.role !== 'board') {
      return { ok: false, error: 'Nur der Vorstand kann diese Liste sehen.' };
    }
    if (!['pending', 'approved', 'rejected'].includes(status)) {
      return { ok: false, error: 'Ungültiger Status-Filter.' };
    }

    try {
      const client = await sb();
      const { data, error } = await client
        .from('clinic_details')
        .select(`
          id, clinic_name, address, postal_code, city, contact_person, phone,
          status, linked_clinic_id, rejection_reason,
          department, notify_email, notify_all_departments,
          created_at, approved_at, approved_by,
          profiles:profiles!clinic_details_id_fkey(email, full_name)
        `)
        .eq('status', status)
        .order('created_at', { ascending: status === 'pending' });
      if (error) return { ok: false, error: error.message };
      const clinics = (data || []).map(c => ({
        ...c,
        email:           c.profiles?.email || '',
        registered_name: c.profiles?.full_name || '',
        profiles:        undefined
      }));
      return { ok: true, clinics };
    } catch(e) {
      console.error('[LPR] listClinicsByStatus:', e);
      return { ok: false, error: 'Netzwerkfehler.' };
    }
  }

  /**
   * VORSTAND: Klinik-Anmeldung freigeben.
   * Zwei Wege:
   *   - Existierender clinics-Eintrag: linkedClinicId mitgeben
   *   - Neuer Stammdaten-Eintrag: createNewClinicId mitgeben (text-Slug),
   *     wird automatisch in clinics angelegt aus den clinic_details-Daten.
   */
  async function approveClinic(clinicAccountId, opts) {
    const s = getSession();
    if (!s) return { ok: false, error: 'Nicht eingeloggt.' };
    if (s.role !== 'admin' && s.role !== 'board') {
      return { ok: false, error: 'Nur der Vorstand kann freigeben.' };
    }
    if (!clinicAccountId) return { ok: false, error: 'Keine Klinik-ID übergeben.' };

    let linkedId = (opts?.linkedClinicId || '').trim();
    const createNewId = (opts?.createNewClinicId || '').trim();

    if (!linkedId && !createNewId) {
      return { ok: false, error: 'Entweder bestehende Klinik wählen oder neue ID angeben.' };
    }

    try {
      const client = await sb();

      // Wenn neue Stammdaten angelegt werden sollen
      if (createNewId) {
        if (!/^[a-z0-9-]{3,40}$/.test(createNewId)) {
          return { ok: false, error: 'Neue Klinik-ID nur Kleinbuchstaben, Ziffern und Bindestriche, 3–40 Zeichen.' };
        }

        // Erst clinic_details lesen, um die Daten zu kennen
        const { data: cd, error: cdErr } = await client
          .from('clinic_details')
          .select('clinic_name, postal_code, city')
          .eq('id', clinicAccountId)
          .single();
        if (cdErr) return { ok: false, error: cdErr.message };

        // Neuen clinics-Eintrag anlegen
        const { error: insErr } = await client
          .from('clinics')
          .insert({
            id:         createNewId,
            name:       cd.clinic_name,
            plz:        cd.postal_code,
            city:       cd.city,
            active:     true,
            sort_order: 999
          });
        if (insErr) {
          if (insErr.code === '23505') {
            return { ok: false, error: 'Klinik-ID bereits vergeben. Bitte andere wählen.' };
          }
          return { ok: false, error: insErr.message };
        }
        linkedId = createNewId;
      } else {
        // Existenz prüfen
        const { data: existing, error: chkErr } = await client
          .from('clinics')
          .select('id')
          .eq('id', linkedId)
          .maybeSingle();
        if (chkErr) return { ok: false, error: chkErr.message };
        if (!existing) return { ok: false, error: 'Diese Klinik gibt es nicht in den Stammdaten.' };
      }

      // clinic_details auf approved setzen
      const { data, error } = await client
        .from('clinic_details')
        .update({
          status:           'approved',
          linked_clinic_id: linkedId,
          approved_at:      new Date().toISOString(),
          approved_by:      s.id,
          rejection_reason: null
        })
        .eq('id', clinicAccountId)
        .select('id, status, linked_clinic_id, approved_at')
        .single();
      if (error) return { ok: false, error: error.message };

      // Auch profiles.status auf approved setzen, damit Login klappt
      await client.from('profiles').update({ status: 'approved' }).eq('id', clinicAccountId);

      return { ok: true, details: data };
    } catch(e) {
      console.error('[LPR] approveClinic:', e);
      return { ok: false, error: 'Netzwerkfehler.' };
    }
  }

  /**
   * VORSTAND: Klinik-Anmeldung ablehnen.
   */
  async function rejectClinic(clinicAccountId, reason) {
    const s = getSession();
    if (!s) return { ok: false, error: 'Nicht eingeloggt.' };
    if (s.role !== 'admin' && s.role !== 'board') {
      return { ok: false, error: 'Nur der Vorstand kann ablehnen.' };
    }
    if (!clinicAccountId) return { ok: false, error: 'Keine Klinik-ID übergeben.' };
    const r = (reason || '').trim();
    if (r.length < 5) return { ok: false, error: 'Bitte eine kurze Begründung angeben (min. 5 Zeichen).' };

    try {
      const client = await sb();
      const { data, error } = await client
        .from('clinic_details')
        .update({
          status:           'rejected',
          rejection_reason: r,
          approved_at:      null,
          approved_by:      null,
          linked_clinic_id: null
        })
        .eq('id', clinicAccountId)
        .select('id, status, rejection_reason')
        .single();
      if (error) return { ok: false, error: error.message };

      await client.from('profiles').update({ status: 'rejected' }).eq('id', clinicAccountId);

      return { ok: true, details: data };
    } catch(e) {
      console.error('[LPR] rejectClinic:', e);
      return { ok: false, error: 'Netzwerkfehler.' };
    }
  }

  // ============================================================
  // Klinik-Buchungen (Etappe 2)
  // ============================================================

  // Klinik sieht alle Verfügbarkeiten (availabilities), die noch nicht gebucht sind.
  // Zurück: Liste mit { id, volunteer_id, volunteer_name, date, shift, note }
  // Optional filter: { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }
  async function listAvailableShifts(filter) {
    const s = getSession();
    if (!s) return { ok: false, error: 'Nicht eingeloggt.', shifts: [] };
    try {
      const client = await sb();
      // Buchbare Schichten kommen serverseitig aus der RPC list_bookable_shifts:
      //  - Verfuegbarkeiten approved Volunteers
      //  - bereits (nicht-storniert) gebuchte Slots werden ausgeschlossen (klinik-uebergreifend)
      //  - nur Volunteers mit allen 5 gueltigen Pflichtdokumenten
      // Die Compliance-Pruefung laeuft mit SECURITY DEFINER in der DB, damit die
      // Klinik KEINEN Lesezugriff auf compliance_records braucht (DSGVO).
      const { data, error } = await client.rpc('list_bookable_shifts', {
        p_from: (filter && filter.from) || null,
        p_to:   (filter && filter.to)   || null
      });
      if (error) return { ok: false, error: error.message, shifts: [] };
      const shifts = (data || []).map(r => ({
        id: r.id,
        volunteer_id: r.volunteer_id,
        volunteer_name: r.volunteer_name || '—',
        date: r.date,
        shift: r.shift,
        note: r.note || ''
      }));
      return { ok: true, shifts };
    } catch(e) {
      console.error('[LPR] listAvailableShifts:', e);
      return { ok: false, error: 'Netzwerkfehler.', shifts: [] };
    }
  }

  /**
   * Verfuegbare Dienste je Datum und Schicht — OHNE Namen.
   *
   * Der Unterschied zu listAvailableShifts ist der Kern der blinden Vergabe:
   * die Namen werden nicht ausgeblendet, sie verlassen die Datenbank gar
   * nicht erst. Alles andere waere nur eine Sichtblende im Browser.
   */
  async function listBookableSlots(filter) {
    const s = getSession();
    if (!s) return { ok: false, error: 'Nicht eingeloggt.', slots: [] };
    try {
      const client = await sb();
      const { data, error } = await client.rpc('list_bookable_slots', {
        p_from: (filter && filter.from) || null,
        p_to:   (filter && filter.to)   || null
      });
      if (error) return { ok: false, error: error.message, slots: [] };
      const slots = (data || []).map(r => ({
        date: r.datum,
        shift: r.schicht,
        anzahl: r.anzahl
      }));
      return { ok: true, slots };
    } catch(e) {
      console.error('[LPR] listBookableSlots:', e);
      return { ok: false, error: 'Netzwerkfehler.', slots: [] };
    }
  }

  /**
   * Dienst buchen, ohne eine Person auszuwaehlen.
   *
   * Die Klinik uebergibt Datum, Schicht und die Angaben zum Einsatz. Wer den
   * Dienst bekommt, entscheidet die Vergaberegel in der Datenbank
   * (naechste_sitzwache): wenigste Dienste in 90 Tagen, dann laengste Pause,
   * dann Streuwert. Den Namen nennt erst die Antwort.
   */
  async function bookShiftFair(payload) {
    const s = getSession();
    if (!s) return { ok: false, error: 'Nicht eingeloggt.' };
    if (!payload || !payload.date || !payload.shift) {
      return { ok: false, error: 'Datum und Schicht sind Pflicht.' };
    }
    try {
      const client = await sb();
      const { data, error } = await client.rpc('book_shift_fair', {
        p_date:          payload.date,
        p_shift:         payload.shift,
        p_station:       payload.station || null,
        p_station_phone: payload.station_phone || null,
        p_room:          payload.patient_room || null,
        p_fallnummer:    payload.fallnummer || null,
        p_flags:         Array.isArray(payload.patient_flags) ? payload.patient_flags : [],
        p_notes:         payload.patient_notes || null,
        // 1 oder 2 — mehr laesst die Datenbank nicht zu. Alles andere wird
        // hier auf 1 gezogen, damit ein verirrter Wert nicht als Fehler beim
        // Buchen ankommt.
        p_patient_count: payload.patient_count === 2 ? 2 : 1
      });
      if (error) return { ok: false, error: error.message };
      const z = Array.isArray(data) ? data[0] : data;
      if (!z) return { ok: false, error: 'Zuteilung nicht möglich.' };
      return {
        ok: true,
        booking: {
          id: z.booking_id,
          volunteer_id: z.volunteer_id,
          volunteer_name: z.volunteer_name,
          date: z.datum,
          shift: z.schicht
        }
      };
    } catch(e) {
      console.error('[LPR] bookShiftFair:', e);
      return { ok: false, error: 'Netzwerkfehler.' };
    }
  }

  // Klinik bucht eine konkrete Schicht.
  // payload: { volunteer_id, date, shift, patient_room, patient_flags: [...], patient_notes }
  async function bookShift(payload) {
    const s = getSession();
    if (!s) return { ok: false, error: 'Nicht eingeloggt.' };
    if (s.role !== 'clinic' && s.role !== 'klinik') {
      return { ok: false, error: 'Nur Kliniken können Schichten buchen.' };
    }
    if (!payload || !payload.volunteer_id || !payload.date || !payload.shift) {
      return { ok: false, error: 'Fehlende Pflichtfelder (volunteer_id, date, shift).' };
    }
    const validShifts = ['morning', 'afternoon', 'night'];
    if (!validShifts.includes(payload.shift)) {
      return { ok: false, error: 'Ungültige Schicht.' };
    }
    const flags = Array.isArray(payload.patient_flags) ? payload.patient_flags : [];
    const room  = (payload.patient_room || '').trim() || null;
    const notes = (payload.patient_notes || '').trim() || null;
    // Station und Fallnummer stehen getrennt, weil der Einsatznachweis sie
    // getrennt ausweist. patient_room traegt nur noch die Zimmernummer.
    const station    = (payload.station || '').trim() || null;
    const fallnummer = (payload.fallnummer || '').trim() || null;
    // Direktnummer der Station: die Sitzwache braucht sie, wenn sie sich
    // verspaetet. clinics.phone ist die Zentrale und hilft dann nicht.
    const stationPhone = (payload.station_phone || '').trim().slice(0, 40) || null;

    try {
      const client = await sb();

      // Compliance wird serverseitig durch den Trigger trg_enforce_booking_compliance
      // erzwungen (Volunteer muss alle 5 Pflichtdokumente gueltig + approved haben).
      // Kein clientseitiger compliance_records-Read mehr -- Kliniken haben darauf
      // bewusst keinen Zugriff (DSGVO).

      const { data, error } = await client
        .from('bookings')
        .insert({
          volunteer_id: payload.volunteer_id,
          clinic_id: s.id,
          date: payload.date,
          shift: payload.shift,
          status: 'planned',
          station: station,
          fallnummer: fallnummer,
          station_phone: stationPhone,
          patient_room: room,
          patient_flags: flags,
          patient_notes: notes,
          patient_count: payload.patient_count === 2 ? 2 : 1
        })
        .select()
        .single();
      if (error) {
        // 23505 = unique violation → schon gebucht
        if (error.code === '23505') {
          return { ok: false, error: 'Diese Schicht ist nicht mehr verfügbar.' };
        }
        return { ok: false, error: error.message };
      }
      return { ok: true, booking: data };
    } catch(e) {
      console.error('[LPR] bookShift:', e);
      return { ok: false, error: 'Netzwerkfehler.' };
    }
  }

  // Klinik sieht eigene Buchungen mit Volunteer-Namen.
  async function getMyClinicBookings(filter) {
    const s = getSession();
    if (!s) return { ok: false, error: 'Nicht eingeloggt.', bookings: [] };
    try {
      let q = (await sb())
        .from('bookings')
        .select('id, volunteer_id, date, shift, status, station, fallnummer, patient_room, patient_flags, patient_notes, patient_count, created_at, cancelled_at, cancelled_by_user_id, cancellation_reason, station_phone, unterwegs_ts, eta_ts, profiles!bookings_volunteer_id_fkey(full_name)')
        .eq('clinic_id', s.id)
        .order('date', { ascending: false });
      if (filter && filter.status) q = q.eq('status', filter.status);
      if (filter && filter.from)   q = q.gte('date', filter.from);
      if (filter && filter.to)     q = q.lte('date', filter.to);
      const { data, error } = await q;
      if (error) return { ok: false, error: error.message, bookings: [] };
      const bookings = (data || []).map(b => ({
        id: b.id,
        volunteer_id: b.volunteer_id,
        volunteer_name: b.profiles && b.profiles.full_name || '—',
        date: b.date,
        shift: b.shift,
        status: b.status,
        station: b.station,
        fallnummer: b.fallnummer,
        patient_room: b.patient_room,
        patient_flags: b.patient_flags || [],
        patient_notes: b.patient_notes,
        patient_count: b.patient_count || 1,
        created_at: b.created_at,
        cancelled_at: b.cancelled_at,
        cancelled_by_user_id: b.cancelled_by_user_id,
        cancellation_reason: b.cancellation_reason,
        station_phone: b.station_phone,
        unterwegs_ts: b.unterwegs_ts,
        eta_ts: b.eta_ts
      }));
      return { ok: true, bookings };
    } catch(e) {
      console.error('[LPR] getMyClinicBookings:', e);
      return { ok: false, error: 'Netzwerkfehler.', bookings: [] };
    }
  }

  // Klinik storniert eine eigene Buchung (nur planned, nicht completed).
  // Begründung ist Pflicht und wird — wie bei der Volunteer-Variante — samt
  // Metadaten protokolliert. Die kostenpflichtige Kurzfrist-Markierung
  // (late_cancellation) folgt mit AP2 (DB-Migration).
  async function cancelClinicBooking(bookingId, reason) {
    const s = getSession();
    if (!s) return { ok: false, error: 'Nicht eingeloggt.' };
    const r = (reason || '').trim();
    if (r.length < 10) return { ok: false, error: 'Bitte eine kurze Begründung angeben (min. 10 Zeichen).' };
    try {
      const client = await sb();
      const { data, error } = await client
        .from('bookings')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancelled_by_user_id: s.id,
          cancellation_reason: r
        })
        .eq('id', bookingId)
        .eq('clinic_id', s.id)
        // 'confirmed' gehoert dazu: die Bestaetigung der Sitzwache darf eine
        // Buchung nicht unstornierbar machen. Nur abgeschlossene und bereits
        // stornierte Dienste sind zu.
        .in('status', ['planned', 'confirmed'])
        .select()
        .single();
      if (error) return { ok: false, error: error.message };
      if (!data)  return { ok: false, error: 'Buchung nicht gefunden oder nicht stornierbar.' };
      return { ok: true, booking: data };
    } catch(e) {
      console.error('[LPR] cancelClinicBooking:', e);
      return { ok: false, error: 'Netzwerkfehler.' };
    }
  }

  // Volunteer storniert eigene Klinik-Buchung mit Begründung
  async function cancelMyClinicBooking(bookingId, reason) {
    const s = getSession();
    if (!s) return { ok: false, error: 'Nicht eingeloggt.' };
    const r = (reason || '').trim();
    if (r.length < 10) return { ok: false, error: 'Bitte eine kurze Begründung angeben (min. 10 Zeichen).' };
    try {
      const client = await sb();
      const { data, error } = await client
        .from('bookings')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancelled_by_user_id: s.id,
          cancellation_reason: r
        })
        .eq('id', bookingId)
        .eq('volunteer_id', s.id)
        // siehe cancelClinicBooking: bestaetigt heisst nicht unwiderruflich.
        .in('status', ['planned', 'confirmed'])
        .select()
        .single();
      if (error)  return { ok: false, error: error.message };
      if (!data)  return { ok: false, error: 'Buchung nicht gefunden oder nicht stornierbar.' };
      return { ok: true, booking: data };
    } catch(e) {
      console.error('[LPR] cancelMyClinicBooking:', e);
      return { ok: false, error: 'Netzwerkfehler.' };
    }
  }

  // Ehrenamtliche:r bestätigt eigenen Einsatz (planned -> confirmed) via RPC.
  async function confirmMyBooking(bookingId) {
    const s = getSession();
    if (!s) return { ok: false, error: 'Nicht eingeloggt.' };
    try {
      const client = await sb();
      const { data, error } = await client.rpc('confirm_my_booking', { p_booking_id: bookingId });
      if (error) return { ok: false, error: error.message };
      return { ok: true, booking: Array.isArray(data) ? data[0] : data };
    } catch(e) {
      console.error('[LPR] confirmMyBooking:', e);
      return { ok: false, error: 'Netzwerkfehler.' };
    }
  }

  /**
   * Sitzwache meldet: "Ich bin unterwegs, ca. X Minuten."
   *
   * Setzt unterwegs_ts/eta_ts und bestaetigt eine noch offene Buchung gleich
   * mit (siehe RPC set_my_unterwegs). Die Ankunftszeit rechnet die Datenbank
   * aus — die Uhr des Telefons entscheidet nicht, was auf dem Stationsmonitor
   * steht.
   */
  async function setUnterwegs(bookingId, minuten) {
    const s = getSession();
    if (!s) return { ok: false, error: 'Nicht eingeloggt.' };
    const m = Number(minuten);
    if (!Number.isFinite(m) || m < 0 || m > 240) {
      return { ok: false, error: 'Bitte eine Ankunft zwischen 0 und 240 Minuten wählen.' };
    }
    try {
      const client = await sb();
      const { data, error } = await client.rpc('set_my_unterwegs', {
        p_booking_id: bookingId,
        p_eta_minuten: Math.round(m)
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true, booking: Array.isArray(data) ? data[0] : data };
    } catch(e) {
      console.error('[LPR] setUnterwegs:', e);
      return { ok: false, error: 'Netzwerkfehler.' };
    }
  }

  /**
   * Wie steht es um die Anreise? Eine Stelle fuer alle drei Ansichten
   * (Sitzwache, Klinik, Vorstand), damit dieselbe Buchung ueberall dasselbe
   * sagt. Gibt null zurueck, solange nichts gemeldet ist.
   *
   * einsatzInfo ist optional — liegt sie vor und laeuft der Einsatz schon,
   * zaehlt die Ankunft nicht mehr, sondern die Anwesenheit.
   */
  function anreiseStatus(booking, einsatzInfo) {
    if (!booking) return null;
    const uhr = ts => new Date(ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    if (einsatzInfo && einsatzInfo.einsatz_status === 'laufend') {
      return {
        art: 'vor_ort',
        text: einsatzInfo.beginn_ts ? 'Vor Ort seit ' + uhr(einsatzInfo.beginn_ts) + ' Uhr' : 'Vor Ort'
      };
    }
    if (!booking.unterwegs_ts) return null;
    const eta = booking.eta_ts ? new Date(booking.eta_ts) : null;
    if (!eta) return { art: 'unterwegs', text: 'Unterwegs' };
    const ueberfaellig = eta.getTime() < Date.now();
    return {
      art: ueberfaellig ? 'ueberfaellig' : 'unterwegs',
      text: (ueberfaellig ? 'Unterwegs · angekündigt war ' : 'Unterwegs · Ankunft ca. ')
            + uhr(eta) + ' Uhr',
      eta_uhr: uhr(eta),
      gemeldet_um: uhr(booking.unterwegs_ts)
    };
  }

  // ═══════════════════════════════════════════════════════
  // WEB PUSH
  //
  // Der oeffentliche VAPID-Schluessel darf im Quelltext stehen — er ist die
  // Ausweisseite des Absenders, nicht das Geheimnis. Der private Teil liegt
  // als Secret bei der Edge Function und nirgends sonst.
  // ═══════════════════════════════════════════════════════

  const VAPID_PUBLIC = 'BMPiIF3_RZoOXkBVVPO2vWIStrAe5DgPalPcyyjJc4fq4aZ4hykwRkbH8cdSvxHeBhDamJcqQcy4xLOW4R80tNY';

  /** base64url → Uint8Array; so will es subscribe(). */
  function vapidBytes(b64) {
    const pad = '='.repeat((4 - (b64.length % 4)) % 4);
    const roh = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    const arr = new Uint8Array(roh.length);
    for (let i = 0; i < roh.length; i++) arr[i] = roh.charCodeAt(i);
    return arr;
  }

  function istIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
           (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }
  function alsAppGestartet() {
    return window.navigator.standalone === true ||
           window.matchMedia('(display-mode: standalone)').matches;
  }

  /**
   * Geht Push auf diesem Geraet ueberhaupt — und wenn nicht, warum?
   *
   * Der Grund ist wichtiger als das Ja/Nein: auf dem iPhone fehlt Push nicht,
   * es ist nur an eine Bedingung geknuepft, die man erklaeren muss. "Wird
   * nicht unterstuetzt" waere dort schlicht falsch.
   */
  function pushMoeglich() {
    if (!('serviceWorker' in navigator)) {
      return { moeglich: false, grund: 'Dieser Browser kann keine Benachrichtigungen empfangen.' };
    }
    if (!('PushManager' in window) || !('Notification' in window)) {
      if (istIOS() && !alsAppGestartet()) {
        return {
          moeglich: false,
          grund: 'Auf dem iPhone und iPad gehen Mitteilungen nur, wenn die Seite auf dem Home-Bildschirm liegt: '
               + 'unten auf „Teilen" tippen, dann „Zum Home-Bildschirm". Danach die App von dort öffnen.',
          ios: true
        };
      }
      return { moeglich: false, grund: 'Dieser Browser kann keine Benachrichtigungen empfangen.' };
    }
    return { moeglich: true, grund: '' };
  }

  /** Was ist der aktuelle Stand auf diesem Geraet? */
  async function pushStatus() {
    const m = pushMoeglich();
    if (!m.moeglich) return { ok: true, moeglich: false, aktiv: false, erlaubnis: 'nicht_moeglich', grund: m.grund, ios: !!m.ios };
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const abo = reg ? await reg.pushManager.getSubscription() : null;
      return { ok: true, moeglich: true, aktiv: !!abo, erlaubnis: Notification.permission, grund: '' };
    } catch(e) {
      console.error('[LPR] pushStatus:', e);
      return { ok: false, moeglich: true, aktiv: false, erlaubnis: 'unbekannt', grund: 'Status nicht lesbar.' };
    }
  }

  /** Kurzer Klartext-Name, damit man in der Abo-Liste sein Geraet wiedererkennt. */
  function geraeteName() {
    const ua = navigator.userAgent;
    const geraet = /iPhone/.test(ua) ? 'iPhone'
                 : /iPad/.test(ua) ? 'iPad'
                 : /Android/.test(ua) ? 'Android'
                 : /Macintosh/.test(ua) ? 'Mac'
                 : /Windows/.test(ua) ? 'Windows' : 'Gerät';
    const browser = /Edg\//.test(ua) ? 'Edge'
                  : /Chrome\//.test(ua) ? 'Chrome'
                  : /Firefox\//.test(ua) ? 'Firefox'
                  : /Safari\//.test(ua) ? 'Safari' : 'Browser';
    return geraet + ' · ' + browser;
  }

  /**
   * Mitteilungen einschalten.
   *
   * Die Erlaubnisfrage des Browsers darf NUR aus einem Klick heraus kommen —
   * ungefragt beim Seitenaufruf ist sie in jedem Browser eine schlechte
   * Erfahrung und in manchen gleich dauerhaft gesperrt. Diese Funktion gehoert
   * deshalb an einen Knopf, nicht in den Start der Seite.
   */
  async function pushAnmelden() {
    const s = getSession();
    if (!s) return { ok: false, error: 'Nicht eingeloggt.' };
    const m = pushMoeglich();
    if (!m.moeglich) return { ok: false, error: m.grund, ios: !!m.ios };

    try {
      const erlaubnis = await Notification.requestPermission();
      if (erlaubnis !== 'granted') {
        return { ok: false, error: erlaubnis === 'denied'
          ? 'Der Browser blockiert Mitteilungen für diese Seite. Das lässt sich nur in den Browser-Einstellungen wieder freigeben.'
          : 'Ohne Erlaubnis können wir nichts schicken.' };
      }

      const reg = await navigator.serviceWorker.register('sw.js');
      await navigator.serviceWorker.ready;

      // Ein vorhandenes Abo weiterverwenden; nur wenn es zu einem anderen
      // Schluessel gehoert, muss es weg — sonst kommt beim Zustellen ein
      // Fehler, den man dem Geraet nicht ansieht.
      let abo = await reg.pushManager.getSubscription();
      if (abo) {
        const alt = abo.options && abo.options.applicationServerKey;
        const gleich = alt && new Uint8Array(alt).every((b, i) => b === vapidBytes(VAPID_PUBLIC)[i]);
        if (!gleich) { await abo.unsubscribe(); abo = null; }
      }
      if (!abo) {
        abo = await reg.pushManager.subscribe({
          userVisibleOnly: true,           // ohne sichtbare Meldung geht es nicht — und soll es auch nicht
          applicationServerKey: vapidBytes(VAPID_PUBLIC)
        });
      }

      const j = abo.toJSON();
      const client = await sb();
      const { error } = await client.rpc('push_abo_speichern', {
        p_endpoint: abo.endpoint,
        p_p256dh:   j.keys && j.keys.p256dh,
        p_auth:     j.keys && j.keys.auth,
        p_geraet:   geraeteName()
      });
      if (error) return { ok: false, error: error.message };

      return { ok: true, geraet: geraeteName() };
    } catch(e) {
      console.error('[LPR] pushAnmelden:', e);
      return { ok: false, error: 'Einschalten fehlgeschlagen: ' + (e && e.message ? e.message : 'unbekannt') };
    }
  }

  /** Mitteilungen auf diesem Geraet abschalten — Abo weg, Zeile weg. */
  async function pushAbmelden() {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const abo = reg ? await reg.pushManager.getSubscription() : null;
      if (!abo) return { ok: true };
      const endpoint = abo.endpoint;
      await abo.unsubscribe();
      const client = await sb();
      // Die Zeile loeschen, nicht nur das Abo: sonst schickt der Server
      // weiter an eine tote Adresse und haelt sie fuer erreichbar.
      const { error } = await client.from('push_abos').delete().eq('endpoint', endpoint);
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    } catch(e) {
      console.error('[LPR] pushAbmelden:', e);
      return { ok: false, error: 'Abschalten fehlgeschlagen.' };
    }
  }

  // ───────────────────────────────────────────────────────
  // AP2 — Vorstand: Sitzwachen Abschluss-/Auszahlungsworkflow
  // Lesen direkt via board-RLS (bookings/claims: is_board()),
  // Statusänderungen ausschließlich über SECURITY-DEFINER-RPCs.
  // ───────────────────────────────────────────────────────

  // Alle Buchungen (board) inkl. aufgelöster Namen. Klinikname kanonisch aus
  // clinic_details.clinic_name (NICHT profiles.full_name = Ansprechperson!).
  async function adminListBookings(fromDate, toDate) {
    const s = getSession();
    if (!s) return { ok: false, error: 'Nicht eingeloggt.', bookings: [] };
    try {
      const client = await sb();
      let q = client.from('bookings')
        .select('id, volunteer_id, clinic_id, date, shift, hours, compensation_eur, status, completed_at, late_cancellation, patient_room, patient_flags, patient_notes, patient_count, cancellation_reason, cancelled_at, cancelled_by_user_id')
        .order('date', { ascending: false });
      if (fromDate) q = q.gte('date', fromDate);
      if (toDate)   q = q.lte('date', toDate);
      const { data: bks, error } = await q;
      if (error) return { ok: false, error: error.message, bookings: [] };
      const rows = bks || [];
      const volIds = [...new Set(rows.map(b => b.volunteer_id).filter(Boolean))];
      const cliIds = [...new Set(rows.map(b => b.clinic_id).filter(Boolean))];
      const [profRes, cdRes] = await Promise.all([
        volIds.length ? client.from('profiles').select('id, full_name').in('id', volIds) : Promise.resolve({ data: [] }),
        cliIds.length ? client.from('clinic_details').select('id, clinic_name').in('id', cliIds) : Promise.resolve({ data: [] })
      ]);
      const volMap = {}; (profRes.data || []).forEach(p => { volMap[p.id] = p.full_name; });
      const cliMap = {}; (cdRes.data  || []).forEach(c => { cliMap[c.id] = c.clinic_name; });
      return { ok: true, bookings: rows.map(b => ({
        ...b,
        volunteer_name: volMap[b.volunteer_id] || '—',
        clinic_name:    cliMap[b.clinic_id]    || '—'
      })) };
    } catch(e) {
      console.error('[LPR] adminListBookings:', e);
      return { ok: false, error: 'Netzwerkfehler.', bookings: [] };
    }
  }

  // Alle Anträge (board) inkl. Antragsteller-Name.
  async function adminListClaims() {
    const s = getSession();
    if (!s) return { ok: false, error: 'Nicht eingeloggt.', claims: [] };
    try {
      const client = await sb();
      const { data, error } = await client.from('claims')
        .select('id, user_id, source_type, booking_id, amount, status, submitted_at, approved_at, paid_at, pauschale_art, beleg_nr, notes, rejected_reason, submitted_to_payroll_at, intake_mail_at, payout_mail_at, kind, auslage_art, nachweis_pfad, mitfahrer_ids')
        .order('submitted_at', { ascending: false, nullsFirst: false });
      if (error) return { ok: false, error: error.message, claims: [] };
      const rows = data || [];
      const uids = [...new Set(rows.map(c => c.user_id).filter(Boolean))];
      const profRes = uids.length ? await client.from('profiles').select('id, full_name').in('id', uids) : { data: [] };
      const nameMap = {}; (profRes.data || []).forEach(p => { nameMap[p.id] = p.full_name; });
      return { ok: true, claims: rows.map(c => ({ ...c, user_name: nameMap[c.user_id] || '—' })) };
    } catch(e) {
      console.error('[LPR] adminListClaims:', e);
      return { ok: false, error: 'Netzwerkfehler.', claims: [] };
    }
  }

  // Zu einer Menge von Buchungen: welche Antraege (claims) haengen daran?
  // Fuer admin-sitzwachen.html, damit dort je Dienst sichtbar ist, ob schon
  // abgerechnet wurde — bearbeitet wird ausschliesslich in
  // admin-auszahlungen.html, sonst gaebe es zwei Wahrheiten darueber, ob ein
  // Antrag freigegeben ist. Eine Abfrage fuer alle IDs statt eine je Zeile.
  async function adminClaimsFuerBuchungen(bookingIds) {
    const s = getSession();
    if (!s || s.role !== 'admin') return { ok: false, error: 'Nur für den Vorstand.', claims: [] };
    const ids = (bookingIds || []).filter(Boolean);
    if (!ids.length) return { ok: true, claims: [] };
    try {
      const { data, error } = await (await sb())
        .from('claims')
        .select('id, booking_id, status, amount, paid_at, beleg_nr')
        .in('booking_id', ids);
      if (error) return { ok: false, error: error.message, claims: [] };
      return { ok: true, claims: data || [] };
    } catch(e) {
      console.error('[LPR] adminClaimsFuerBuchungen:', e);
      return { ok: false, error: 'Netzwerkfehler.', claims: [] };
    }
  }

  // Zu einer Menge von Anmeldungen (trip_signups): welche Auslagen (claims mit
  // kind='auslage') haengen daran? Fuer admin-reisen.html, damit dort je
  // Anmeldung sichtbar ist, was zusaetzlich zur Pauschale erfasst wurde — die
  // Pauschalen-Uebersicht (admin_pauschale_overview) zaehlt Auslagen bewusst
  // NICHT mit, weil sie nicht gegen den Uebungsleiterfreibetrag laufen (§ 3
  // Nr. 50 statt § 3 Nr. 26 EStG). Bearbeitet wird ausschliesslich in
  // admin-auszahlungen.html. Eine Abfrage fuer alle IDs statt eine je Zeile.
  async function adminAuslagenFuerAnmeldungen(signupIds) {
    const s = getSession();
    if (!s || s.role !== 'admin') return { ok: false, error: 'Nur für den Vorstand.', claims: [] };
    const ids = (signupIds || []).filter(Boolean);
    if (!ids.length) return { ok: true, claims: [] };
    try {
      const { data, error } = await (await sb())
        .from('claims')
        .select('id, trip_signup_id, status, amount, paid_at')
        .eq('kind', 'auslage')
        .in('trip_signup_id', ids);
      if (error) return { ok: false, error: error.message, claims: [] };
      return { ok: true, claims: data || [] };
    } catch(e) {
      console.error('[LPR] adminAuslagenFuerAnmeldungen:', e);
      return { ok: false, error: 'Netzwerkfehler.', claims: [] };
    }
  }

  // Holt den eingefrorenen Auszahlungsbeleg eines einzelnen Antrags. Bewusst
  // nicht in adminListClaims mitgeladen: das Dokument ist mehrere Kilobyte gross
  // und wird nur beim Hinsehen gebraucht.
  async function getClaimBeleg(claimId) {
    const s = getSession();
    if (!s || s.role !== 'admin') return { ok: false, error: 'Nur für den Vorstand.' };
    try {
      const { data, error } = await (await sb())
        .from('claims').select('id, beleg_nr, beleg_html, status').eq('id', claimId).maybeSingle();
      if (error) return { ok: false, error: error.message };
      if (!data) return { ok: false, error: 'Antrag nicht gefunden.' };
      return { ok: true, claim: data };
    } catch(e) {
      console.error('[LPR] getClaimBeleg:', e);
      return { ok: false, error: 'Netzwerkfehler.' };
    }
  }

  function _rpcRow(data) { return Array.isArray(data) ? data[0] : data; }

  async function adminSetBookingStatus(bookingId, status, hours, completedAt) {
    try {
      const client = await sb();
      const { data, error } = await client.rpc('admin_set_booking_status', {
        p_booking_id: bookingId, p_status: status,
        p_hours: (hours ?? null), p_completed_at: (completedAt ?? null)
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true, booking: _rpcRow(data) };
    } catch(e) {
      console.error('[LPR] adminSetBookingStatus:', e);
      return { ok: false, error: 'Netzwerkfehler.' };
    }
  }

  async function adminSetClaimStatus(claimId, status, reason) {
    try {
      const client = await sb();
      const { data, error } = await client.rpc('admin_set_claim_status', {
        p_claim_id: claimId, p_status: status, p_reason: (reason || null)
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true, claim: _rpcRow(data) };
    } catch(e) {
      console.error('[LPR] adminSetClaimStatus:', e);
      return { ok: false, error: 'Netzwerkfehler.' };
    }
  }

  // Ruft claim-mails direkt auf, mit force: die Function ueberspringt dann den
  // gesetzten Zeitstempel. Fuer den Fall, dass ein Versand still gescheitert ist.
  async function resendClaimMail(claimId) {
    const s = getSession();
    if (!s || s.role !== 'admin') return { ok: false, error: 'Nur für den Vorstand.' };
    try {
      const { data, error } = await (await sb())
        .functions.invoke('claim-mails', { body: { claim_id: claimId, force: true } });
      if (error) return { ok: false, error: error.message };
      // Die Function antwortet bewusst IMMER mit 200 (sonst wiederholt der
      // Webhook und die Mail geht doppelt raus). Der Erfolg steht deshalb im
      // Rumpf: ok=false plus fehler. Wer nur auf data.error prueft, meldet
      // "verschickt", wo nichts rausging.
      if (data && data.ok === false) return { ok: false, error: data.fehler || data.error || 'Versand fehlgeschlagen.' };
      if (data && data.error) return { ok: false, error: data.error };
      const raus = (data && data.sent) || [];
      if (!raus.length) return { ok: false, error: data && data.hinweis ? data.hinweis : 'Zu diesem Antrag war nichts zu verschicken.' };
      return { ok: true, sent: raus };
    } catch(e) {
      console.error('[LPR] resendClaimMail:', e);
      return { ok: false, error: 'Netzwerkfehler.' };
    }
  }

  /**
   * Vorstand: erfasst eine Auslage (§ 3 Nr. 50 EStG) für ein Mitglied.
   *
   * Der Antrag entsteht direkt als 'approved' und nicht als 'submitted': der
   * Vorstand trägt hier nur ein, was er ohnehin genehmigt hätte — eine
   * anschließende Freigabe wäre dieselbe Person am selben Vorgang. Die
   * Zahlungsanweisung an finanzen@ folgt automatisch über den Webhook, genau
   * wie bei einer freigegebenen Pauschale.
   *
   * pauschale_art bleibt leer. Eine Auslage hat keine — der Freibetragsfilter
   * in der Vorstandsliste und der Beleg verlassen sich darauf, dass kind und
   * pauschale_art nicht gleichzeitig gesetzt sind.
   *
   * Gerechnet wird im Dialog (admin-sitzwachen.html), hier wird geschrieben.
   * Nachgeschlagen werden trotzdem user_id, Anmeldestatus und Reisezeitraum:
   * die kommen aus der Datenbank statt aus dem Formular, damit ein Antrag
   * nicht an einer unbestätigten oder fremden Anmeldung landet.
   *
   * payload: { trip_signup_id, auslage_art, amount_cents, amount_breakdown,
   *            mitfahrer_ids, notes }
   */
  async function adminCreateAuslageClaim(payload) {
    const s = getSession();
    if (!s || s.role !== 'admin') return { ok: false, error: 'Nur für den Vorstand.' };
    const p = payload || {};
    if (p.auslage_art !== 'anreise' && p.auslage_art !== 'beleg') {
      return { ok: false, error: 'Unbekannte Art der Auslage.' };
    }
    if (!p.trip_signup_id) return { ok: false, error: 'Bitte eine Person mit bestätigter Anmeldung auswählen.' };
    const cents = Math.round(Number(p.amount_cents));
    if (!Number.isFinite(cents) || cents <= 0) return { ok: false, error: 'Betrag fehlt oder ist ungültig.' };
    try {
      const client = await sb();
      // claims_source_chk verlangt zu source_type='trip' eine Anmeldung —
      // deshalb hängt auch eine Auslage immer an einem trip_signup, und nur an
      // einem bestätigten: wer nicht mitgefahren ist, hatte keine Anreise.
      const { data: signup, error: suErr } = await client
        .from('trip_signups')
        .select('id, user_id, status, trips(start_date, end_date)')
        .eq('id', p.trip_signup_id)
        .maybeSingle();
      if (suErr) return { ok: false, error: 'Anmeldung konnte nicht geladen werden: ' + suErr.message };
      if (!signup) return { ok: false, error: 'Anmeldung nicht gefunden.' };
      if (signup.status !== 'confirmed') {
        return { ok: false, error: 'Die Anmeldung ist nicht bestätigt (Status: ' + signup.status + ').' };
      }
      const trip = signup.trips || {};
      const jetzt = new Date().toISOString();
      const mitfahrer = Array.isArray(p.mitfahrer_ids) ? p.mitfahrer_ids.filter(Boolean) : [];
      const { data: claim, error: insErr } = await client
        .from('claims')
        .insert({
          user_id: signup.user_id,
          kind: 'auslage',
          auslage_art: p.auslage_art,
          source_type: 'trip',
          trip_signup_id: signup.id,
          // claims.amount steht in Euro, gerechnet wird im Dialog in Cent.
          amount: cents / 100,
          amount_breakdown: Array.isArray(p.amount_breakdown) ? p.amount_breakdown : [],
          period_start: trip.start_date || null,
          period_end: trip.end_date || null,
          status: 'approved',
          // Ohne submitted_at stünde der Antrag in der nach Eingang sortierten
          // Vorstandsliste ganz unten und ohne Datum.
          submitted_at: jetzt,
          approved_at: jetzt,
          pauschale_art: null,
          mitfahrer_ids: (p.auslage_art === 'anreise' && mitfahrer.length) ? mitfahrer : null,
          notes: (p.notes || '').trim() || null
        })
        .select()
        .single();
      if (insErr) return { ok: false, error: 'Auslage konnte nicht gespeichert werden: ' + insErr.message };
      return { ok: true, claim };
    } catch(e) {
      console.error('[LPR] adminCreateAuslageClaim:', e);
      return { ok: false, error: 'Netzwerkfehler.' };
    }
  }

  async function adminSetSitzRate(shift, amount, effectiveFrom, beschluss) {
    try {
      const client = await sb();
      const { data, error } = await client.rpc('admin_set_sitz_rate', {
        p_shift: shift, p_amount: amount,
        p_effective_from: effectiveFrom, p_beschluss: (beschluss || null)
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true, rate: _rpcRow(data) };
    } catch(e) {
      console.error('[LPR] adminSetSitzRate:', e);
      return { ok: false, error: 'Netzwerkfehler.' };
    }
  }

  // ── Fördermittel-Cockpit ────────────────────────────────────────────────
  // Alle drei Tabellen sind board-only per RLS. Ein Nicht-Board bekommt keine
  // Fehlermeldung, sondern eine leere Liste — die Seite prüft deshalb zusätzlich
  // die Rolle, damit der Unterschied zwischen "leer" und "kein Zugriff" sichtbar ist.
  // Rückgabe: null = Fehler, [] = nichts vorhanden.

  async function foerderListProgramme() {
    try {
      const { data, error } = await (await sb())
        .from('foerder_programme')
        .select('*')
        .order('sortierung', { ascending: true })
        .order('programm', { ascending: true });
      if (error) { console.error('[LPR] foerderListProgramme:', error); return null; }
      return data || [];
    } catch(e) { console.error('[LPR] foerderListProgramme failed:', e); return null; }
  }

  async function foerderListAufgaben() {
    try {
      const { data, error } = await (await sb())
        .from('foerder_aufgaben')
        .select('*')
        .order('faellig_am', { ascending: true, nullsFirst: false })
        .order('sortierung', { ascending: true });
      if (error) { console.error('[LPR] foerderListAufgaben:', error); return null; }
      return data || [];
    } catch(e) { console.error('[LPR] foerderListAufgaben failed:', e); return null; }
  }

  async function foerderListNotizen(programmId) {
    try {
      const { data, error } = await (await sb())
        .from('foerder_notizen')
        .select('*')
        .eq('programm_id', programmId)
        .order('created_at', { ascending: false });
      if (error) { console.error('[LPR] foerderListNotizen:', error); return null; }
      return data || [];
    } catch(e) { console.error('[LPR] foerderListNotizen failed:', e); return null; }
  }

  // created_by setzt die Datenbank per default auth.uid() — der Client schickt es
  // bewusst nicht mit, sonst koennte er bestimmen, wer etwas angelegt hat.
  async function foerderCreateAufgabe(felder) {
    try {
      const { data, error } = await (await sb())
        .from('foerder_aufgaben')
        .insert({
          programm_id: felder.programm_id || null,
          titel: felder.titel,
          beschreibung: felder.beschreibung || null,
          status: felder.status || 'offen',
          faellig_am: felder.faellig_am || null,
          zustaendig: felder.zustaendig || null
        })
        .select()
        .single();
      if (error) { console.error('[LPR] foerderCreateAufgabe:', error); return null; }
      return data;
    } catch(e) { console.error('[LPR] foerderCreateAufgabe failed:', e); return null; }
  }

  // Nur die Felder, die im Portal geändert werden dürfen. repo_key, programm_id
  // und die Zeitstempel sind bewusst nicht dabei — sie gehören dem Sync bzw. dem Trigger.
  async function foerderUpdateAufgabe(id, felder) {
    const erlaubt = {};
    for (const k of ['titel','beschreibung','status','faellig_am','zustaendig']) {
      if (k in felder) erlaubt[k] = felder[k];
    }
    try {
      const { data, error } = await (await sb())
        .from('foerder_aufgaben').update(erlaubt).eq('id', id).select().single();
      if (error) { console.error('[LPR] foerderUpdateAufgabe:', error); return null; }
      return data;
    } catch(e) { console.error('[LPR] foerderUpdateAufgabe failed:', e); return null; }
  }

  async function foerderCreateNotiz(programmId, text) {
    try {
      const { data, error } = await (await sb())
        .from('foerder_notizen')
        .insert({ programm_id: programmId, text })
        .select().single();
      if (error) { console.error('[LPR] foerderCreateNotiz:', error); return null; }
      return data;
    } catch(e) { console.error('[LPR] foerderCreateNotiz failed:', e); return null; }
  }

  // Für die Anzeige von "erledigt von" — Board darf profiles lesen (wie admin-mitwirkende).
  // Mit ids wird nur nach den tatsächlich gebrauchten Namen gefragt, statt die
  // ganze Mitgliederliste zu holen; ohne ids bleibt das alte Verhalten.
  async function foerderNamen(ids) {
    try {
      if (Array.isArray(ids)) {
        const gesucht = [...new Set(ids.filter(Boolean))];
        if (!gesucht.length) return {};
        const { data, error } = await (await sb())
          .from('profiles').select('id, full_name').in('id', gesucht);
        if (error) { console.error('[LPR] foerderNamen:', error); return {}; }
        return Object.fromEntries((data || []).map(p => [p.id, p.full_name || '—']));
      }
      const { data, error } = await (await sb()).from('profiles').select('id, full_name');
      if (error) { console.error('[LPR] foerderNamen:', error); return {}; }
      return Object.fromEntries((data || []).map(p => [p.id, p.full_name || '—']));
    } catch(e) { console.error('[LPR] foerderNamen failed:', e); return {}; }
  }

  // ── Block D: Rechnungsstellung ─────────────────────────────────────────
  // Wahrheitsquelle fuer Nummern und Summen ist die Datenbank (issue_invoice).
  // Im Browser wird nur zur Anzeige gerechnet.

  const VEREIN = {
    name:         'Leben Pflegen Reisen e.V.',
    strasse:      'Stephanstr. 46',
    ort:          '10559 Berlin',
    register:     'Amtsgericht Charlottenburg, VR 42682 B',
    // Zugeteilt am 20.07.2026 vom Finanzamt fuer Koerperschaften I Berlin.
    // § 14 UStG verlangt Steuernummer oder USt-IdNr.; letztere hat der Verein
    // nicht, deshalb steht diese Nummer auf jeder Rechnung.
    steuernummer: '27/671/51395',
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
  //
  // Ein Punkt ist hier normalerweise der Tausendertrenner. ABER: Ein Punkt ohne
  // Komma, der auf genau zwei Ziffern endet, ist in der Praxis ein
  // Dezimalpunkt -- so kommen Betraege aus Mails, Tabellen und englischen
  // Oberflaechen. Ohne diese Ausnahme wurde aus '19.90' der Betrag 1.990 EUR,
  // und zwar still: auf einer Rechnung an eine Klinik das Hundertfache.
  // '1.234' bleibt dagegen 1.234 EUR (drei Ziffern), '1.234,56' ebenfalls,
  // weil dort ein Komma steht.
  function eurToCents(v) {
    if (typeof v === 'number') return Math.round(v * 100);
    let roh = String(v ?? '').trim();
    if (!roh.includes(',') && /\.\d{2}$/.test(roh) && (roh.match(/\./g) || []).length === 1) {
      roh = roh.replace('.', ',');
    }
    const s = roh.replace(/\./g, '').replace(',', '.').replace(/[^\d.\-]/g, '');
    if (!s) return 0;
    return Math.round((parseFloat(s) || 0) * 100);
  }

  // Menge ist numeric(10,2) und wird deutsch getippt: '1,5' muss 1.5 werden.
  // Number('1,5') ist NaN und landete als stille 0 auf der Rechnung.
  function qtyToNumber(v) { return typeof v === 'number' ? v : eurToCents(v) / 100; }

  // Wandelt die Euro-Eingabe des Vergleichspreises (trips.anreise_vergleich_cents)
  // in Cent um. Anders als eurToCents() selbst, die bei leerer oder kaputter
  // Eingabe still 0 liefert, MUSS dieses Feld "leer" strikt von "0 Euro"
  // unterscheiden: leer heißt "für diese Reise ist keine Auto-Anreisepauschale
  // hinterlegt", während 0 Euro fälschlich eine Erstattung von 0 EUR
  // rechtfertigen würde. Ungültige Eingaben werden abgewiesen statt still zu
  // 0 zu werden.
  // Rückgabe: { ok:true, cents:number|null } oder { ok:false, error:string }
  function parseVergleichspreisCents(v) {
    const s = String(v ?? '').trim();
    if (!s) return { ok: true, cents: null };
    // eurToCents() behandelt '.' immer als Tausendertrenner (deutsches Format).
    // Für dieses Feld sollen aber auch einfache Eingaben mit Punkt als
    // Dezimaltrenner funktionieren (z. B. aus Copy-Paste), deshalb hier erst
    // prüfen/normalisieren, bevor eurToCents() genutzt wird.
    if (!/^\d{1,6}([.,]\d{1,2})?$/.test(s)) {
      return { ok: false, error: 'Vergleichspreis ungültig. Bitte z. B. "25" oder "25,00" eingeben.' };
    }
    const cents = eurToCents(s.replace('.', ','));
    if (!Number.isFinite(cents) || cents <= 0) {
      return { ok: false, error: 'Vergleichspreis ungültig.' };
    }
    return { ok: true, cents };
  }

  function itemAmountCents(quantity, unitPriceCents) {
    return Math.round((qtyToNumber(quantity) || 0) * (Number(unitPriceCents) || 0));
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

  // PostgREST liefert nur, was hier steht. Fehlt eine Spalte, ist sie im Browser
  // still undefined — der Beleg druckt sie dann nie, ohne dass etwas meckert.
  const INVOICE_COLS_BASIS = 'id, invoice_no, status, recipient_id, recipient_snapshot, invoice_date, ' +
    'service_from, service_to, due_date, tax_mode, tax_rate, tax_note, intro_text, ' +
    'subtotal_cents, tax_cents, total_cents, care_share_cents, paid_on, ' +
    'cancels_invoice_id, cancelled_by_invoice_id, created_at, issued_at';

  // Felder aus der Migration vom 23.08.2026 (Betreff, Kostenvoranschlag,
  // Begleitschreiben). Sie stehen getrennt, weil sie fehlen koennen — siehe
  // unten.
  const INVOICE_COLS_BRIEF = 'betreff, kv_datum, mit_brief, brief';

  /* ── WARUM DIESE KLAMMER ──────────────────────────────────────────────────
     Die Datenbank wird von Hand im Dashboard migriert, das Frontend geht beim
     Push automatisch live. Zwischen beidem liegen im besten Fall Minuten. In
     dieser Zeit fragt eine neue app.js Spalten ab, die es noch nicht gibt —
     PostgREST antwortet dann mit 42703 und JEDE Rechnungsseite bleibt leer,
     auch die Uebersicht.

     Deshalb wird die erste Abfrage mit den neuen Spalten versucht; scheitert
     sie an einer fehlenden Spalte, merkt sich das Modul das und arbeitet ohne
     sie weiter. Fehlen tun dann nur die neuen Felder, nicht die Rechnungen.
     Nach der Migration genuegt ein Neuladen.

     `null` heisst: noch nicht geprueft. */
  let _hatBriefFelder = null;

  function invoiceCols() {
    return _hatBriefFelder === false
      ? INVOICE_COLS_BASIS
      : INVOICE_COLS_BASIS + ', ' + INVOICE_COLS_BRIEF;
  }

  const ITEM_COLS_BASIS = 'id, pos, quantity, description, period_text, unit_price_cents, amount_cents';
  function itemCols() {
    return _hatBriefFelder === false
      ? ITEM_COLS_BASIS
      : 'id, pos, quantity, description, detail_text, nachweis_text, period_text, unit_price_cents, amount_cents';
  }

  /** Meldet PostgREST eine unbekannte Spalte? Dann fehlt die Migration. */
  function spalteFehlt(error) {
    if (!error) return false;
    return error.code === '42703' || /column .* does not exist/i.test(error.message || '');
  }

  /**
   * Fuehrt `bauen(cols)` aus und wiederholt es einmal ohne die neuen Spalten,
   * falls die Datenbank sie noch nicht kennt.
   */
  async function mitSpaltenrueckfall(bauen) {
    let res = await bauen();
    if (spalteFehlt(res.error) && _hatBriefFelder !== false) {
      console.warn('[LPR] Rechnungsfelder aus der Migration vom 23.08.2026 fehlen noch — '
                 + 'Betreff, Kostenvoranschlag und Begleitschreiben bleiben ausgeblendet.');
      _hatBriefFelder = false;
      res = await bauen();
    } else if (!res.error && _hatBriefFelder === null) {
      _hatBriefFelder = true;
    }
    return res;
  }

  /** Fuer die Oberflaeche: sind die neuen Felder benutzbar? */
  function hatBriefFelder() { return _hatBriefFelder !== false; }

  async function listInvoices(filter) {
    const f = filter || {};
    try {
      const client = await sb();
      const { data, error } = await mitSpaltenrueckfall(() => {
        let q = client
          .from('invoices')
          .select(invoiceCols() + ', billing_recipients(name)')
          .order('invoice_date', { ascending: false })
          .order('created_at', { ascending: false });
        if (f.year)        q = q.gte('invoice_date', f.year + '-01-01').lte('invoice_date', f.year + '-12-31');
        if (f.status)      q = q.eq('status', f.status);
        if (f.recipientId) q = q.eq('recipient_id', f.recipientId);
        return q;
      });
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
      // Erst die Rechnung — sie stellt fest, ob die neuen Spalten da sind. Die
      // Positionen danach, damit sie dieselbe Antwort schon kennen und nicht
      // ein zweites Mal ins Leere greifen.
      const invRes = await mitSpaltenrueckfall(() =>
        client.from('invoices').select(invoiceCols() + ', billing_recipients(*)').eq('id', id).maybeSingle());
      const itemRes = await mitSpaltenrueckfall(() =>
        client.from('invoice_items').select(itemCols())
              .eq('invoice_id', id).order('pos', { ascending: true }));
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
        .select(invoiceCols()).single();
      if (error) return { ok: false, error: error.message };
      return { ok: true, invoice: data };
    } catch(e) {
      console.error('[LPR] createInvoice:', e);
      return { ok: false, error: 'Netzwerkfehler.' };
    }
  }

  /**
   * Eine festgeschriebene Rechnung zurueck in den Entwurf.
   *
   * Die Datenbankfunktion gibt es seit dem 17.08.2026, aufgerufen hat sie bis
   * zum 23.08.2026 niemand — es fehlte schlicht der Knopf. Sie prueft selbst,
   * dass die Rechnung offen ist, im Papierkorb nicht liegt, kein Storno daran
   * haengt und dass ihre Nummer die zuletzt vergebene war; sonst bleibt nur der
   * Storno. Beim Wiederoeffnen fallen Nummer, Zahlungsziel und der eingefrorene
   * Empfaenger-Schnappschuss weg, der Zaehler geht einen Schritt zurueck.
   *
   * Gedacht ist das ausschliesslich fuer Rechnungen, die das Haus noch nicht
   * verlassen haben: dort gibt es beim Empfaenger nichts zu berichtigen.
   */
  async function reopenInvoice(id) {
    try {
      const { data, error } = await (await sb()).rpc('reopen_invoice', { p_id: id });
      if (error) return { ok: false, error: error.message };
      return { ok: true, invoice: _rpcRow(data) };
    } catch(e) {
      console.error('[LPR] reopenInvoice:', e);
      return { ok: false, error: 'Netzwerkfehler.' };
    }
  }

  async function updateInvoiceDraft(id, patch) {
    const allowed = ['recipient_id','invoice_date','service_from','service_to','due_date',
                     'tax_mode','tax_rate','tax_note','intro_text','care_share_cents']
                     // Nur mitschicken, wenn die Migration durch ist — sonst
                     // wiese PostgREST das ganze Update zurueck und der Entwurf
                     // liesse sich gar nicht mehr speichern.
                     .concat(hatBriefFelder() ? ['betreff','kv_datum','mit_brief','brief'] : []);
    const row = {};
    allowed.forEach(k => { if (patch && k in patch) row[k] = patch[k] === '' ? null : patch[k]; });
    if (!Object.keys(row).length) return { ok: true };
    try {
      const { data, error } = await (await sb())
        .from('invoices').update(row).eq('id', id).select(invoiceCols()).single();
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
        quantity:         qtyToNumber(it.quantity) || 0,
        description:      String(it.description || '').trim(),
        period_text:      it.period_text || null,
        unit_price_cents: Number(it.unit_price_cents) || 0,
        amount_cents:     itemAmountCents(it.quantity, it.unit_price_cents)
      })).filter(r => r.description);
      // Dieselbe Ruecksicht wie oben: vor der Migration kennt die Tabelle die
      // beiden Textspalten nicht, und ein Insert damit schluege komplett fehl.
      if (hatBriefFelder()) {
        rows.forEach((r, idx) => {
          r.detail_text   = items[idx] && items[idx].detail_text   || null;
          r.nachweis_text = items[idx] && items[idx].nachweis_text || null;
        });
      }
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

  // ── Leistungsvorlagen ──────────────────────────────────────────────────
  // Frei benannte Positionen, die in jede Rechnung eingefuegt werden koennen.
  // Eine Vorlage ist ein Vorschlag: die eingefuegte Position ist danach eine
  // ganz normale Zeile und wird nicht mit der Vorlage verknuepft.

  async function listItemTemplates() {
    try {
      const client = await sb();
      // Ueber den Rueckfall und nicht nur ueber hatBriefFelder(): die Vorlagen
      // werden auf rechnung.html geladen, bevor die Rechnungsabfrage
      // feststellen konnte, ob die Spalten da sind. Die Merkvariable stand dann
      // noch auf "unbekannt", detail_text ging trotzdem raus und der Nutzer sah
      // eine rote Meldung ueber eine fehlende Spalte. Am 23.08.2026 passiert.
      const { data, error } = await mitSpaltenrueckfall(() => client
        .from('invoice_item_templates')
        .select(hatBriefFelder() ? 'id, name, detail_text, unit_price_cents' : 'id, name, unit_price_cents')
        .order('name', { ascending: true }));
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
    // Die Beschreibung faehrt mit: sie ist bei wiederkehrenden Positionen
    // (Mietwagen, Kraftstoff, Parkgebuehren) jedes Mal fast derselbe Satz.
    const detail = hatBriefFelder() ? ((tpl.detail_text || '').trim() || null) : undefined;
    try {
      const client = await sb();
      // Mit id ist die Zeile bekannt — dann wird stur sie aktualisiert. Der
      // Namensweg wuerde eine inzwischen geloeschte Vorlage neu anlegen.
      let ziel = (tpl && tpl.id) ? { id: tpl.id } : null;
      if (!ziel) {
        const list = await listItemTemplates();
        if (!list.ok) return { ok: false, error: list.error };
        ziel = list.templates.find(t => t.name.toLowerCase() === name.toLowerCase()) || null;
      }
      const q = ziel
        ? client.from('invoice_item_templates')
                .update(detail === undefined ? { name, unit_price_cents: price }
                                             : { name, unit_price_cents: price, detail_text: detail })
                .eq('id', ziel.id)
        : client.from('invoice_item_templates')
                .insert(detail === undefined ? { name, unit_price_cents: price }
                                             : { name, unit_price_cents: price, detail_text: detail });
      const { data, error } = await q.select().single();
      if (error) {
        if (error.code === '23505') {
          return { ok: false, error: 'Es gibt schon eine Vorlage mit diesem Namen.' };
        }
        if (error.code === 'PGRST116') {
          return { ok: false, error: 'Diese Vorlage gibt es nicht mehr.' };
        }
        return { ok: false, error: error.message };
      }
      return { ok: true, template: data, updated: !!ziel };
    } catch(e) {
      console.error('[LPR] saveItemTemplate:', e);
      return { ok: false, error: 'Netzwerkfehler.' };
    }
  }

  // Hart loeschen ist richtig: an einer Vorlage haengt nichts. Positionen auf
  // Rechnungen sind Kopien, keine Verweise.
  async function deleteItemTemplate(id) {
    try {
      // select() mitschicken: sonst meldet auch ein Loeschen von null Zeilen
      // Erfolg, und der Nutzer glaubt, die Vorlage sei weg.
      const { data, error } = await (await sb())
        .from('invoice_item_templates').delete().eq('id', id).select('id');
      if (error) return { ok: false, error: error.message };
      if (!data || !data.length) return { ok: false, error: 'Diese Vorlage gibt es nicht mehr.' };
      return { ok: true };
    } catch(e) {
      console.error('[LPR] deleteItemTemplate:', e);
      return { ok: false, error: 'Netzwerkfehler.' };
    }
  }

  global.LPR = {
    // Der fertig eingerichtete Supabase-Client. Seiten, die selbst an der
    // Auth-Schicht arbeiten (passwort-neu.html), brauchen ihn direkt —
    // window.LPRSupabase ist erst nach dem ersten Aufruf gesetzt.
    supabase: sb,
    // Freibetrag § 3 Nr. 26 EStG (zentral, statt mehrfach hartkodiert)
    PAUSCHALE_LIMIT, PAUSCHALE_WARN,
    KEYS, load, save, del,
    escape, formatEUR, dateKey, keyToDate, formatDateRange,
    getSession, setSession, clearSession, refreshSessionCache,
    logout,
    getUser,
    getMyProfile, updateMyIban,
    // Präferenzen — Self-Service
    listClinics, getMyPreferences, updateMySoftPreferences, setClinicPreference,
    listAllClinics, clinicIdVorschlag, saveClinic, setClinicActive, clinicUsage, deleteClinic,
    setClinicNotifySettings, getBookingNotifications,
    // Präferenzen — Vorstand
    setUserHardPreferences, getUserPreferences, setUserSoftPreferences, setUserClinicPreference,
    register, loginWithPassword, requireRole,
    requestPasswordReset, setNewPassword,
    listUsersByStatus, approveUser, rejectUser, deleteRegistration,
    listKunden, saveKunde, setKundeAktiv, createTermin, finishTermin,
    listTermine, cancelTermin,
    getMyCompliance, getComplianceForUser, setComplianceStatus, isComplianceComplete,
    // Block C
    getRates, getRate,
    // Block D: Rechnungsstellung
    VEREIN, BILLING_DEFAULT_SHIFT_CENTS,
    centsToEUR, eurToCents, qtyToNumber, itemAmountCents, invoiceSubtotalCents, invoiceIsOverdue,
    listRecipients, saveRecipient, setRecipientActive,
    listInvoices, getInvoice, createInvoice, updateInvoiceDraft, reopenInvoice, saveInvoiceItems,
    deleteInvoiceDraft, issueInvoice, cancelInvoice, markInvoicePaid,
    listItemTemplates, saveItemTemplate, hatBriefFelder, deleteItemTemplate,
    listTrips, getTrip, getTripSignups, getMySignup, signupForTrip, cancelSignup,
    // Besetzungsregel — geteilt von admin-reisen.html und admin-jahreskalender.html
    enumTripDays, formatTripDay, signupEffectiveDays, signupEffectiveHalf,
    signupCoversHalf, tripDayGaps, tripCoverage,
    getMySignupDays, setMySignupDays, setSignupDaysAdmin, listVolunteersAdmin, addSignupAdmin, removeSignupAdmin,
    // Vorstand: Reise-Verwaltung
    listAllTripsAdmin, createTrip, updateTrip, deleteTrip,
    getAllTripSignupsAdmin, getPauschaleOverviewAdmin,
    getMyAvailability, setAvailability, removeAvailability,
    getMySignups, getMyBookings,
    getMyClaims, claimTotals, calculatePay,
    submitTripClaim, submitSitzClaim,
    // Sitzwachen-Einsatzdoku
    getEinsatzKontext, einsatzStarten, einsatzEreignis, getEinsatzEreignisse,
    getEinsatzInfoFuerBuchungen, KEINE_UNTERSCHRIFT_LABEL, TAETIGKEIT_LABEL,
    einsatzStornieren, einsatzReaktivieren, einsatzNacherfassen,
    uploadUnterschrift, einsatzAbschliessen, einsatzNettoMinuten,
    einsatzPufferLesen, einsatzPufferSchreiben, einsatzPufferLeeren,
    // Klinik-Self-Service (Etappe 1)
    getMyClinic, submitMyClinic,
    listClinicsByStatus, approveClinic, rejectClinic,
    // Klinik-Buchungen (Etappe 2)
    listAvailableShifts, bookShift, listBookableSlots, bookShiftFair,
    getMyClinicBookings, cancelClinicBooking, cancelMyClinicBooking,
    confirmMyBooking,
    setUnterwegs,
    anreiseStatus,
    pushMoeglich,
    pushStatus,
    pushAnmelden,
    pushAbmelden,
    // AP2 — Vorstand: Sitzwachen-Abschluss/Auszahlung
    adminListBookings, adminListClaims, adminSetBookingStatus, adminSetClaimStatus, adminSetSitzRate,
    resendClaimMail, getClaimBeleg, adminClaimsFuerBuchungen, adminAuslagenFuerAnmeldungen,
    // Auslagenersatz (§ 3 Nr. 50 EStG) — Erfassung durch den Vorstand
    adminCreateAuslageClaim,
    // Fördermittel-Cockpit
    foerderListProgramme, foerderListAufgaben, foerderListNotizen,
    foerderCreateAufgabe, foerderUpdateAufgabe, foerderCreateNotiz, foerderNamen,
    // UI
    setTextSize, toggleContrast, toggleLS,
    showToast,
    roleTarget
  };
  global.setTextSize = setTextSize;
  global.toggleContrast = toggleContrast;
  global.toggleLS = toggleLS;

  // Beim Laden: bestehende Session → Hint-Cookie auch dann auffrischen,
  // wenn der User schon vor dem Cookie-Feature eingeloggt war.
  try {
    const _existing = getSession();
    if (_existing && _existing.role) setHintCookie(_existing.role, _existing.name);
  } catch(e) {}

})(window);
