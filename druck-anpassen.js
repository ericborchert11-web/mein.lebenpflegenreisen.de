/**
 * Druck auf ein Blatt — gemeinsame Routine für Rechnung und Auszahlungsbeleg.
 *
 * WARUM ES DAS GIBT
 * -----------------
 * Eine Rechnung mit drei Positionen passt auf eine Seite, eine mit fünf nicht
 * mehr — und dann steht die Pflichtfußzeile allein auf Blatt 2. Das sieht aus
 * wie ein Fehler, kostet Porto und Papier, und beim Empfänger landet ein
 * halbleeres zweites Blatt in der Buchhaltung. Feste Schriftgrößen lösen das
 * nicht: klein genug für die längste Rechnung heißt unnötig klein für die
 * kürzeste.
 *
 * Deshalb wird hier vor dem Druck gemessen und, wenn es knapp ist, genau so
 * weit verkleinert, dass der Beleg auf ein Blatt geht. Ist er weit darüber
 * (viele Positionen), bleibt es beim normalen Seitenumbruch — eine Rechnung
 * auf 60 % zusammenzuquetschen wäre schlechter als zwei ordentliche Seiten.
 *
 * WIE GEMESSEN WIRD
 * -----------------
 * Der Bildschirm zeigt den Beleg breiter und größer als das Papier, eine
 * Messung an der sichtbaren Seite wäre also wertlos. JavaScript kann das
 * Druck-Layout aber nicht direkt ausmessen (es gibt keine API dafür). Deshalb:
 * die Regeln aus den `@media print`-Blöcken der Seite werden einmal ausgelesen,
 * unter eine eigene Klasse umgehängt und auf einen unsichtbaren Klon in
 * Papierbreite angewandt. Was dabei herauskommt, ist die Höhe, die der Beleg
 * auf Papier hätte.
 *
 * Die Regeln werden bewusst NICHT hier nochmal aufgeschrieben, sondern aus dem
 * Stylesheet der Seite geholt: eine zweite Kopie würde beim nächsten
 * CSS-Umbau stillschweigend auseinanderlaufen, und dann misst diese Datei
 * etwas anderes, als der Drucker druckt.
 *
 * FÄLLT DAS SKRIPT AUS, ist nichts kaputt: ohne `--druck-faktor` steht der
 * Zoom auf 1 und es wird gedruckt wie vorher.
 */
