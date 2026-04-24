// âââââââââââââââââââââââââââââââââââââââââââââââââââââââ
// LPR Â· Shared App Module Â· app.js
// âââââââââââââââââââââââââââââââââââââââââââââââââââââââ

(function(global) {
  'use strict';

  const KEYS = {
    session:    'lpr-session-v2',
    magic:      'lpr-magic-pending-v2',
    signups:    'lpr-schichtplan-v1',
    availability: 'lpr-sitzwachen-avail-v1',
    bookings:     'lpr-sitzwachen-book-v1',
    clinics:      'lpr-sitzwachen-clinics-v1',
    clinicSession:'lpr-sw-clinic-session-v1',
    users:        'lpr-users-v2',
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
    return `${a} â ${b}`;
  }

  function getSession() { return load(KEYS.session, null); }
  function setSession(u) {
    const s = { email: u.email.toLowerCase(), name: u.name || null, role: u.role || 'ehrenamt', loginAt: new Date().toISOString() };
    save(KEYS.session, s); return s;
  }
  function clearSession() { del(KEYS.session); del(KEYS.clinicSession); }

  function requestMagicLink(email, name) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'Bitte gÃ¼ltige E-Mail eingeben.' };
    email = email.toLowerCase();
    const token = Math.random().toString(36).substring(2, 10).toUpperCase();
    const pending = { email, name: name || null, token, expiresAt: Date.now() + 15*60*1000 };
    save(KEYS.magic, pending);

    const users = load(KEYS.users, {});
    if (!users[email]) {
      users[email] = { email, name: name || email.split('@')[0], registeredAt: new Date().toISOString() };
    } else if (name) {
      users[email].name = name;
    }
    save(KEYS.users, users);
    return { ok: true, token, email, name: users[email].name };
  }

  function verifyMagicLink(token) {
    const pending = load(KEYS.magic, null);
    if (!pending) return { ok: false, error: 'Kein Login angefordert.' };
    if (pending.token !== token.toUpperCase().trim()) return { ok: false, error: 'Code stimmt nicht.' };
    if (Date.now() > pending.expiresAt) return { ok: false, error: 'Code abgelaufen. Bitte neuen anfordern.' };

    const users = load(KEYS.users, {});
    const user = users[pending.email] || { email: pending.email, name: pending.name };
    const session = setSession({ email: user.email, name: user.name });
    del(KEYS.magic);
    return { ok: true, session };
  }

  function logout() { clearSession(); }
  function getUser(email) {
    const users = load(KEYS.users, {});
    return users[email.toLowerCase()] || null;
  }
  function updateUserProfile(email, updates) {
    const users = load(KEYS.users, {});
    if (!users[email.toLowerCase()]) return false;
    Object.assign(users[email.toLowerCase()], updates);
    save(KEYS.users, users);
    return true;
  }

  // âââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  // PASSWORT-AUTH (neu, fÃ¼r WordPress-Migration vorbereitet)
  // âââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  async function hashPassword(password, salt) {
    const data = new TextEncoder().encode(password + ':' + salt);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0')).join('');
  }
  function genSalt() {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function register({ email, password, name, role, extra }) {
    email = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'Bitte gÃ¼ltige E-Mail eingeben.' };
    if (!password || password.length < 6) return { ok: false, error: 'Passwort muss mindestens 6 Zeichen lang sein.' };
    if (!name || name.trim().length < 2) return { ok: false, error: 'Bitte Namen eingeben.' };
    if (!['ehrenamt','klinik','admin'].includes(role)) return { ok: false, error: 'UngÃ¼ltige Rolle.' };

    const users = load(KEYS.users, {});
    if (users[email] && users[email].hash) return { ok: false, error: 'Ein Konto mit dieser E-Mail existiert bereits. Bitte einloggen.' };

    const salt = genSalt();
    const hash = await hashPassword(password, salt);
    const existing = users[email] || {};
    users[email] = {
      ...existing,
      email, name: name.trim(), role, salt, hash,
      extra: extra || {},
      registeredAt: existing.registeredAt || new Date().toISOString(),
      status: existing.status || 'pending',
      personalnummer: existing.personalnummer || null,
      approvedAt: existing.approvedAt || null,
      approvedBy: existing.approvedBy || null,
      rejectedReason: existing.rejectedReason || null
    };
    save(KEYS.users, users);
    return { ok: true, pending: true, user: users[email], message: 'Ihre Registrierung wurde erfolgreich eingereicht. Der Vorstand prueft Ihre Anfrage und schaltet Ihr Konto innerhalb von 1-2 Werktagen frei.' };
  }

  async function loginWithPassword({ email, password }) {
    email = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'Bitte gÃ¼ltige E-Mail eingeben.' };
    const users = load(KEYS.users, {});
    const user = users[email];
    if (!user || !user.hash) return { ok: false, error: 'Kein Konto gefunden. Bitte zuerst registrieren.' };
    const hash = await hashPassword(password, user.salt);
    if (hash !== user.hash) return { ok: false, error: 'E-Mail oder Passwort falsch.' };
    const role = user.role || 'ehrenamt';
    if (role !== 'admin' && user.status && user.status !== 'approved') {
      if (user.status === 'pending') return { ok: false, error: 'Ihr Konto wurde noch nicht vom Vorstand freigeschaltet. Die Freischaltung erfolgt in der Regel innerhalb von 1-2 Werktagen.' };
      if (user.status === 'rejected') return { ok: false, error: 'Ihre Registrierung wurde nicht angenommen.' + (user.rejectedReason ? ' Grund: ' + user.rejectedReason : '') + ' Bitte wenden Sie sich an vorstand@lebenpflegenreisen.de.' };
    }
    setSession({ email, name: user.name, role });
    return { ok: true, user };
  }

  async function changePassword(email, newPassword) {
    const users = load(KEYS.users, {});
    const user = users[email.toLowerCase()];
    if (!user) return false;
    user.salt = genSalt();
    user.hash = await hashPassword(newPassword, user.salt);
    save(KEYS.users, users);
    return true;
  }

  function requireRole(role, redirectTo) {
    const s = getSession();
    if (!s || s.role !== role) {
      if (redirectTo) window.location.href = redirectTo;
      return false;
    }
    return true;
  }

  async function seedDemoUsers() {
    const users = load(KEYS.users, {});
    const demoUsers = [
      { email: 'margarete@demo.de', name: 'Margarete MÃ¼ller', role: 'ehrenamt', pw: 'demo1234', personalnummer: 'LPR-0001', extra: { phone: '030-12345678' } },
      { email: 'hans@demo.de',      name: 'Hans Schulz',      role: 'ehrenamt', pw: 'demo1234', personalnummer: 'LPR-0002', extra: { phone: '030-12345679' } },
      { email: 'fatma@demo.de',     name: 'Fatma Yilmaz',     role: 'ehrenamt', pw: 'demo1234', personalnummer: 'LPR-0003', extra: { phone: '030-12345680' } },
      { email: 'charite@demo.de',   name: 'Anna Krause',      role: 'klinik',   pw: 'demo1234',
        extra: { clinic_name: 'CharitÃ© Campus Mitte', ward: 'Geriatrie 4B', phone: '030-450-555-123', address: 'CharitÃ©platz 1, 10117 Berlin' } },
      { email: 'hedwig@demo.de',    name: 'Thomas Berger',    role: 'klinik',   pw: 'demo1234',
        extra: { clinic_name: 'St. Hedwig-Krankenhaus', ward: 'Innere 2', phone: '030-2311-0', address: 'Gr. Hamburger Str. 5, 10115 Berlin' } },
      { email: 'vorstand@demo.de',  name: 'Eric (Vorstand)',  role: 'admin',    pw: 'demo1234', extra: {} }
    ];
    for (const u of demoUsers) {
      if (users[u.email] && users[u.email].hash) continue; // existiert schon
      const salt = genSalt();
      const hash = await hashPassword(u.pw, salt);
      users[u.email] = {
        ...(users[u.email] || {}),
        email: u.email, name: u.name, role: u.role,
        salt, hash, extra: u.extra,
        registeredAt: users[u.email]?.registeredAt || new Date().toISOString(),
        status: 'approved',
        personalnummer: u.personalnummer || users[u.email]?.personalnummer || null,
        approvedAt: users[u.email]?.approvedAt || new Date().toISOString(),
        approvedBy: 'demo-seed',
        rejectedReason: null
      };
    }
    save(KEYS.users, users);
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

  async function loadDemoData() {
    const today = new Date();
    const inDays = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return dateKey(d); };

    // Erst alle Demo-User mit PasswÃ¶rtern + Rollen anlegen
    await seedDemoUsers();

    save(KEYS.signups, {
      'trip-001': [
        { name: 'Margarete MÃ¼ller', email: 'margarete@demo.de', phone: '030-12345678', note: '', signedAt: today.toISOString() },
        { name: 'Hans Schulz', email: 'hans@demo.de', phone: '030-12345679', note: 'nur wenn barrierearm', signedAt: today.toISOString() }
      ],
      'trip-002': [
        { name: 'Fatma Yilmaz', email: 'fatma@demo.de', phone: '030-12345680', note: '', signedAt: today.toISOString() }
      ]
    });

    save(KEYS.availability, {
      'margarete@demo.de': {
        [inDays(2)]: { name: 'Margarete MÃ¼ller', shifts: ['frueh','spaet'], note: 'nur CharitÃ©', updatedAt: today.toISOString() },
        [inDays(3)]: { name: 'Margarete MÃ¼ller', shifts: ['nacht'], note: '', updatedAt: today.toISOString() },
        [inDays(5)]: { name: 'Margarete MÃ¼ller', shifts: ['frueh'], note: '', updatedAt: today.toISOString() }
      },
      'hans@demo.de': {
        [inDays(2)]: { name: 'Hans Schulz', shifts: ['nacht'], note: '', updatedAt: today.toISOString() },
        [inDays(4)]: { name: 'Hans Schulz', shifts: ['frueh','spaet','nacht'], note: 'flexibel', updatedAt: today.toISOString() }
      },
      'fatma@demo.de': {
        [inDays(6)]: { name: 'Fatma Yilmaz', shifts: ['spaet'], note: 'spricht TÃ¼rkisch', updatedAt: today.toISOString() }
      }
    });

    save(KEYS.clinics, {
      'charite@demo.de': {
        email: 'charite@demo.de',
        name: 'CharitÃ© Campus Mitte',
        ward: 'Geriatrie 4B',
        contact: 'Anna Krause',
        phone: '030-450-555-123',
        address: 'CharitÃ©platz 1, 10117 Berlin',
        registeredAt: today.toISOString()
      },
      'hedwig@demo.de': {
        email: 'hedwig@demo.de',
        name: 'St. Hedwig-Krankenhaus',
        ward: 'Innere 2',
        contact: 'Thomas Berger',
        phone: '030-2311-0',
        address: 'Gr. Hamburger Str. 5, 10115 Berlin',
        registeredAt: today.toISOString()
      }
    });

    save(KEYS.bookings, {
      [inDays(5)]: {
        'frueh': {
          confirmNr: `LPR-SW-${today.getFullYear()}-DEMO01`,
          date: inDays(5), shift: 'frueh',
          ehrenamt_email: 'margarete@demo.de',
          ehrenamt_name: 'Margarete MÃ¼ller',
          clinic_email: 'charite@demo.de',
          clinic_name: 'CharitÃ© Campus Mitte',
          clinic_ward: 'Geriatrie 4B',
          clinic_contact: 'Anna Krause',
          clinic_phone: '030-450-555-123',
          clinic_address: 'CharitÃ©platz 1, 10117 Berlin',
          patient_ref: 'Zimmer 4B-17',
          special_notes: 'demenziell verwirrt, spricht nur TÃ¼rkisch',
          amount: 200,
          bookedAt: today.toISOString(),
          status: 'confirmed',
          declarations: { binding: true, dsgvo: true, scope: true, cancel: true }
        }
      }
    });

    const pastEnd = new Date(today); pastEnd.setDate(pastEnd.getDate() - 20);
    const pastStart = new Date(pastEnd); pastStart.setDate(pastStart.getDate() - 6);
    save(KEYS.claims, [{
      belegNr: `LPR-${today.getFullYear()}-DEMO01`,
      email: 'margarete@demo.de',
      name: 'Margarete MÃ¼ller',
      tripId: 'demo-past',
      tripTitle: 'Harz â Bad Harzburg (Demo)',
      location: 'Bad Harzburg',
      partner: null,
      start: dateKey(pastStart), end: dateKey(pastEnd),
      days: 7, midDays: 5, halfDayAmount: 75, midAmount: 750, amount: 900,
      iban: 'DE12500105170648489890',
      note: '',
      submittedAt: today.toISOString(),
      status: 'paid',
      declarations: { correct: true, nebenberuflich: true, nichtDoppelt: true, datenschutz: true },
      beschluss: '15. April 2026'
    }]);

    showToast('â Demo-Daten geladen. Log ein als margarete@demo.de oder charite@demo.de (PW: demo1234)');
    setTimeout(() => window.location.reload(), 1500);
  }

  function clearAllData() {
    if (!confirm('Alle Prototyp-Daten wirklich lÃ¶schen? (Nur dein Browser-localStorage)')) return;
    Object.values(KEYS).forEach(k => del(k));
    showToast('â Alle Daten gelÃ¶scht');
    setTimeout(() => window.location.reload(), 1000);
  }

  document.addEventListener('DOMContentLoaded', applyA11ySettings);

  // Admin-Freigabe-Workflow

  function nextPersonalnummer() {
    const users = load(KEYS.users, {});
    let maxNum = 0;
    for (const email in users) {
      const pn = users[email].personalnummer;
      if (pn && typeof pn === 'string') {
        const m = pn.match(/^LPR-(\d+)$/);
        if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
      }
    }
    return 'LPR-' + String(maxNum + 1).padStart(4, '0');
  }

  function approveUser(email, options) {
    options = options || {};
    email = (email || '').trim().toLowerCase();
    const users = load(KEYS.users, {});
    const user = users[email];
    if (!user) return { ok: false, error: 'Benutzer nicht gefunden.' };
    if (user.status === 'approved') return { ok: false, error: 'Benutzer ist bereits freigeschaltet.' };
    const session = getSession();
    const adminEmail = (session && session.email) || options.approvedBy || 'unknown';
    user.status = 'approved';
    user.personalnummer = user.personalnummer || options.personalnummer || nextPersonalnummer();
    user.approvedAt = new Date().toISOString();
    user.approvedBy = adminEmail;
    user.rejectedReason = null;
    users[email] = user;
    save(KEYS.users, users);
    return { ok: true, user };
  }

  function rejectUser(email, reason) {
    email = (email || '').trim().toLowerCase();
    const users = load(KEYS.users, {});
    const user = users[email];
    if (!user) return { ok: false, error: 'Benutzer nicht gefunden.' };
    const session = getSession();
    const adminEmail = (session && session.email) || 'unknown';
    user.status = 'rejected';
    user.rejectedReason = reason || null;
    user.approvedAt = null;
    user.approvedBy = null;
    user.rejectedAt = new Date().toISOString();
    user.rejectedBy = adminEmail;
    users[email] = user;
    save(KEYS.users, users);
    return { ok: true, user };
  }

  function listUsersByStatus(status) {
    const users = load(KEYS.users, {});
    const out = [];
    for (const email in users) {
      const u = users[email];
      if (!u.hash) continue;
      if (!status || u.status === status || (!u.status && status === 'pending')) out.push(u);
    }
    out.sort((a, b) => (a.registeredAt || '').localeCompare(b.registeredAt || ''));
    return out;
  }

  // Zentraler Helper: Wohin soll ein User nach Login geleitet werden?
  function roleTarget(role) {
    if (role === 'klinik') return 'kliniken.html';
    if (role === 'admin')  return 'admin-mitwirkende.html';
    return 'mein-bereich.html';
  }

  global.LPR = {
    KEYS, load, save, del,
    escape, formatEUR, dateKey, keyToDate, formatDateRange,
    getSession, setSession, clearSession,
    requestMagicLink, verifyMagicLink, logout,
    getUser, updateUserProfile,
    register, loginWithPassword, changePassword, requireRole, seedDemoUsers,
    approveUser, rejectUser, listUsersByStatus, nextPersonalnummer,
    setTextSize, toggleContrast, toggleLS,
    showToast, loadDemoData, clearAllData,
    roleTarget
  };
  global.setTextSize = setTextSize;
  global.toggleContrast = toggleContrast;
  global.toggleLS = toggleLS;
  global.loadDemoData = loadDemoData;
  global.clearAllData = clearAllData;
})(window)