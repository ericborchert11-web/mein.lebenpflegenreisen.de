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
        .select('id, title, location, start_date, end_date, partner, description, max_spots, status, rate_override_per_day, created_at')
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
    const insertData = {
      title, location, start_date, end_date, max_spots,
      status: payload.status || 'open',
      partner: (payload.partner || '').trim() || null,
      description: (payload.description || '').trim() || null,
      description_ls: (payload.description_ls || '').trim() || null,
      rate_override_per_day: payload.rate_override_per_day != null && payload.rate_override_per_day !== '' ? Number(payload.rate_override_per_day) : null,
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
    const allowedKeys = ['title','location','start_date','end_date','partner','description','description_ls','max_spots','status','rate_override_per_day'];
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
    for (const k of ['partner','description','description_ls']) {
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
        .select('id, request_id, clinic_id, date, shift, hours, compensation_eur, status, station, fallnummer, patient_room, patient_flags, patient_notes, created_at, profiles!bookings_clinic_id_fkey(full_name)')
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
        created_at: b.created_at
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
        .select('id, source_type, trip_signup_id, booking_id, amount, amount_breakdown, period_start, period_end, status, submitted_at, approved_at, paid_at, rejected_reason, notes, beleg_nr, pauschale_art, submitted_to_payroll_at')
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

  // ─────────────────────────────────────────────────
  // Block C2: Claim-PDF in Storage + Mail an Buchhaltung
  // ─────────────────────────────────────────────────
  
  /**
   * Lädt ein PDF-Blob in den Storage-Bucket 'claim-pdfs' und schreibt
   * pdf_path in die claims-Zeile. Pfad-Konvention: {user_id}/{claim_id}.pdf
   * — RLS sorgt dafür, dass Mitwirkende nur in ihren eigenen Ordner schreiben.
   */
  async function uploadClaimPdf(claimId, pdfBlob) {
    try {
      const session = getSession();
      if (!session) return { ok: false, error: 'Nicht eingeloggt.' };
      if (!claimId || !pdfBlob) return { ok: false, error: 'claim_id oder PDF fehlt.' };
      
      const client = await sb();
      const path = session.id + '/' + claimId + '.pdf';
      
      const { error: upErr } = await client
        .storage
        .from('claim-pdfs')
        .upload(path, pdfBlob, {
          contentType: 'application/pdf',
          upsert: true
        });
      if (upErr) return { ok: false, error: 'PDF-Upload fehlgeschlagen: ' + upErr.message };
      
      const { error: updErr } = await client
        .from('claims')
        .update({ pdf_path: path })
        .eq('id', claimId)
        .eq('user_id', session.id);
      if (updErr) return { ok: false, error: 'pdf_path konnte nicht gespeichert werden: ' + updErr.message };
      
      return { ok: true, path };
    } catch(e) {
      console.error('[LPR] uploadClaimPdf:', e);
      return { ok: false, error: 'Netzwerkfehler beim PDF-Upload.' };
    }
  }
  
  /**
   * Ruft die Edge Function 'send-claim-to-payroll' auf, die das PDF
   * aus Storage lädt und per SMTP an buchhaltung@ verschickt.
   * Bei Fehler bleibt der Claim eingereicht — Margarete bekommt Hinweis,
   * dass sie Sonja manuell informieren kann.
   */
  async function sendClaimToPayroll(claimId) {
    try {
      const session = getSession();
      if (!session) return { ok: false, error: 'Nicht eingeloggt.' };
      if (!claimId) return { ok: false, error: 'claim_id fehlt.' };
      
      const client = await sb();
      const { data, error } = await client.functions.invoke('send-claim-to-payroll', {
        body: { claim_id: claimId }
      });
      if (error) return { ok: false, error: error.message || 'Edge-Function-Aufruf fehlgeschlagen.' };
      if (data && data.error) return { ok: false, error: data.error };
      
      return { ok: true, sent_to: data?.sent_to };
    } catch(e) {
      console.error('[LPR] sendClaimToPayroll:', e);
      return { ok: false, error: 'Netzwerkfehler beim Mailversand.' };
    }
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
          patient_room: room,
          patient_flags: flags,
          patient_notes: notes
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
        .select('id, volunteer_id, date, shift, status, station, fallnummer, patient_room, patient_flags, patient_notes, created_at, cancelled_at, cancelled_by_user_id, cancellation_reason, profiles!bookings_volunteer_id_fkey(full_name)')
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
        created_at: b.created_at,
        cancelled_at: b.cancelled_at,
        cancelled_by_user_id: b.cancelled_by_user_id,
        cancellation_reason: b.cancellation_reason
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
        .eq('status', 'planned')
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
        .eq('status', 'planned')
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
        .select('id, volunteer_id, clinic_id, date, shift, hours, compensation_eur, status, completed_at, late_cancellation, patient_room, patient_flags, patient_notes, cancellation_reason, cancelled_at, cancelled_by_user_id')
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
        .select('id, user_id, source_type, booking_id, amount, status, submitted_at, approved_at, paid_at, pauschale_art, beleg_nr, notes, rejected_reason')
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

  global.LPR = {
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
    // Präferenzen — Vorstand
    setUserHardPreferences, getUserPreferences, setUserSoftPreferences, setUserClinicPreference,
    register, loginWithPassword, requireRole,
    listUsersByStatus, approveUser, rejectUser,
    getMyCompliance, getComplianceForUser, setComplianceStatus, isComplianceComplete,
    // Block C
    getRates, getRate,
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
    // Block C2: Payroll
    uploadClaimPdf, sendClaimToPayroll,
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
    listAvailableShifts, bookShift, getMyClinicBookings, cancelClinicBooking, cancelMyClinicBooking,
    confirmMyBooking,
    // AP2 — Vorstand: Sitzwachen-Abschluss/Auszahlung
    adminListBookings, adminListClaims, adminSetBookingStatus, adminSetClaimStatus, adminSetSitzRate,
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
