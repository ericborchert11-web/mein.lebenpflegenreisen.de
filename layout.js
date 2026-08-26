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
    bar.setAttribute('aria-label','Barrierefreiheit');
    bar.innerHTML = `
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

    // Logo-Ziel: Eingeloggte → ihr Hub, sonst Startseite
    const logoHref = session
      ? (LPR.roleTarget ? LPR.roleTarget(session.role) : 'mein-bereich.html')
      : 'index.html';

    // Untertitel je nach Kontext
    const subTitle = session
      ? (session.role === 'klinik' ? 'Klinik-Portal' :
         session.role === 'admin'  ? 'Admin-Bereich' :
                                     'Mein Bereich')
      : 'e.V. · Berlin';

    // ── Navigation ────────────────────────────────────────────────────────
    //
    // Der Vorstandsbereich hatte zwoelf Punkte in einer Zeile — auf dem Desktop
    // eine Aufzaehlung, auf dem Handy eine Liste zum Scrollen. Gruppiert sind es
    // vier. Die Schnittlinie ist nicht Taxonomie, sondern WOZU man die Seite
    // oeffnet: Menschen betreut man, Einsaetze plant man, Geld rechnet man ab.
    //
    // Geklappt wird mit <details>/<summary>, nicht mit einem eigenen Bauteil:
    // Tastaturbedienung, Vorlesbarkeit und Auf/Zu bringt das Element mit. Bei
    // einem Portal mit eigener Barrierefreiheits-Seite ist ein handgeschnitztes
    // Dropdown die schlechtere Wahl.

    /** Ein Menuepunkt. */
    const punkt = (href, seite, text, extra) =>
      `<li><a href="${href}" class="${c(seite)}">${text}${extra || ''}</a></li>`;

    /**
     * Eine Gruppe. Sie steht offen, wenn die aktuelle Seite darin liegt — sonst
     * muesste man sich beim Navigieren jedes Mal neu durchklicken.
     */
    const gruppe = (titel, seiten, eintraege, zusatz) => {
      const offen = seiten.indexOf(currentPage) !== -1 ? ' open' : '';
      // name= macht die Gruppen gegenseitig ausschliessend: Beim Oeffnen der
      // einen schliesst der Browser die andere. Ohne das staenden zwei
      // Klappmenues nebeneinander offen und ueberlappten sich.
      // Aeltere Browser ignorieren das Attribut — dann sind eben mehrere offen,
      // kaputt ist nichts.
      return `<li class="nav-gruppe"><details name="hauptnav"${offen}>
        <summary>${titel}${zusatz || ''}</summary>
        <ul class="nav-unter">${eintraege}</ul>
      </details></li>`;
    };

    const abmelden = `<li><a href="#" onclick="LPR.logout().then(function(){ location.href='index.html'; }); return false;" style="color:var(--warn);">Abmelden</a></li>`;

    let navItems = '';
    if (session) {
      if (session.role === 'ehrenamt') {
        // Schulung und Praeferenzen hingen bisher nur an Kacheln auf
        // mein-bereich. Wer die Kachel einmal weggescrollt hatte, fand sie
        // nicht wieder — dabei ist die Schulung eine der drei Saeulen, mit
        // denen die Portal-Startseite wirbt.
        navItems =
          punkt('mein-bereich.html', 'mein-bereich', 'Mein Bereich') +
          punkt('sitzwachen.html', 'sitzwachen', 'Sitzwachen') +
          punkt('schichtplaner.html', 'schichtplaner', 'Reisen') +
          punkt('abrechnung.html', 'abrechnung', 'Abrechnung') +
          gruppe('Mein Konto',
            ['compliance', 'schulung', 'praeferenzen', 'profil'],
            punkt('mein-compliance.html', 'compliance', 'Unterlagen') +
            punkt('schulung.html', 'schulung', 'Schulung') +
            punkt('meine-praeferenzen.html', 'praeferenzen', 'Präferenzen') +
            punkt('profil.html', 'profil', 'Profil')) +
          abmelden;

      } else if (session.role === 'klinik') {
        // Drei Punkte — hier gibt es nichts zu gruppieren.
        navItems =
          punkt('kliniken.html', 'kliniken', 'Klinik-Portal') +
          punkt('klinik-buchen.html', 'klinik-buchen', 'Sitzwache buchen') +
          punkt('klinik-buchungen.html', 'klinik-buchungen', 'Meine Buchungen') +
          abmelden;

      } else if (session.role === 'admin') {
        // Die Zahl offener Interessenten sitzt auf der GRUPPE, nicht auf dem
        // Eintrag: eingeklappt waere sie unsichtbar, und dann koennte man sie
        // sich sparen. Sie ist das eine Signal in diesem Menue, das sagt
        // "hier wartet jemand auf dich".
        const zahl = `<span id="nav-interesse-zahl" class="nav-badge" hidden></span>`;
        navItems =
          gruppe('Menschen',
            ['admin', 'ehrenamt-interesse'],
            punkt('admin-mitwirkende.html', 'admin', 'Mitwirkende') +
            punkt('admin-ehrenamt-interesse.html', 'ehrenamt-interesse', 'Interessenten'),
            zahl) +
          gruppe('Einsätze',
            ['sitzwachen-admin', 'kunden', 'kliniken-admin', 'reisen-admin', 'jahreskalender'],
            punkt('admin-sitzwachen.html', 'sitzwachen-admin', 'Sitzwachen') +
            punkt('admin-kunden.html', 'kunden', 'Kunden') +
            punkt('admin-kliniken.html', 'kliniken-admin', 'Kliniken') +
            punkt('admin-reisen.html', 'reisen-admin', 'Reisen') +
            punkt('admin-jahreskalender.html', 'jahreskalender', 'Jahreskalender')) +
          gruppe('Finanzen',
            ['auszahlungen-admin', 'pauschalen-admin', 'rechnungen-admin', 'kalkulation', 'foerdermittel'],
            punkt('admin-auszahlungen.html', 'auszahlungen-admin', 'Auszahlungen') +
            punkt('admin-pauschalen.html', 'pauschalen-admin', 'Pauschalen') +
            punkt('admin-rechnungen.html', 'rechnungen-admin', 'Rechnungen') +
            punkt('kalkulation.html', 'kalkulation', 'Kalkulation') +
            punkt('admin-foerdermittel.html', 'foerdermittel', 'Fördermittel')) +
          abmelden;
      }
    } else {
      navItems = `
        <li><a href="https://lebenpflegenreisen.de" target="_blank" rel="noopener" style="opacity:.8;">Zur Website ↗</a></li>
        <li><a href="login.html" class="btn btn-primary" style="padding:8px 18px;">Anmelden</a></li>
      `;
    }

    const header = document.createElement('header');
    header.className = 'site';
    header.innerHTML = `
      <div class="wrap header-row">
        <a href="${logoHref}" class="brand" aria-label="Zum Hauptbereich">
          <svg viewBox="0 0 48 48" width="40" height="40" aria-hidden="true">
            <g fill="none" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="10,10 24,24 10,38" stroke="#C8F135" stroke-width="4.5"/>
              <polyline points="22,10 36,24 22,38" stroke="#C8F135" stroke-width="4.5" opacity="0.42"/>
            </g>
          </svg>
          <div>
            <div class="brand-name">Leben <em>Pflegen</em> Reisen</div>
            <div class="brand-sub">${escapeHtml(subTitle)}</div>
          </div>
        </a>
        <nav aria-label="Hauptnavigation">
          <button class="menu-btn" onclick="document.querySelector('header.site nav ul').classList.toggle('open')" aria-label="Menü">☰</button>
          <ul>${navItems}</ul>
        </nav>
      </div>
    `;
    const anchor = document.querySelector('.a11y-bar');
    if (anchor) anchor.insertAdjacentElement('afterend', header);
    else document.body.insertBefore(header, document.body.firstChild);
    header.querySelectorAll('nav ul a').forEach(a => {
      a.addEventListener('click', () => header.querySelector('nav ul').classList.remove('open'));
    });

    // Eine offene Gruppe legt sich ueber die Seite. Sie muss sich schliessen
    // lassen, ohne den Menuepunkt noch einmal zu treffen — sonst verdeckt sie
    // genau das, was man lesen will.
    const gruppenZu = () => header.querySelectorAll('.nav-gruppe > details[open]')
      .forEach(d => { d.open = false; });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.nav-gruppe')) gruppenZu();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') gruppenZu();
    });
  }

  function renderFooter() {
    const session = LPR.getSession ? LPR.getSession() : null;
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
            <h4>Hauptwebsite</h4>
            <ul>
              <li><a href="https://lebenpflegenreisen.de" target="_blank" rel="noopener">Startseite ↗</a></li>
              <li><a href="https://lebenpflegenreisen.de/reisen" target="_blank" rel="noopener">Begleitete Reisen ↗</a></li>
              <li><a href="https://lebenpflegenreisen.de/sitzwachen" target="_blank" rel="noopener">Sitzwachen ↗</a></li>
              <li><a href="https://lebenpflegenreisen.de/ehrenamt" target="_blank" rel="noopener">Ehrenamt ↗</a></li>
            </ul>
          </div>
          <div class="footer-col">
            <h4>Mein Konto</h4>
            <ul>
              ${session ? `
                <li><a href="${LPR.roleTarget ? LPR.roleTarget(session.role) : 'mein-bereich.html'}">Mein Bereich</a></li>
                <li><a href="profil.html">Profil</a></li>
                <li><a href="#" onclick="LPR.logout().then(function(){ location.href='index.html'; }); return false;">Abmelden</a></li>
              ` : `
                <li><a href="login.html">Anmelden</a></li>
                <li><a href="login.html">Konto erstellen</a></li>
              `}
              <li><a href="barrierefreiheit.html">Barrierefreiheit</a></li>
            </ul>
          </div>
          <div class="footer-col">
            <h4>Rechtliches</h4>
            <ul>
              <li><a href="https://lebenpflegenreisen.de/impressum" target="_blank" rel="noopener">Impressum ↗</a></li>
              <li><a href="https://lebenpflegenreisen.de/datenschutz" target="_blank" rel="noopener">Datenschutz ↗</a></li>
            </ul>
          </div>
        </div>
        <div class="footer-bottom">
          <div>© 2026 Leben Pflegen Reisen e.V. · Berlin</div>
          <div>Kontakt: <a href="tel:+491743409116" style="color:var(--lime);">0174 3409116</a> · <a href="https://wa.me/491743409116" target="_blank" rel="noopener" style="color:var(--lime);">WhatsApp</a> · <a href="mailto:info@lebenpflegenreisen.de" style="color:var(--lime);">info@lebenpflegenreisen.de</a></div>
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
      zeigeOffeneInteressenten();
    },
    escapeHtml
  };

  /**
   * Zahl offener Interessenten-Meldungen ins Menue.
   *
   * Der Grund, warum diese Zahl ueberhaupt existiert: Eine Meldung, von der
   * niemand weiss, ist dasselbe wie keine Meldung. Genau dieser Fehler lag
   * vorher bei den Registrierungen vor — sie standen auf "pending" und niemand
   * bekam davon eine Nachricht. Die Mail an ehrenamt@ ist der eine Weg, diese
   * Zahl der zweite.
   *
   * Scheitert still: fehlt die Migration oder ist jemand kein Vorstand, bleibt
   * das Menue einfach ohne Zahl. Eine Fehlermeldung im Menue waere fuer alle
   * anderen Seiten laestig und fuer diese Zahl nicht wichtig genug.
   */
  async function zeigeOffeneInteressenten() {
    const el = document.getElementById('nav-interesse-zahl');
    if (!el || !window.LPR || !LPR.getSession) return;
    const s = LPR.getSession();
    if (!s || s.role !== 'admin') return;
    try {
      const sb = await LPR.supabase();
      const { data, error } = await sb.rpc('ehrenamt_interesse_offen');
      if (error || !data) return;
      el.textContent = data;
      el.hidden = false;
    } catch (_) { /* still */ }
  }

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