(function (global) {
  'use strict';

  var PROBE_KLASSE = 'druck-probe';
  var probeGebaut = false;

  function mmZuPx(mm) {
    return mm * 96 / 25.4;
  }

  /**
   * Baut einmalig ein Stylesheet, das alle `@media print`-Regeln der Seite
   * unter `.druck-probe` nochmal anbietet — damit sie am Bildschirm auf den
   * Messklon wirken.
   *
   * Fremde Stylesheets (Google Fonts) werfen beim Zugriff auf cssRules eine
   * Sicherheitsausnahme. Die werden übersprungen, sie enthalten ohnehin keine
   * Druckregeln für den Beleg.
   */
  function probeStilBauen() {
    if (probeGebaut) return;
    probeGebaut = true;

    var css = '';
    for (var i = 0; i < document.styleSheets.length; i++) {
      var regeln;
      try {
        regeln = document.styleSheets[i].cssRules;
      } catch (e) {
        continue;
      }
      if (!regeln) continue;
      for (var j = 0; j < regeln.length; j++) {
        var r = regeln[j];
        if (!(r.media && String(r.media.mediaText).indexOf('print') !== -1)) continue;
        for (var k = 0; k < r.cssRules.length; k++) {
          var innen = r.cssRules[k];
          // Nur echte Selektor-Regeln lassen sich umhängen. @page & Co. haben
          // am Bildschirm keine Entsprechung und werden übersprungen.
          if (!innen.selectorText) continue;
          var sel = innen.selectorText.split(',').map(function (s) {
            s = s.trim();
            // html/body sind ausserhalb des Klons — ihre Druckregeln (etwa
            // min-height) spielen fuer die Hoehe des Belegs keine Rolle.
            if (/^(html|body)\b/.test(s)) return null;
            return '.' + PROBE_KLASSE + ' ' + s;
          }).filter(Boolean).join(', ');
          if (!sel) continue;
          css += sel + '{' + innen.style.cssText + '}\n';
        }
      }
    }

    var stil = document.createElement('style');
    stil.setAttribute('data-druck-probe', '');
    stil.textContent = css;
    document.head.appendChild(stil);
  }

  /**
   * @param {Object} opt
   *   el         Element, das skaliert werden soll (bekommt --druck-faktor)
   *   breiteMm   Textbreite auf dem Papier (A4 minus Seitenränder)
   *   hoeheMm    Texthöhe auf dem Papier (A4 minus Seitenränder)
   *   minFaktor  Untergrenze; darunter wird lieber umgebrochen (Vorgabe 0.8)
   */
  function anpassen(opt) {
    opt = opt || {};
    var el = opt.el;
    if (!el) return 1;

    var minFaktor = opt.minFaktor || 0.8;
    var breite = mmZuPx(opt.breiteMm || 182);   // 210 − 2 × 14
    var hoehe  = mmZuPx(opt.hoeheMm  || 269);   // 297 − 2 × 6 (@page) − 2 × 8 (Padding)

    // Sicherheitsabstand von 2 mm. Die Messung am Bildschirm trifft das
    // Druck-Layout nicht auf den Punkt — Chrome rundet Millimeter in Pixel,
    // und Schriften rendern in der Druckvorschau minimal anders. Ein Beleg,
    // der rechnerisch mit 3 px Luft passt, lief in der Praxis trotzdem auf
    // zwei Seiten. Lieber ein Prozent kleiner als ein zweites Blatt.
    hoehe -= mmZuPx(2);

    // Vor der Messung zurücksetzen: sonst misst der zweite Druck den bereits
    // verkleinerten Beleg und schrumpft ihn ein zweites Mal.
    el.style.removeProperty('--druck-faktor');

    var faktor = 1;
    try {
      probeStilBauen();

      var probe = document.createElement('div');
      probe.className = PROBE_KLASSE;
      probe.setAttribute('aria-hidden', 'true');
      probe.style.cssText = 'position:absolute;left:-99999px;top:0;width:' + breite +
                            'px;visibility:hidden;pointer-events:none';
      var klon = el.cloneNode(true);
      klon.style.removeProperty('--druck-faktor');
      probe.appendChild(klon);
      document.body.appendChild(probe);

      var ist = klon.getBoundingClientRect().height;
      document.body.removeChild(probe);

      if (ist > hoehe) {
        faktor = Math.floor((hoehe / ist) * 100) / 100;   // abrunden, nie knapp drüber
        if (faktor < minFaktor) faktor = 1;               // zu weit weg: lieber umbrechen
      }
    } catch (e) {
      // Messen ist Kür. Schlägt es fehl, wird ungezoomt gedruckt.
      console.warn('[LPR] Druckanpassung übersprungen:', e);
      return 1;
    }

    if (faktor !== 1) el.style.setProperty('--druck-faktor', String(faktor));
    return faktor;
  }

  /**
   * Hängt die Anpassung an das beforeprint-Ereignis. Chrome, Firefox und
   * Safari feuern es sowohl bei Cmd+P als auch bei window.print().
   */
  function beiDruck(getEl, opt) {
    global.addEventListener('beforeprint', function () {
      var el = typeof getEl === 'function' ? getEl() : getEl;
      if (el) anpassen(Object.assign({}, opt || {}, { el: el }));
    });
  }

  global.LPRDruck = { anpassen: anpassen, beiDruck: beiDruck };
})(window);
