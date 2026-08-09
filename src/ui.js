/* Downbeat — the desk.

   The hardware is the app. It sits in #rig and never moves; #stage carries
   whichever part you are playing — its shape on the grid, the pads to press
   for it, and the recipe for setting the device up. Song creation and the
   arrangement guide open as sheets *inside* #stage, which is what lets you
   change the song without ever losing sight of the faceplate. */
(function (global) {
  'use strict';

  /* The room comes up dark and then powers on. This script is the last thing in
     <body>, so adding the class here still lands before the first paint — which
     is the whole point: css/motion.css parks the panels, the faceplate and the
     play lamp at rest behind `.is-booting:not(.is-powered)`, and a class that
     arrived a frame late would show the settled interface first and then hide
     it. The flip to `.is-powered` is what runs the sequence.

     Deliberately not `.is-live`: §5.7 and §7.4 both use that class to mean *the
     transport is running*, and ui.js sets it on play and clears it on stop. If
     the power-on hung off it the whole interface would power down every time
     you pressed stop. */
  document.body.classList.add('is-booting');

  /* The release is armed here, next to the thing it releases, and not at the
     end of this file — everything below can throw, and the rest state it would
     strand the app in is `opacity:0` on the rig and the stage. A blank room is
     a far worse failure than a missing animation, so the timer is the floor and
     the rAF at the foot of the file is only the good path. Whichever lands
     first wins; the other is a no-op. 400ms also covers a background tab, where
     rAF is throttled to nothing and no frame is ever produced. */
  const powerOn = () => document.body.classList.add('is-powered');
  global.setTimeout(powerOn, 400);

  const T = global.Theory;
  const G = global.Genres;
  const C = global.Compose;
  const Engine = global.Engine;
  const Midi = global.Midi;
  const Devices = global.Devices;
  const Arrange = global.Arrange;
  const Library = global.Library;
  const mod = T.mod;

  const $ = (selector) => document.querySelector(selector);
  const genreSelect = $('#genreSelect');
  const keySelect = $('#keySelect');
  const scaleSelect = $('#scaleSelect');
  const energySelect = $('#energySelect');
  const barsSelect = $('#barsSelect');
  const tempoRange = $('#tempoRange');
  const counterToggle = $('#counterToggle');
  const desk = $('#desk');
  const lane = $('#lane');

  /* Resolved once, at mount.

     Every element below is written on every animation frame while the
     transport runs. A querySelector per frame is sixty document walks a second
     spent finding five elements that never move — and the playhead is the one
     thing in a music tool that is not allowed to stutter. Nothing in the
     playback path may read layout either, which is why the run's scroll
     correction happens only on the frame the highlighted chip changes. */
  const laneWrap = $('#laneWrap');
  const laneHead = $('#laneHead');
  const laneBars = $('#laneBars');
  const runBox = $('#run');
  const barSlot = $('#barSlot');
  const barProgress = $('#barProgress');
  const barPos = $('#barPos');
  const specPlate = $('#specPlate');
  const performancePosition = $('#performancePosition');
  /* motion.js is loaded before this file; the shim is only so a missing script
     degrades to no choreography rather than to a blank screen. */
  const Motion = global.Motion || {
    reduced: () => false, tempo: () => {}, stagger: () => 0,
    hideWith: (el) => { if (el) el.hidden = true; return Promise.resolve(); },
    flip: (nodes, mutate) => { if (mutate) mutate(); return Promise.resolve(); },
    slot: (el, text) => { if (el) el.textContent = text == null ? '' : String(text); }
  };
  /* Same shim reasoning: the mark is identity, not chrome, so a missing module
     must leave an empty box rather than take the boot down with it. */
  const Mark = global.Mark || { render: () => null, svg: () => '', favicon: () => '' };

  /* Written where §5.5's table gives a region an index of its own rather than a
     position in a list — the control tiers are 0,1,1,2,2, which no single
     stagger call can produce. Same two properties Motion.stagger writes, so
     css/motion.css reads one contract either way. */
  function enterAt(el, index, step) {
    if (!el) return;
    el.style.setProperty('--enter-i', String(index));
    el.style.setProperty('--hop', (Motion.reduced() ? 0 : (step || 45)) + 'ms');
  }

  /* [hidden] is display:none, which is what pushed Structure off the right edge
     of a 374px screen the moment Undo appeared. These three reserve their space
     from first paint and fade instead, so the row's geometry never changes
     under a thumb. inert rather than a tabindex dance: an invisible control
     must not be reachable, and visibility:hidden alone does not stop a
     programmatic focus() landing on it. */
  function showConditional(el, shown) {
    if (!el) return;
    el.toggleAttribute('data-shown', !!shown);
    el.inert = !shown;
  }

  /* The progress bar carries a value written from the audio clock every frame,
     so it must not be tweened: a 100ms transition restarted sixty times a
     second leaves the visual transport permanently 100ms behind what you are
     hearing. It must not animate `width` either — that is layout, and layout
     is the one kind of work a per-frame value cannot afford. It scales from a
     full-width element pinned to its left edge instead. These are set inline
     because they have to outrank the chrome sheet's own rule for this element,
     which still declares the width animation. */
  barProgress.style.width = '100%';
  barProgress.style.transformOrigin = 'left center';
  barProgress.style.transform = 'scaleX(0)';
  barProgress.style.transition = 'none';

  let song = null;
  let tempoTouched = false;
  let frame = null;
  const DRAFT_STORE = global.Store.key('draft.v1');
  const COUNT_IN_STORE = global.Store.key('count-in');
  const ONBOARDING_STORE = global.Store.key('onboarding.v1');
  const PERFORMANCE_STORE = global.Store.key('performance');
  const history = [];
  const HISTORY_LIMIT = 24;

  const TITLES = [
    'Bar one', 'Straight in', 'Second time round', 'The turnaround',
    'Top of the form', 'The lift', 'One more chorus', 'Open fifth',
    'Four to the bar', 'Half-time', 'Held note', 'Out on the four'
  ];

  /* ----------------------------------------------------------- populate */

  G.order.forEach((id) => genreSelect.add(new Option(G.GENRES[id].label, id)));
  T.KEYS.forEach((key) => keySelect.add(new Option(key.label, String(key.pc))));
  genreSelect.value = 'pop';
  keySelect.value = '0';

  function refreshScales() {
    const scales = G.scalesFor(genreSelect.value);
    const previous = scaleSelect.value;
    scaleSelect.innerHTML = '';
    scaleSelect.add(new Option('Pick for me', 'auto'));
    scales.forEach((name) => scaleSelect.add(new Option(name, name)));
    scaleSelect.value = scales.indexOf(previous) >= 0 ? previous : 'auto';
    $('#genreBlurb').textContent = G.GENRES[genreSelect.value].blurb;
  }

  function setTempoTouched(value) {
    tempoTouched = value;
    showConditional($('#tempoReset'), value);
  }

  /* Once ::-webkit-slider-runnable-track is styled, accent-color stops painting
     progress in every engine except Firefox — so the filled half of the track is
     drawn from this number instead. Written on input, on change, and wherever a
     genre or a saved song sets the tempo behind the user's back. */
  function syncTempoFill() {
    const min = Number(tempoRange.min) || 0;
    const max = Number(tempoRange.max) || 100;
    const span = max - min;
    const at = span > 0 ? ((Number(tempoRange.value) - min) / span) * 100 : 0;
    tempoRange.style.setProperty('--range-fill', Math.max(0, Math.min(100, at)).toFixed(2));
  }

  let announceTimer = null;
  function announce(message) {
    const status = $('#transportStatus');
    if (announceTimer) global.clearTimeout(announceTimer);
    status.textContent = '';
    announceTimer = global.setTimeout(() => {
      status.textContent = message;
      announceTimer = null;
    }, 20);
  }

  function haptic(pattern) {
    const nav = global.navigator;
    if (!nav || typeof nav.vibrate !== 'function') return;
    /* Chrome refuses to vibrate before the frame has been touched and reports
       the refusal as a console error, not an exception — so the try/catch below
       never sees it and the console fills with one entry per part switch for as
       long as the session is driven from the keyboard or a script. Asking first
       is the same check the browser is about to make, and it keeps the console
       clean enough that a real error is visible in it. */
    if (nav.userActivation && !nav.userActivation.hasBeenActive) return;
    try { nav.vibrate(pattern || 8); } catch (e) { /* optional capability */ }
  }

  /* ----------------------------------------------------------- generate */

  function options(extra) {
    const genre = G.GENRES[genreSelect.value];
    const base = {
      genre: genreSelect.value,
      keyPc: Number(keySelect.value),
      scale: scaleSelect.value === 'auto' ? null : scaleSelect.value,
      energy: energySelect.value,
      bars: barsSelect.value === 'auto' ? 'auto' : Number(barsSelect.value),
      bpm: tempoTouched ? Number(tempoRange.value) : null,
      counter: counterToggle.checked
    };
    if (!base.scale) delete base.scale;
    // Keep the tempo slider inside what the genre actually plays at.
    tempoRange.min = Math.min(50, genre.tempo[0] - 10);
    tempoRange.max = Math.max(180, genre.tempo[1] + 20);
    return Object.assign(base, extra || {});
  }

  function syncUndo() {
    showConditional($('#undoButton'), history.length > 0);
  }

  function rememberCurrent() {
    if (!song) return;
    const recipe = Library.recipeOf(song);
    const encoded = Library.encode(recipe);
    const previous = history.length ? Library.encode(history[history.length - 1]) : '';
    if (encoded && encoded !== previous) history.push(recipe);
    if (history.length > HISTORY_LIMIT) history.shift();
    syncUndo();
  }

  function saveDraft() {
    if (!song) return;
    try { localStorage.setItem(DRAFT_STORE, JSON.stringify(Library.recipeOf(song))); } catch (e) { /* private mode */ }
  }

  function undoLastChange() {
    const recipe = history.pop();
    if (!recipe) return;
    loadRecipe(recipe, { noHistory: true });
    syncUndo();
    toast('Undid song change');
    announce('Previous song restored');
    haptic(6);
  }

  function generate(extra, behavior) {
    const mode = behavior || {};
    if (!mode.noHistory) rememberCurrent();
    stopPlayback();
    const opts = options(extra);
    song = C.compose(opts);
    // The title belongs to the song, not to the render — otherwise a saved
    // sketch would come back under a different name every time.
    song.title = opts.title || TITLES[Math.floor(Math.random() * TITLES.length)];
    song.opts = opts;
    if (!tempoTouched) tempoRange.value = song.bpm;
    syncTempoFill();
    $('#tempoValue').textContent = `${song.bpm} bpm`;
    /* Once per song, never per frame. Everything beat-relative — the decay
       behind the playhead, the stagger between chips — is derived from this. */
    Motion.tempo(song.bpm);
    clearAudition();
    /* §7.7, in the bible's order: the title cuts first, the sweep is claimed
       here and spent by the render below once the surfaces it crosses have
       actually been repainted, and the plate follows. Two buttons that look
       identical when pressed is the bug the `changed` list exists to fix. */
    Motion.slot($('#songTitle'), song.title);
    pendingSweep = mode.changed || ALL_TRACKS;
    render();
    writeSpecPlate();
    saveDraft();
  }

  /* Which tracks a rewrite actually touched. A reroll that holds the harmony
     steady must not wash the chord card, or the two reroll buttons are one
     button with two labels. */
  const ALL_TRACKS = ['melody', 'counter', 'chords', 'bass', 'drums'];
  let pendingSweep = null;

  /* The tape head passing (§5.6). One element on the lane, one class on the
     run, both removed when they finish. `.sweep` is fully styled in
     css/motion.css and #lane is already the positioned, clipping container it
     needs; a11y.css turns the travel into a cross-cut rather than deleting it. */
  function spendSweep(part) {
    const scope = pendingSweep;
    pendingSweep = null;
    if (!scope || scope.indexOf(part) < 0) return;

    const band = document.createElement('i');
    band.className = 'sweep';
    band.setAttribute('aria-hidden', 'true');
    band.addEventListener('animationend', () => band.remove());
    lane.append(band);

    runBox.classList.remove('is-sweeping');
    void runBox.offsetWidth;
    runBox.classList.add('is-sweeping');
    if (runSweepTimer) global.clearTimeout(runSweepTimer);
    runSweepTimer = global.setTimeout(() => {
      runSweepTimer = null;
      runBox.classList.remove('is-sweeping');
    }, 260);
  }
  let runSweepTimer = null;

  /* A plate is stamped, and a stamp does not spell things out: the full scale
     names run the line onto two and the register only reads as engraving on
     one. These are the abbreviations an instrument's own screen uses. */
  const PLATE_SCALE = {
    'Major (Ionian)': 'maj', 'Natural Minor': 'min', 'Dorian': 'dor',
    'Phrygian': 'phr', 'Lydian': 'lyd', 'Mixolydian': 'mix',
    'Harmonic Minor': 'harm min', 'Melodic Minor': 'mel min',
    'Phrygian Dominant': 'phr dom'
  };

  /* §3.6 / §7.8. The asset tag, recomputed with the song. Uppercased by the
     stylesheet, so the string is written in the app's own voice and the
     transform stays a presentation decision. */
  function writeSpecPlate() {
    if (!specPlate || !song) return;
    const device = Devices.DEVICES[deviceState.device];
    Motion.slot(specPlate, [
      'Downbeat', device ? device.label : '—',
      `${song.key.rootName} ${PLATE_SCALE[song.scaleName] || song.scaleName}`,
      `${song.bpm} BPM`, `${song.bars} bar`
    ].join(' · '));
  }

  /* Rebuild a saved sketch exactly: same seeds, same key, same everything. */
  function loadRecipe(recipe, behavior) {
    const opts = Library.optionsOf(recipe);
    genreSelect.value = opts.genre;
    refreshScales();
    keySelect.value = String(opts.keyPc);
    scaleSelect.value = opts.scale || 'auto';
    energySelect.value = opts.energy;
    barsSelect.value = opts.bars === 'auto' ? 'auto' : String(opts.bars);
    counterToggle.checked = opts.counter;
    setTempoTouched(true);
    tempoRange.value = opts.bpm;
    generate(opts, behavior);
  }

  /* Reroll one half of the sketch while holding the other steady. The `changed`
     list is what makes the two buttons visibly different: a new melody rewrites
     the two sung lines, a new harmony rewrites the chords and the bass that
     walks them, and only the surface that was actually rewritten is swept. */
  function rerollMelody() {
    if (!song) return generate();
    generate({ harmonySeed: song.harmonySeed, scale: song.scaleName, bars: song.bars },
      { changed: ['melody', 'counter'] });
  }

  function rerollChords() {
    if (!song) return generate();
    generate({ melodySeed: song.melodySeed }, { changed: ['chords', 'bass'] });
  }

  /* -------------------------------------------------------------- state */

  /* One device, chosen by hand and held: switching parts changes what you are
     playing, never what you are playing it on. */
  const DEVICE_STORE = global.Store.key('devices.v1');
  let deviceState = { track: 'melody', device: Devices.DEFAULT_DEVICE };
  try {
    const saved = JSON.parse(localStorage.getItem(DEVICE_STORE));
    if (saved) {
      if (Devices.TRACKS.some((t) => t.id === saved.track)) deviceState.track = saved.track;
      /* Earlier builds kept a device per track and reassigned it under you.
         Carry across the one that was last on screen. */
      const device = saved.device || (saved.devices && saved.devices[deviceState.track]);
      if (Devices.DEVICES[device]) deviceState.device = device;
    }
  } catch (e) { /* first visit */ }

  function saveDeviceState() {
    try { localStorage.setItem(DEVICE_STORE, JSON.stringify(deviceState)); } catch (e) { /* private mode */ }
  }

  let mounted = null;     // the live Devices.mount handle
  let soloOn = false;

  /* --------------------------------------------------------------- mutes

     Three things can silence a part — solo, an audition from the structure
     sheet, and nothing at all — so they resolve in one place rather than
     fighting over Engine.setMute. */
  let auditioning = null;
  let auditionMuted = [];

  function applyMutes() {
    const muted = auditioning
      ? auditionMuted
      : soloOn ? Devices.TRACKS.map((t) => t.id).filter((id) => id !== deviceState.track) : [];
    Devices.TRACKS.forEach((t) => Engine.setMute(t.id, muted.indexOf(t.id) >= 0));
  }

  /* §5.3: a [hidden] toggle is 220ms in and 120ms out, and .ghost[hidden] is
     display:none, so the exit class has to land before the attribute does.
     Motion.hideWith parks its own timer on the element and cancels a second
     call against it; showing again inside that window has to cancel it too, or
     the element is hidden 120ms after being asked to appear. */
  function setGhostShown(el, shown) {
    if (!el) return;
    if (shown) {
      if (el._motionExit) { global.clearTimeout(el._motionExit); el._motionExit = null; }
      el.classList.remove('is-leaving');
      el.hidden = false;
    } else if (!el.hidden) {
      Motion.hideWith(el, 'is-leaving', 120);
    }
  }

  function clearAudition() {
    auditioning = null;
    auditionMuted = [];
    setGhostShown($('#arrangeReset'), false);
    Array.from(document.querySelectorAll('.is-auditioning'))
      .forEach((el) => el.classList.remove('is-auditioning'));
    applyMutes();
  }

  function auditionSection(section) {
    if (auditioning === section.id) return clearAudition();
    auditioning = section.id;
    auditionMuted = section.muted;
    soloOn = false;
    syncSolo();
    applyMutes();
    setGhostShown($('#arrangeReset'), true);
    Array.from(document.querySelectorAll('[data-section]')).forEach((el) => {
      el.classList.toggle('is-auditioning', el.dataset.section === section.id);
    });
    if (!Engine.isPlaying()) startPlayback(true);
  }

  function syncSolo() {
    $('#soloButton').setAttribute('aria-pressed', String(soloOn));
  }

  /* -------------------------------------------------------------- render */

  function render() {
    /* The title is not written here: generate() slot-cuts it, and a textContent
       write landing first would leave the cut with nothing to travel to. */
    $('#songMeta').textContent = `${song.genre.label} · ${song.key.rootName} ${song.scaleName} · ${song.bpm} bpm`;
    buildBarSegments();
    // A remembered optional part may not exist in the newly loaded song. Keep
    // the first rendered screen actionable instead of landing on an empty tab.
    if (!hasPart(deviceState.track)) {
      deviceState.track = 'melody';
      saveDeviceState();
    }
    renderParts();
    renderPart();
    renderStructure();
    renderLibrary();
  }

  function hasPart(id) {
    if (id === 'counter') return !!(song.counter && song.counter.length);
    if (id === 'drums') return !!song.drums.length;
    return true;
  }

  /* ------------------------------------------------------- transport slot

     One segment per bar (§6.2). A single undifferentiated line cannot say
     where you are in the form and cannot show the loop point resetting; a
     segmented strip does both without adding a control anyone has to learn.

     #barProgress is kept and *moved* into whichever segment is current rather
     than rebuilt per bar. That keeps the per-frame write in followPlayhead at
     exactly one transform on one node — and --head is registered inherits:false
     anyway, so a value written on the housing would never reach a child. */
  let barSegs = [];
  let lastBarIndex = -1;

  function buildBarSegments() {
    const bars = Math.max(1, song ? song.bars : 1);
    if (barSegs.length === bars) return resetBarSegments();
    Array.from(barSlot.querySelectorAll('.bar-seg')).forEach((el) => el.remove());
    const out = document.createDocumentFragment();
    barSegs = [];
    for (let bar = 0; bar < bars; bar++) {
      const seg = document.createElement('button');
      seg.type = 'button';
      seg.className = 'bar-seg';
      seg.dataset.bar = String(bar);
      seg.setAttribute('aria-label', `Bar ${bar + 1} of ${bars}`);
      seg.onclick = () => showBar(bar);
      out.append(seg);
      barSegs.push(seg);
    }
    barSlot.append(out);
    resetBarSegments();
  }

  /* The fill lives inside a segment, never as a bare flex child of the housing
     — as a sibling of the segments it would claim a twelfth of the slot and
     squeeze them. At rest it parks in bar one at scaleX(0). */
  function resetBarSegments() {
    lastBarIndex = -1;
    barSegs.forEach((seg) => seg.classList.remove('is-done', 'is-now'));
    Array.from(laneBars.children).forEach((cell) => cell.classList.remove('is-now'));
    if (barSegs[0] && barProgress.parentNode !== barSegs[0]) barSegs[0].append(barProgress);
    barProgress.style.transform = 'scaleX(0)';
  }

  /* Called on the frame the bar turns over and on no other — a class write per
     segment per frame is the exact per-frame churn §5.7 forbids. */
  function markBar(bar) {
    for (let i = 0; i < barSegs.length; i++) {
      barSegs[i].classList.toggle('is-done', i < bar);
      barSegs[i].classList.toggle('is-now', i === bar);
    }
    const seg = barSegs[bar];
    if (seg && barProgress.parentNode !== seg) seg.append(barProgress);
    const cells = laneBars.children;
    for (let i = 0; i < cells.length; i++) cells[i].classList.toggle('is-now', i === bar);
  }

  /* The engine has no seek — its scheduler always starts a take at step zero —
     so a segment moves the *score* to that bar rather than the playhead. That
     is still the thing the strip is a map of, and it is the one job a 3px
     control can do honestly with the API it has. */
  function showBar(bar) {
    const row = runBox.querySelector(`.seq-row[data-bar="${bar}"]`);
    if (row && row.scrollIntoView) {
      row.scrollIntoView({
        block: 'nearest', inline: 'nearest',
        behavior: Motion.reduced() ? 'auto' : 'smooth'
      });
    }
    announce(`Bar ${bar + 1} of ${song ? song.bars : 1}`);
  }

  /* Five buttons, one per part, each carrying its own colour. Picking one is
     the main gesture in the app, so they are the first thing under the bar. */
  function renderParts() {
    const parts = $('#parts');
    parts.innerHTML = Devices.TRACKS.map((t, i) => {
      const on = t.id === deviceState.track;
      const available = hasPart(t.id);
      /* aria-disabled, never disabled: an unavailable part keeps its place in
         the tab order, announces its own label, and activating it opens the
         sheet that would create it. A dead button that cannot even be read is
         not a state, it is an omission (§6.11/§9.6). */
      return `<button class="part${on ? ' is-on' : ''}${available ? '' : ' is-empty'}"` +
        ` data-part="${t.id}" aria-pressed="${on}" aria-current="${on ? 'true' : 'false'}"` +
        ` aria-keyshortcuts="${i + 1}"` +
        ` aria-label="${t.label}${available ? '' : ', unavailable in this song'}"` +
        `${available ? '' : ' aria-disabled="true"'}>${t.label}</button>`;
    }).join('');
    Array.from(parts.children).forEach((chip) => {
      chip.onclick = () => selectPart(chip.dataset.part);
    });
  }

  /* Every empty state in the app promises the same recourse: open New song with
     the control that fixes it focused. Focusing it is not enough — Tempo, the
     counter toggle and the key are all inside a closed <details>, whose
     contents are display:none, so the focus() call lands on nothing and the
     recourse dead-ends on the sheet's first field. The disclosure is opened
     first, and the field is scrolled to, so the fix is the thing you are
     looking at when the sheet arrives. */
  function openSheetTo(focusId) {
    openSheet('songSheet');
    const target = $('#' + focusId);
    if (!target) return;
    let box = target.closest('details');
    while (box) {
      box.open = true;
      box = box.parentElement ? box.parentElement.closest('details') : null;
    }
    global.setTimeout(() => {
      target.focus({ preventScroll: true });
      if (target.scrollIntoView) {
        target.scrollIntoView({ block: 'center', behavior: Motion.reduced() ? 'auto' : 'smooth' });
      }
    }, 60);
  }

  function selectPart(id) {
    if (!Devices.TRACKS.some((t) => t.id === id)) return;
    /* The guard moved off the attribute and onto the click, because the control
       is reachable now. An unavailable part is a problem with a fix, so it
       leads to the fix rather than to nothing. */
    if (!hasPart(id)) {
      const track = Devices.TRACKS.find((item) => item.id === id);
      announce(`${track ? track.label : 'That part'} is not in this song. Opening New song.`);
      openSheetTo(id === 'counter' ? 'counterToggle' : 'genreSelect');
      return;
    }
    /* §7.3 step 2: the switch body kicks the way you moved. --dir is the signed
       index delta, so left and right are not the same animation. */
    const order = Devices.TRACKS.map((t) => t.id);
    const parts = $('#parts');
    const delta = order.indexOf(id) - order.indexOf(deviceState.track);
    if (delta && parts) {
      parts.style.setProperty('--dir', delta > 0 ? '1' : '-1');
      parts.classList.remove('is-detent');
      void parts.offsetWidth;
      parts.classList.add('is-detent');
    }
    deviceState.track = id;
    saveDeviceState();
    renderParts();
    renderPart();
    const track = Devices.TRACKS.find((item) => item.id === id);
    if (track) {
      $('#performancePart').textContent = track.label;
      announce(`${track.label} selected`);
    }
    haptic(8);
    // Solo follows the part you are looking at, which is the point of it.
    applyMutes();
    // Five chips will not sit across a phone, so the row scrolls — keep the
    // one you just chose in view, however you chose it.
    const chip = $(`.part[data-part="${id}"]`);
    if (chip && chip.scrollIntoView) {
      chip.scrollIntoView({
        block: 'nearest', inline: 'center',
        behavior: Motion.reduced() ? 'auto' : 'smooth'
      });
    }
  }

  /* Hardware performance is sequential: next and previous move only through
     parts this song actually contains, so the player never lands on a dead end. */
  function stepPart(delta) {
    const ids = Devices.TRACKS.map((t) => t.id).filter(hasPart);
    const at = ids.indexOf(deviceState.track);
    selectPart(ids[mod(at + delta, ids.length)]);
  }

  let performanceOn = false;
  function setPerformance(on, quiet) {
    performanceOn = !!on;
    if (performanceOn && openName) closeSheet();
    document.body.classList.toggle('is-performing', performanceOn);
    const chrome = $('#performanceChrome');
    /* §6.32 is a cross-fade, and a display flip skips both halves of it — the
       strip disappears in a frame while the bar is still fading back in
       underneath, which reads as a repaint rather than as a mode ending. */
    if (performanceOn) {
      if (chrome._motionExit) { global.clearTimeout(chrome._motionExit); chrome._motionExit = null; }
      chrome.classList.remove('is-leaving');
      chrome.hidden = false;
    } else if (!chrome.hidden) {
      Motion.hideWith(chrome, 'is-leaving', 143).then(syncChrome);
    }
    $('#performButton').setAttribute('aria-pressed', String(performanceOn));
    try { localStorage.setItem(PERFORMANCE_STORE, performanceOn ? '1' : '0'); } catch (e) { /* private mode */ }
    syncChrome();
    /* The onboarding copy promises the screen stays awake in this mode, and it
       only ever did so while the transport happened to be running. */
    holdScreenAwake(performanceOn || Engine.isPlaying());
    if (quiet) return;
    announce(performanceOn ? 'Performance mode on' : 'Performance mode off');
    haptic(performanceOn ? [12, 30, 12] : 8);
    global.setTimeout(() => {
      const target = performanceOn
        ? (global.matchMedia('(max-width: 699px)').matches ? $('#playButton') : $('#performancePlay'))
        : $('#performButton');
      if (target && target.offsetParent !== null) target.focus({ preventScroll: true });
    }, 0);
  }

  /* --------------------------------------------------------- the part view */

  /* The part colour leaves in the frame you pressed the chip — that is step 1
     of §7.3 and everything downstream cross-fades off it — but the run itself
     is not allowed to vanish in a frame (§5.3/§7.10). It fades over 60ms,
     which is 0.55 of the chip entrance, and the rebuild lands with the class
     coming off in the same frame as the new markup.

     Deliberately not routed through Motion.hideWith: that helper ends by
     setting [hidden], which would hide the run permanently. */
  let partSwapTimer = null;
  function renderPart() {
    if (!song) return;
    const part = deviceState.track;
    desk.dataset.part = part;
    const track = Devices.TRACKS.find((item) => item.id === part);
    if (track) $('#performancePart').textContent = track.label;

    if (partSwapTimer) { global.clearTimeout(partSwapTimer); partSwapTimer = null; }
    if (Motion.reduced() || !runBox.children.length) return renderPartNow();
    runBox.classList.add('is-leaving');
    partSwapTimer = global.setTimeout(() => {
      partSwapTimer = null;
      renderPartNow();
    }, 60);
  }

  function renderPartNow() {
    if (!song) return;
    const part = deviceState.track;
    const deviceId = deviceState.device;

    renderDevices(deviceId);
    renderLane(part);

    /* Three paragraphs of instructions used to replace themselves between
       frames under an open disclosure — the classic "did that just change?"
       failure. Only worth staging when the disclosure is actually open. */
    const steps = $('#recipeSteps');
    const swapping = $('#recipe').open && !Motion.reduced();
    if (swapping) steps.classList.add('is-swapping');

    const view = Devices.build(song, part, deviceId);
    mounted = Devices.mount(view, {
      stage: $('#rigStage'), sequence: runBox, setup: steps
    });
    cropFaceplate();

    /* Devices.mount flags a chords run so it could be laid out as a bank of
       cards. The score grid replaces that for every part, so the flag is left
       on as a plain "this run is chords" hook and nothing lays out from it —
       the phone-breakpoint rule that used to fight the grid over it is gone
       from css/responsive.css. */
    dressRunEmptyState(part);
    layOutRun(view, part);
    $('#recipeSummaryLabel').textContent = `Set-up · ${Devices.DEVICES[deviceId].label}`;
    runBox.classList.remove('is-leaving');
    if (swapping) {
      // Same floor as the boot release: the staged state is invisible, and rAF
      // does not run in a tab that is not compositing.
      const settle = () => steps.classList.remove('is-swapping');
      global.requestAnimationFrame(settle);
      global.setTimeout(settle, 120);
    }
    spendSweep(part);

    if (Engine.isPlaying()) mounted.update(mod(Engine.position(), song.totalSteps));
  }

  /* §6.37. Devices.build hands back a bare sentence when a part has nothing to
     play, and ui.js used to add a second one in a third voice. One helper, so
     the mark, the reason and the fix cannot drift apart — and so the fix is a
     control rather than an instruction to go and find one. */
  const RUN_EMPTY = {
    counter: {
      reason: 'No second line',
      detail: 'A countermelody moves when the tune rests and leans against it when the tune moves.',
      fix: 'Switch it on in New song', focus: 'counterToggle'
    },
    drums: {
      reason: 'No kit in this genre',
      detail: 'Some genres are written without drums. Another genre brings the kit back.',
      fix: 'Pick another genre', focus: 'genreSelect'
    }
  };
  function dressRunEmptyState(part) {
    const bare = runBox.querySelector('p.seq-empty');
    if (!bare && runBox.children.length) return;
    const copy = RUN_EMPTY[part] || {
      reason: 'Nothing on this part',
      detail: 'This song has no notes here. Rewrite it and the part comes back with it.',
      fix: 'Open New song', focus: 'genreSelect'
    };
    if (bare) bare.remove();
    const box = document.createElement('div');
    box.className = 'seq-empty';
    const mark = document.createElement('span');
    mark.setAttribute('aria-hidden', 'true');
    Mark.render(mark);
    const reason = document.createElement('p');
    reason.textContent = copy.reason;
    const detail = document.createElement('small');
    detail.textContent = copy.detail;
    const fix = document.createElement('button');
    fix.type = 'button';
    fix.className = 'ghost';
    fix.textContent = copy.fix;
    fix.onclick = () => openSheetTo(copy.focus);
    box.append(mark, reason, detail, fix);
    runBox.append(box);
  }

  function renderDevices(deviceId) {
    [$('#rigDevices'), $('#onboardingDevices')].forEach((box) => {
      if (!box) return;
      box.innerHTML = Object.keys(Devices.DEVICES).map((id) => {
        const d = Devices.DEVICES[id];
        const on = id === deviceId;
        return `<button class="device${on ? ' is-on' : ''}" data-device="${id}" aria-pressed="${on}">` +
          `${d.label}<small>${d.maker}</small></button>`;
      }).join('');
      Array.from(box.children).forEach((option) => {
        option.onclick = () => chooseDevice(option.dataset.device);
      });
    });
  }

  /* One switcher, two places it is drawn: the rig well and onboarding page two.
     Both write the same store, so the question the introduction asks is the
     answer the desk is already holding. */
  function chooseDevice(id) {
    if (!Devices.DEVICES[id] || id === deviceState.device) return;
    deviceState.device = id;
    saveDeviceState();
    renderPart();
    writeSpecPlate();
    haptic(8);
  }

  /* On a phone the display and the function rows are pixels you cannot press,
     so the faceplate crops to the pads themselves. The viewBox is an attribute
     rather than a style, so it is retargeted here instead of in the sheet. */
  /* The pad grid runs y 196–447 on the K.O. II and the keybed y 190–304 on the
     FM-1; the crops stop just short of the fader and the function rows so no
     half a control is left hanging at the edge. */
  const CROP = { ep133: '14 180 336 272', fm1: '10 182 662 126' };
  function cropFaceplate() {
    const stage = $('#rigStage');
    const svg = stage.querySelector('svg');
    if (!svg) return;
    const full = svg.dataset.full || svg.getAttribute('viewBox');
    svg.dataset.full = full;
    /* Keyed on the same band as the thumb: a phone on its side is 390px tall
       and needs the crop just as much as one held upright, but it is 844px
       wide, so width alone never saw it. */
    const tight = global.matchMedia('(max-width: 699px)').matches ||
      global.matchMedia('(max-height: 500px) and (max-width: 1199px)').matches;
    const box = (tight ? (CROP[deviceState.device] || full) : full);
    svg.setAttribute('viewBox', box);
    /* The panel's box is the instrument's own proportion, and it is read back
       out of the viewBox actually being drawn rather than from a table — the
       phone crop rewrites that viewBox, so a ratio captured at mount would hang
       a 662x126 keybed in a 356x540 hole. Without it .rig-stage falls back to
       the EP-133's ratio for both units and the FM-1 sits at a third of the
       EP's visual weight, which is the exact failure §6.8 names. */
    const size = box.split(/[\s,]+/).map(Number);
    if (size.length === 4 && size[2] > 0 && size[3] > 0) {
      stage.style.setProperty('--dev-ar', `${size[2]} / ${size[3]}`);
      /* The desk learns what is bolted into it. A portrait plate fills a tall
         column and a landscape one cannot — the FM-1 drew 387x204 in an 808px
         panel, which is three quarters of the largest region on screen reading
         as nothing — so the column has to be sized by the instrument rather
         than the instrument fitted to the column. It is read off the viewBox
         being drawn rather than from a table, for the same reason --dev-ar is:
         the phone crop rewrites that viewBox, and two copies of the same fact
         drift. css/responsive.css spends it; this only has to state it. */
      const desk = $('#desk');
      if (desk) desk.dataset.instrument = size[2] >= size[3] ? 'wide' : 'tall';
    }
    /* Written from the same branch that decides the column's shape, so the desk
       cannot be told it has a second cell and left without anything to put in
       it — or the reverse, which is worse. */
    placeSetup();
  }

  /* ------------------------------------------------------------- the bay

     Stopping the wide rig panel at its contents fixed the emptiness inside it
     and moved the emptiness onto the desk underneath: measured at 1440x900 the
     FM-1's panel was 100% full and there were still 383px of bare surface below
     it, 47% of the left column, rising to 481px and 49% at 1920x1080. There is
     no arrangement of a 1.86:1 object that fills a portrait column, so the
     column stops being one region. The second one is a panel, and it is given
     the one piece of content that wants the height.

     SET-UP is that piece. It is the largest block of prose in the app; it is
     about the hardware, so it belongs in the hardware column directly under the
     hardware; and in the stage it was a 44px collapsed strip pinned to the foot
     of the most valuable panel on the screen. Moving it hands the stage that
     strip back for the lane and the run and fills the hole with reading matter.
     Measured, the steps run 340-485px at this column width against a cell of
     273-411px across 1280x800, 1440x900 and 1920x1080, so the cell is full at
     all three and the overflow scrolls inside the well.

     The element is moved rather than copied, for the same reason #parts and
     #barControls are moved into the thumb bar: one <details>, one id, one skip
     target, one set of handlers, and nothing to keep in step. */
  const wideDesk = global.matchMedia('(min-width: 900px) and (min-height: 501px)');
  let setupBay = null;
  /* The bay opens the disclosure, so what the stage had has to be remembered.
     Coming back to a narrow window and finding SET-UP expanded under the run is
     the desk overruling a choice the player made. */
  let recipeStageOpen = false;

  function placeSetup() {
    const recipe = $('#recipe');
    const body = $('#stageBody');
    if (!recipe || !body) return;
    /* Both halves, and the media query is the same string css/responsive.css
       uses. A flag the stylesheet cannot honour is a third grid item dropped
       into a two-column desk. */
    if (desk.dataset.instrument === 'wide' && wideDesk.matches) {
      if (!setupBay) {
        setupBay = document.createElement('section');
        setupBay.className = 'bay';
        setupBay.id = 'setupBay';
        /* A region needs a name in the landmark list for the same reason the
           rig and the stage have one — and the disclosure's own silkscreen is
           the label a sighted reader gets, so it is the label to use. */
        setupBay.setAttribute('aria-label', 'Set-up');
      }
      if (setupBay.parentNode !== desk) desk.append(setupBay);
      if (recipe.parentNode !== setupBay) {
        recipeStageOpen = recipe.open;
        setupBay.append(recipe);
        recipe.open = true;
      }
      desk.dataset.bay = 'on';
      return;
    }
    if (recipe.parentNode !== body) {
      // Last, which is where index.html has it: after the run it summarises.
      body.append(recipe);
      recipe.open = recipeStageOpen;
    }
    if (setupBay && setupBay.parentNode) setupBay.remove();
    delete desk.dataset.bay;
  }

  /* ---------------------------------------------------------------- lane

     One part's shape on the grid, drawn at a size you can actually read —
     which is what a lane gets once it is not sharing the panel with four
     others. Row height is computed rather than fixed so a wide-ranging line
     and a three-note bass part both fit the same box. */
  function notesFor(part) {
    return {
      melody: song.melody,
      counter: song.counter || [],
      chords: song.chordTrack || [],
      bass: song.bass
    }[part] || [];
  }

  const ROLE_LETTER = {
    root: 'R', third: '3', fifth: '5', seventh: '7', ninth: '9',
    sixth: '6', fourth: '4', octave: '8', approach: '→'
  };

  const BLACK_PCS = [1, 3, 6, 8, 10];

  /* The lane is the picture, so the lane carries the description. It used to
     hang off #laneToggle, which is display:none above 700px and therefore
     never announced — meaning half of what this app is for was silently
     dropped for screen-reader users on the primary layout. The sr-only span
     stays as the toggle's description target but is hidden from the reading
     order, so the same sentence is not read twice on a phone. */
  const laneDescription = $('#laneDescription');
  laneDescription.setAttribute('aria-hidden', 'true');
  function describeLane(text) {
    laneDescription.textContent = text;
    lane.setAttribute('role', 'img');
    lane.setAttribute('aria-label', text);
    lane.removeAttribute('aria-hidden');
  }

  /* The playhead's mark. Notes are bucketed by the sixteenth they start on, so
     lighting one is a single map lookup on the frame the step changes rather
     than a scan of the lane sixty times a second. --lit going to 1 and decaying
     behind the head is what makes the lane read as being written. */
  let notesByStep = new Map();
  let litNotes = [];
  let lastLitStep = -1;
  /* Kept so the measured density can be recomputed on resize without
     re-rendering the whole lane. */
  let laneNotes = [];

  function clearLaneLight() {
    litNotes.forEach((el) => el.style.setProperty('--lit', '0'));
    litNotes = [];
    lastLitStep = -1;
  }

  function lightLaneStep(step) {
    litNotes.forEach((el) => el.style.setProperty('--lit', '0'));
    litNotes = notesByStep.get(step) || [];
    litNotes.forEach((el) => el.style.setProperty('--lit', '1'));
  }

  /* Density is measured, not guessed. The old step-count heuristic dropped
     every label in the lane the moment the song passed 96 steps, so a whole
     note lost its name because the sixteenths around it could not hold theirs.
     One layout read per render — never per frame — and the answer is per note. */
  function applyNoteDensity() {
    if (!song || !laneNotes.length) return;
    const box = global.getComputedStyle(lane);
    const width = lane.clientWidth -
      (parseFloat(box.paddingLeft) || 0) - (parseFloat(box.paddingRight) || 0);
    if (width <= 0) return;
    const colW = width / song.totalSteps;
    laneNotes.forEach((item) => item.el.classList.toggle('is-dense', colW * item.dur < 20));
  }

  /* §6.37: every empty state names the fix and offers the button. .tl-off is a
     centred grid with its own gap, so a .ghost dropped into it lays out with no
     further CSS — and the sentence stops being an instruction to go and find a
     control that is one tap away. */
  function laneEmpty(reason, fixLabel, focusId) {
    lane.innerHTML = '';
    const box = document.createElement('span');
    box.className = 'tl-off';
    const line = document.createElement('span');
    line.textContent = reason;
    const fix = document.createElement('button');
    fix.type = 'button';
    fix.className = 'ghost';
    fix.textContent = fixLabel;
    fix.onclick = () => openSheetTo(focusId);
    box.append(line, fix);
    lane.append(box, laneHead);
  }

  function renderLane(part) {
    notesByStep = new Map();
    litNotes = [];
    laneNotes = [];
    lastLitStep = -1;

    /* The one property that says where the step grid starts. The rail, the bar
       rules and the playhead all resolve against it, which is what stops the
       drum playhead pointing at a beat 80px away from the one it is on. */
    laneWrap.classList.toggle('is-drums', part === 'drums');

    laneBars.innerHTML = '';
    laneBars.style.setProperty('--bars', String(song.bars));
    for (let bar = 0; bar < song.bars; bar++) {
      const cell = document.createElement('span');
      cell.textContent = String(bar + 1);
      laneBars.append(cell);
    }

    lane.innerHTML = '';
    lane.className = 'lane ' + (part === 'drums' ? 'is-drums' : 'is-pitched');
    lane.style.setProperty('--steps', String(song.totalSteps));
    lane.style.setProperty('--bars', String(song.bars));
    /* The playhead belongs to the grid it annotates, not to the number rail
       above it. Parented to .lane-wrap it spanned the rail too and measured
       from the wrong left edge; inside .lane its containing block *is* the
       grid. It is moved rather than rebuilt so the transport keeps one node
       across every part change. */
    lane.append(laneHead);

    if (part === 'drums') return renderDrumLane();

    const notes = notesFor(part);
    if (!notes.length) {
      lane.classList.remove('is-pitched');
      describeLane(part === 'counter' ? 'No second melody in this song.' : 'No notes in this part.');
      laneEmpty(part === 'counter'
        ? 'No second line in this song.'
        : 'Nothing on this part.',
        part === 'counter' ? 'Switch it on in New song' : 'Open New song',
        part === 'counter' ? 'counterToggle' : 'genreSelect');
      return;
    }

    let low = Math.min.apply(null, notes.map((n) => n.midi));
    let high = Math.max.apply(null, notes.map((n) => n.midi));
    /* The grid is cropped to the pitches the part actually plays and to nothing
       else. It used to widen a narrow part to a fixed seven semitones (five on
       bass) and centre it, which invented up to six rows that no note could
       ever land on — a bass line sitting on three pitches drew eight rows and
       filled three of them, and the top and bottom of the lane were guaranteed
       empty on every song. A part with a small range is not a part that needs a
       bigger grid; it is a part whose rows can afford to be taller, and the row
       heights below already do that on their own.

       Four rows is the floor and it is a drawing floor, not a musical one: a
       one-note part still has to read as a grid rather than as a single stripe
       with a keyboard beside it. The padding is split low-first so the note
       that is there stays nearest the middle. */
    const MIN_ROWS = 4;
    const span = high - low + 1;
    if (span < MIN_ROWS) {
      const pad = MIN_ROWS - span;
      const under = Math.floor(pad / 2);
      low -= under; high += pad - under;
    }
    const rows = high - low + 1;
    const track = Devices.TRACKS.find((item) => item.id === part);
    const lowName = `${song.key.nameForPc(low)}${Math.floor(low / 12 - 1)}`;
    const highName = `${song.key.nameForPc(high)}${Math.floor(high / 12 - 1)}`;
    describeLane(`${track.label} contour across ${song.bars} bars, from ${lowName} to ${highName}. ` +
      'The exact playable sequence follows.');
    lane.style.setProperty('--rows', String(rows));
    /* The lane gets a fixed slice of the stage and the rows divide it, rather
       than the rows setting the height and the run taking what is left — a
       wide-ranging melody would otherwise push the pads off the screen.

       How big that slice is belongs to the breakpoint, not to this function.
       css/responsive.css declares --lane-target at four bands — 96 lying down,
       118 upright, 132 on a tablet, 280 on the wide band §3.9 designs — and
       every one of them was inert, because the number here was a two-value
       ternary that only knew about the phone. Read the property and the
       stylesheet gets its say; the literal stays as the fallback so a missing
       declaration degrades to the desktop budget rather than to zero. */
    const declared = parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--lane-target'));
    const target = isFinite(declared) && declared > 0 ? declared : 210;
    const rowH = Math.max(8, Math.min(24, Math.floor(target / rows)));
    lane.style.setProperty('--row-h', `${rowH}px`);

    /* A pitch grid with no black-key shading is a chart with no gridlines: the
       contour is readable and the intervals are not. The bands are grid items
       rather than a repeating gradient because the pattern of black keys is
       irregular and a gradient cannot know which pitch the top row landed on.
       The keyboard down the side says which rows those are. */
    const tonicPc = song.key.scalePcs ? song.key.scalePcs[0] : mod(Number(keySelect.value) || 0, 12);
    const keys = document.createElement('div');
    keys.className = 'lane-keys' + (rowH >= 15 ? ' has-labels' : '');
    keys.setAttribute('aria-hidden', 'true');
    for (let row = 1; row <= rows; row++) {
      const midi = high - row + 1;
      const pc = mod(midi, 12);
      const black = BLACK_PCS.indexOf(pc) >= 0;
      const key = document.createElement('i');
      if (black) key.className = 'is-black';
      if (pc === 0) key.dataset.label = `C${Math.floor(midi / 12 - 1)}`;
      keys.append(key);
      if (!black && pc !== tonicPc) continue;
      const band = document.createElement('div');
      band.className = 'lane-band' + (black ? ' is-black' : '') + (pc === tonicPc ? ' is-tonic' : '');
      band.style.gridRow = `${row} / span 1`;
      lane.append(band);
    }
    lane.append(keys);

    notes.forEach((note) => {
      const block = document.createElement('div');
      block.className = `tl-note is-${part}` + (part === 'bass' ? ` role-${note.role}` : '');
      const dur = Math.max(1, Math.round(note.dur));
      const start = Math.round(note.start);
      block.style.gridColumn = `${start + 1} / span ${dur}`;
      block.style.gridRow = `${high - note.midi + 1} / span 1`;
      /* Velocity was computed by the composer and thrown away by every
         renderer except the drum grid. It rides as ink density — a tint of the
         same opaque pigment, which is what a halftone screen print does — and
         the loudest notes additionally take a full-chroma cap that survives
         greyscale. */
      const velocity = typeof note.velocity === 'number' ? note.velocity : 0.8;
      block.style.setProperty('--vel', velocity.toFixed(2));
      if (velocity > 0.85) block.classList.add('is-accent');
      block.dataset.label = part === 'bass' ? (ROLE_LETTER[note.role] || '') : (note.name || song.key.nameForPc(note.midi));
      block.title = `${song.key.nameForPc(note.midi)}${Math.floor(note.midi / 12 - 1)}` +
        (part === 'bass' ? ` — ${note.role} of ${note.chord}` : '');
      block.setAttribute('aria-hidden', 'true');
      /* No click handler. At roughly five pixels by eighteen it failed WCAG
         2.5.8 by a factor of five in each axis, and the run of chips directly
         below already previews every one of these notes at a proper 44px
         target — which also takes one listener per note back off the page. */
      lane.append(block);
      laneNotes.push({ el: block, dur });
      const bucket = notesByStep.get(start);
      if (bucket) bucket.push(block);
      else notesByStep.set(start, [block]);
    });

    applyNoteDensity();
    renderRoleKey(part, notes);
  }

  /* The bass letters need a key, and only the bass part does. */
  function renderRoleKey(part, notes) {
    const existing = $('#roleKey');
    /* The list has an authored 220ms entrance now, and a surface that fades in
       and is deleted in a frame is worse than one that does neither. 120ms is
       0.55 of the arrival; the node is dropped once the exit has had its time,
       and its id goes first so the replacement can never collide with it. */
    if (existing) {
      existing.removeAttribute('id');
      Motion.hideWith(existing, 'is-leaving', 120).then(() => existing.remove());
    }
    if (part !== 'bass') return;
    const describe = {
      root: 'root', third: 'third', fifth: 'fifth', seventh: 'seventh',
      ninth: 'ninth', sixth: 'sixth', fourth: 'fourth', octave: 'octave up',
      approach: 'leaning into the next chord'
    };
    const used = [];
    notes.forEach((n) => { if (used.indexOf(n.role) < 0) used.push(n.role); });
    const list = document.createElement('ul');
    list.className = 'role-key';
    list.id = 'roleKey';
    list.innerHTML = used.map((role) =>
      `<li><b class="role-${role}">${ROLE_LETTER[role] || '?'}</b>${describe[role] || role}</li>`).join('');
    lane.parentNode.append(list);
  }

  function renderDrumLane() {
    const byVoice = {};
    song.drums.forEach((hit) => { (byVoice[hit.instrument] = byVoice[hit.instrument] || []).push(hit); });
    const voices = G.DRUM_VOICES.filter((voice) => byVoice[voice.id]);
    if (!voices.length) {
      describeLane('This song has no drum pattern.');
      laneEmpty('This genre plays without drums.', 'Pick another genre', 'genreSelect');
      return;
    }

    describeLane(`Drum pattern across ${song.bars} bars with ${voices.length} voices. ` +
      'The exact playable sequence follows.');

    voices.forEach((voice) => {
      const row = document.createElement('div');
      row.className = 'drum-row';
      row.setAttribute('aria-hidden', 'true');
      const name = document.createElement('span');
      name.className = 'drum-name';
      name.textContent = voice.label;
      row.append(name);

      const cells = document.createElement('div');
      cells.className = 'drum-cells';
      cells.style.setProperty('--steps', String(song.totalSteps));
      /* One pass to bucket this voice's hits by sixteenth, then one array index
         per cell. The filter that was here walked every hit for every one of up
         to 128 cells in every one of up to eight voices, on every render. */
      const byStep = [];
      byVoice[voice.id].forEach((hit) => {
        const at = Math.floor(hit.step);
        (byStep[at] = byStep[at] || []).push(hit);
      });
      for (let step = 0; step < song.totalSteps; step++) {
        const cell = document.createElement('span');
        const inCell = byStep[step] || [];
        cell.className = 'drum-cell' + (step % 4 === 0 ? ' is-beat' : '') + (step % 16 === 0 ? ' is-bar' : '');
        if (inCell.length === 1) {
          cell.classList.add('is-hit');
          cell.style.setProperty('--strength', inCell[0].velocity.toFixed(2));
          if (inCell[0].velocity < 0.45) cell.classList.add('is-ghost');
          /* Density alone cannot separate 0.86 from 0.99, and the drum grid was
             the one place velocity had no reading that survives greyscale. The
             cap is the same 2px the pitched lane gives an accent. */
          if (inCell[0].velocity > 0.85) cell.classList.add('is-accent');
          cell.title = `${voice.label} · bar ${Math.floor(step / 16) + 1} beat ${(step % 16) / 4 + 1}`;
        } else if (inCell.length > 1) {
          cell.classList.add('is-roll');
          cell.title = `${voice.label} roll — ${inCell.length} hits inside one sixteenth`;
        }
        /* The playhead already writes --lit to whatever is in this bucket, and
           .drum-cell.is-hit reads it. One line is the difference between a lane
           that reads as being written and a lane with a playhead nothing
           responds to. */
        if (inCell.length) {
          const bucket = notesByStep.get(step);
          if (bucket) bucket.push(cell);
          else notesByStep.set(step, [cell]);
        }
        cells.append(cell);
      }
      row.append(cells);
      /* No click handler. The row is 20px tall and aria-hidden, so it failed
         WCAG 2.5.8 and "nothing interactive is aria-hidden" at the same time,
         and it cannot be fixed by growing — eight voices at 44px is 352px
         inside a 210px well. The faceplate's drum pads are the 44px preview
         target, exactly as they are for the pitched lane's notes. */
      lane.append(row);
    });
  }

  /* ----------------------------------------------------------------- run

     The run is a score, not a wrapped paragraph of chips. Devices.build emits
     one flat list because it does not know how the run is laid out, so the
     grid is grafted on here: one row per bar, the bar number in a fixed
     gutter, that bar's chips beside it. A bar marker can no longer orphan at
     the end of a line and the run scans vertically like a lead sheet.

     Every chip node is *moved*, never rebuilt. Devices.mount has already
     cached the node list the playhead drives and bound a hover and a click to
     each one; regenerating the markup would silently detach all of it. */

  const NOTE_VALUE = {
    1: '1/16', 2: '1/8', 3: '1/8.', 4: '1/4', 6: '1/4.',
    8: '1/2', 12: '1/2.', 16: '1/1', 32: '2/1'
  };
  function durationLabel(steps) {
    return NOTE_VALUE[steps] || `${steps}/16`;
  }

  /* An unplayable note is a problem with a fix, so the chip carries the fix
     rather than the word OFF. Whether an octave on the device would reach it is
     answered by asking the mapping, not by guessing at ranges. */
  function offAdvice(mapping, midi) {
    const named = Number.isFinite(midi)
      ? `${song.key.nameForPc(midi)}${Math.floor(midi / 12 - 1)}` : '';
    try {
      if (mapping && mapping.idFor && Number.isFinite(midi)) {
        if (mapping.idFor(midi - 12)) return { glyph: '↑8', text: `${named} · needs oct +1` };
        if (mapping.idFor(midi + 12)) return { glyph: '↓8', text: `${named} · needs oct −1` };
      }
    } catch (e) { /* a mapping that cannot answer is the same as a no */ }
    return { glyph: '⌀', text: `${named} · outside the pads` };
  }

  /* The glyph column is fixed width so the chip's own width is free to carry
     duration and nothing else — `pad ENTER` and `pad 1` used to be different
     widths, and that difference read as information when it was only
     spelling. The eyebrow says which control the glyph names. */
  function dressChip(chip, mapping, event) {
    const b = chip.querySelector('b');
    if (!b || chip.querySelector('.chip-glyph')) return;
    const first = b.firstChild;
    const text = first && first.nodeValue ? first.nodeValue : '';
    let tag = chip.dataset.light ? 'key' : 'off';
    const padded = /^pad\s+/i.exec(text);
    if (padded) { tag = 'pad'; first.nodeValue = text.slice(padded[0].length); }

    if (chip.classList.contains('is-off')) {
      const advice = offAdvice(mapping, Number(chip.dataset.midi));
      b.textContent = advice.glyph;
      const line = chip.querySelector('small');
      if (line) line.textContent = advice.text;
      tag = 'off';
    }

    const glyph = document.createElement('span');
    glyph.className = 'chip-glyph';
    const eyebrow = document.createElement('i');
    eyebrow.className = 'chip-tag';
    eyebrow.textContent = tag;
    chip.insertBefore(glyph, b);
    glyph.append(eyebrow, b);

    /* Duration goes in its own element rather than into the note line, because
       Devices.mount prints that line on the device's own display and a note
       value has no business showing up there. */
    const note = chip.querySelector('small');
    if (!note) return;
    const sub = document.createElement('span');
    sub.className = 'chip-sub';
    chip.insertBefore(sub, note);
    sub.append(note);
    if (event && !chip.classList.contains('is-off')) {
      const value = document.createElement('small');
      value.className = 'chip-dur';
      value.textContent = durationLabel(event.dur);
      sub.append(value);
    }
  }

  /* Each note in its own box on a wrapping row. overflow-wrap:anywhere used to
     break an accidental off its letter and leave a bare sharp starting a line. */
  function dressChord(card) {
    const keys = card.querySelector('.seq-chord-keys');
    if (!keys || keys.querySelector('span')) return;
    const names = keys.textContent.split(' + ').filter(Boolean);
    keys.textContent = '';
    names.forEach((name) => {
      const box = document.createElement('span');
      box.textContent = name;
      keys.append(box);
    });
  }

  /* Silence takes up room on a score, so it takes up room here. Without it the
     horizontal rhythm is implied by whitespace, which is to say not stated. */
  function restChip(steps) {
    const rest = document.createElement('span');
    const value = Math.round(steps);
    rest.className = 'seq-rest';
    rest.setAttribute('aria-hidden', 'true');
    rest.style.setProperty('--dur', String(value));
    rest.title = `rest · ${durationLabel(value)}`;
    return rest;
  }

  function layOutRun(view, part) {
    const chips = Array.from(runBox.querySelectorAll('.seq-chip, .seq-chord'));
    // An empty part leaves the well to its empty state, so the tier from the
    // part before it must not be left behind to style nothing — and neither may
    // the previous part's out-of-range summary, which would otherwise pin the
    // apology's row to min-content and stop it centring in the well.
    if (!chips.length) {
      runBox.dataset.density = 'roomy';
      runBox.classList.remove('has-run-note');
      return;
    }
    // Devices.js writes its own bar markers inline with the chips; the grid
    // supersedes them.
    Array.from(runBox.querySelectorAll('.seq-bar')).forEach((el) => el.remove());

    const mapping = view.mapping || null;
    const rows = [];
    const rowFor = (bar) => {
      const last = rows[rows.length - 1];
      if (last && last.bar === bar) return last;
      const row = { bar, items: [], cursor: bar === null ? 0 : bar * 16 };
      rows.push(row);
      return row;
    };

    if (part === 'drums') {
      // A kit has no bar structure — it is the set of voices, once.
      const row = rowFor(null);
      chips.forEach((chip) => { dressChip(chip, mapping, null); row.items.push(chip); });
    } else if (part === 'chords') {
      const spans = song.spans || [];
      chips.forEach((chip, index) => {
        const span = spans[index];
        const start = span ? span.start : index * 16;
        const next = spans[index + 1];
        const until = next ? next.start : song.totalSteps;
        chip.style.setProperty('--dur', String(Math.max(1, until - start)));
        dressChord(chip);
        rowFor(Math.floor(start / 16)).items.push(chip);
      });
    } else {
      const events = (mapping && mapping.events) || [];
      chips.forEach((chip, index) => {
        const event = events[index];
        if (!event) { rowFor(0).items.push(chip); return; }
        const row = rowFor(Math.floor(event.start / 16));
        const gap = event.start - row.cursor;
        if (gap >= 1) row.items.push(restChip(gap));
        chip.style.setProperty('--dur', String(event.dur));
        dressChip(chip, mapping, event);
        row.items.push(chip);
        row.cursor = Math.max(row.cursor, event.start + event.dur);
      });
      /* The tail of the bar. Every item in a row now grows in proportion to
         --dur, so a bar whose last note stops on beat three and has nothing
         after it would hand the leftover to that note and draw it a beat
         longer than it is played. The silence has to be in the row for the
         proportion to be true. */
      rows.forEach((row) => {
        if (row.bar === null) return;
        const start = row.bar * 16;
        const end = start + 16;
        /* Only where the cursor actually moved. A chip the mapping had no event
           for never advances it, and a bar's worth of rest printed beside that
           chip would be a silence the song does not contain. */
        if (row.cursor > start && end - row.cursor >= 1) row.items.push(restChip(end - row.cursor));
      });
    }

    const out = document.createDocumentFragment();
    /* Twelve dimmed chips scattered through a run tell you there is a problem
       without ever telling you how big it is. State it once, as a count. */
    const off = chips.filter((chip) => chip.classList.contains('is-off')).length;
    if (off) {
      const summary = document.createElement('p');
      summary.className = 'run-note';
      summary.textContent = off === 1
        ? '1 note sits outside the pads'
        : `${off} notes sit outside the pads`;
      out.append(summary);
    }
    /* The well distributes its spare height across its rows, and a sentence is
       not a system — without this the summary line would take a quarter of the
       score's leading and sit alone at the top of a row of its own. The class
       is what lets css/run.css name that first track without also naming the
       first bar of a run that has no summary at all. */
    runBox.classList.toggle('has-run-note', off > 0);
    /* One cell per bar rather than one line per bar. The cell carries its own
       gutter, so the run can pack two bars to a system the way a printed lead
       sheet does and eight bars stop needing eight full-width lines — which is
       what made the panel scroll at 1440x900 with the whole song in it. The
       number of bars across is css/run.css's decision, taken off the stage's
       own width; this function only has to stop assuming there is one. */
    rows.forEach((row) => {
      const cell = document.createElement('div');
      cell.className = 'seq-bar-cell';
      const gutter = document.createElement('span');
      gutter.className = 'seq-bar';
      gutter.textContent = row.bar === null ? '' : String(row.bar + 1);
      const box = document.createElement('div');
      box.className = 'seq-row';
      // The transport slot's segments navigate to these.
      if (row.bar !== null) {
        box.dataset.bar = String(row.bar);
        cell.dataset.bar = String(row.bar);
      }
      row.items.forEach((item) => box.append(item));
      cell.append(gutter, box);
      out.append(cell);
    });
    runBox.append(out);

    /* How busy the busiest bar is decides how much of a chip can survive.
       Proportional width made the row always exactly full, but it never
       stopped a bar from needing more room than the cell has: a chip cannot
       shrink past the text inside it, so an over-subscribed bar wraps, and a
       wrapped bar costs a whole line. Measured on a funk song at 1440x900, a
       six-note bass bar with four rests between the notes turned a 337px well
       into 792px of content and put the score back behind the scrollbar V1 was
       written to remove.

       The tier is arithmetic, not taste. A 384px cell at --sp-1 gaps holds ten
       items only if each chip floors at 44px (§9.3's target, which is also the
       narrowest a chip is allowed to be), so the eyebrow, the note value and
       two thirds of the padding come off in that order as the bar fills up.
       css/run.css spends the tier; this only has to name it. */
    const busiest = rows.reduce((most, row) => Math.max(most, row.items.length), 0);
    const tiers = ['roomy', 'tight', 'dense'];
    let tier = busiest > 7 ? 2 : busiest > 3 ? 1 : 0;
    runBox.dataset.density = tiers[tier];

    /* The tier above answers "how wide can a chip be", and that was only ever
       half the question. A chord chart is one chip to the bar — the busiest
       bar holds a single item, so the arithmetic says roomy — and eight roomy
       chords still stack four systems deep. Measured at 1280x800 with the
       EP-133 mounted, that is 318px of score in a 263px well: the run went
       back behind the scrollbar §V1 was written to remove, on a laptop, with
       nothing dense about the music.

       The well cannot know its own height from a media query, because the
       height it gets is whatever the lane and the set-up strip leave it, so
       the only honest way to ask is to lay the score out and look. Stepping
       down is monotonic — every tier removes chip padding and never adds it,
       and a smaller chip cannot wrap where a larger one did not — so the loop
       terminates at `dense` and takes no step at all wherever the score
       already fits, which is every part at 1440x900 and 1920x1080. Reading
       scrollHeight forces one layout per part switch, never per frame.

       The query is what keeps this off the phone, and it is the same one
       css/responsive.css uses to decide the desk is two columns of locked
       height: only there is the well the only place a score can hide. Stacked
       or on a short screen the stage-body scrolls and the run sits on its own
       two-tap floor, where no tier makes eight bars fit in 88px — stepping
       would spend the note value and the pad eyebrow and buy the reader
       nothing. It is a media query rather than a measurement of the well
       because the well's height is not settled on the first render below 900px
       and a tier that depends on a transient pixel is a tier that disagrees
       with itself between two loads of the same page. */
    const locked = global.matchMedia('(min-width:900px) and (min-height:501px)').matches;
    while (locked && tier < 2 && runBox.scrollHeight > runBox.clientHeight + 1) {
      tier += 1;
      runBox.dataset.density = tiers[tier];
    }

    /* The entrance is a delay, not a class that lingers: --enter-i drives an
       animation-delay, so nothing is left on the chip afterwards to delay the
       `now` marker — which is the one thing in the run that has to arrive in
       the frame it happens. */
    Motion.stagger(chips, { step: 16, max: 12, cls: null });
  }

  /* ------------------------------------------------------------ structure */

  function renderStructure() {
    const plan = Arrange.plan(song);
    $('#arrangeFormLabel').textContent = plan.label;
    $('#arrangeSummary').textContent =
      `· ${plan.sections.length} sections · ${plan.totalBars} bars · ~${plan.time}`;
    $('#theoryText').textContent = song.theory;

    const map = $('#arrangeMap');
    map.style.setProperty('--cols', plan.sections.map((s) => `minmax(64px, ${s.bars}fr)`).join(' '));

    /* The map is a table and was announced as a pile of anonymous spans. The
       row wrappers carry display:contents inline so the grid still sees the
       cells as its own children — that one declaration belongs in sheets.css
       and is written here only because the roles cannot ship without it. */
    const ROW = '<div role="row" style="display:contents">';
    let html = ROW + '<span class="map-corner" role="columnheader" aria-label="Track"></span>';
    plan.sections.forEach((s) => {
      html += `<button class="map-head" role="columnheader" data-section="${s.id}"` +
        ` aria-label="${escapeHtml(s.name)}, ${s.bars} bar${s.bars === 1 ? '' : 's'}. Audition this section.">` +
        `<b>${s.name}</b><small>${s.bars} bar${s.bars === 1 ? '' : 's'}</small></button>`;
    });
    html += '</div>' + ROW + '<span class="map-track" role="rowheader">Energy</span>';
    plan.sections.forEach((s) => {
      const level = Math.round(s.intensity * 100);
      html += `<span class="map-energy" role="cell" data-section="${s.id}" aria-label="${level}%">` +
        `<i style="height:${level}%"></i></span>`;
    });
    html += '</div>';
    plan.tracks.forEach((track) => {
      html += ROW + `<span class="map-track" role="rowheader">${track.label}</span>`;
      plan.sections.forEach((s) => {
        const on = s.tracks.indexOf(track.id) >= 0;
        html += `<span class="map-cell is-${track.id}${on ? ' is-on' : ''}" role="cell"` +
          ` data-section="${s.id}" aria-label="${on ? 'plays' : 'out'}"` +
          ` title="${track.label} ${on ? 'plays' : 'is out'} in ${s.name}"></span>`;
      });
      html += '</div>';
    });
    map.innerHTML = html;

    /* A bare <li> with cursor:pointer and no tabindex put the descriptive prose
       of the entire arrangement out of a keyboard user's reach. data-section
       stays on both nodes: the li so auditionSection's sweep can paint it, the
       button so the handler can read the id. */
    $('#arrangeSteps').innerHTML = plan.sections.map((s) => {
      const outs = s.muted.length
        ? `<span class="drop-note">out: ${s.muted.map((id) =>
            Arrange.TRACKS.filter((t) => t.id === id)[0].label.toLowerCase()).join(', ')}</span>`
        : '<span class="drop-note is-full">everything in</span>';
      return `<li data-section="${s.id}">` +
        `<button class="section-step" type="button" data-section="${s.id}">` +
        `<span class="step-n">${s.loops}×</span><div>` +
        `<b>${s.name}<small> · bars ${s.start + 1}–${s.start + s.bars}</small></b>` +
        `<p>${s.how}</p>${outs}</div></button></li>`;
    }).join('');

    $('#arrangeTips').innerHTML = Object.keys(Arrange.DEVICE_TIPS).map((id) =>
      `<p><b>${Devices.DEVICES[id].label}</b> ${Arrange.DEVICE_TIPS[id]}</p>`).join('');

    const byId = {};
    plan.sections.forEach((s) => { byId[s.id] = s; });
    Array.from(map.querySelectorAll('.map-head')).forEach((head) => {
      head.onclick = () => auditionSection(byId[head.dataset.section]);
    });
    Array.from($('#arrangeSteps').querySelectorAll('.section-step')).forEach((step) => {
      step.onclick = () => auditionSection(byId[step.dataset.section]);
    });
    $('#arrangeReset').onclick = (event) => { event.stopPropagation(); clearAudition(); };
    syncMapEnd();
  }

  /* §6.26. The right-edge fade has to clear at the end of the scroll, and the
     same predicate is true when the map is narrower than the sheet — so one
     hook covers both "nothing to scroll" and "reached the end", and a map that
     fits stops showing a fade that promises more. */
  function syncMapEnd() {
    const wrap = $('#mapWrap');
    if (!wrap) return;
    wrap.classList.toggle('is-end', wrap.scrollLeft + wrap.clientWidth >= wrap.scrollWidth - 1);
  }
  $('#mapWrap').addEventListener('scroll', syncMapEnd, { passive: true });

  /* -------------------------------------------------------- saved sketches */

  const DELETE_GLYPH = '<svg class="i" aria-hidden="true" focusable="false"><use href="#i-close"></use></svg>';

  /* A re-keyed FLIP. Motion.flip measures the same nodes either side of the
     mutation, and renderLibrary rebuilds the list by innerHTML — so the nodes
     it measured no longer exist to be animated. Matching on data-id across the
     rebuild is the same first/last/invert on the same curve, against the nodes
     that actually survive. */
  function flipCards(mutate) {
    const list = $('#libraryList');
    const before = new Map();
    Array.from(list.children).forEach((card) => before.set(card.dataset.id, card.getBoundingClientRect().top));
    mutate();
    if (Motion.reduced()) return;
    Array.from(list.children).forEach((card) => {
      const first = before.get(card.dataset.id);
      if (first === undefined || typeof card.animate !== 'function') return;
      const dy = first - card.getBoundingClientRect().top;
      if (!dy) return;
      card.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }],
        { duration: 260, easing: (Motion.EASE || {}).detent || 'linear' });
    });
  }

  function renderLibrary(behavior) {
    const staged = !!(behavior && behavior.staged);
    const entries = Library.list();
    const count = $('#libraryCount');
    count.textContent = String(entries.length);
    count.hidden = entries.length === 0;
    setGhostShown($('#libraryEmpty'), entries.length === 0);
    if (!entries.length) Mark.render($('#libraryEmpty .empty-mark'));

    const current = song ? Library.encode(Library.recipeOf(song)) : '';
    $('#libraryList').innerHTML = entries.map((entry) =>
      `<article class="lib-card${entry.key === current ? ' is-current' : ''}" data-id="${entry.id}">` +
      `<button class="lib-load"><b>${escapeHtml(entry.title)}</b>` +
      `<small>${escapeHtml(entry.meta)}</small><em>${Library.when(entry.savedAt)}</em></button>` +
      `<div class="lib-actions">` +
      `<button class="lib-icon" data-act="link" title="Copy a link" aria-label="Copy link for ${escapeHtml(entry.title)}">` +
      '<svg class="i" aria-hidden="true" focusable="false"><use href="#i-share"></use></svg></button>' +
      `<button class="lib-icon" data-act="delete" title="Delete" aria-label="Delete ${escapeHtml(entry.title)}">` +
      DELETE_GLYPH + '</button>' +
      `</div></article>`
    ).join('');

    Array.from($('#libraryList').children).forEach((card) => {
      const id = card.dataset.id;
      card.querySelector('.lib-load').onclick = () => {
        const entry = Library.find(id);
        if (entry) { loadRecipe(entry.recipe); closeSheet(); toast(`Loaded “${entry.title}”`); }
      };
      const del = card.querySelector('[data-act=delete]');
      const saved = Library.find(id);
      const savedTitle = saved ? saved.title : 'saved song';
      const deleteLabel = del.getAttribute('aria-label');
      const disarmDelete = () => {
        if (!del.isConnected) return;
        delete del.dataset.armed;
        del.innerHTML = DELETE_GLYPH;
        del.setAttribute('aria-label', deleteLabel);
        del.classList.remove('is-armed');
      };
      del.onclick = () => {
        // Two taps rather than a dialog: the first arms it, the second does it.
        if (del.dataset.armed) {
          /* height:0 cannot interpolate from auto, so the card's current height
             is pinned first and the collapse released on the next frame. The
             survivors are carried by that reflow and then walked into their
             final places, rather than teleporting when the list rebuilds. */
          card.style.height = `${card.offsetHeight}px`;
          global.requestAnimationFrame(() => card.classList.add('is-removing'));
          global.setTimeout(() => {
            flipCards(() => { Library.remove(id); renderLibrary(); });
          }, Motion.reduced() ? 0 : 200);
          toast('Deleted');
          announce(`${savedTitle} deleted`);
          haptic(8);
          return;
        }
        /* The depleting hairline is an animation on .is-armed::after, and a
           class that is already present will not restart it — a second arm
           would show a bar that had already run out. */
        del.classList.remove('is-armed');
        void del.offsetWidth;
        del.dataset.armed = '1';
        del.textContent = 'Delete?';
        del.setAttribute('aria-label', `Confirm delete ${savedTitle}`);
        del.classList.add('is-armed');
        announce(`Delete ${savedTitle}? Activate delete again to confirm.`);
        haptic([8, 26, 8]);
        global.setTimeout(disarmDelete, 3200);
      };
      del.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape' || !del.dataset.armed) return;
        event.preventDefault();
        event.stopPropagation();
        disarmDelete();
        announce('Delete cancelled');
      });
      card.querySelector('[data-act=link]').onclick = () => {
        const entry = Library.find(id);
        if (entry) copyText(Library.linkFor(entry.recipe), 'Link copied');
      };
    });

    /* §6.25's entrance, and only on the frame the sheet opens: 'is-staged'
       rather than the default class because css/motion.css keys .is-entering
       off a flat 45ms boot step in a later layer, which would overwrite the
       30ms this list wants. */
    if (staged) Motion.stagger($('#libraryList').children, { step: 30, cls: 'is-staged' });
  }

  function escapeHtml(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function copyText(text, message) {
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(
      () => toast(message), () => toast('Clipboard blocked'));
    else toast('Clipboard blocked');
  }

  async function shareSong() {
    const url = Library.linkFor(Library.recipeOf(song));
    const data = {
      title: `${song.title} · Downbeat`,
      text: `${song.genre.label} in ${song.key.rootName} ${song.scaleName} · ${song.bpm} BPM`,
      url
    };
    const canShare = typeof navigator.share === 'function' &&
      (typeof navigator.canShare !== 'function' || navigator.canShare(data));
    if (!canShare) return copyText(url, 'Link copied');
    try {
      await navigator.share(data);
      toast('Shared');
      announce('Song shared');
    } catch (error) {
      // Closing the system share sheet is a normal decision, not an error.
      if (!error || error.name !== 'AbortError') toast('Share unavailable');
    }
  }

  /* --------------------------------------------------------------- sheets

     Both sheets are children of #stage, so the scrim covers the part you are
     reading and never the hardware you are reading it for. That is the whole
     trick — there is no fixed positioning to get wrong at a breakpoint, and
     no reason to lock the page's scroll. */
  const SHEETS = ['songSheet', 'structureSheet'];
  let openName = null;
  let returnFocus = null;

  function setSheetBackground(inert) {
    [$('#bar'), $('#rig'), $('#thumb'), $('#performanceChrome')].forEach((el) => {
      if (!el) return;
      if (inert && !el.hidden) el.setAttribute('inert', '');
      else el.removeAttribute('inert');
    });
    const body = $('#stageBody');
    if (inert) {
      body.setAttribute('inert', '');
      body.setAttribute('aria-hidden', 'true');
    } else {
      body.removeAttribute('inert');
      body.removeAttribute('aria-hidden');
    }
  }

  /* The two openers are the same button pattern, so the chevron state is
     written from one place. aria-expanded is also what rotates it — without the
     attribute the glyph never flips and the control lies about what it did. */
  function syncOpeners() {
    $('#songButton').setAttribute('aria-expanded', String(openName === 'songSheet'));
    $('#structureButton').setAttribute('aria-expanded', String(openName === 'structureSheet'));
  }

  function openSheet(name) {
    if (openName === name) return closeSheet();
    returnFocus = document.activeElement;
    openName = name;
    /* §6.16. Both sheets mark the rig and the thumb inert the moment they open,
       so at every width the hardware is already dead — leaving it at full
       brightness is the interface telling you something untrue. */
    document.body.classList.add('sheet-open');
    /* Cancel any exit still in flight before un-hiding, or its timer lands a
       few frames from now and hides the sheet that has just been opened. */
    const host = $('#sheetHost');
    if (host._motionExit) { global.clearTimeout(host._motionExit); host._motionExit = null; }
    host.classList.remove('is-leaving');
    host.hidden = false;
    SHEETS.forEach((id) => { $('#' + id).hidden = id !== name; });
    setSheetBackground(true);
    syncOpeners();
    /* Both entrances belong to the frame the sheet opens and to no other:
       renderLibrary and renderStructure run on every generate, and an entrance
       that replays on every regenerate stops being an entrance. */
    if (name === 'songSheet') renderLibrary({ staged: true });
    if (name === 'structureSheet') {
      Motion.stagger($('#arrangeMap').querySelectorAll('.map-energy'), { step: 25, cls: 'is-staged' });
      syncMapEnd();
    }
    const sheet = $('#' + name);
    // Focus the dialog itself so assistive technology announces its title and
    // touch users do not see a picker highlighted before they choose it.
    sheet.focus({ preventScroll: true });
  }

  function closeSheet() {
    if (!openName) return;
    openName = null;
    document.body.classList.remove('sheet-open');
    /* §7.10. The scrim, the host and the sheet all have authored exits and none
       of them ever ran: this used to set [hidden] on all three in the same
       frame, so the largest surface in the app was the one thing that cut to
       nothing. Routed through Motion.hideWith the class goes on now and the
       attribute lands when the transition ends — 176ms, 55% of the 320ms rise,
       and 143 under the 699px query where the sheet enters in 260. The sheets
       themselves are hidden after the host, so the scrim and the panel leave
       together as the one object they look like.

       Everything that is not visual happens immediately. Focus must not wait
       behind an animation — it would sit inside a surface that is on its way
       out — and the stage has to stop being inert before it can receive it. */
    setSheetBackground(false);
    syncOpeners();
    if (returnFocus && returnFocus.isConnected) returnFocus.focus();
    returnFocus = null;
    /* 176 at every width, not 143 on the phone. The number has to be the HOST's
       clock — `.sheet-host.is-leaving` fades over --t-slide * .55 — because the
       host is what is being hidden; the phone sheet's shorter 143ms slide is a
       child transition that finishes comfortably inside it. Timing the hide to
       the child would cut the parent's fade 33ms early. */
    Motion.hideWith($('#sheetHost'), 'is-leaving', 176).then(() => {
      // Only if nothing re-opened while it was leaving.
      if (!openName) SHEETS.forEach((id) => { $('#' + id).hidden = true; });
    });
  }

  /* Tab stays inside an open sheet — without this it walks off into the stage
     behind, which is exactly the content we just marked inert. */
  $('#sheetHost').addEventListener('keydown', (event) => {
    if (event.key !== 'Tab' || !openName) return;
    const sheet = $('#' + openName);
    const focusable = Array.from(sheet.querySelectorAll(
      'button, select, input, [href], [tabindex]:not([tabindex="-1"])'))
      .filter((el) => !el.disabled && el.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });

  /* ----------------------------------------------------------- lane strip

     On a phone the run of pads is what you read while playing, so the lane
     opens as a glance at the shape of the part and expands only when you ask.
     The choice is remembered — someone who wants the grid wants it every time. */
  const LANE_STORE = global.Store.key('lane');
  let laneSlim = true;
  try { laneSlim = localStorage.getItem(LANE_STORE) !== 'full'; } catch (e) { /* first visit */ }

  /* The button says what it does, not what it is next to. It used to read
     "Shape" under a silkscreen that already reads SHAPE — the region named
     twice in two type registers, eight pixels apart, with only the chevron
     carrying any information. The legend names the region; the control states
     the action. The accessible name keeps the region in it so the visible word
     is a prefix of the announced one, which is what §9 asks of a control whose
     label is shorter than its purpose. */
  function applyLane() {
    document.body.classList.toggle('lane-slim', laneSlim);
    const toggle = $('#laneToggle');
    toggle.setAttribute('aria-expanded', String(!laneSlim));
    toggle.querySelector('.lane-toggle-label').textContent = laneSlim ? 'Show' : 'Hide';
    toggle.setAttribute('aria-label', laneSlim ? 'Show the shape of this part' : 'Hide the shape of this part');
  }
  $('#laneToggle').onclick = () => {
    laneSlim = !laneSlim;
    try { localStorage.setItem(LANE_STORE, laneSlim ? 'slim' : 'full'); } catch (e) { /* private mode */ }
    applyLane();
  };
  applyLane();

  $('#scrim').onclick = closeSheet;
  Array.from(document.querySelectorAll('[data-close-sheet]')).forEach((b) => { b.onclick = closeSheet; });
  $('#songButton').onclick = () => openSheet('songSheet');
  $('#structureButton').onclick = () => openSheet('structureSheet');

  /* -------------------------------------------------------------- gestures

     Swiping across the stage moves between parts. The run scrolls vertically
     and the parts row scrolls horizontally, so this only claims a gesture that
     is clearly horizontal, clearly long enough to be deliberate, and did not
     start inside something that scrolls sideways itself. */
  (function swipeBetweenParts() {
    const stage = $('#stage');
    let startX = 0;
    let startY = 0;
    let tracking = false;

    stage.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' || openName) return;
      if (event.target.closest('.parts, .map-wrap, .lane-wrap')) return;
      startX = event.clientX;
      startY = event.clientY;
      tracking = true;
    }, { passive: true });

    stage.addEventListener('pointerup', (event) => {
      if (!tracking) return;
      tracking = false;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
      stepPart(dx < 0 ? 1 : -1);
    }, { passive: true });

    stage.addEventListener('pointercancel', () => { tracking = false; }, { passive: true });
  })();

  /* Dragging a sheet down dismisses it, which is the gesture every iOS sheet
     answers to. The drag is only claimed from the header — inside the body it
     would fight the scroll. */
  (function dragSheetAway() {
    const host = $('#sheetHost');
    let from = null;
    let sheet = null;

    host.addEventListener('pointerdown', (event) => {
      const head = event.target.closest('.sheet-head');
      if (!head || event.pointerType === 'mouse') return;
      sheet = head.closest('.sheet');
      from = event.clientY;
      sheet.style.transition = 'none';
    }, { passive: true });

    host.addEventListener('pointermove', (event) => {
      if (from === null) return;
      const dy = Math.max(0, event.clientY - from);
      sheet.style.transform = `translateY(${dy}px)`;
      $('#scrim').style.opacity = String(Math.max(0.15, 1 - dy / 320));
    }, { passive: true });

    const release = (event) => {
      if (from === null) return;
      const dy = Math.max(0, (event.clientY || 0) - from);
      sheet.style.transition = '';
      sheet.style.transform = '';
      $('#scrim').style.opacity = '';
      from = null;
      if (dy > 90) closeSheet();
    };
    host.addEventListener('pointerup', release, { passive: true });
    host.addEventListener('pointercancel', release, { passive: true });
  })();

  /* ------------------------------------------------------------ playback */

  /* Playing along to a loop means long stretches without touching the screen,
     which is exactly when a phone decides you have gone away. */
  let wakeLock = null;
  function holdScreenAwake(on) {
    if (!global.navigator || !global.navigator.wakeLock) return;
    if (on) {
      if (wakeLock) return;
      global.navigator.wakeLock.request('screen')
        .then((lock) => { wakeLock = lock; lock.addEventListener('release', () => { wakeLock = null; }); })
        .catch(() => { /* denied, or the battery is too low — not worth saying */ });
    } else if (wakeLock) {
      wakeLock.release().catch(() => {});
      wakeLock = null;
    }
  }
  let countInInterrupted = false;
  // The lock is dropped whenever the tab hides; take it back on return. A
  // count-in, however, must never finish invisibly while the app is suspended.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && countingIn) {
      countInInterrupted = true;
      stopPlayback();
      return;
    }
    if (!document.hidden && Engine.isPlaying()) holdScreenAwake(true);
    if (!document.hidden && countInInterrupted) {
      countInInterrupted = false;
      announce('Count in cancelled when Downbeat moved to the background');
    }
  });

  let countInTimer = null;
  let countingIn = false;
  let countInReturnFocus = null;

  function setCountInOverlay(on) {
    const overlay = $('#countIn');
    const background = [$('#bar'), desk, $('#thumb'), $('#performanceChrome')];
    if (on) {
      if (overlay._motionExit) { global.clearTimeout(overlay._motionExit); overlay._motionExit = null; }
      overlay.classList.remove('is-leaving');
      overlay.hidden = false;
    } else if (!overlay.hidden) {
      /* §6.30/§5.3. The numeral grows to 1.14 as the transport takes over —
         the count-in hands off rather than being switched off, which is the
         difference between four beats of preparation and a flicker. */
      Motion.hideWith(overlay, 'is-leaving', 165);
    }
    background.forEach((el) => {
      if (!el) return;
      if (on && !el.hidden) el.setAttribute('inert', '');
      else el.removeAttribute('inert');
    });
    if (on) {
      countInReturnFocus = document.activeElement;
      $('#countInCancel').focus({ preventScroll: true });
    } else if (countInReturnFocus && countInReturnFocus.isConnected) {
      countInReturnFocus.focus({ preventScroll: true });
      countInReturnFocus = null;
    }
  }

  function syncTransport(playing, label) {
    const text = label || (playing ? 'Stop' : 'Play');
    const action = countingIn ? 'Cancel count in' : (playing ? 'Stop playback' : 'Play song');
    $('#playLabel').textContent = text;
    $('#playIcon').textContent = playing || countingIn ? '■' : '▶';
    /* The glyph is a mask driven by this class, so it has to cover the count-in
       too — otherwise the text node says stop while the drawn shape still says
       play, and the one is the fallback for the other. */
    $('#playButton').classList.toggle('is-playing', playing || countingIn);
    $('#playButton').classList.toggle('is-counting', countingIn);
    $('#playButton').setAttribute('aria-label', action);
    $('#playButton').setAttribute('aria-pressed', String(playing || countingIn));
    $('#performancePlay').textContent = text;
    $('#performancePlay').classList.toggle('is-playing', playing || countingIn);
    $('#performancePlay').setAttribute('aria-label', action);
    $('#performancePlay').setAttribute('aria-pressed', String(playing || countingIn));
  }

  /* §7.4. The mark's four strokes are a CSS animation off --beat-ms, so lining
     it up with the audio is one property write rather than a per-frame bus: the
     animation starts the frame body.is-live lands, and --mark-sync shifts its
     timeline so stroke one strikes on the downbeat. Written once on playback
     start and once per loop, never per frame — --mark-sync is inherited, and an
     inherited property written to :root invalidates the whole document. */
  let markStartedAt = 0;
  let markSynced = false;
  function syncMark() {
    if (!song) return;
    const cycle = (60000 / song.bpm) * 4;
    const phase = ((mod(Engine.position(), 16)) / 16) * cycle;
    const delay = (global.performance.now() - markStartedAt) - phase;
    document.documentElement.style.setProperty('--mark-sync', `${Math.round(delay)}ms`);
  }

  function beginPlayback() {
    if (!song) return;
    countingIn = false;
    setCountInOverlay(false);
    Engine.start(song, {
      loop: $('#loopButton').getAttribute('aria-pressed') === 'true',
      onStop: stopPlayback,
      onLoop: () => { markSynced = false; }
    });
    syncTransport(true);
    /* Promoted for the length of the take and demoted the moment it stops. A
       will-change left on is a compositor layer left allocated. */
    document.body.classList.add('is-live');
    /* The playhead's visibility is carried by is-live, which fades it in on
       --t-click. `hidden` is display:none and cuts that dead — no crash, just a
       dismissal that vanishes in a frame, which is the thing §7.10 abolishes. */
    markStartedAt = global.performance.now();
    markSynced = false;
    barProgress.style.willChange = 'transform';
    holdScreenAwake(true);
    announce('Playback started');
    haptic(10);
    followPlayhead();
  }

  /* The count-in was the only timing path in the app that accumulated its own
     error: `setTimeout(tick, interval)` re-measures from whenever the previous
     tick actually ran, so every scheduler delay is added to the next beat and
     by the downbeat the click is measurably late — in the one moment a hardware
     performance tool cannot afford to drift.

     Every beat now has an absolute deadline computed from a single origin, and
     each wake is scheduled against the *deadline* rather than against the
     interval, so a late beat shortens the next wait instead of pushing it out.
     The loop spends every deadline that has already passed, so a wake that
     arrives two beats late catches up rather than falling further behind.

     performance.now() rather than AudioContext.currentTime because the engine
     does not expose its context; both are monotonic and neither accumulates, so
     across a four-beat window the two are the same clock. A frame loop was the
     obvious shape for this and is the wrong one: rAF is throttled to nothing in
     a tab that is not compositing, which would leave a count-in that never
     reaches its downbeat and a transport that never starts. */
  function startCountIn(bars) {
    if (!song || countingIn) return;
    Engine.ensure();
    countingIn = true;
    const total = Math.max(1, bars * 4);
    const interval = 60000 / song.bpm;
    const origin = global.performance.now();
    const beatEl = $('#countInBeat');
    const overlay = $('#countIn');
    let beat = 0;
    // Nothing hands over into the first beat, so there is no outgoing digit.
    beatEl.textContent = '';
    setCountInOverlay(true);
    syncTransport(false);
    announce(`${bars} bar count in`);

    const spend = () => {
      if (!countingIn) return;
      const now = global.performance.now();
      while (beat < total && now >= origin + beat * interval - 1) {
        const beatInBar = (beat % 4) + 1;
        /* Order matters: .pulse restarts three animations at once — the
           numeral strike, the outgoing digit and the scanline — so the text and
           data-prev have to be in place before the class lands, or every beat
           animates the digit before it. */
        beatEl.setAttribute('data-prev', beatEl.textContent || '');
        beatEl.textContent = String(beatInBar);
        overlay.classList.remove('pulse');
        void overlay.offsetWidth;
        overlay.classList.add('pulse');
        Engine.playDrum(beatInBar === 1 ? 'rim' : 'hat', null, beatInBar === 1 ? 0.9 : 0.55);
        haptic(beatInBar === 1 ? 18 : 7);
        beat += 1;
      }
      // The final beat still has to be heard before the transport takes over.
      const deadline = origin + Math.min(beat, total) * interval;
      if (beat >= total && global.performance.now() >= deadline - 1) {
        countInTimer = null;
        return beginPlayback();
      }
      countInTimer = global.setTimeout(spend, Math.max(0, deadline - global.performance.now()));
    };
    spend();
  }

  function startPlayback(skipCountIn) {
    if (!song) return;
    const bars = Number($('#countInSelect').value || 0);
    if (!skipCountIn && bars > 0) startCountIn(bars);
    else beginPlayback();
  }

  function stopPlayback() {
    if (countInTimer) global.clearTimeout(countInTimer);
    countInTimer = null;
    countingIn = false;
    setCountInOverlay(false);
    Engine.stop(true);
    if (frame) { cancelAnimationFrame(frame); frame = null; }
    syncTransport(false);
    barProgress.style.willChange = 'auto';
    document.body.classList.remove('is-live');
    barPos.textContent = '';
    performancePosition.textContent = '';
    lastPosition = '';
    // Segments back to dark and the fill back to bar one, at scaleX(0).
    resetBarSegments();
    clearLaneLight();
    if (mounted) mounted.update(null);
    // The mode holds the lock even when the transport is not running.
    holdScreenAwake(performanceOn);
    lastNow = null;
  }

  function togglePlayback() {
    if (Engine.isPlaying() || countingIn) {
      stopPlayback();
      announce('Playback stopped');
      haptic(6);
    }
    else startPlayback();
  }

  /* The playhead reads the audio clock every frame, so it never drifts out of
     step with what you are hearing.

     Everything this loop touches is a composited property or a value written
     to a registered custom property, every element it writes to was resolved
     at mount, and the two read-outs are guarded by a change check — the same
     eight characters were being written to the DOM sixty times a second to say
     the same thing. Nothing here reads layout. */
  let lastNow = null;
  let lastPosition = '';
  function followPlayhead() {
    const step = Engine.position();
    const ratio = song.totalSteps ? step / song.totalSteps : 0;
    /* The fill lives inside the current segment now, so what it scales is the
       bar rather than the song — one transform on one node, exactly as before,
       and the segment it sits in is only re-parented when the bar turns over. */
    const bar = Math.max(0, Math.min(song.bars - 1, Math.floor(step / 16)));
    if (bar !== lastBarIndex) {
      lastBarIndex = bar;
      markBar(bar);
    }
    const within = barSegs.length ? (step / 16) - bar : ratio;
    barProgress.style.transform = `scaleX(${Math.max(0, Math.min(1, within)).toFixed(5)})`;
    if (!markSynced && step > 0) { markSynced = true; syncMark(); }
    const position = `bar ${Math.min(song.bars, Math.floor(step / 16) + 1)}/${song.bars}`;
    if (position !== lastPosition) {
      lastPosition = position;
      barPos.textContent = position;
      performancePosition.textContent = position;
    }
    laneHead.style.setProperty('--head', ratio.toFixed(5));
    /* The head lights the notes it reaches; they decay behind it on --t-decay,
       which is why this only fires on the frame the sixteenth turns over. */
    const at = Math.floor(mod(step, song.totalSteps));
    if (at !== lastLitStep) {
      lastLitStep = at;
      lightLaneStep(at);
    }
    if (mounted) mounted.update(mod(step, song.totalSteps));
    followRun();
    frame = requestAnimationFrame(followPlayhead);
  }

  /* The run can be longer than its box, so it follows playback rather than
     leaving you to hunt for where you are — but it gives way the moment you
     scroll it yourself. A smooth scroll fighting a finger is the most
     irritating thing an app can do. */
  let runHeldByUser = false;
  (function yieldToTheFinger() {
    const hold = () => { runHeldByUser = true; };
    const releaseSoon = () => { global.setTimeout(() => { runHeldByUser = false; }, 2500); };
    runBox.addEventListener('pointerdown', hold, { passive: true });
    runBox.addEventListener('pointerup', releaseSoon, { passive: true });
    runBox.addEventListener('pointercancel', releaseSoon, { passive: true });
  })();

  /* The two rect reads below happen only on the frame the highlighted chip
     changes, never on the sixty frames between — and only then decide whether
     anything needs to move. The old version centred the chip unconditionally,
     which meant it scrolled on every note even when the chip was already in
     plain sight, and content sliding under the reader during playback is the
     one genuinely vestibular motion in the app. */
  function followRun() {
    if (runHeldByUser) return;
    const now = runBox.querySelector('.now');
    if (!now || now === lastNow) return;
    lastNow = now;
    const box = runBox.getBoundingClientRect();
    const chip = now.getBoundingClientRect();
    if (chip.top >= box.top && chip.bottom <= box.bottom) return;
    now.scrollIntoView({
      block: 'nearest', inline: 'nearest',
      behavior: Motion.reduced() ? 'auto' : 'smooth'
    });
  }

  /* ---------------------------------------------------------------- misc */

  let toastTimer = null;
  function toast(message) {
    const element = $('#toast');
    if (toastTimer) global.clearTimeout(toastTimer);
    /* §6.29. A second message landing on a live one used to be a silent caption
       swap, which is indistinguishable from the first one never having gone.
       The seat is restarted so each message is *seen* to arrive. */
    const overlapping = element.classList.contains('show') && element.textContent !== message;
    element.textContent = message;
    element.classList.add('show');
    if (overlapping) {
      element.classList.remove('is-swapping');
      void element.offsetWidth;
      element.classList.add('is-swapping');
    }
    toastTimer = global.setTimeout(() => {
      element.classList.remove('show', 'is-swapping');
      toastTimer = null;
    }, 1900);
  }

  function copySketch() {
    const lines = [
      `${song.genre.label} — ${song.key.rootName} ${song.scaleName} · ${song.bpm} BPM · ${song.bars} bars`,
      `Chords:  ${song.spans.map((s) => s.chord.symbol).join(' | ')}`,
      `Roman:   ${song.spans.map((s) => s.chord.roman).join(' | ')}`,
      `Melody:  ${song.melody.map((n) => n.name + n.octave).join(' ')}`,
      song.counter.length ? `Counter: ${song.counter.map((n) => n.name + n.octave).join(' ')}` : null,
      `Bass:    ${song.bassPlan.label} — ${song.bass.map((n) => (n.name || '') + '(' + n.role + ')').join(' ')}`,
      '',
      song.theory
    ].filter(Boolean).join('\n');
    copyText(lines, 'Song copied');
  }

  /* -------------------------------------------------------------- wiring */

  genreSelect.onchange = () => { refreshScales(); setTempoTouched(false); generate(); };
  [keySelect, scaleSelect, energySelect, barsSelect].forEach((element) => {
    element.onchange = () => generate();
  });
  /* Once the tempo is dragged it stops following the genre, so there has to be
     a way back. Rerolling the same seeds gives the identical sketch at the
     tempo the genre wanted. */
  $('#tempoReset').onclick = () => {
    setTempoTouched(false);
    if (!song) return generate();
    generate({
      harmonySeed: song.harmonySeed, melodySeed: song.melodySeed,
      scale: song.scaleName, bars: song.bars, title: song.title
    });
  };
  // Adding or removing the second line keeps everything else exactly as it is.
  counterToggle.onchange = () => {
    if (!song) return generate();
    generate({
      harmonySeed: song.harmonySeed, melodySeed: song.melodySeed,
      scale: song.scaleName, bars: song.bars
    });
  };
  /* The read-out follows the drag, but the engine is only restarted when you
     let go. Restarting per input event meant a touch drag — which fires far
     more events than a mouse — layered an abandoned run of notes from every
     intermediate tempo on top of the last, and threw the playhead back to bar
     one each time. */
  tempoRange.oninput = () => {
    setTempoTouched(true);
    syncTempoFill();
    $('#tempoValue').textContent = `${tempoRange.value} bpm`;
    if (!song) return;
    song.bpm = Number(tempoRange.value);
    $('#songMeta').textContent =
      `${song.genre.label} · ${song.key.rootName} ${song.scaleName} · ${song.bpm} bpm`;
  };
  tempoRange.addEventListener('pointerdown', rememberCurrent, { passive: true });
  tempoRange.addEventListener('keydown', (event) => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) {
      rememberCurrent();
    }
  });
  tempoRange.onchange = () => {
    syncTempoFill();
    saveDraft();
    if (song && Engine.isPlaying()) {
      stopPlayback();
      startPlayback(true);
    }
  };

  let tempoTaps = [];
  $('#tapTempoButton').onclick = () => {
    const now = performance.now();
    if (tempoTaps.length && now - tempoTaps[tempoTaps.length - 1] > 2500) tempoTaps = [];
    tempoTaps.push(now);
    if (tempoTaps.length > 6) tempoTaps.shift();
    haptic(6);
    if (tempoTaps.length < 2) {
      $('#tapTempoButton').textContent = 'Keep tapping';
      return;
    }
    if (tempoTaps.length === 2) rememberCurrent();
    const gaps = tempoTaps.slice(1).map((tap, index) => tap - tempoTaps[index]);
    const average = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
    const bpm = Math.max(Number(tempoRange.min), Math.min(Number(tempoRange.max), Math.round(60000 / average)));
    tempoRange.value = String(bpm);
    tempoRange.oninput();
    saveDraft();
    $('#tapTempoButton').textContent = `${bpm} bpm · tap`;
    announce(`Tempo ${bpm} beats per minute`);
  };

  const storedCountIn = (() => {
    try { return localStorage.getItem(COUNT_IN_STORE); } catch (e) { return null; }
  })();
  if (storedCountIn !== null && ['0', '1', '2'].includes(storedCountIn)) {
    $('#countInSelect').value = storedCountIn;
  }
  $('#countInSelect').onchange = function () {
    try { localStorage.setItem(COUNT_IN_STORE, this.value); } catch (e) { /* private mode */ }
    announce(this.value === '0' ? 'Count in off' : `${this.value} bar count in`);
  };

  $('#generateButton').onclick = () => {
    setTempoTouched(false);
    generate();
    closeSheet();
    toast('New song ready');
    haptic([10, 28, 12]);
  };
  $('#rerollMelodyButton').onclick = rerollMelody;
  $('#rerollChordsButton').onclick = rerollChords;
  $('#playButton').onclick = togglePlayback;
  $('#countInCancel').onclick = () => {
    stopPlayback();
    announce('Count in cancelled');
  };
  $('#performancePlay').onclick = togglePlayback;
  $('#performancePrevious').onclick = () => stepPart(-1);
  $('#performanceNext').onclick = () => stepPart(1);
  $('#performButton').onclick = () => setPerformance(!performanceOn);
  $('#performanceExit').onclick = () => setPerformance(false);
  $('#undoButton').onclick = undoLastChange;
  $('#copyButton').onclick = copySketch;
  $('#midiButton').onclick = () => {
    try { toast(`Saved ${Midi.download(song)}`); }
    catch (e) { toast('MIDI export unavailable'); }
  };

  const saveCurrent = () => {
    const result = Library.save(song);
    renderLibrary();
    if (result.duplicate) toast('Already saved');
    else if (result.stored) { toast(`Saved “${song.title}”`); announce('Song saved'); }
    else toast('Storage unavailable');
  };
  $('#saveButton').onclick = saveCurrent;
  /* §6.37: the empty state's button is the fix, not a description of it — so it
     is the same action, not a second one that can drift away from it. */
  $('#librarySaveEmpty').onclick = saveCurrent;
  $('#linkButton').onclick = shareSong;

  $('#loopButton').onclick = function () {
    const on = this.getAttribute('aria-pressed') !== 'true';
    this.setAttribute('aria-pressed', String(on));
    Engine.setLoop(on);
  };

  $('#soloButton').onclick = () => {
    soloOn = !soloOn;
    if (soloOn) clearAuditionFlagsOnly();
    syncSolo();
    applyMutes();
  };

  /* A short, skippable introduction explains the product in the order it is
     actually used. It can always be reopened from New song. */
  let onboardingPage = 0;
  function renderOnboarding(from) {
    const titleIds = ['onboardingTitle', 'onboardingHardwareTitle', 'onboardingPerformTitle'];
    /* §5.5: direction is carried. Without it Back and Continue are the same
       animation, which is a page change that refuses to say which way it went. */
    const delta = typeof from === 'number' ? onboardingPage - from : 1;
    $('#onboarding').style.setProperty('--dir', delta >= 0 ? '1' : '-1');
    Array.from(document.querySelectorAll('[data-onboarding-page]')).forEach((page, index) => {
      const on = index === onboardingPage;
      if (on) {
        if (page._motionExit) { global.clearTimeout(page._motionExit); page._motionExit = null; }
        page.classList.remove('is-leaving');
        page.hidden = false;
      } else if (!page.hidden) {
        // The incoming page needs no delay of its own — its CSS carries 80ms.
        // 88, not 160: `.onboarding-page.is-leaving` runs 160 * .55, and the
        // extra 72ms was the page sitting invisible before [hidden] landed.
        Motion.hideWith(page, 'is-leaving', 88);
      }
    });
    /* Real tab stops, so the indicator is an ARIA state rather than a class:
       [aria-current] is what draws the 18px pill, and the old `is-on` had no
       rule left anywhere to match it. */
    Array.from(document.querySelectorAll('.onboarding-dots button')).forEach((dot, index) => {
      if (index === onboardingPage) dot.setAttribute('aria-current', 'true');
      else dot.removeAttribute('aria-current');
    });
    /* §9.6: unavailable stays focusable and explains itself. A native disabled
       would remove the tab stop and match no rule in the sheet. */
    const back = $('#onboardingBack');
    if (onboardingPage === 0) back.setAttribute('aria-disabled', 'true');
    else back.removeAttribute('aria-disabled');
    $('#onboarding').setAttribute('aria-labelledby', titleIds[onboardingPage]);
    $('#onboardingNext').textContent = onboardingPage === 2 ? 'Start creating' : 'Continue';
  }

  function goToOnboardingPage(index) {
    const next = Math.max(0, Math.min(2, index));
    if (next === onboardingPage) return;
    const from = onboardingPage;
    onboardingPage = next;
    renderOnboarding(from);
    const title = document.getElementById($('#onboarding').getAttribute('aria-labelledby'));
    if (title) announce(title.textContent);
    haptic(6);
  }

  function showOnboarding() {
    if (openName) closeSheet();
    const card = $('#onboarding');
    onboardingPage = 0;
    if (card._motionExit) { global.clearTimeout(card._motionExit); card._motionExit = null; }
    card.classList.remove('is-leaving');
    card.hidden = false;
    [$('#bar'), desk, $('#thumb'), $('#performanceChrome')].forEach((el) => {
      if (el && !el.hidden) el.setAttribute('inert', '');
    });
    renderOnboarding(0);
    $('#onboardingNext').focus({ preventScroll: true });
  }

  function finishOnboarding() {
    Motion.hideWith($('#onboarding'), 'is-leaving', 190);
    [$('#bar'), desk, $('#thumb'), $('#performanceChrome')].forEach((el) => {
      if (el) el.removeAttribute('inert');
    });
    try { localStorage.setItem(ONBOARDING_STORE, 'complete'); } catch (e) { /* private mode */ }
    /* The introduction ends on the transport, not on another sheet: the last
       thing it said was "press play and follow the lights", and opening New
       song instead is the product contradicting itself in the same second. */
    $('#playButton').focus({ preventScroll: true });
  }

  $('#onboardingNext').onclick = () => {
    if (onboardingPage < 2) goToOnboardingPage(onboardingPage + 1);
    else finishOnboarding();
  };
  $('#onboardingBack').onclick = () => {
    if (onboardingPage === 0) return announce('You are on the first step');
    goToOnboardingPage(onboardingPage - 1);
  };
  Array.from(document.querySelectorAll('[data-onboarding-go]')).forEach((dot) => {
    dot.onclick = () => goToOnboardingPage(Number(dot.dataset.onboardingGo));
  });
  $('#onboardingClose').onclick = finishOnboarding;
  $('#onboarding').addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const controls = [$('#onboardingClose'), $('#onboardingNext')];
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  $('#helpButton').onclick = () => { closeSheet(); global.setTimeout(showOnboarding, 120); };

  /* Installability is offered only when the browser says the app can be
     installed. iOS has no install prompt, so it gets concise system guidance. */
  let installPrompt = null;
  /* The markup ships the attribute so the space is reserved from first paint;
     this is what also makes the control unreachable until it means something. */
  showConditional($('#installButton'), false);
  const isIos =/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isStandalone = global.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (isIos && !isStandalone) {
    showConditional($('#installButton'), true);
    $('#installButton').textContent = 'Add to Home Screen';
  }
  global.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event;
    showConditional($('#installButton'), true);
  });
  $('#installButton').onclick = async () => {
    if (!installPrompt) {
      if (isIos && !isStandalone) {
        setGhostShown($('#installHelp'), true);
        announce('Tap Share, then choose Add to Home Screen');
      }
      return;
    }
    installPrompt.prompt();
    try {
      const result = await installPrompt.userChoice;
      if (result.outcome === 'accepted') toast('Downbeat installed');
    } catch (e) { toast('Install unavailable'); }
    installPrompt = null;
    showConditional($('#installButton'), false);
    setGhostShown($('#installHelp'), false);
  };
  global.addEventListener('appinstalled', () => {
    installPrompt = null;
    showConditional($('#installButton'), false);
    setGhostShown($('#installHelp'), false);
    toast('Downbeat installed');
  });
  global.addEventListener('offline', () => {
    document.body.classList.add('is-offline');
    toast('Offline · your current song is safe');
    announce('Offline. Your current song is safe.');
  });
  global.addEventListener('online', () => {
    document.body.classList.remove('is-offline');
    toast('Back online');
  });
  const initiallyOffline = !navigator.onLine;
  document.body.classList.toggle('is-offline', initiallyOffline);
  if (initiallyOffline) global.setTimeout(() => announce('Offline. Your current song is safe.'), 120);

  /* Soloing leaves the section you were auditioning, but the mutes it wants
     are its own — so drop the audition without putting every part back on. */
  function clearAuditionFlagsOnly() {
    auditioning = null;
    auditionMuted = [];
    setGhostShown($('#arrangeReset'), false);
    Array.from(document.querySelectorAll('.is-auditioning'))
      .forEach((el) => el.classList.remove('is-auditioning'));
  }

  /* Follow the device until the person makes an explicit choice. */
  const THEME_STORE = global.Store.key('theme');
  const systemTheme = global.matchMedia('(prefers-color-scheme: light)');
  /* The browser chrome has to be the same colour as the room or the launch
     screen shows a seam against the app. Read it back out of the stylesheet
     rather than repeating the hex here — a literal in this file is how the two
     silently drifted apart the last time the palette moved. */
  let themeShift = 0;
  function applyTheme(light, animate) {
    /* The colour transition is opt-in: at boot there is no previous theme to
       travel from, and staging a cross-fade against the first paint just makes
       the app look slow to start. */
    if (animate) {
      document.body.classList.add('theme-shifting');
      global.clearTimeout(themeShift);
      themeShift = global.setTimeout(() => document.body.classList.remove('theme-shifting'), 360);
    }
    document.body.classList.toggle('light', light);
    const room = getComputedStyle(document.body).getPropertyValue('--room').trim() || (light ? '#D6D2C7' : '#070806');
    Array.from(document.querySelectorAll('meta[name="theme-color"]')).forEach((meta) => {
      meta.setAttribute('content', room);
    });
    $('#themeButton').setAttribute('aria-label', light ? 'Use dark appearance' : 'Use light appearance');
    $('#themeButton').setAttribute('title', light ? 'Use dark appearance' : 'Use light appearance');
    /* The glyph is a drawn symbol from the sprite now, so this repoints the
       <use> rather than writing text into the button — a textContent write here
       would delete the SVG and leave the control blank for the rest of the
       session. */
    const icon = $('#themeIcon');
    if (icon) {
      const use = icon.querySelector('use');
      if (use) use.setAttribute('href', light ? '#i-sun' : '#i-moon');
    }
  }
  const storedTheme = (() => {
    try { return localStorage.getItem(THEME_STORE); } catch (e) { return null; }
  })();
  applyTheme(storedTheme ? storedTheme === 'light' : systemTheme.matches);
  const followSystemTheme = (event) => {
    let preference = null;
    try { preference = localStorage.getItem(THEME_STORE); } catch (e) { /* private mode */ }
    if (!preference) applyTheme(event.matches, true);
  };
  if (systemTheme.addEventListener) systemTheme.addEventListener('change', followSystemTheme);
  else systemTheme.addListener(followSystemTheme);
  $('#themeButton').onclick = () => {
    const light = !document.body.classList.contains('light');
    applyTheme(light, true);
    try { localStorage.setItem(THEME_STORE, light ? 'light' : 'dark'); } catch (e) { /* fine */ }
  };

  /* The escape stack, innermost first. The count-in is a modal aria-modal
     dialog and was the one dialog in the app that could not be dismissed with
     Escape; performance mode is last because it is a mode rather than a
     surface, and leaving it should never pre-empt closing something on top. */
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && countingIn) {
      event.preventDefault();
      stopPlayback();
      return announce('Count in cancelled');
    }
    if (event.key === 'Escape' && !$('#onboarding').hidden) {
      event.preventDefault();
      return finishOnboarding();
    }
    if (event.key === 'Escape' && openName) { event.preventDefault(); return closeSheet(); }
    if (event.key === 'Escape' && performanceOn) { event.preventDefault(); return setPerformance(false); }
    /* The listener is on the document, so the target is not guaranteed to be
       an element: with no focused node Chrome delivers keydown to the document
       itself, which has neither `matches` nor `closest`, and the TypeError
       aborted the handler — taking Space, G and the part-number shortcuts with
       it for that press. A document target means nothing is focused, which is
       exactly the case the shortcuts are for, so it falls through rather than
       returning. */
    const focused = event.target instanceof Element ? event.target : null;
    if (focused && focused.matches('input, select, textarea')) return;
    if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      return undoLastChange();
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.code === 'Space') {
      // Space belongs to whatever control has focus — pressing it on Save
      // should save, not save and start playing.
      if (focused && focused.closest('button, a, summary')) return;
      event.preventDefault();
      togglePlayback();
    } else if (event.key === 'g' || event.key === 'G') {
      generate();
    } else if (/^[1-5]$/.test(event.key)) {
      selectPart(Devices.TRACKS[Number(event.key) - 1].id);
    }
  });

  /* ------------------------------------------------------------ placement

     The bar and the thumb are both measured rather than assumed: the bar grows
     by the status-bar inset on a notched phone, and the thumb by the home
     indicator, and the desk's height is whatever is left between them. */
  const bar = $('#bar');
  const thumb = $('#thumb');
  function syncChrome() {
    const root = document.documentElement.style;
    const topChrome = performanceOn ? $('#performanceChrome') : bar;
    root.setProperty('--bar-h', `${topChrome.offsetHeight}px`);
    root.setProperty('--thumb-h', thumb.hidden ? '0px' : `${thumb.offsetHeight}px`);
  }

  /* On a phone the controls and the part switcher move to the foot of the
     screen — the same elements, not copies, so there is one of each control
     and the handlers wired to them never need re-binding. */
  const phone = global.matchMedia('(max-width: 699px)');
  const shortways = global.matchMedia('(max-height: 500px) and (max-width: 1199px)');

  /* §3.5's table names .thumb .bar-controls, so the register follows the row
     down the screen rather than being duplicated in two places that can drift.
     Built once and moved, like everything else that relocates here. */
  const thumbLegend = document.createElement('p');
  thumbLegend.className = 'legend';
  thumbLegend.textContent = 'Transport';

  /* §6.33. Five secondary actions leave the second row for a menu, which is
     what turns a wrapping three-line bar into the prescribed single line — and
     which is the actual fix for #structureButton clipping eighteen pixels past
     a 390px viewport. The menu is the sheet openers' own controls, activated
     where they already are, so there is one handler per action and no copy. */
  const thumbMore = document.createElement('button');
  thumbMore.type = 'button';
  thumbMore.className = 'pill thumb-more';
  thumbMore.id = 'thumbMore';
  thumbMore.setAttribute('aria-expanded', 'false');
  thumbMore.setAttribute('aria-label', 'More actions');
  thumbMore.innerHTML = '<svg class="i" aria-hidden="true" focusable="false"><use href="#i-more"></use></svg>';
  /* A disclosure, not a menu: there is no second surface to build and no copy
     of any control to keep in step — the five actions simply come back into the
     row they were taken out of, each still the one element with the one handler
     already bound to it.

     The collapse is written inline rather than left to the :has() rule in
     css/layout.css. That rule cannot win: it lives in the `layout` layer and
     `.pill { display:flex }` lives in `components`, which the cascade puts
     after it — so specificity never gets a say and the row stays two lines. An
     inline declaration outranks every layer, which is the one place this can be
     stated from without reaching into a stylesheet somebody else owns. */
  const overflowControls = () =>
    Array.from(document.querySelectorAll('#barControls [data-thumb-overflow]'));
  /* Both housings hold nothing but overflow controls, so collapsing the row
     empties them — and an empty milled well and a hairline rule with nothing
     after it are the two clearest ways to say a control is missing. A housing
     with no visible contents is not a group, so it goes with them. */
  const overflowHousings = () =>
    Array.from(document.querySelectorAll('#barControls .toggle-well, #barControls .key-group'));
  function setThumbOverflow(open) {
    thumbMore.setAttribute('aria-expanded', String(open));
    overflowControls().forEach((el) => { el.style.display = open ? '' : 'none'; });
    overflowHousings().forEach((box) => {
      const filled = Array.from(box.children).some((el) => el.style.display !== 'none');
      box.style.display = filled ? '' : 'none';
    });
  }
  // Back in the bar there is room for all of them, so the override comes off.
  function releaseThumbOverflow() {
    thumbMore.setAttribute('aria-expanded', 'false');
    overflowControls().forEach((el) => { el.style.display = ''; });
    overflowHousings().forEach((box) => { box.style.display = ''; });
  }
  thumbMore.onclick = () => {
    setThumbOverflow(thumbMore.getAttribute('aria-expanded') !== 'true');
    haptic(6);
  };

  function placeControls() {
    const down = phone.matches || shortways.matches;
    const controls = $('#barControls');
    const parts = $('#parts');
    if (down) {
      /* Clearing [hidden] is a display change and display does not transition.
         Parking the bar in its own exit state for one frame and releasing it
         buys the 220ms entrance off the class that is already written. */
      /* Unconditionally, and before the hidden check: crossing back inside the
         120ms exit window leaves a timer still armed to hide a bar we have just
         decided to keep, and [hidden] is false for the whole of that window so
         the entrance branch never sees it. */
      if (thumb._motionExit) { global.clearTimeout(thumb._motionExit); thumb._motionExit = null; }
      thumb.classList.remove('is-leaving');
      if (thumb.hidden) {
        thumb.hidden = false;
        thumb.classList.add('is-leaving');
        /* Both, and for the same reason the boot release is armed twice: the
           exit state is opacity:0, and in a tab that is not compositing rAF
           never runs — a bar parked invisible is a far worse failure than a
           missing entrance. Whichever lands first wins; the other is a no-op. */
        const release = () => thumb.classList.remove('is-leaving');
        global.requestAnimationFrame(release);
        global.setTimeout(release, 120);
      }
      if (thumbLegend.parentNode !== thumb) thumb.prepend(thumbLegend);
      if (parts.parentNode !== thumb) thumb.append(parts);
      if (controls.parentNode !== thumb) thumb.append(controls);
      if (thumbMore.parentNode !== controls) controls.append(thumbMore);
      setThumbOverflow(false);
    } else {
      // Appearance is a trailing toolbar action on wide layouts. Inserting
      // the controls before it also keeps song identity adjacent to playback.
      if (controls.parentNode !== bar) bar.insertBefore(controls, $('#themeButton'));
      if (parts.parentNode !== $('#stageBody')) $('#stageBody').prepend(parts);
      // The overflow and its legend belong to the thumb, so they leave with it.
      releaseThumbOverflow();
      if (thumbMore.parentNode) thumbMore.remove();
      if (thumbLegend.parentNode) thumbLegend.remove();
      // §5.3/§7.10 — nothing in the app is permitted to vanish in a frame.
      if (!thumb.hidden) Motion.hideWith(thumb, 'is-leaving', 120).then(syncChrome);
    }
    document.body.classList.toggle('has-thumb', down);
    syncChrome();
  }

  if (global.ResizeObserver) {
    const ro = new global.ResizeObserver(() => { placeSetup(); syncChrome(); });
    ro.observe(bar);
    ro.observe(thumb);
    ro.observe($('#performanceChrome'));
    /* And the viewport itself, for the set-up bay. A window dragged across
       900px or 501px has to move the disclosure back out of the desk, and the
       resize event is the wrong single point of failure for something that
       leaves a region empty when it misses: browsers coalesce and throttle it,
       and an emulated viewport can change without dispatching it at all. The
       root element is safe to observe from a callback that moves the
       disclosure, because moving it cannot change the size of a box that is
       already exactly the viewport — placeSetup is idempotent, so a second
       delivery is a no-op rather than a loop. */
    ro.observe(document.documentElement);
  }
  /* The first measurement happens against whatever face is on screen at the
     time, and font-display:swap means that is the metric-matched fallback on a
     cold cache. Archivo is 96% size-adjusted, so every control in both bars
     grows when the real face lands: measured here, the thumb went 103 -> 147px
     and the desk kept the old number, leaving the SET-UP disclosure 44px behind
     the thumb bar. The ResizeObserver above is supposed to catch it and does,
     on a compositing tab — but the desk's height should not depend on a frame
     being produced, and this is one line. */
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(syncChrome).catch(() => {});
  }
  /* Column width is what decides whether a note can carry its own name, so the
     measurement is retaken whenever the column width can have changed — and the
     set-up bay is placed here too, because dragging a window across 900px or
     501px is the one way the desk can change shape without anything being
     re-rendered. It is a no-op whenever the disclosure is already where it
     belongs. */
  global.addEventListener('resize', () => { placeSetup(); syncChrome(); applyNoteDensity(); });

  /* Crossing a band changes how much faceplate fits, how much height the lane
     may spend, and where the controls live. */
  const onBand = () => { placeControls(); placeSetup(); if (song) renderPart(); };
  [phone, shortways, wideDesk].forEach((q) => {
    if (q.addEventListener) q.addEventListener('change', onBand);
    else q.addListener(onBand);
  });
  placeControls();
  placeSetup();

  syncSolo();
  refreshScales();

  /* ------------------------------------------------------------- identity

     §3.7's consumers of the mark, wired here because until this ran the
     document contained no .mark at all — the wordmark rules, §7.4's per-beat
     counting and §7.9's offline ring were all styling an element that did not
     exist. Into .mark-slot, never into .wordmark: Mark.render sets innerHTML
     and would delete the word standing beside it. */
  Mark.render('.wordmark .mark-slot', { live: true });
  Array.from(document.querySelectorAll('.onboarding-mark')).forEach((el) => Mark.render(el));
  Mark.render($('#libraryEmpty .empty-mark'));
  /* index.html carries the same string inline so the first paint is right; this
     re-points it at the module so the two cannot silently diverge. */
  Mark.favicon();

  /* §6.39. There was no error state anywhere in the app: a share link that
     existed but would not decode silently produced an unrelated random song,
     which is the app lying about what you opened. Fact and recourse in one
     clause, with the recourse as a control rather than as advice. */
  function showStageError(reason, fixLabel) {
    const body = $('#stageBody');
    if (!body || body.querySelector('.empty-state.is-error')) return;
    const box = document.createElement('div');
    box.className = 'empty-state is-error';
    const mark = document.createElement('span');
    mark.className = 'empty-state-mark';
    mark.setAttribute('aria-hidden', 'true');
    Mark.render(mark);
    const eyebrow = document.createElement('p');
    eyebrow.className = 'eyebrow';
    eyebrow.textContent = 'Nothing was written';
    const head = document.createElement('h3');
    head.textContent = reason;
    const again = document.createElement('button');
    again.type = 'button';
    again.className = 'ghost';
    again.textContent = fixLabel || 'Try again';
    again.onclick = () => {
      box.remove();
      try { generate(null, { noHistory: true }); }
      catch (e) { showStageError(reason, fixLabel); }
    };
    box.append(mark, eyebrow, head, again);
    body.prepend(box);
    announce(`${reason}. ${again.textContent}.`);
  }

  /* §6.40. A 1.9-second caption was the entire welcome on the one acquisition
     path a product with no accounts has. The banner persists and leaves on the
     first thing you do, which is the event it is actually waiting for. */
  function openSharedLanding() {
    const landing = $('#sharedLanding');
    if (!landing) return;
    landing.hidden = false;
    /* 132, not 121. 121 is the generic [hidden] toggle's 220 * .55 pasted onto
       a surface that rises in over 240, and `.landing.is-leaving` is authored
       against that 240 — so the last 11ms of the fade was being cut. */
    const dismiss = () => Motion.hideWith(landing, 'is-leaving', 132);
    const away = (event) => {
      if (landing.contains(event.target)) return;
      document.removeEventListener('pointerdown', away, true);
      document.removeEventListener('keydown', away, true);
      dismiss();
    };
    document.addEventListener('pointerdown', away, true);
    document.addEventListener('keydown', away, true);
    $('#sharedLandingPlay').onclick = () => { dismiss(); startPlayback(); };
    $('#sharedLandingNew').onclick = () => { dismiss(); openSheet('songSheet'); };
    announce('Opened a shared sketch');
  }

  /* A shared link wins over a local draft. Otherwise the exact current sketch
     returns after a refresh, browser eviction, or accidental tab close. */
  const shared = Library.fromHash();
  /* Library.decode swallows a malformed payload and hands back null, which is
     indistinguishable from having no link at all — so the app composed
     something unrelated and let you believe it was what had been shared with
     you. The address bar is the only place left that still knows a sketch was
     asked for, so that is what is read. */
  const sharedAsked = /[#&]s=/.test(global.location.hash || '');
  let draft = null;
  try { draft = JSON.parse(localStorage.getItem(DRAFT_STORE)); } catch (e) { /* no usable draft */ }
  const fallback = () => {
    if (draft && draft.g) loadRecipe(draft, { noHistory: true });
    else generate(null, { noHistory: true });
  };
  try {
    if (shared) {
      loadRecipe(shared, { noHistory: true });
      Library.clearHash();
      openSharedLanding();
    } else if (sharedAsked) {
      Library.clearHash();
      fallback();
      showStageError('That shared link could not be opened', 'Write me one instead');
    } else {
      fallback();
    }
  } catch (error) {
    Library.clearHash();
    showStageError(sharedAsked
      ? 'That shared link could not be opened'
      : 'Something went wrong writing that song');
    // A named failure still needs a usable desk behind it.
    try { if (!song) generate(null, { noHistory: true }); } catch (e) { /* the error state stands alone */ }
  }
  syncUndo();

  /* The mode is written on every toggle and used to be read nowhere, so it did
     not survive a refresh. Quietly, because a restored state is not an
     announcement and boot is not the moment to move someone's focus. */
  try { if (localStorage.getItem(PERFORMANCE_STORE) === '1') setPerformance(true, true); }
  catch (e) { /* private mode */ }

  /* Gated on the store alone. It used to hang off `firstRun`, which meant
     anyone arriving through a shared link — the highest-value arrival path in a
     product with no accounts — was never introduced to the product at all.

     It waits for --t-power rather than for a number typed here. The
     introduction landing at 180ms used to cut across the power-on: the room was
     still coming up behind a modal that had already covered it. One token now
     says how long the unit takes to power up, and the two things that need to
     know it read the same value. */
  let introduced = false;
  try { introduced = localStorage.getItem(ONBOARDING_STORE) === 'complete'; } catch (e) { /* private mode */ }
  if (!introduced) {
    const power = parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--t-power')) || 520;
    global.setTimeout(showOnboarding, Motion.reduced() ? 0 : power);
  }

  /* §7.1 step 4, and the reason it did not exist: css/motion.css delays
     legend-in by calc(var(--enter-i) * 45ms) and nothing was writing --enter-i,
     so the whole engraved register arrived in one frame. Written before the
     power-on class flips, because that class is what starts the animation. */
  Motion.stagger(document.querySelectorAll('.legend, .plate'), { step: 45, max: 12, cls: null });
  /* §5.5 gives the control tiers indices of their own rather than positions in
     a list — 0, 1, 1, 2, 2 — which no single stagger call can produce. */
  [['.transport', 0], ['.toggle-well', 1], ['.key-group', 1], ['#rigDevices', 2], ['#parts', 2]]
    .forEach(([selector, index]) => enterAt($(selector), index));

  /* The good path: the first song is on the screen and laid out, so the
     power-on reveals a finished interface rather than an empty one. The floor
     under this is the timer armed at the top of the file. */
  global.requestAnimationFrame(() => global.requestAnimationFrame(powerOn));

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then((registration) => {
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            toast('Update ready for next launch');
          }
        });
      });
    }).catch(() => { /* the app remains fully usable without installation */ });
  }
})(window);
