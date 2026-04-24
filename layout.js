/**
 * LPR Layout — fügt A11y-Bar, Header und Footer dynamisch in jede Seite ein.
 * Braucht LPR (aus app.js).
 */
(function() {
  'use strict';

  function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; }

  function renderA11y() {
    const bar = document.createElement('div');
    bar.className = 'a11y-bar';
    bar.setAttribute('role','region');
    bar.setAttribute('aria-label','Barrierefreiheit und Demo-Modus');
    bar.innerHTML = `
      <div class="a11y-left">
        <span class="demo-badge" title="Daten werden lokal im Browser gespeichert">DEMO</span>
        <a href="demo.html" class="a11y-btn" style="border-color:rgba(200,241,53,.5);">⚙ Test-Konten</a>
      </div>
      <div class="a11y-right">
        <div class="a11y-group">
          <span class="a11y-label">Text:</span>
          <button class="a11y-btn" data-size="" aria-pressed="true" onclick="LPR.setTextSize('')" aria-label="Normal">A</button>
          <button class="a11y-btn" data-size="l" aria-pressed="false" onclick="LPR.setTextSize('l')" aria-label="Groß">A+</button>
          <button class="a11y-btn" data-size="xl" aria-pressed="false" onclick="LPR.setTextSize('xl')" aria-label="Sehr groß">A++</button>
        </div>
        <div class="a11y-group">
          <button class="a11y-btn" id="btn-contrast" aria-pressed="false" onclick="LPR.toggleContrast()">◐ Kontrast</button>
          <button class="a11y-btn" id="btn-ls" aria-pressed="false" onclick="LPR.toggleLS()">✎ Leichte Sprache</button>
        </div>
      </div>
    `;
    document.body.prepend(bar);
    try {
      const size = localStorage.getItem('lpr-text-size') || '';
      document.querySelectorAll('.a11y-btn[data-size]').forEach(b =>
        b.setAttribute('aria-pressed', b.dataset.size === size ? 'true' : 'false'));
      if (localStorage.getItem('lpr-contrast') === '1')
        document.getElementById('btn-contrast')?.setAttribute('aria-pressed','true');
      if (localStorage.getItem('lpr-ls') === '1')
        document.getElementById('btn-ls')?.setAttribute('aria-pressed','true');
    } catch(e) {}
  }

  function renderHeader(currentPage) {
    const session = LPR.getSession ? LPR.getSession() : null;
    const c = (p) => currentPage === p ? 'current' : '';
    let userArea;
    if (session) {
      const hubLink = session.role === 'klinik' ? 'kliniken.html' : 'mein-bereich.html';
      userArea = `<a href="${hubLink}" style="background:rgba(200,241,53,0.15); color:var(--lime); font-weight:700;">${escapeHtml(session.name.split(' ')[0])} →</a>`;
    } else {
      userArea = `<a href="login.html">Anmelden</a>`;
    }
    const header = document.createElement('header');
    header.className = 'site';
    header.innerHTML = `
      <div class="wrap header-row">
        <a href="index.html" class="brand" aria-label="Startseite">
          <svg viewBox="0 0 48 48" width="40" height="40" aria-hidden="true">
            <g fill="none" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="10,10 24,24 10,38" stroke="#C8F135" stroke-width="4.5"/>
              <polyline points="22,10 36,24 22,38" stroke="#C8F135" stroke-width="4.5" opacity="0.42"/>
            </g>
          </svg>
          <div>
            <div class="brand-name">Leben <em>Pflegen</em> Reisen</div>
            <div class="brand-sub">e.V. · Berlin</div>
          </div>
        </a>
        <nav aria-label="Hauptnavigation">
          <button class="menu-btn" onclick="document.querySelector('header.site nav ul').classList.toggle('open')" aria-label="Menü">☰</button>
          <ul>
            <li><a href="index.html" class="${c('home')}">Start</a></li>
            <li><a href="reisen.html" class="${c('reisen')}">Reisen</a></li>
            <li><a href="sitzwache-buchen.html" class="${c('sw-buchen')}">Sitzwachen</a></li>
            <li><a href="ehrenamt.html" class="${c('ehrenamt')}">Ehrenamt</a></li>
            <li><a href="spenden.html" class="${c('spenden')}">Spenden</a></li>
            <li>${userArea}</li>
          </ul>
        </nav>
      </div>
    `;
    document.querySelector('.a11y-bar').insertAdjacentElement('afterend', header);
    header.querySelectorAll('nav ul a').forEach(a => {
      a.addEventListener('click', () => header.querySelector('nav ul').classList.remove('open'));
    });
  }

  function renderFooter() {
    const footer = document.createElement('footer');
    footer.className = 'site';
    footer.innerHTML = `
      <div class="wrap">
        <div class="footer-grid">
          <div class="footer-col">
            <div style="display:flex; align-items:center; gap:12px; margin-bottom:14px;">
              <svg viewBox="0 0 48 48" width="36" height="36" aria-hidden="true">
                <g fill="none" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="10,10 24,24 10,38" stroke="#C8F135" stroke-width="4.5"/>
                  <polyline points="22,10 36,24 22,38" stroke="#C8F135" stroke-width="4.5" opacity="0.42"/>
                </g>
              </svg>
              <div>
                <div style="font-family:'Bricolage Grotesque',sans-serif; font-weight:800; font-size:17px; color:#fff;">Leben Pflegen Reisen</div>
                <div style="font-size:11px; opacity:.65; letter-spacing:.12em; text-transform:uppercase; margin-top:2px;">e.V. · Berlin</div>
              </div>
            </div>
            <p style="font-size:14px; line-height:1.6;">Gemeinnütziger Verein für Reisebegleitung, Sitzwachen und soziale Teilhabe in Berlin.</p>
          </div>
          <div class="footer-col">
            <h4>Angebote</h4>
            <ul>
              <li><a href="reisen.html">Begleitete Reisen</a></li>
              <li><a href="sitzwache-buchen.html">Sitzwachen buchen</a></li>
              <li><a href="ehrenamt.html">Ehrenamt</a></li>
              <li><a href="spenden.html">Spenden</a></li>
            </ul>
          </div>
          <div class="footer-col">
            <h4>Mitgliederbereich</h4>
            <ul>
              <li><a href="login.html">Anmelden</a></li>
              <li><a href="mein-bereich.html">Mein Bereich</a></li>
              <li><a href="schichtplaner.html">Reise-Plan</a></li>
              <li><a href="abrechnung.html">Abrechnung</a></li>
            </ul>
          </div>
          <div class="footer-col">
            <h4>Rechtliches</h4>
            <ul>
              <li><a href="impressum.html">Impressum</a></li>
              <li><a href="datenschutz.html">Datenschutz</a></li>
              <li><a href="barrierefreiheit.html">Barrierefreiheit</a></li>
            </ul>
          </div>
        </div>
        <div class="footer-bottom">
          <div>© 2026 Leben Pflegen Reisen e.V. · Berlin</div>
          <div>Kontakt: <a href="mailto:info@lebenpflegenreisen.de" style="color:var(--lime);">info@lebenpflegenreisen.de</a></div>
        </div>
      </div>
    `;
    document.body.appendChild(footer);
  }

  window.LPR_Layout = {
    init: function(opts) {
      opts = opts || {};
      renderA11y();
      if (opts.header !== false) renderHeader(opts.page || '');
      if (opts.footer !== false) renderFooter();
      if (opts.chatbot !== false) loadChatbot();
    },
    escapeHtml
  };

  function loadChatbot() {
    // Chatbot nur einmal laden
    if (document.getElementById('lpr-chatbot-script')) return;
    const s = document.createElement('script');
    s.id = 'lpr-chatbot-script';
    s.src = 'chatbot.js';
    s.defer = true;
    document.body.appendChild(s);
  }
})();
