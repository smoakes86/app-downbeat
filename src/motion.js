/* Downbeat's motion engine.

   Nothing involving sequencing was fixable until this existed: there was no
   stagger, no FLIP, no JS reduced-motion query and no exit path anywhere in the
   repo, so every dismissal in the app was a display:none flip.

   The six curves are declared here and only here. They are written onto the
   document element at load as --e-detent … --e-rubber, which is what lets CSS
   and JS read the same easing without two copies of a cubic-bezier that can
   quietly disagree. */
(function () {
  'use strict';

  var EASE = {
    /* a rotary switch clicking to the next position: fast off the mark, settles
       hard, zero overshoot. Part switch, device switch, pill toggles. */
    detent: 'cubic-bezier(.16,.84,.28,1)',
    /* key travel: slow to break, quick through, cushioned at the bottom. */
    travel: 'cubic-bezier(.34,.02,.2,1)',
    /* a drawer thrown open. Entrances only. */
    throw: 'cubic-bezier(.2,0,0,1)',
    /* accelerating away. Exits only — a spring settles, an exit should not. */
    close: 'cubic-bezier(.5,0,.9,.4)',
    /* LED falloff. Only on --lit and the blooms. */
    decay: 'cubic-bezier(.3,0,.6,.2)',
    /* the one overshoot in the app: sheet drag release and the .check knob. */
    rubber: 'cubic-bezier(.18,1.3,.42,1)'
  };

  var root = document.documentElement;
  Object.keys(EASE).forEach(function (name) {
    root.style.setProperty('--e-' + name, EASE[name]);
  });

  /* A live read, re-checked on every call, so a mid-session OS change is
     respected rather than baked in at load. */
  var reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  function reduced() { return reducedQuery.matches; }

  function toArray(value) {
    if (!value) return [];
    if (value.nodeType === 1) return [value];
    return Array.prototype.slice.call(value);
  }

  /* Written once per song, never per frame: --beat-ms is an inherited property
     on the document element, so a per-frame write invalidates style for every
     node in the document regardless of how few of them read it. */
  function tempo(bpm) {
    var n = Number(bpm);
    if (!isFinite(n) || n <= 0) return;
    root.style.setProperty('--beat-ms', String(Math.round(60000 / n)));
  }

  /* Writes --enter-i per node; the CSS turns that into
     transition-delay: calc(var(--enter-i) * var(--hop)). Capped at twelve
     nodes sharing the twelfth's delay, because a 64-chip run must not take a
     second to arrive. --hop is set locally so the stagger step can differ from
     the beat-relative choreography step it defaults to. */
  function stagger(nodes, options) {
    var o = options || {};
    var step = typeof o.step === 'number' ? o.step : 16;
    var max = typeof o.max === 'number' ? o.max : 12;
    var cls = o.cls === undefined ? 'is-entering' : o.cls;
    var list = toArray(nodes);
    var slow = reduced() ? 0 : step;
    list.forEach(function (node, i) {
      node.style.setProperty('--enter-i', String(Math.min(i, max - 1)));
      node.style.setProperty('--hop', slow + 'ms');
      if (cls) node.classList.add(cls);
    });
    return list.length;
  }

  /* Rect, mutate, invert, play. Used where a list reorders — deleting a saved
     song, for one — so the survivors move to their new places instead of
     teleporting. */
  function flip(nodes, mutate) {
    var list = toArray(nodes);
    var first = list.map(function (n) { return n.getBoundingClientRect(); });
    if (typeof mutate === 'function') mutate();
    if (reduced()) return Promise.resolve();
    var playing = [];
    list.forEach(function (node, i) {
      var last = node.getBoundingClientRect();
      var dx = first[i].left - last.left;
      var dy = first[i].top - last.top;
      if ((!dx && !dy) || typeof node.animate !== 'function') return;
      playing.push(node.animate(
        [{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'none' }],
        { duration: 260, easing: EASE.detent }
      ));
    });
    return Promise.all(playing.map(function (a) {
      return a.finished ? a.finished.catch(function () {}) : Promise.resolve();
    }));
  }

  /* The single two-phase exit, used by all seven dismissable surfaces. Adding
     the class is phase one; [hidden] lands only after the transition has had
     its time. Re-entrant: a second call cancels the first rather than leaving
     two timers racing to hide the same element. */
  function hideWith(el, cls, ms) {
    return new Promise(function (resolve) {
      if (!el) { resolve(); return; }
      var name = cls || 'is-leaving';
      var wait = reduced() ? Math.min(ms || 0, 90) : (ms || 0);
      if (el._motionExit) clearTimeout(el._motionExit);
      el.classList.add(name);
      el._motionExit = setTimeout(function () {
        el._motionExit = null;
        el.classList.remove(name);
        el.hidden = true;
        resolve();
      }, wait);
    });
  }

  /* Cross-fade rather than cut: the faceplate on a device switch, and the two
     chrome bars entering performance mode. The outgoing copy is removed once it
     has finished, never left in the tree at opacity zero swallowing clicks. */
  function swap(oldEl, newEl, options) {
    var o = options || {};
    var inMs = typeof o.in === 'number' ? o.in : 260;
    var outMs = typeof o.out === 'number' ? o.out : 130;
    if (reduced()) { inMs = 90; outMs = 60; }
    if (newEl && typeof newEl.animate === 'function') {
      newEl.animate([{ opacity: 0 }, { opacity: 1 }], { duration: inMs, easing: EASE.throw });
    }
    if (!oldEl) return Promise.resolve();
    var done = function () { if (oldEl.parentNode) oldEl.parentNode.removeChild(oldEl); };
    if (typeof oldEl.animate !== 'function') { done(); return Promise.resolve(); }
    var out = oldEl.animate(
      [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.992)' }],
      { duration: outMs, easing: EASE.close, fill: 'forwards' }
    );
    return (out.finished || Promise.resolve()).then(done, done);
  }

  /* The slot cut: text does not cross-fade into other text, it travels. Each
     word rides up out of its own mask and the replacement rises into it, 40ms
     apart, which is what a mechanical split-flap does and what a keygen
     character-shuffle does not. */
  function slot(el, text) {
    if (!el) return;
    var next = text == null ? '' : String(text);
    if (el.textContent === next) return;
    if (reduced() || typeof el.animate !== 'function') { el.textContent = next; return; }

    var leaving = document.createElement('span');
    leaving.style.cssText = 'display:inline-block;overflow:hidden;vertical-align:bottom';
    var leavingInner = document.createElement('span');
    leavingInner.style.display = 'inline-block';
    leavingInner.textContent = el.textContent;
    leaving.appendChild(leavingInner);

    el.textContent = '';
    el.appendChild(leaving);
    leavingInner.animate([{ transform: 'none' }, { transform: 'translateY(-100%)' }],
      { duration: 130, easing: EASE.close, fill: 'forwards' });

    setTimeout(function () {
      el.textContent = '';
      next.split(/(\s+)/).forEach(function (word, i) {
        if (!word) return;
        if (!word.trim()) { el.appendChild(document.createTextNode(word)); return; }
        var mask = document.createElement('span');
        mask.style.cssText = 'display:inline-block;overflow:hidden;vertical-align:bottom';
        var inner = document.createElement('span');
        inner.style.display = 'inline-block';
        inner.textContent = word;
        mask.appendChild(inner);
        el.appendChild(mask);
        inner.animate([{ transform: 'translateY(100%)' }, { transform: 'none' }],
          { duration: 240, delay: Math.min(i, 12) * 40, easing: EASE.detent, fill: 'backwards' });
      });
    }, 130);
  }

  window.Motion = {
    EASE: EASE,
    reduced: reduced,
    tempo: tempo,
    stagger: stagger,
    flip: flip,
    hideWith: hideWith,
    swap: swap,
    slot: slot
  };
})();
