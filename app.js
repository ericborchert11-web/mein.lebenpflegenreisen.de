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

  function setSession(profile, supabaseSession) {
    if (!profile || !supabaseSession) { clearSession(); return null; }
    const s = {
      id:             profile.id,
      email:          (profile.email || '').toLowerCase(),
      name:           profile.full_name || null,
      role:           ROLE_BE_TO_FE[profile.role] || 'ehrenamt',
      status:         profile.status || 'pending',
      personalnummer: profile.personalnummer || null,
      loginAt:        new Date().toISOString()
    };
    save(KEYS.session, s);
    return s;
  }

  function clearSession() { del(KEYS.session); del(KEYS.clinicSession); }

  async function refreshSessionCache() {
    try {
      const { data: { session: sbSession } } = await (await sb()).auth.getSession();
      if (!sbSession) { clearSession(); return null; }
      const { data: profile, error } = await (await sb())
        .from('profiles')
        .select('id, email, full_name, role, status, personalnummer')
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

    if (role === 'klinik') {
      return { ok: false, error: 'Klinik-Konten werden direkt vom Vorstand angelegt. Bitte kontaktieren Sie uns unter info@lebenpflegenreisen.de.' };
    }

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
        .select('id, email, full_name, role, status, personalnummer')
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
          await (await sb()).auth.signOut();
          return { ok: false, error: 'Ihre Registrierung wurde nicht angenommen. Bitte wenden Sie sich an vorstand@lebenpflegenreisen.de.' };
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
        .select('id, email, full_name, role, status, personalnummer, phone, created_at, approved_at, approved_by, rejected_at, rejected_reason')
        .order('created_at', { ascending: true });
      if (status) query = query.eq('status', status);
      const { data, error } = await query;
      if (error) { console.error('[LPR] listUsersByStatus:', error); return []; }
      return (data || []).map(p => ({
        email: p.email, name: p.full_name, role: ROLE_BE_TO_FE[p.role] || p.role,
        status: p.status, personalnummer: p.personalnummer, phone: p.phone,
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
  async function getRates() {
    if (_ratesCache) return _ratesCache;
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
  async function signupForTrip(tripId, note) {
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

      // 3. Insert
      const { data, error } = await (await sb())
        .from('trip_signups')
        .insert({ trip_id: tripId, user_id: s.id, position: nextPos, status, note: note || null })
        .select()
        .single();
      if (error) {
        if (error.code === '23505') return { ok: false, error: 'Sie sind bereits für diese Reise eingetragen.' };
        return { ok: false, error: error.message };
      }
      return { ok: true, signup: data, waitlist: status === 'waitlist' };
    } catch(e) { console.error('[LPR] signupForTrip:', e); return { ok: false, error: 'Netzwerkfehler.' }; }
  }
  async function cancelSignup(tripId) {
    const s = getSession();
    if (!s) return { ok: false, error: 'Nicht eingeloggt.' };
    try {
      const { error } = await (await sb())
        .from('trip_signups')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
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
                  return { ok: true, signups: data || [] };
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
        .select('id, request_id, date, shift, hours, compensation_eur, status, created_at')
        .eq('volunteer_id', s.id)
        .order('date', { ascending: false });
      if (filter && filter.status) q = q.eq('status', filter.status);
      const { data, error } = await q;
      if (error) return { ok: false, error: error.message, bookings: [] };
      return { ok: true, bookings: data || [] };
    } catch(e) { console.error('[LPR] getMyBookings:', e); return { ok: false, error: 'Netzwerkfehler.', bookings: [] }; }
  }

  // --- Abrechnung (claims) ---
  // claims werden aus signups oder bookings auto-generiert
  async function getMyClaims(filter) {
    const s = getSession();
    if (!s) return { ok: false, error: 'Nicht eingeloggt.', claims: [] };
    try {
      let q = (await sb())
        .from('claims')
        .select('id, source_type, trip_signup_id, booking_id, amount, amount_breakdown, period_start, period_end, status, submitted_at, approved_at, paid_at, rejected_reason, notes')
        .eq('user_id', s.id)
        .order('submitted_at', { ascending: false });
      if (filter && filter.status) q = q.eq('status', filter.status);
      const { data, error } = await q;
      if (error) return { ok: false, error: error.message, claims: [] };
      return { ok: true, claims: data || [] };
    } catch(e) { console.error('[LPR] getMyClaims:', e); return { ok: false, error: 'Netzwerkfehler.', claims: [] }; }
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
        if (!ctx.start_date || !ctx.end_date) return { ok: false, error: 'Reise braucht start_date und end_date' };
        const days = Math.round((new Date(ctx.end_date) - new Date(ctx.start_date)) / 86400000) + 1;
        if (days < 1) return { ok: false, error: 'Ungültige Reisedauer' };
        const halfAmount = Number((baseAmount / 2).toFixed(2));
        const breakdown = [];
        let total = 0;
        if (days === 1) {
          breakdown.push({ label: 'Reisetag', date: ctx.start_date, base: baseAmount, factor: 1, amount: baseAmount });
          total = baseAmount;
        } else {
          breakdown.push({ label: 'Anreisetag (halber Tag)', date: ctx.start_date, base: baseAmount, factor: 0.5, amount: halfAmount });
          total += halfAmount;
          const midDays = days - 2;
          if (midDays > 0) {
            const midAmount = Number((midDays * baseAmount).toFixed(2));
            breakdown.push({ label: 'Volltage', count: midDays, base: baseAmount, factor: 1, amount: midAmount });
            total += midAmount;
          }
          breakdown.push({ label: 'Abreisetag (halber Tag)', date: ctx.end_date, base: baseAmount, factor: 0.5, amount: halfAmount });
          total += halfAmount;
        }
        total = Number(total.toFixed(2));
        return { ok: true, base_source: baseSource, base_amount: baseAmount, supplements_applied: [], breakdown, total, currency: 'EUR' };
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

  async function submitTripClaim(signupId, notes) {
    try {
      const session = getSession();
      if (!session) return { ok: false, error: 'Nicht eingeloggt.' };
      
      const profileResp = await getMyProfile();
      if (!profileResp.ok) return { ok: false, error: 'Profil konnte nicht geladen werden.' };
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
      
      const calc = await calculatePay({
        activity: 'reise',
        shift_type: 'day',
        role: 'ehrenamt',
        override_amount: trip.rate_override_per_day,
        start_date: trip.start_date,
        end_date: trip.end_date
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
          period_start: trip.start_date,
          period_end: trip.end_date,
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
        .select('id, email, full_name, phone, role, status, personalnummer, iban, iban_updated_at')
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

  global.LPR = {
    KEYS, load, save, del,
    escape, formatEUR, dateKey, keyToDate, formatDateRange,
    getSession, setSession, clearSession, refreshSessionCache,
    logout,
    getUser,
    getMyProfile, updateMyIban,
    register, loginWithPassword, requireRole,
    listUsersByStatus, approveUser, rejectUser,
    getMyCompliance, getComplianceForUser, setComplianceStatus, isComplianceComplete,
    // Block C
    getRates, getRate,
    listTrips, getTrip, getTripSignups, getMySignup, signupForTrip, cancelSignup,
    // Vorstand: Reise-Verwaltung
    listAllTripsAdmin, createTrip, updateTrip, deleteTrip,
    getMyAvailability, setAvailability, removeAvailability,
    getMySignups, getMyBookings,
    getMyClaims, calculatePay,
    submitTripClaim, submitSitzClaim,
    // Block C2: Payroll
    uploadClaimPdf, sendClaimToPayroll,
    // UI
    setTextSize, toggleContrast, toggleLS,
    showToast,
    roleTarget
  };
  global.setTextSize = setTextSize;
  global.toggleContrast = toggleContrast;
  global.toggleLS = toggleLS;

})(window);
