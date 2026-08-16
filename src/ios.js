/* Downbeat — the platform layer.

   Modal presentation, the alert and action-sheet stack, the segmented
   control's thumb, swipe-to-delete and the toast. Everything in here exists
   because iOS has a specific, well-known answer to the question and users
   already know how it behaves — a bespoke dialog is not neutral, it is worse.

   Two things are worth reading before changing any of it.

   POINTER EVENTS, NOT TOUCH EVENTS. One code path covers finger, pencil,
   trackpad and mouse, and setPointerCapture means a drag that leaves the
   element still ends up back here rather than being silently dropped.

   A DRAG IS NOT A SCROLL, AND THE SHEET HAS TO DECIDE WHICH IT IS. The header
   and grabber always drag. The body drags only when it is already scrolled to
   the top and the gesture is downward — which is exactly the rule
   UISheetPresentationController uses, and the reason a sheet with a long list
   in it never feels like it is fighting you. */
(function (global) {
  'use strict';

  const doc = global.document;
  const $ = (sel, root) => (root || doc).querySelector(sel);

  /* --------------------------------------------------------------- basics */

  function el(tag, className, html) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (html != null) node.innerHTML = html;
    return node;
  }

  function icon(name, cls) {
    return `<svg class="i${cls ? ' ' + cls : ''}" aria-hidden="true" focusable="false"><use href="#i-${name}"></use></svg>`;
  }

  const reduced = () => (global.Motion ? global.Motion.reduced()
    : global.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* Feedback on iOS Safari is not available to a web app: navigator.vibrate is
     unimplemented there and there is no Taptic API. The call is kept because
     it is correct everywhere else the app runs, and because the alternative —
     scattering `if (navigator.vibrate)` through the UI — puts the platform
     check at forty call sites instead of one. */
  function haptic(pattern) {
    if (!global.navigator || typeof global.navigator.vibrate !== 'function') return;
    try { global.navigator.vibrate(pattern || 8); } catch (e) { /* not permitted */ }
  }

  /* ---------------------------------------------------------------- focus */

  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), ' +
    'select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

  function focusables(root) {
    return Array.from(root.querySelectorAll(FOCUSABLE))
      .filter((node) => node.offsetWidth || node.offsetHeight || node.getClientRects().length);
  }

  function trap(root, event) {
    if (event.key !== 'Tab') return;
    const list = focusables(root);
    if (!list.length) { event.preventDefault(); return; }
    const first = list[0];
    const last = list[list.length - 1];
    if (event.shiftKey && doc.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && doc.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  /* ---------------------------------------------------------------- toast */

  let toastNode = null;
  let toastTimer = 0;

  function toast(message, ms) {
    if (!toastNode) {
      toastNode = el('div', 'toast');
      toastNode.setAttribute('role', 'status');
      doc.body.appendChild(toastNode);
    }
    toastNode.textContent = message;
    /* Reflow between the text and the class, or a second toast fired while the
       first is still up never re-runs the transition. */
    void toastNode.offsetWidth;
    toastNode.classList.add('on');
    global.clearTimeout(toastTimer);
    toastTimer = global.setTimeout(() => toastNode.classList.remove('on'), ms || 2100);
  }

  /* --------------------------------------------------------------- sheets */

  /* One host, one sheet at a time. A stack would need a z-index ladder and a
     scrim per level for a app that never presents two at once. */
  let host = null;
  let live = null;

  function ensureHost() {
    if (host) return host;
    host = el('div', 'sheet-host');
    host.hidden = true;
    const scrim = el('div', 'scrim');
    scrim.addEventListener('click', () => { if (live && live.dismissable) live.close(); });
    host.appendChild(scrim);
    doc.body.appendChild(host);
    return host;
  }

  function present(node, options) {
    const opts = options || {};
    ensureHost();
    if (live) live.close(true);

    const previous = doc.activeElement;
    host.hidden = false;
    host.appendChild(node);

    const controller = {
      node,
      dismissable: opts.dismissable !== false,
      close: function (immediate) {
        if (live !== controller) return;
        live = null;
        host.classList.remove('is-open');
        const done = () => {
          if (node.parentNode === host) host.removeChild(node);
          if (!live) host.hidden = true;
          if (previous && previous.isConnected && typeof previous.focus === 'function') {
            previous.focus({ preventScroll: true });
          }
          if (opts.onClose) opts.onClose();
        };
        if (immediate || reduced()) done();
        else global.setTimeout(done, 340);
      }
    };
    live = controller;

    node.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && controller.dismissable) { event.stopPropagation(); controller.close(); }
      trap(node, event);
    });

    /* Two frames: one for the node to be in the tree with its off-screen
       transform applied, one for the class change to be a transition rather
       than an initial value. */
    global.requestAnimationFrame(() => global.requestAnimationFrame(() => {
      host.classList.add('is-open');
      const target = node.querySelector('[data-autofocus]') || node;
      if (target.tabIndex < 0 && target === node) node.tabIndex = -1;
      target.focus({ preventScroll: true });
    }));

    return controller;
  }

  /* -------------------------------------------------- drag to dismiss */

  /* The gesture that makes a sheet a sheet. A pull past a quarter of its own
     height, or a flick faster than half a pixel per millisecond, throws it
     away; anything less springs back. Both thresholds are the platform's. */
  function draggable(sheet, controller, scroller) {
    let startY = 0;
    let lastY = 0;
    let lastT = 0;
    let dy = 0;
    let active = false;
    let armed = false;

    const from = (event) => {
      /* The body only takes the gesture when it has nowhere left to scroll —
         otherwise the drag belongs to the list inside the sheet. */
      if (!scroller || !scroller.contains(event.target)) return true;
      return scroller.scrollTop <= 0;
    };

    sheet.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if (!controller.dismissable) return;
      /* A control under the finger is a tap, not the start of a drag. */
      if (event.target.closest('button, a, input, select, textarea')) return;
      armed = from(event);
      if (!armed) return;
      startY = lastY = event.clientY;
      lastT = event.timeStamp;
      dy = 0;
      active = false;
    });

    sheet.addEventListener('pointermove', (event) => {
      if (!armed) return;
      const delta = event.clientY - startY;
      if (!active) {
        /* Eight pixels of slop before the sheet commits to moving, so a tap
           that wanders never drags it. Upward movement releases the gesture
           back to the scroller. */
        if (delta < -4) { armed = false; return; }
        if (delta < 8) return;
        active = true;
        sheet.classList.add('is-dragging');
        try { sheet.setPointerCapture(event.pointerId); } catch (e) { /* already captured */ }
      }
      /* Past the bottom the sheet follows the finger one for one; pulled
         upward it resists, because there is nothing up there to go to. */
      dy = delta > 0 ? delta : delta / 6;
      sheet.style.transform = `translateY(${dy}px)`;
      lastY = event.clientY;
      lastT = event.timeStamp;
      event.preventDefault();
    }, { passive: false });

    const release = (event) => {
      if (!armed) return;
      armed = false;
      if (!active) return;
      active = false;
      sheet.classList.remove('is-dragging');
      sheet.style.transform = '';
      const dt = Math.max(1, event.timeStamp - lastT);
      const velocity = (event.clientY - lastY) / dt;
      const height = sheet.offsetHeight || 1;
      if (dy > height * 0.25 || velocity > 0.5) controller.close();
    };
    sheet.addEventListener('pointerup', release);
    sheet.addEventListener('pointercancel', release);
  }

  /* A standard sheet: grabber, centred title, optional lead and trail bar
     buttons, and a scrolling body. */
  function sheet(options) {
    const opts = options || {};
    const node = el('section', 'sheet');
    node.setAttribute('role', 'dialog');
    node.setAttribute('aria-modal', 'true');
    node.setAttribute('aria-label', opts.title || 'Sheet');

    node.appendChild(el('div', 'grabber'));

    const head = el('div', 'sheet-head');
    const lead = el('div', 'sheet-lead');
    if (opts.lead) {
      const button = el('button', 'btn', opts.lead.label);
      button.style.minHeight = '34px';
      button.addEventListener('click', () => opts.lead.onSelect(controller));
      lead.appendChild(button);
    }
    head.appendChild(lead);

    const title = el('h2', null, '');
    title.textContent = opts.title || '';
    head.appendChild(title);

    const trail = el('div', 'sheet-trail');
    const close = el('button', 'nav-btn', icon('close'));
    close.setAttribute('aria-label', 'Close');
    close.addEventListener('click', () => controller.close());
    trail.appendChild(close);
    head.appendChild(trail);
    node.appendChild(head);

    const body = el('div', 'sheet-body');
    if (typeof opts.body === 'string') body.innerHTML = opts.body;
    else if (opts.body) body.appendChild(opts.body);
    node.appendChild(body);

    const controller = present(node, opts);
    controller.body = body;
    draggable(node, controller, body);
    return controller;
  }

  /* ---------------------------------------------------------- action sheet */

  /* actions: [{ label, role: 'default'|'destructive', onSelect }]. Cancel is
     added automatically and sits in its own group, as it does on iOS. */
  function actionSheet(options) {
    const opts = options || {};
    const node = el('div', 'action-sheet');
    node.setAttribute('role', 'dialog');
    node.setAttribute('aria-modal', 'true');
    node.setAttribute('aria-label', opts.title || 'Actions');

    const group = el('div', 'action-group');
    if (opts.title || opts.message) {
      /* Built as nodes, not as markup. A sketch title is whatever the user
         typed into the rename field, and it reaches here on every open of the
         library's action sheet. */
      const head = el('div', 'action-title');
      if (opts.title) { const b = el('b'); b.textContent = opts.title; head.appendChild(b); }
      if (opts.message) { const d = el('div'); d.textContent = opts.message; head.appendChild(d); }
      group.appendChild(head);
    }
    (opts.actions || []).forEach((action) => {
      const button = el('button', action.role === 'destructive' ? 'is-danger' : null);
      button.textContent = action.label;
      button.addEventListener('click', () => {
        /* The handler runs FIRST and synchronously. navigator.share,
           execCommand('copy') and a download click all require the user
           activation the tap granted, and WebKit enforces a same-task rule
           strict enough that deferring even one frame loses it. Presenting is
           safe in either order — present() closes whatever is live before it
           mounts the next thing. */
        if (action.onSelect) action.onSelect();
        controller.close();
      });
      group.appendChild(button);
    });
    node.appendChild(group);

    const cancelGroup = el('div', 'action-group action-cancel');
    const cancel = el('button', null);
    cancel.textContent = opts.cancelLabel || 'Cancel';
    cancel.setAttribute('data-autofocus', '');
    cancel.addEventListener('click', () => controller.close());
    cancelGroup.appendChild(cancel);
    node.appendChild(cancelGroup);

    const controller = present(node, opts);
    draggable(node, controller, null);
    return controller;
  }

  /* ---------------------------------------------------------- alert/prompt */

  /* A centred alert rather than a sheet, because a destructive confirmation
     has to interrupt rather than slide politely into view. */
  function alertBox(options) {
    const opts = options || {};
    return new Promise((resolve) => {
      ensureHost();
      if (live) live.close(true);
      host.hidden = false;
      host.classList.add('is-alert');

      const node = el('div', 'alert');
      node.setAttribute('role', 'alertdialog');
      node.setAttribute('aria-modal', 'true');
      node.setAttribute('aria-label', opts.title || 'Alert');

      const card = el('div', 'alert-card');
      const copy = el('div', 'alert-copy');
      if (opts.title) { const b = el('b'); b.textContent = opts.title; copy.appendChild(b); }
      if (opts.message) { const t = el('p'); t.textContent = opts.message; copy.appendChild(t); }
      card.appendChild(copy);

      if (opts.field) {
        const wrap = el('div', 'alert-field');
        const input = el('input');
        input.type = 'text';
        input.value = opts.field.value || '';
        input.placeholder = opts.field.placeholder || '';
        input.setAttribute('aria-label', opts.field.label || opts.title || 'Value');
        input.setAttribute('data-autofocus', '');
        input.autocapitalize = 'sentences';
        input.enterKeyHint = 'done';
        wrap.appendChild(input);
        card.appendChild(wrap);
        card._input = input;
        input.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') { event.preventDefault(); finish(input.value.trim()); }
        });
      }

      const row = el('div', 'alert-actions');
      const cancel = el('button', null);
      cancel.textContent = opts.cancelLabel || 'Cancel';
      cancel.addEventListener('click', () => finish(null));
      row.appendChild(cancel);

      const go = el('button', opts.destructive ? 'is-danger' : 'is-default');
      go.textContent = opts.confirmLabel || 'OK';
      if (!opts.field) go.setAttribute('data-autofocus', '');
      go.addEventListener('click', () => finish(opts.field ? (card._input.value.trim() || null) : true));
      row.appendChild(go);
      card.appendChild(row);
      node.appendChild(card);

      let settled = false;
      function finish(value) {
        if (settled) return;
        settled = true;
        controller.close();
        host.classList.remove('is-alert');
        resolve(value);
      }

      const controller = present(node, {
        dismissable: true,
        onClose: () => { host.classList.remove('is-alert'); if (!settled) { settled = true; resolve(null); } }
      });
    });
  }

  const confirmBox = (options) => alertBox(options).then((value) => value === true);
  const promptBox = (options) => alertBox(Object.assign({ field: { value: '' } }, options));

  /* ---------------------------------------------------- segmented control */

  /* The thumb is one element moved with a transform. Painting a background on
     whichever button is selected cannot slide, and sliding is the whole of
     what a UISegmentedControl does. */
  function segmented(root, onChange) {
    const buttons = () => Array.from(root.querySelectorAll('button'));
    let thumb = root.querySelector('.seg-thumb');
    if (!thumb) { thumb = el('i', 'seg-thumb'); thumb.setAttribute('aria-hidden', 'true'); root.appendChild(thumb); }

    /* A tab is selected and a radio is checked. Both spellings are correct for
       the role that carries them and neither is correct for the other, so the
       attribute is chosen from the role rather than picked once for the file. */
    const attrOf = (node) => (node.getAttribute('role') === 'radio' ? 'aria-checked' : 'aria-selected');

    function sync() {
      const list = buttons();
      root.style.setProperty('--seg-n', list.length || 1);
      const index = list.findIndex((b) => b.getAttribute(attrOf(b)) === 'true');
      root.style.setProperty('--seg-i', index < 0 ? 0 : index);
      thumb.hidden = index < 0;
    }

    root.addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button || !root.contains(button)) return;
      if (button.getAttribute('aria-disabled') === 'true') {
        if (onChange) onChange(button.dataset.value, button, true);
        return;
      }
      select(button.dataset.value);
      haptic(6);
      if (onChange) onChange(button.dataset.value, button, false);
    });

    /* Left/right arrows move between segments, which is what the platform
       control does and what a keyboard user expects of role="tablist". */
    root.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      const list = buttons().filter((b) => b.getAttribute('aria-disabled') !== 'true');
      const current = list.indexOf(doc.activeElement);
      if (current < 0) return;
      event.preventDefault();
      const next = list[(current + (event.key === 'ArrowRight' ? 1 : list.length - 1)) % list.length];
      next.focus();
      select(next.dataset.value);
      if (onChange) onChange(next.dataset.value, next, false);
    });

    function select(value) {
      buttons().forEach((b) => {
        const on = b.dataset.value === value;
        b.setAttribute(attrOf(b), on ? 'true' : 'false');
        /* One tab stop for the whole control, arrow keys inside it — the
           roving-tabindex pattern both roles are specified with. */
        b.tabIndex = on ? 0 : -1;
      });
      sync();
    }

    sync();
    return { select, sync };
  }

  /* -------------------------------------------------------------- swipe */

  /* Swipe-to-delete. The row rides on a transform over a fixed action layer,
     exactly as a table view cell does, so the gesture people already use in
     Mail works here without being taught. */
  let openSwipe = null;

  function swipe(row, width) {
    const body = row.querySelector('.swipe-body');
    if (!body) return;
    const span = width || 84;
    let startX = 0;
    let startY = 0;
    let offset = 0;
    let base = 0;
    let axis = '';

    const set = (value) => { row.style.setProperty('--swipe', value); offset = value; };

    function closeIt() { row.classList.remove('is-dragging'); set(0); if (openSwipe === api) openSwipe = null; }
    const api = { close: closeIt, row };

    body.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      startX = event.clientX;
      startY = event.clientY;
      base = offset;
      axis = '';
    });

    body.addEventListener('pointermove', (event) => {
      if (!startX && !startY) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (!axis) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        /* A gesture is horizontal only if it is clearly more horizontal than
           vertical; anything else belongs to the list's own scrolling. */
        axis = Math.abs(dx) > Math.abs(dy) * 1.4 ? 'x' : 'y';
        if (axis === 'x') {
          row.classList.add('is-dragging');
          if (openSwipe && openSwipe !== api) openSwipe.close();
          try { body.setPointerCapture(event.pointerId); } catch (e) { /* already captured */ }
        }
      }
      if (axis !== 'x') return;
      event.preventDefault();
      const next = base + dx;
      /* Rubber-band past the ends rather than stopping dead. */
      set(next > 0 ? next / 5 : Math.max(next, -span - 40) );
    }, { passive: false });

    let dragged = false;
    const release = () => {
      if (axis === 'x') {
        row.classList.remove('is-dragging');
        dragged = true;
        if (offset < -span * 0.5) { set(-span); openSwipe = api; haptic(8); }
        else closeIt();
      }
      startX = startY = 0;
      axis = '';
    };
    body.addEventListener('pointerup', release);
    body.addEventListener('pointercancel', release);

    /* Two different clicks arrive here and they need opposite answers.
       A pointer that drags and releases on the same element still emits a
       click — swallow that one, or the gesture that just opened the row
       immediately closes it again. A genuine tap on an already-open row is
       the one that should close it, which is the same bargain a table view
       cell makes. */
    body.addEventListener('click', (event) => {
      if (dragged) { dragged = false; event.preventDefault(); event.stopPropagation(); return; }
      if (offset < -4) { event.preventDefault(); event.stopPropagation(); closeIt(); }
    }, true);

    return api;
  }

  function closeSwipes() { if (openSwipe) openSwipe.close(); }

  /* ------------------------------------------------------------- keyboard */

  /* iOS does not resize the layout viewport when the keyboard opens — it just
     covers the bottom of it — so a centred alert with a text field in it can
     end up entirely behind the keys. visualViewport is the only thing that
     knows how much is covered; the host pays it back as bottom padding. */
  if (global.visualViewport) {
    const sync = () => {
      const vv = global.visualViewport;
      const covered = Math.max(0, global.innerHeight - vv.height - vv.offsetTop);
      doc.documentElement.style.setProperty('--kb', Math.round(covered) + 'px');
    };
    global.visualViewport.addEventListener('resize', sync);
    global.visualViewport.addEventListener('scroll', sync);
    sync();
  }

  /* --------------------------------------------------------------- export */

  global.IOS = {
    el, icon, haptic, toast,
    sheet, actionSheet,
    alert: alertBox, confirm: confirmBox, prompt: promptBox,
    segmented, swipe, closeSwipes,
    focusables, reduced,
    close: function () { if (live) live.close(); },
    isOpen: function () { return !!live; }
  };
})(window);
