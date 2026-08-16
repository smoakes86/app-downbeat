/* Downbeat — the app.

   Four screens behind a tab bar, a transport that never leaves the screen, and
   a navigation bar carrying the song. Everything below is written for a phone
   held in one hand: the thing you touch most is nearest the thumb, nothing
   depends on hovering, and no state lives anywhere you have to scroll to see.

   The engine underneath is untouched — Theory, Genres, Compose, Engine, Midi,
   Devices, Arrange and Library are exactly what they were. This file is the
   part that was wrong on a phone, rebuilt against the same contracts. */
(function (global) {
  'use strict';

  const doc = global.document;
  const $ = (sel, root) => (root || doc).querySelector(sel);
  const T = global.Theory;
  const G = global.Genres;
  const C = global.Compose;
  const Engine = global.Engine;
  const Devices = global.Devices;
  const Library = global.Library;
  const Motion = global.Motion;
  const Mark = global.Mark;
  const UI = global.IOS;

  const PARTS = [
    { id: 'melody',  label: 'Melody',  short: 'Melody' },
    { id: 'counter', label: 'Counter', short: 'Counter' },
    { id: 'chords',  label: 'Chords',  short: 'Chords' },
    { id: 'bass',    label: 'Bass',    short: 'Bass' },
    { id: 'drums',   label: 'Drums',   short: 'Drums' }
  ];

  const TITLES = [
    'Bar one', 'Straight in', 'Second time round', 'The turnaround',
    'Top of the form', 'The lift', 'One more chorus', 'Open fifth',
    'Four to the bar', 'Half-time', 'Held note', 'Out on the four'
  ];

  const ENERGIES = [
    { id: 'still',   label: 'Still & sparse' },
    { id: 'soft',    label: 'Soft & spacious' },
    { id: 'flow',    label: 'Easy flow' },
    { id: 'bright',  label: 'Bright & lively' },
    { id: 'driving', label: 'Driving & full' },
    { id: 'heavy',   label: 'Slow & heavy' },
    { id: 'hushed',  label: 'Busy but hushed' }
  ];

  const LENGTHS = [
    { id: 'auto', label: 'Fits the genre' },
    { id: '4', label: '4 bars' },
    { id: '8', label: '8 bars' },
    { id: '12', label: '12 bars' }
  ];

  const COUNT_INS = [
    { id: '0', label: 'Off' },
    { id: '1', label: '1 bar' },
    { id: '2', label: '2 bars' }
  ];

  /* One letter for the job each bass note is doing. A bass line you can only
     see the shape of is not a bass line you can play. */
  const ROLE_LETTER = {
    root: 'R', octave: 'R', third: '3', fifth: '5', seventh: '7',
    ninth: '9', fourth: '4', sixth: '6', approach: '→'
  };
  const ROLE_CLASS = { root: 'root', octave: 'root', third: 'third', fifth: 'fifth', approach: 'approach' };

  /* Every key goes through Store.key, which src/library.js defines. It carries
     values across from the `keyframe.*` names the app used before the rebrand —
     call it and a returning user keeps their library, appearance, draft and
     device choice; skip it and they silently lose all four. */
  const key = (name) => (global.Store ? global.Store.key(name) : 'downbeat.' + name);
  /* These are the names the previous build wrote, not new ones. A rename here
     is silent data loss: the user is re-onboarded, their hardware choice goes
     back to the default and their draft disappears, with nothing to say why.
     `devices.v1` held { track, device } as JSON, so it is read as JSON. */
  const STORE = {
    device: key('devices.v1'),
    theme: key('theme'),
    seen: key('onboarding.v1'),
    tab: key('tab'),
    draft: key('draft.v1'),
    countIn: key('count-in')
  };

  /* Each access is individually guarded: iOS Safari in private browsing throws
     on setItem, and one uncaught throw at boot kills the app before the first
     song is composed. */
  const store = {
    get: function (name) { try { return global.localStorage.getItem(name); } catch (e) { return null; } },
    set: function (name, value) { try { global.localStorage.setItem(name, value); } catch (e) { /* private mode */ } }
  };

  /* --------------------------------------------------------------- state */

  let song = null;
  let part = 'melody';
  let device = readDevice();
  function readDevice() {
    const raw = store.get(STORE.device);
    if (!raw) return Devices.DEFAULT_DEVICE;
    let id = raw;
    if (raw.charAt(0) === '{') {
      try {
        const saved = JSON.parse(raw);
        /* Earlier builds kept a device per track. Carry across whichever one
           was last on screen. */
        id = saved.device || (saved.devices && saved.devices[saved.track]) || '';
      } catch (e) { id = ''; }
    }
    return Devices.DEVICES[id] ? id : Devices.DEFAULT_DEVICE;
  }
  let tab = 'play';
  let mounted = null;          /* the Devices.mount updater for the live view */
  let arrangement = null;
  let activeSection = null;
  let soloOn = false;
  let loopOn = true;
  let tempoTouched = false;
  let countInBars = Number(store.get(STORE.countIn) || 1);
  let undoState = null;
  let raf = 0;
  let wakeLock = null;
  let countInTimer = 0;
  let deferredInstall = null;

  const app = $('#app');
  const faceStage = $('#faceStage');
  const faceBay = $('#faceBay');
  const faceWrap = $('#faceWrap');
  const runBox = $('#run');
  const lane = $('#lane');
  const laneScroll = $('#laneScroll');
  let laneHead = null;
  let laneHeld = false;
  let laneReleased = 0;

  const draft = {
    genre: 'pop',
    keyPc: 0,
    scale: 'auto',
    energy: 'flow',
    bars: 'auto',
    bpm: null,
    counter: false
  };

  /* ------------------------------------------------------------ plumbing */

  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function announce(message) {
    const live = $('#live');
    live.textContent = '';
    global.setTimeout(() => { live.textContent = message; }, 40);
  }

  const toast = (message) => UI.toast(message);

  function noteName(midi) {
    if (!song) return '';
    return song.key.nameForPc(midi) + Math.floor(midi / 12 - 1);
  }

  /* ============================================================ the song */

  function generate(options) {
    const opts = options || {};
    const previous = song;
    song = C.compose(opts);
    song.title = opts.title || TITLES[Math.floor(Math.random() * TITLES.length)];
    /* The recipe Library saves is read off song.opts, so the options that made
       a song travel with it rather than living in a variable that the next
       generate would overwrite. */
    song.opts = opts;

    if (previous && !opts.silentUndo) armUndo(previous);
    if (!tempoTouched) draft.bpm = null;

    /* Once per song, never per frame: everything beat-relative — the pad decay,
       the stagger between lit pads — derives from this one write, and a
       registered inherited property written to :root invalidates the whole
       document. */
    if (Motion) Motion.tempo(song.bpm);

    arrangement = global.Arrange ? global.Arrange.plan(song) : null;
    activeSection = null;

    /* Before anything reads it. A song with no countermelody cannot be viewed
       on the Counter part, and everything below — the mutes solo applies, the
       colour the screen takes, the lane, the run — is derived from `part`. */
    if (part === 'counter' && !(song.counter && song.counter.length)) part = 'melody';
    app.dataset.part = part;

    /* The new song has its own sections, so whatever was soloed out by the old
       one is meaningless — but solo is a property of the player, not of the
       song, and it has to survive. applySolo() re-derives every mute from
       scratch: with no section active it is exactly a reset, and with solo on
       it puts solo back rather than quietly dropping it. */
    applySolo();

    renderSong();
    saveDraft();
    return song;
  }

  /* The song on screen survives a reload. It is stored as its recipe rather
     than as a dump of notes — the same handful of bytes a share link carries —
     so it costs nothing and comes back note for note. */
  function saveDraft() {
    try { store.set(STORE.draft, JSON.stringify(Library.recipeOf(song))); } catch (e) { /* nothing to keep */ }
  }

  function readDraft() {
    const raw = store.get(STORE.draft);
    if (!raw) return null;
    try {
      const recipe = JSON.parse(raw);
      return recipe && recipe.g && G.GENRES[recipe.g] ? recipe : null;
    } catch (e) { return null; }
  }

  function renderSong() {
    const meta = `${song.genre.label} · ${song.key.rootName} ${song.scaleName} · ${song.bpm} BPM · ${song.bars} bars`;
    if (Motion && $('#songTitle').textContent !== song.title) Motion.slot($('#songTitle'), song.title);
    else $('#songTitle').textContent = song.title;
    $('#songMeta').textContent = meta;
    doc.title = `${song.title} — Downbeat`;

    renderParts();
    renderPart();
    renderSongScreen();
    renderArrange();
    renderCurrentActions();
    renderDockBars();
    syncTransportReadout();
  }

  function optionsFromDraft(extra) {
    const opts = {
      genre: draft.genre,
      keyPc: draft.keyPc,
      energy: draft.energy,
      bars: draft.bars === 'auto' ? 'auto' : Number(draft.bars),
      counter: draft.counter
    };
    if (draft.scale && draft.scale !== 'auto') opts.scale = draft.scale;
    if (draft.bpm) opts.bpm = draft.bpm;
    return Object.assign(opts, extra || {});
  }

  /* Regenerate with the current draft but keep whichever seed was not asked to
     change, so rerolling one half leaves the other where it was. */
  function regenerate(keep) {
    const opts = optionsFromDraft();
    if (keep === 'harmony') opts.harmonySeed = song.harmonySeed;
    if (keep === 'melody') opts.melodySeed = song.melodySeed;
    if (keep === 'both') { opts.harmonySeed = song.harmonySeed; opts.melodySeed = song.melodySeed; opts.title = song.title; }
    const playing = Engine.isPlaying();
    generate(opts);
    if (playing) startPlayback(true);
  }

  /* ------------------------------------------------------------- undo */

  /* The RECIPE, not the options. A song's options carry its seeds only when
     the caller happened to pin them — everywhere else they are the random
     numbers Compose picked, and replaying without them composes a third,
     unrelated song rather than restoring the one you just lost. The recipe is
     what a save and a share link are made of, and it holds both. */
  function armUndo(previous) {
    undoState = Library.recipeOf(previous);
    $('#undoButton').hidden = false;
  }

  function undo() {
    if (!undoState) return;
    const opts = Library.optionsOf(undoState);
    opts.silentUndo = true;
    undoState = null;
    $('#undoButton').hidden = true;
    const playing = Engine.isPlaying();
    /* The draft has to follow the song back, or the next generate silently
       re-applies the settings the undo just reverted. */
    applyOptionsToDraft(opts);
    generate(opts);
    if (playing) startPlayback(true);
    toast('Change undone');
  }

  /* What the genre and feel would choose on their own — the same arithmetic
     Compose does. */
  function naturalTempo(genreId, energyId) {
    const genre = G.GENRES[genreId];
    const energy = G.ENERGY[energyId] || G.ENERGY.flow;
    if (!genre) return null;
    return Math.round(genre.tempo[0] + (genre.tempo[1] - genre.tempo[0]) * energy.tempo);
  }

  function applyOptionsToDraft(opts) {
    draft.genre = opts.genre || draft.genre;
    draft.keyPc = opts.keyPc === undefined ? draft.keyPc : opts.keyPc;
    draft.scale = opts.scale || 'auto';
    draft.energy = opts.energy || 'flow';
    draft.bars = opts.bars === undefined || opts.bars === 'auto' ? 'auto' : String(opts.bars);
    draft.counter = !!opts.counter;
    draft.bpm = opts.bpm || null;
    /* Every recipe records a tempo, so `opts.bpm` on its own is no evidence
       the user chose one — and treating it as evidence latched the tempo the
       first time a draft was restored, after which no genre could ever set
       its own again. Only a tempo the genre would not have picked counts. */
    tempoTouched = !!opts.bpm && opts.bpm !== naturalTempo(draft.genre, draft.energy);
    if (!tempoTouched) draft.bpm = null;
  }

  /* ========================================================= the parts */

  let partsControl = null;
  let devicesControl = null;

  function renderParts() {
    const box = $('#parts');
    const hasCounter = !!(song && song.counter && song.counter.length);
    box.innerHTML = PARTS.map((p) => {
      /* Counter is dimmed when the song has no second line, but it is NOT
         disabled: a dead segment can only tell you that you cannot have the
         thing, where a live one can go and get it. Tapping it writes the
         countermelody and lands you on it.

         Drums is dimmed on the one genre that has no kit at all — Ambient —
         where there is nothing to go and get, so it stays selectable and its
         lane says why. */
      const off = (p.id === 'counter' && !hasCounter) ||
        (p.id === 'drums' && !(song && song.drums && song.drums.length));
      return `<button type="button" role="radio" data-value="${p.id}" ` +
        `aria-checked="${p.id === part ? 'true' : 'false'}" tabindex="${p.id === part ? 0 : -1}"` +
        `${off ? ' data-off="true"' : ''}>${p.short}</button>`;
    }).join('') + '<i class="seg-thumb" aria-hidden="true"></i>';

    partsControl = UI.segmented(box, (value, button) => {
      if (value === 'counter' && !(song.counter && song.counter.length)) {
        draft.counter = true;
        regenerate('both');
        setPart('counter');
        toast('Second melody added');
        return;
      }
      setPart(value);
    });
    partsControl.select(part);
  }

  function setPart(id) {
    if (!PARTS.some((p) => p.id === id)) return;
    /* The same guard stepPart applies. Landing on Counter with no second line
       draws an empty lane, an empty run and a faceplate with nothing lit. */
    if (id === 'counter' && !(song.counter && song.counter.length)) return;
    part = id;
    app.dataset.part = id;
    if (partsControl) partsControl.select(id);
    renderPart();
    if (soloOn) applySolo();
    syncTransportReadout();
    announce(`${PARTS.find((p) => p.id === id).label} selected`);
  }

  function stepPart(direction) {
    const usable = PARTS.filter((p) => p.id !== 'counter' || (song.counter && song.counter.length));
    const index = usable.findIndex((p) => p.id === part);
    setPart(usable[(index + direction + usable.length) % usable.length].id);
  }

  /* ====================================================== the faceplate */

  function renderDevices() {
    const box = $('#devices');
    box.innerHTML = Object.keys(Devices.DEVICES).map((id) => {
      const d = Devices.DEVICES[id];
      return `<button type="button" role="radio" data-value="${id}" ` +
        `aria-checked="${id === device ? 'true' : 'false'}" tabindex="${id === device ? 0 : -1}">${d.label}</button>`;
    }).join('') + '<i class="seg-thumb" aria-hidden="true"></i>';
    devicesControl = UI.segmented(box, setDevice);
    devicesControl.select(device);
  }

  function setDevice(id) {
    if (!Devices.DEVICES[id] || id === device) return;
    device = id;
    store.set(STORE.device, JSON.stringify({ track: part, device: id }));
    if (introDeviceControl) introDeviceControl.select(id);
    if (devicesControl) devicesControl.select(id);
    renderPart();
    toast(Devices.DEVICES[id].label);
  }

  /* Fit the plate into the bay.

     A faceplate is a fixed number of user units wide — 356 for the EP-133, 682
     for the FM-1 — so "just make it the width of the screen" produces two very
     different objects: the EP renders at about one CSS pixel per unit on a
     phone and the FM at half that, which is the difference between a readable
     silkscreen legend and a grey smudge.

     So the fit is computed rather than declared. The plate takes the width if
     the width is generous enough; where it is not, the plate keeps a minimum
     scale and the bay scrolls sideways instead. Losing a little of a 27-key
     keybed off the edge of a phone is a far better outcome than shrinking all
     27 keys past the point of being able to read which one to press. */
  /* The floor is per device because the two objects put wildly different
     numbers of user units across the same opening: 356 for the EP-133 against
     682 for the FM-1. The same rendered legend therefore needs a very
     different scale on each, and a single number would either shrink the FM's
     key names to nothing or waste half the screen on the EP. */
  const MIN_UNIT = { ep133: 0.62, fm1: 0.7 };

  function fitFace() {
    const svg = faceStage.querySelector('svg');
    if (!svg || !faceBay) return;
    const box = (svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
    if (box.length !== 4 || !box[2] || !box[3]) return;

    const available = Math.max(220, faceBay.clientWidth - 16);

    /* Two different jobs, decided by whether the plate is sharing the screen
       with the run or sitting in a column of its own.

       ONE COLUMN. The plate takes under half the height, and the number is not
       arbitrary: any taller and the first row of the run falls entirely below
       the fold, and the run is the half of this screen you read while your
       hands are busy. At 0.44 a row of chips is visibly there to be scrolled
       to.

       TWO COLUMNS — a phone on its side, a tablet, a desk. The run is beside
       the plate rather than under it, so height costs less and the plate can
       spend the width it has been given. Not without limit: a landscape phone
       has about 250 points of scroller, and a plate five times that is a plate
       nobody will scroll to the bottom of. 1.15 viewports is roughly one flick
       to the pads, and the ceiling stops a wide desk drawing a metre-high
       sampler. */
    const twoColumn = global.matchMedia(
      '(min-width: 900px), (orientation: landscape) and (max-height: 520px)').matches;
    const ceiling = twoColumn
      ? Math.min(global.innerHeight * 1.15, 620)
      : Math.min(global.innerHeight * 0.44, 460);

    const fitWidth = available / box[2];
    const fitHeight = ceiling / box[3];
    let unit = Math.min(fitWidth, fitHeight);
    /* Where fitting the width would make the silkscreen unreadable the plate
       keeps its floor and the bay scrolls instead. Losing the far end of a
       keybed off the edge of a phone is a better outcome than shrinking all 27
       keys past being able to read which one to press. */
    const floor = MIN_UNIT[device] || 0.62;
    if (unit < floor) unit = Math.min(floor, fitHeight);

    svg.style.width = Math.round(box[2] * unit) + 'px';
    svg.style.height = Math.round(box[3] * unit) + 'px';
    syncFaceEdges();
  }

  function syncFaceEdges() {
    const room = faceBay.scrollWidth - faceBay.clientWidth;
    faceWrap.classList.toggle('more-left', room > 4 && faceBay.scrollLeft > 4);
    faceWrap.classList.toggle('more-right', room > 4 && faceBay.scrollLeft < room - 4);
  }

  /* Centre the bay on the pads this part actually uses, so a keybed that runs
     off the edge of the screen still opens on the half you are about to
     play. */
  function centreOnUsed(view) {
    if (!faceBay || faceBay.scrollWidth <= faceBay.clientWidth + 4) return;
    const ids = view.mapping.usedPads
      ? Array.from(view.mapping.usedPads).map((pad) => 'p' + pad)
      : Array.from(view.mapping.usedKeys || []);
    if (!ids.length) return;
    const svg = faceStage.querySelector('svg');
    if (!svg) return;
    let min = Infinity;
    let max = -Infinity;
    ids.forEach((id) => {
      const node = svg.querySelector(`[data-el="${id}"]`);
      if (!node) return;
      const rect = node.getBoundingClientRect();
      min = Math.min(min, rect.left);
      max = Math.max(max, rect.right);
    });
    if (!isFinite(min)) return;
    const bay = faceBay.getBoundingClientRect();
    const centre = (min + max) / 2 - bay.left + faceBay.scrollLeft;
    faceBay.scrollTo({ left: Math.max(0, centre - bay.width / 2), behavior: UI.reduced() ? 'auto' : 'smooth' });
    global.setTimeout(syncFaceEdges, 420);
  }

  /* ======================================================= the play screen */

  function renderPart() {
    if (!song) return;
    const view = Devices.build(song, part, device);
    mounted = Devices.mount(view, { stage: faceStage, sequence: runBox });
    runBox.classList.toggle('is-chords', part === 'chords');

    const d = Devices.DEVICES[device];
    $('#setupButton').textContent = 'Set-up';
    $('#faceReadout').textContent = `${d.maker} ${d.label} · ${d.firmware}`;
    $('#runNote').textContent = runNoteFor(view);
    setupSteps = view.setup;

    fitFace();
    global.requestAnimationFrame(() => { fitFace(); centreOnUsed(view); });

    renderLane();
    renderDevices();
    if (mounted && !Engine.isPlaying()) mounted.update(null);
  }

  function runNoteFor(view) {
    if (part === 'drums') return `${view.mapping.voices.length} voices`;
    if (part === 'chords') return `${(song.spans || []).length} chords`;
    const events = view.mapping.events || [];
    const off = events.filter((e) => !view.mapping.idFor(e.midi)).length;
    if (off) return `${events.length} notes · ${off} out of range`;
    return `${events.length} notes`;
  }

  let setupSteps = [];

  function openSetup() {
    const list = doc.createElement('ol');
    list.className = 'recipe-steps';
    list.style.padding = '0 16px';
    list.innerHTML = setupSteps.map((s, i) =>
      `<li><span class="step-n">${i + 1}</span><div><b>${s[0]}</b><p>${s[1]}</p></div></li>`).join('');
    UI.sheet({ title: 'Set up ' + Devices.DEVICES[device].label, body: list });
  }

  /* --------------------------------------------------------------- lane */

  function renderLane() {
    const bars = song.bars;
    lane.className = 'lane is-' + part;
    lane.style.setProperty('--bars', bars);
    lane.style.setProperty('--beats', bars * 4);
    /* Written on both paths, never on one: an inline property set for the drum
       grid stays on the element for every pitched lane drawn afterwards. */
    lane.style.setProperty('--bar-min', part === 'drums' ? '132px' : '96px');
    lane.innerHTML = '';

    if (part === 'drums') renderDrumLane();
    else renderPitchedLane();

    /* The bar ruler, and the playhead, last so they sit over the notes. */
    if (part !== 'drums') {
      const ruler = doc.createElement('div');
      ruler.className = 'lane-bars';
      let html = '';
      for (let i = 0; i < bars; i++) html += `<span>${i + 1}</span>`;
      ruler.innerHTML = html;
      lane.appendChild(ruler);
    }
    /* The playhead keeps a reference of its own because --head is registered
       `inherits:false` — a value written on .lane is invisible to a child, so
       the property has to be written on the element that reads it. It stays
       non-inheriting deliberately: this is written on every animation frame,
       and an inherited registered property invalidates its whole subtree. */
    laneHead = doc.createElement('i');
    laneHead.className = 'lane-head';
    lane.appendChild(laneHead);

    lane.setAttribute('aria-label', laneDescription());
    /* A scroll container with nothing focusable inside it cannot be scrolled
       from a keyboard at all. The lane is a picture, so the scroller itself
       takes the tab stop and the arrow keys. */
    laneScroll.tabIndex = 0;
    laneScroll.setAttribute('role', 'group');
    laneScroll.setAttribute('aria-label', laneDescription() + ' Scrollable.');
    $('#laneNote').textContent = laneNote();
  }

  function eventsFor(id) {
    if (id === 'melody') return song.melody || [];
    if (id === 'counter') return song.counter || [];
    if (id === 'bass') return song.bass || [];
    if (id === 'chords') return song.chordTrack || [];
    return [];
  }

  function renderPitchedLane() {
    const events = eventsFor(part);
    const total = song.totalSteps;
    lane.style.setProperty('--lane-h', part === 'bass' ? '104px' : '132px');
    lane.style.setProperty('--note-h', part === 'bass' ? '15px' : '7px');
    if (!events.length) {
      lane.insertAdjacentHTML('beforeend',
        '<p class="seq-empty">Nothing on this part.</p>');
      return;
    }

    let low = Infinity;
    let high = -Infinity;
    events.forEach((e) => { low = Math.min(low, e.midi); high = Math.max(high, e.midi); });
    /* A part that never leaves one pitch would divide by zero and draw its one
       note on the floor of the lane; a minimum span puts it in the middle. */
    const span = Math.max(7, high - low);
    const base = low - (span - (high - low)) / 2;

    let html = '';
    events.forEach((e) => {
      const y = (e.midi - base) / span;
      const role = e.role ? (ROLE_CLASS[e.role] || 'other') : null;
      html += `<i class="lane-note"${role ? ` data-role="${role}"` : ''} ` +
        `data-start="${e.start}" data-dur="${e.dur || 1}" ` +
        `style="--x:${e.start / total};--w:${(e.dur || 1) / total};--y:${y.toFixed(4)};--vel:${e.velocity || 0.8}">` +
        `${part === 'bass' ? (ROLE_LETTER[e.role] || '·') : ''}</i>`;
    });

    /* Chord symbols along the top of the chord lane, one per span. */
    if (part === 'chords') {
      (song.spans || []).forEach((s) => {
        html += `<span class="lane-chord" style="--x:${s.start / total}">${escapeHtml(s.chord.symbol)}</span>`;
      });
    }
    lane.insertAdjacentHTML('beforeend', html);
  }

  function renderDrumLane() {
    const events = song.drums || [];
    const used = G.DRUM_VOICES.filter((v) => events.some((e) => e.instrument === v.id));
    const total = song.totalSteps;
    /* A drum grid needs a readable step, and a sixteenth of a bar 96px wide is
       six pixels, so its bars are wider — see --bar-min in renderLane. */
    lane.style.setProperty('--lane-h', 'auto');

    if (!used.length) {
      lane.insertAdjacentHTML('beforeend',
        `<p class="seq-empty">${escapeHtml(song.genre.label)} has no kit — this one is played without drums.</p>`);
      return;
    }

    const byStep = {};
    events.forEach((e) => {
      if (!byStep[e.instrument]) byStep[e.instrument] = {};
      const at = Math.round(e.step);
      byStep[e.instrument][at] = Math.max(byStep[e.instrument][at] || 0, e.velocity);
    });

    let html = '';
    used.forEach((voice) => {
      const hits = byStep[voice.id] || {};
      let cells = '';
      for (let step = 0; step < total; step++) {
        const velocity = hits[step];
        const cls = velocity === undefined ? '' :
          velocity <= 0.4 ? ' ghost' : velocity >= 0.9 ? ' on accent' : ' on';
        cells += `<i class="drum-cell${cls}" data-step="${step}"` +
          `${step % 4 === 0 && velocity === undefined ? ' data-beat' : ''}` +
          `${velocity === undefined ? '' : ` style="--vel:${velocity}"`}></i>`;
      }
      html += `<div class="drum-row"><b class="drum-label">${voice.label}</b>` +
        `<div class="drum-cells">${cells}</div></div>`;
    });
    lane.insertAdjacentHTML('beforeend', html);
  }

  function laneNote() {
    if (part === 'drums') return `${song.bars} bars · 16ths`;
    const events = eventsFor(part);
    if (!events.length) return '';
    let low = Infinity;
    let high = -Infinity;
    events.forEach((e) => { low = Math.min(low, e.midi); high = Math.max(high, e.midi); });
    return `${noteName(low)}–${noteName(high)}`;
  }

  function laneDescription() {
    const label = PARTS.find((p) => p.id === part).label;
    if (part === 'drums') {
      const used = G.DRUM_VOICES.filter((v) => (song.drums || []).some((e) => e.instrument === v.id));
      return `${label}: ${used.map((v) => v.label).join(', ')} over ${song.bars} bars.`;
    }
    const events = eventsFor(part);
    if (!events.length) return `${label}: nothing on this part.`;
    return `${label}: ${events.length} notes from ${laneNote()} over ${song.bars} bars.`;
  }

  /* ======================================================= the transport */

  function renderDockBars() {
    const box = $('#dockBars');
    let html = '';
    for (let i = 0; i < song.bars; i++) html += '<i></i>';
    box.innerHTML = html;
  }

  function syncTransportReadout() {
    const label = PARTS.find((p) => p.id === part).label;
    /* Solo and an auditioned section both silence tracks, and both are set on
       a screen you are not looking at while you play. The transport is the one
       thing always in view, so it is where they have to be visible. */
    const note = soloOn ? ' · solo'
      : (activeSection && activeSection.muted.length ? ' · ' + activeSection.name : '');
    $('#dockPart').textContent = label + note;
    if (!Engine.isPlaying()) {
      $('#dockPos').textContent = `${song.bars} bars · ${song.bpm} BPM`;
    }
  }

  function togglePlayback() {
    if (Engine.isPlaying() || countInTimer) stopPlayback();
    else startPlayback();
  }

  function startPlayback(skipCountIn) {
    /* iOS will not create or resume an AudioContext outside a user gesture,
       and the gesture that reaches this function is the one that has to do it.
       Every other entry point into playback is a keyboard shortcut, which
       counts. */
    Engine.ensure();
    if (!skipCountIn && countInBars > 0) { runCountIn(() => beginPlayback()); return; }
    beginPlayback();
  }

  function beginPlayback() {
    Engine.setLoop(loopOn);
    Engine.start(song, {
      loop: loopOn,
      onStop: () => setLive(false)
    });
    setLive(true);
    announce('Playing');
  }

  function stopPlayback() {
    cancelCountIn();
    Engine.stop();
    setLive(false);
    announce('Stopped');
  }

  function setPlayGlyph(stopping, label) {
    $('#playButton').setAttribute('aria-label', label || (stopping ? 'Stop' : 'Play'));
    $('#playIcon').firstElementChild.setAttribute('href', stopping ? '#i-stop' : '#i-play');
  }

  function setLive(on) {
    doc.body.classList.toggle('is-live', on);
    setPlayGlyph(on);
    if (on) {
      requestWakeLock();
      lastBar = -1;
      lastStep = -1;
      if (!raf) raf = global.requestAnimationFrame(frame);
    } else {
      releaseWakeLock();
      if (raf) { global.cancelAnimationFrame(raf); raf = 0; }
      if (mounted) mounted.update(null);
      markLaneStep(-1);
      if (laneHead) laneHead.style.setProperty('--head', 0);
      Array.from($('#dockBars').children).forEach((node) => node.classList.remove('on'));
      syncTransportReadout();
    }
  }

  /* One loop, driving everything that moves with the music: the lit pads, the
     lit chips, the playhead, the bar counter and the readout. Reading the
     position once and handing it around is what keeps this to a single audio
     clock query per frame. */
  let lastBar = -1;
  let lastStep = -1;

  function frame() {
    raf = 0;
    if (!Engine.isPlaying()) return;
    const position = Engine.position();
    const step = Math.floor(position);

    if (mounted && step !== lastStep) { mounted.update(step); markLaneStep(step); lastStep = step; }
    if (laneHead) laneHead.style.setProperty('--head', (position / song.totalSteps).toFixed(4));
    followLane(position);

    const bar = Math.floor(position / 16);
    if (bar !== lastBar) {
      lastBar = bar;
      const bars = $('#dockBars').children;
      for (let i = 0; i < bars.length; i++) bars[i].classList.toggle('on', i === bar);
      $('#dockPos').textContent = `Bar ${Math.min(bar + 1, song.bars)} of ${song.bars} · ${song.bpm} BPM`;
    }
    raf = global.requestAnimationFrame(frame);
  }

  /* Light whatever the playhead is inside. The lane already draws the line;
     this is what makes it read as the music rather than as a ruler moving. */
  function markLaneStep(step) {
    const live = lane.querySelectorAll('.lane-note.now, .drum-cell.now');
    for (let i = 0; i < live.length; i++) live[i].classList.remove('now');
    if (step < 0) return;
    if (part === 'drums') {
      lane.querySelectorAll(`.drum-cell[data-step="${step}"].on, .drum-cell[data-step="${step}"].ghost`)
        .forEach((cell) => cell.classList.add('now'));
      return;
    }
    lane.querySelectorAll('.lane-note').forEach((note) => {
      const start = Number(note.dataset.start);
      const end = start + Number(note.dataset.dur);
      if (step >= start && step < end) note.classList.add('now');
    });
  }

  /* Keep the playhead on screen when the lane is wider than the phone, and do
     it only when it is genuinely about to leave — a lane that re-centres every
     frame is unreadable. */
  function followLane(position) {
    if (!laneScroll || laneScroll.scrollWidth <= laneScroll.clientWidth + 4) return;
    /* Never move the lane out from under a finger that is holding it, and give
       it a few seconds afterwards before taking it back. Auto-scroll that
       fights the user is worse than no auto-scroll at all. */
    if (laneHeld || global.performance.now() - laneReleased < 2500) return;
    const x = (position / song.totalSteps) * laneScroll.scrollWidth;
    const left = laneScroll.scrollLeft;
    const width = laneScroll.clientWidth;
    if (x < left + width * 0.15 || x > left + width * 0.85) {
      laneScroll.scrollLeft = Math.max(0, x - width * 0.4);
    }
  }

  /* --------------------------------------------------------- count-in */

  function runCountIn(done) {
    const box = $('#countIn');
    const beat = $('#countInBeat');
    const beats = countInBars * 4;
    let n = 0;
    const interval = 60000 / song.bpm;
    /* Every beat is scheduled against one fixed start rather than against the
       last one that fired. A chained timeout carries the whole of its own
       lateness forward, and four beats of that is the difference between
       coming in on the downbeat and coming in behind it. */
    const started = global.performance.now();
    box.hidden = false;
    UI.setInert(true);
    beat.textContent = String(beats);
    setPlayGlyph(true, 'Stop the count-in');
    $('#countInCancel').focus({ preventScroll: true });

    const tick = () => {
      const left = beats - n;
      if (left <= 0) {
        cancelCountIn();
        done();
        return;
      }
      beat.textContent = String(left);
      /* A real click rather than a silent countdown: the whole point of a
         count-in is that you can start playing on the downbeat without looking
         at the screen. */
      Engine.playDrum(n % 4 === 0 ? 'rim' : 'hat', 0, n % 4 === 0 ? 0.9 : 0.5);
      n++;
      const due = started + n * interval;
      countInTimer = global.setTimeout(tick, Math.max(0, due - global.performance.now()));
    };
    tick();
  }

  function cancelCountIn() {
    if (countInTimer) { global.clearTimeout(countInTimer); countInTimer = 0; }
    if (!$('#countIn').hidden) {
      $('#countIn').hidden = true;
      UI.setInert(false);
      setPlayGlyph(Engine.isPlaying());
      const play = $('#playButton');
      if (play) play.focus({ preventScroll: true });
    }
  }

  /* ------------------------------------------------------------- solo */

  function applySolo() {
    Devices.TRACKS.forEach((t) => {
      Engine.setMute(t.id, soloOn ? t.id !== part : sectionMuted(t.id));
    });
  }

  function sectionMuted(id) {
    return !!(activeSection && activeSection.muted.indexOf(id) >= 0);
  }

  /* ====================================================== the song screen */

  function renderSongScreen() {
    renderGenres();
    renderSongFields();
    renderRewrite();
    syncTempo();
  }

  function renderGenres() {
    const rail = $('#genreRail');
    /* Rebuilding the rail resets its scroll, and it is rebuilt on every
       regenerate — which is every field on the Song screen. The cards never
       change, so only the selection is written unless the rail is empty. */
    if (rail.children.length === G.order.length) {
      Array.from(rail.children).forEach((card) => {
        const on = card.dataset.genre === draft.genre;
        card.setAttribute('aria-checked', on ? 'true' : 'false');
        card.tabIndex = on ? 0 : -1;
      });
      $('#genreBlurb').textContent = G.GENRES[draft.genre].blurb || '';
      revealGenre(false);
      return;
    }
    rail.innerHTML = G.order.map((id) => {
      const genre = G.GENRES[id];
      return `<button type="button" class="genre-card" role="radio" data-genre="${id}" ` +
        `aria-checked="${id === draft.genre ? 'true' : 'false'}" tabindex="${id === draft.genre ? 0 : -1}">` +
        `<b>${escapeHtml(genre.label)}</b><small>${escapeHtml(genre.tempo[0])}–${escapeHtml(genre.tempo[1])} BPM</small></button>`;
    }).join('');
    $('#genreBlurb').textContent = G.GENRES[draft.genre].blurb || '';
    revealGenre(false);
  }

  /* Bring the chosen genre into the rail, but only when it is not already
     there — scrolling a rail that is already showing you the card it is about
     to highlight is motion with nothing behind it, and on the first card it
     just pulls the gutter off the left edge. */
  function revealGenre(smooth) {
    if (tab !== 'song') return;
    const rail = $('#genreRail');
    const card = rail.querySelector('[aria-checked=true]');
    if (!card) return;
    const left = card.offsetLeft - rail.scrollLeft;
    const right = left + card.offsetWidth;
    if (left >= 0 && right <= rail.clientWidth) return;
    rail.scrollTo({
      left: Math.max(0, card.offsetLeft - (rail.clientWidth - card.offsetWidth) / 2),
      behavior: smooth && !UI.reduced() ? 'smooth' : 'auto'
    });
  }

  /* Native <select> stretched invisibly over the right of the row. iOS then
     presents its own wheel picker — a far better control than anything this
     app could draw, and one every user already knows — while the row still
     reads as a row. */
  function selectRow(id, label, options, value, onChange) {
    const row = doc.createElement('div');
    row.className = 'row row-select';
    const shown = (options.find((o) => String(o.id) === String(value)) || options[0] || {}).label || '';
    row.innerHTML =
      `<span class="row-text"><span class="row-title">${escapeHtml(label)}</span></span>` +
      `<span class="row-value" id="${id}Value">${escapeHtml(shown)}` +
      '<svg class="row-chevron" aria-hidden="true" focusable="false"><use href="#i-chevron-down"></use></svg></span>';
    const select = doc.createElement('select');
    select.id = id;
    select.setAttribute('aria-label', label);
    options.forEach((option) => select.add(new Option(option.label, String(option.id))));
    select.value = String(value);
    select.addEventListener('change', () => {
      $('#' + id + 'Value').firstChild.nodeValue = select.options[select.selectedIndex].text;
      onChange(select.value);
    });
    row.appendChild(select);
    return row;
  }

  /* The row itself carries role="switch". Nesting a switch inside a button
     makes two controls out of one, and the inner one has no accessible name
     of its own — the label is in its sibling. Like this the row's own text is
     the name and there is a single thing to tap, focus and toggle. */
  function switchRow(id, label, sub, checked, onChange) {
    const row = doc.createElement('button');
    row.type = 'button';
    row.className = 'row';
    row.id = id;
    row.setAttribute('role', 'switch');
    row.setAttribute('aria-checked', checked ? 'true' : 'false');
    row.innerHTML =
      `<span class="row-text"><span class="row-title">${escapeHtml(label)}</span>` +
      `${sub ? `<span class="row-sub">${escapeHtml(sub)}</span>` : ''}</span>` +
      '<span class="switch" aria-hidden="true"></span>';
    row.addEventListener('click', () => {
      const next = row.getAttribute('aria-checked') !== 'true';
      row.setAttribute('aria-checked', next ? 'true' : 'false');
      UI.haptic(6);
      onChange(next);
    });
    return row;
  }

  function renderSongFields() {
    const box = $('#songFields');
    box.innerHTML = '';

    const scales = G.scalesFor(draft.genre);
    if (draft.scale !== 'auto' && scales.indexOf(draft.scale) < 0) draft.scale = 'auto';

    box.appendChild(selectRow('keySelect', 'Key',
      T.KEYS.map((k) => ({ id: k.pc, label: k.label })), draft.keyPc,
      (value) => { draft.keyPc = Number(value); regenerate('both'); }));

    box.appendChild(selectRow('scaleSelect', 'Scale',
      [{ id: 'auto', label: 'Pick for me' }].concat(scales.map((s) => ({ id: s, label: s }))), draft.scale,
      (value) => { draft.scale = value; regenerate('both'); }));

    box.appendChild(selectRow('energySelect', 'Feel',
      ENERGIES, draft.energy,
      (value) => { draft.energy = value; regenerate('both'); }));

    box.appendChild(selectRow('barsSelect', 'Length',
      LENGTHS, draft.bars,
      (value) => { draft.bars = value; regenerate('both'); }));

    box.appendChild(switchRow('counterToggle', 'Second melody',
      'A countermelody written under the tune', draft.counter,
      (value) => { draft.counter = value; regenerate('both'); }));

    box.appendChild(selectRow('countInSelect', 'Count-in',
      COUNT_INS, String(countInBars),
      (value) => { countInBars = Number(value); store.set(STORE.countIn, value); }));
  }

  function renderRewrite() {
    const box = $('#rewriteList');
    box.innerHTML = '';
    box.appendChild(actionRow('refresh', 'New melody', 'Keeps the chords', () => {
      regenerate('harmony');
      toast('New melody');
    }));
    box.appendChild(actionRow('refresh', 'New chords', 'Keeps the melody line', () => {
      regenerate('melody');
      toast('New chords');
    }));
  }

  function actionRow(iconName, label, sub, onClick, danger) {
    const row = doc.createElement('button');
    row.type = 'button';
    row.className = 'row has-icon' + (danger ? ' row-danger' : '');
    row.innerHTML =
      `<span class="row-icon"><svg class="i" aria-hidden="true" focusable="false"><use href="#i-${iconName}"></use></svg></span>` +
      `<span class="row-text"><span class="row-title">${escapeHtml(label)}</span>` +
      `${sub ? `<span class="row-sub">${escapeHtml(sub)}</span>` : ''}</span>` +
      '<svg class="row-chevron" aria-hidden="true" focusable="false"><use href="#i-chevron-right"></use></svg>';
    row.addEventListener('click', onClick);
    return row;
  }

  /* ------------------------------------------------------------ tempo */

  function syncTempo() {
    const range = $('#tempoRange');
    /* The travel is the genre's own range, widened a little at both ends —
       a slider whose whole useful span is twelve pixels in the middle is a
       slider you cannot land on a number with. */
    const tempo = song.genre.tempo;
    range.min = Math.min(50, tempo[0] - 10);
    range.max = Math.max(180, tempo[1] + 20);
    range.value = song.bpm;
    $('#tempoValue').textContent = song.bpm + ' BPM';
    paintTempoTrack(song.bpm);
    $('#tempoReset').hidden = !tempoTouched;
    $('#tapTempoHint').textContent = tempoTouched
      ? `Genre sits at ${tempo[0]}–${tempo[1]} BPM`
      : 'Tap four times in time';
  }

  /* The filled part of the track. WebKit gives no ::-webkit-slider-progress,
     so the fill is a gradient stop written from JS. */
  function paintTempoTrack(value) {
    const range = $('#tempoRange');
    const min = Number(range.min);
    const max = Number(range.max);
    range.style.setProperty('--fill-pct',
      (((value - min) / Math.max(1, max - min)) * 100).toFixed(1) + '%');
  }

  function setTempo(bpm, commit) {
    const range = $('#tempoRange');
    const value = Math.max(Number(range.min), Math.min(Number(range.max), Math.round(bpm)));
    range.value = value;
    $('#tempoValue').textContent = value + ' BPM';
    paintTempoTrack(value);
    if (!commit) return;
    tempoTouched = true;
    draft.bpm = value;
    $('#tempoReset').hidden = false;
    /* The tempo does not change a single note, so this reuses both seeds and
       the title: it is the same song, played faster. */
    regenerate('both');
  }

  /* ==================================================== the arrange screen */

  function renderArrange() {
    if (!arrangement) return;
    $('#arrangeFormLabel').textContent = arrangement.label;
    $('#arrangeSummary').textContent =
      `${arrangement.sections.length} sections · ${arrangement.totalBars} bars · ${arrangement.time}. ${arrangement.note}`;

    const map = $('#arrangeMap');
    map.innerHTML = arrangement.sections.map((s) => {
      const tracks = arrangement.tracks.map((t) =>
        `<i class="map-track${s.tracks.indexOf(t.id) >= 0 ? ' on' : ''}" style="--tk:var(--t-${t.id})"></i>`).join('');
      return `<button type="button" class="map-sec" data-section="${s.id}" style="--w:${s.bars}" ` +
        `aria-pressed="false" aria-label="${escapeHtml(s.name)}, ${s.bars} bars. Tap to hear it.">` +
        `<span class="map-sec-name">${escapeHtml(s.name)}</span>` +
        `<span class="map-sec-bars">${s.bars} bars</span>` +
        `<span class="map-tracks">${tracks}</span></button>`;
    }).join('');

    /* A new song has no auditioned section, so the control that puts one back
       must not survive the render that removed it. */
    $('#arrangeReset').hidden = !activeSection;

    $('#arrangeKey').innerHTML = arrangement.tracks.map((t) =>
      `<span><i style="--tk:var(--t-${t.id})"></i>${escapeHtml(t.label)}</span>`).join('');

    /* Buttons, not paragraphs. They are drawn as rows in a list, they sit
       under a map whose sections are tappable, and doing nothing when tapped
       is the one thing a row like this must not do. */
    const steps = $('#arrangeSteps');
    steps.innerHTML = arrangement.sections.map((s, i) =>
      `<button type="button" class="row has-icon section-row" data-section="${s.id}" aria-pressed="false">` +
      `<span class="row-icon">${i + 1}</span>` +
      `<span class="row-text"><span class="row-title">${escapeHtml(s.name)} · ${s.bars} bars</span>` +
      `<span class="row-sub" style="white-space:normal">${escapeHtml(s.how)}</span></span>` +
      '<svg class="row-chevron" aria-hidden="true" focusable="false"><use href="#i-play"></use></svg></button>').join('');

    $('#theoryText').innerHTML = song.theory || '';

    const d = Devices.DEVICES[device];
    $('#arrangeTips').innerHTML = `<p><b>${escapeHtml(d.label)}</b></p><p>` +
      (global.Arrange.DEVICE_TIPS[device] || '') + '</p>';
  }

  function toggleSection(id) {
    const section = arrangement.sections.find((s) => s.id === id);
    if (!section) return;
    const already = activeSection && activeSection.id === id;
    activeSection = already ? null : section;
    soloOn = false;
    $('#soloButton').setAttribute('aria-pressed', 'false');
    applySolo();
    doc.querySelectorAll('#arrangeMap [data-section], #arrangeSteps [data-section]').forEach((node) => {
      node.setAttribute('aria-pressed', !already && node.dataset.section === id ? 'true' : 'false');
    });
    $('#arrangeReset').hidden = !activeSection;
    syncTransportReadout();
    if (activeSection) {
      const dropped = activeSection.muted.length
        ? activeSection.muted.map((t) => PARTS.find((p) => p.id === t).label).join(', ') + ' dropped'
        : 'everything plays';
      toast(`${activeSection.name} — ${dropped}`);
    } else {
      toast('All parts back on');
    }
  }

  /* ==================================================== the library screen */

  function renderCurrentActions() {
    const box = $('#currentActions');
    box.innerHTML = '';
    box.appendChild(actionRow('library', 'Save to library', 'Kept on this device', saveCurrent));
    box.appendChild(actionRow('link', 'Copy link', 'Rebuilds the sketch anywhere', copyLink));
    box.appendChild(actionRow('copy', 'Copy as text', 'Chords, key and tempo', copyText));
    box.appendChild(actionRow('download', 'Download MIDI', 'Five parts, ready to drop in', downloadMidi));
  }

  function renderLibrary() {
    const list = $('#libraryList');
    const entries = Library.list();
    $('#libraryCount').textContent = String(entries.length);
    $('#libraryCount').hidden = !entries.length;
    $('#libraryEmpty').hidden = !!entries.length;
    list.hidden = !entries.length;
    list.innerHTML = '';

    entries.forEach((entry) => {
      const wrap = doc.createElement('div');
      wrap.className = 'swipe';
      wrap.innerHTML =
        '<div class="swipe-actions"><button type="button" data-act="delete">Delete</button></div>' +
        '<div class="swipe-body"></div>';
      const body = $('.swipe-body', wrap);
      const row = doc.createElement('button');
      row.type = 'button';
      row.className = 'row has-icon sketch-row';
      row.innerHTML =
        `<span class="row-icon"><i class="sketch-dot" style="--tk:var(--t-melody)"></i></span>` +
        `<span class="row-text"><span class="row-title">${escapeHtml(entry.title)}</span>` +
        `<span class="row-sub">${escapeHtml(entry.meta || '')} · ${escapeHtml(Library.when(entry.savedAt))}</span></span>` +
        '<svg class="row-chevron" aria-hidden="true" focusable="false"><use href="#i-chevron-right"></use></svg>';
      row.addEventListener('click', () => openSketch(entry));
      body.appendChild(row);
      list.appendChild(wrap);
      UI.swipe(wrap, 84);
      $('[data-act=delete]', wrap).addEventListener('click', () => removeSketch(entry));
    });
  }

  function openSketch(entry) {
    UI.actionSheet({
      title: entry.title,
      message: entry.meta || '',
      actions: [
        { label: 'Load this sketch', onSelect: () => loadRecipe(entry.recipe, entry.title) },
        { label: 'Copy its link', onSelect: () => {
          copyToClipboard(Library.linkFor(entry.recipe), 'Link copied');
        } },
        { label: 'Rename', onSelect: () => renameSketch(entry) },
        { label: 'Delete', role: 'destructive', onSelect: () => removeSketch(entry) }
      ]
    });
  }

  function renameSketch(entry) {
    UI.prompt({
      title: 'Rename sketch',
      confirmLabel: 'Save',
      field: { value: entry.title, label: 'Sketch name', placeholder: 'Sketch name' }
    }).then((value) => {
      if (!value) return;
      Library.rename(entry.id, value);
      renderLibrary();
      toast('Renamed');
    });
  }

  function removeSketch(entry) {
    UI.confirm({
      title: 'Delete this sketch?',
      message: `“${entry.title}” will be removed from this device.`,
      confirmLabel: 'Delete',
      destructive: true
    }).then((yes) => {
      if (!yes) return;
      Library.remove(entry.id);
      renderLibrary();
      toast('Deleted');
    });
  }

  function saveCurrent() {
    const result = Library.save(song);
    renderLibrary();
    if (result.duplicate) { toast('Already in your library'); return; }
    /* Library.save reports whether the write landed. iOS Safari in private
       browsing throws on setItem, and telling someone their work is safe when
       it is not is the worst answer available. */
    if (result.stored === false) {
      toast('Could not save — this browser is blocking storage');
      announce('Save failed');
      return;
    }
    toast(`Saved “${song.title}”`);
    announce('Saved to library');
  }

  function loadRecipe(recipe, title) {
    const opts = Library.optionsOf(recipe);
    if (title) opts.title = title;
    applyOptionsToDraft(opts);
    const playing = Engine.isPlaying();
    generate(opts);
    renderLibrary();
    setTab('play');
    if (playing) startPlayback(true);
    toast(`Loaded “${song.title}”`);
  }

  /* --------------------------------------------------------- share/export */

  function copyToClipboard(text, message) {
    const done = () => toast(message);
    if (global.navigator.clipboard && global.navigator.clipboard.writeText) {
      global.navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
    } else fallbackCopy(text, done);
  }

  /* iOS will only copy from a real selection inside a visible, editable field,
     so the textarea is on-screen and transparent rather than display:none —
     and the selection range is set explicitly, because setSelectionRange is
     the only thing that works on iOS Safari. */
  function fallbackCopy(text, done) {
    const field = doc.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px;';
    doc.body.appendChild(field);
    field.contentEditable = 'true';
    field.focus();
    field.setSelectionRange(0, text.length);
    try { doc.execCommand('copy'); done(); } catch (e) { toast('Could not copy'); }
    doc.body.removeChild(field);
  }

  function copyLink() {
    const link = Library.linkFor(Library.recipeOf(song));
    /* The system share sheet is the right answer on a phone: it can put the
       link in Messages, in a note or on the clipboard, and it is one tap. */
    if (global.navigator.share) {
      global.navigator.share({ title: song.title + ' · Downbeat', text: 'A sketch from Downbeat', url: link })
        .catch(() => { /* dismissed */ });
      return;
    }
    copyToClipboard(link, 'Link copied');
  }

  /* Everything you would want in a notes app or a message: the recipe, the
     harmony as both symbols and numerals, every pitched part written out, what
     the kit is playing, the theory note, and the link that rebuilds it. */
  function sketchAsText() {
    const bar = (step) => Math.floor(step / 16) + 1;
    const line = (events) => {
      if (!events || !events.length) return null;
      let at = 0;
      return events.map((e) => {
        const prefix = bar(e.start) !== at ? ((at = bar(e.start)), `| ${at}: `) : '';
        return prefix + noteName(e.midi) + (e.role ? `(${e.role})` : '');
      }).join(' ');
    };

    const out = [
      `${song.title} — Downbeat`,
      `${song.genre.label} · ${song.key.rootName} ${song.scaleName} · ${song.bpm} BPM · ${song.bars} bars`,
      `Feel: ${(ENERGIES.find((e) => e.id === song.energy) || {}).label || song.energy}`,
      '',
      `Chords:   ${(song.spans || []).map((s) => s.chord.symbol).join(' | ')}`,
      `Numerals: ${((song.progression || {}).chords || []).join(' | ')}`
    ];
    const melody = line(song.melody);
    const counter = line(song.counter);
    const bass = line(song.bass);
    if (melody) out.push('', 'Melody:  ' + melody);
    if (counter) out.push('Counter: ' + counter);
    if (bass) out.push('Bass:    ' + bass);
    const kit = G.DRUM_VOICES.filter((v) => (song.drums || []).some((e) => e.instrument === v.id));
    if (kit.length) out.push('Drums:   ' + kit.map((v) => v.label).join(', '));
    if (song.theory) out.push('', String(song.theory).replace(/<[^>]+>/g, ''));
    out.push('', Library.linkFor(Library.recipeOf(song)));
    return out.join('\n');
  }

  function copyText() { copyToClipboard(sketchAsText(), 'Copied as text'); }

  /* An <a download> with a blob URL is the desktop answer and it is unreliable
     in an installed iOS app: audio/midi is a type Safari cannot preview, and a
     standalone PWA has no download bar to put the file in. Where the system
     share sheet can take a file, hand it the file — that path ends in Files,
     AirDrop or the DAW you actually want it in. The anchor stays as the
     fallback for every other platform.

     Both branches run synchronously inside the tap: the share sheet and the
     anchor click each need the user activation the tap granted. */
  function downloadMidi() {
    const name = global.Midi.filename(song);
    const nav = global.navigator;
    if (nav.canShare && typeof File === 'function') {
      try {
        const file = new File([global.Midi.build(song)], name, { type: 'audio/midi' });
        if (nav.canShare({ files: [file] })) {
          nav.share({ files: [file], title: song.title })
            .then(() => toast('MIDI shared'))
            .catch(() => { /* dismissed, or the target refused it */ });
          return;
        }
      } catch (e) { /* File unavailable — fall through to the anchor */ }
    }
    global.Midi.download(song);
    toast('Saved ' + name);
  }

  function openShare() {
    UI.actionSheet({
      title: song.title,
      message: `${song.genre.label} · ${song.key.rootName} ${song.scaleName} · ${song.bpm} BPM`,
      actions: [
        { label: global.navigator.share ? 'Share link' : 'Copy link', onSelect: copyLink },
        { label: 'Copy as text', onSelect: copyText },
        { label: 'Download MIDI', onSelect: downloadMidi },
        { label: 'Save to library', onSelect: saveCurrent }
      ]
    });
  }

  /* ---------------------------------------------------------- about rows */

  function renderAbout() {
    const box = $('#aboutList');
    box.innerHTML = '';
    box.appendChild(actionRow('info', 'How it works', 'The three-step tour', () => showIntro(true)));
    if (deferredInstall || isIosSafariUninstalled()) {
      box.appendChild(actionRow('plus', 'Install Downbeat', 'Full screen, and works offline', install));
    }
  }

  function isIosSafariUninstalled() {
    const ios = /iPad|iPhone|iPod/.test(global.navigator.userAgent) ||
      (global.navigator.platform === 'MacIntel' && global.navigator.maxTouchPoints > 1);
    const standalone = global.navigator.standalone ||
      global.matchMedia('(display-mode: standalone)').matches;
    return ios && !standalone;
  }

  function install() {
    if (deferredInstall) {
      deferredInstall.prompt();
      deferredInstall.userChoice.then(() => { deferredInstall = null; renderAbout(); });
      return;
    }
    /* iOS has no install prompt at all — Add to Home Screen is a Safari menu
       item and the only honest thing an app can do is say where it is. */
    $('#installHelp').hidden = false;
    $('#installHelp').scrollIntoView({ block: 'nearest', behavior: UI.reduced() ? 'auto' : 'smooth' });
  }

  /* ============================================================== tabs */

  function setTab(id) {
    if (!id || id === tab) return;
    tab = id;
    store.set(STORE.tab, id);
    Array.from(doc.querySelectorAll('#tabbar .tab')).forEach((button) => {
      const on = button.dataset.tab === id;
      button.setAttribute('aria-selected', on ? 'true' : 'false');
      button.tabIndex = on ? 0 : -1;
    });
    Array.from($('#screens').children).forEach((screen) => {
      const on = screen.dataset.screen === id;
      screen.classList.toggle('is-active', on);
      /* inert rather than display:none: a hidden screen keeps its scroll
         offset the way a tab controller's children do, and re-laying out the
         faceplate on every tab change is the one expensive thing here. */
      if (on) screen.removeAttribute('inert');
      else screen.setAttribute('inert', '');
    });
    UI.closeSwipes();
    /* The action bar belongs to a screen, so it comes and goes with it — and
       the toast has to know, or it lands on top of the app's primary button. */
    const cta = $('#songCta');
    cta.hidden = id !== 'song';
    doc.documentElement.style.setProperty('--cta-h', cta.hidden ? '0px' : cta.offsetHeight + 'px');
    if (id === 'library') renderLibrary();
    if (id === 'song') renderGenres();
    if (id === 'play') global.requestAnimationFrame(fitFace);
    syncScrolled();
    announce(id.charAt(0).toUpperCase() + id.slice(1));
  }

  function syncScrolled() {
    const screen = $('#screens').querySelector('.screen.is-active');
    app.classList.toggle('is-scrolled', !!screen && screen.scrollTop > 2);
  }

  /* ========================================================== onboarding */

  let introPage = 0;
  let introDeviceControl = null;

  function showIntro(force) {
    if (!force && store.get(STORE.seen)) return;
    const intro = $('#intro');
    intro.hidden = false;
    UI.setInert(true);
    global.requestAnimationFrame(() => intro.classList.add('is-open'));
    introPage = 0;
    $('#introPages').scrollLeft = 0;
    syncIntro();

    if (Mark) {
      Array.from(intro.querySelectorAll('.intro-mark')).forEach((slot) => {
        Mark.render(slot, { size: 96 });
      });
    }
    const box = $('#introDevices');
    box.innerHTML = Object.keys(Devices.DEVICES).map((id) =>
      `<button type="button" role="radio" data-value="${id}" ` +
      `aria-checked="${id === device ? 'true' : 'false'}">${Devices.DEVICES[id].label}</button>`).join('') +
      '<i class="seg-thumb" aria-hidden="true"></i>';
    introDeviceControl = UI.segmented(box, setDevice);
    introDeviceControl.select(device);
  }

  function syncIntro() {
    Array.from($('#introDots').children).forEach((dot, i) =>
      dot.setAttribute('aria-current', i === introPage ? 'true' : 'false'));
    $('#introNext').textContent = introPage === 2 ? 'Start' : 'Next';
    $('#introSkip').hidden = introPage === 2;
  }

  function goIntro(page) {
    introPage = Math.max(0, Math.min(2, page));
    const pages = $('#introPages');
    pages.scrollTo({ left: introPage * pages.clientWidth, behavior: UI.reduced() ? 'auto' : 'smooth' });
    syncIntro();
  }

  function finishIntro() {
    store.set(STORE.seen, '1');
    const intro = $('#intro');
    intro.classList.remove('is-open');
    UI.setInert(false);
    global.setTimeout(() => { intro.hidden = true; }, UI.reduced() ? 0 : 260);
    /* Back to the control that opened it, or to the app if it came up on
       first run and there is nothing to go back to. */
    const back = $('#playButton');
    if (back) back.focus({ preventScroll: true });
  }

  /* =============================================================== theme */

  const systemTheme = global.matchMedia('(prefers-color-scheme: light)');

  function applyTheme(light) {
    doc.body.classList.toggle('light', light);
    $('#themeIcon').firstElementChild.setAttribute('href', light ? '#i-sun' : '#i-moon');
    $('#themeButton').setAttribute('aria-label', light ? 'Use the dark appearance' : 'Use the light appearance');
    /* index.html ships two theme-color tags, both media-qualified, so the OS
       appearance picks one and a manual override inside the app could never
       reach either. The browser uses the FIRST tag whose media matches, so the
       managed one is created without a media attribute and inserted at the top
       of <head>, where it wins outright. */
    let meta = doc.querySelector('meta[name="theme-color"][data-managed]');
    if (!meta) {
      meta = doc.createElement('meta');
      meta.name = 'theme-color';
      meta.setAttribute('data-managed', '');
      doc.head.insertBefore(meta, doc.head.firstChild);
    }
    meta.setAttribute('content', light ? '#FBFAF6' : '#070806');
  }

  /* ================================================== iOS platform glue */

  /* Wake Lock is what stops the phone dimming three bars into a take. Safari
     has had it since 16.4; everywhere else this is a no-op and the screen
     behaves as it always did. */
  function requestWakeLock() {
    if (!global.navigator.wakeLock || wakeLock) return;
    global.navigator.wakeLock.request('screen')
      .then((lock) => {
        wakeLock = lock;
        lock.addEventListener('release', () => { wakeLock = null; });
      })
      .catch(() => { /* denied, or the tab is not visible */ });
  }

  function releaseWakeLock() {
    if (!wakeLock) return;
    const lock = wakeLock;
    wakeLock = null;
    lock.release().catch(() => { /* already gone */ });
  }

  /* An AudioContext created before a gesture starts suspended on iOS and never
     recovers on its own, so the very first touch anywhere in the app resumes
     it. Once is enough — after that the context is unlocked for the session. */
  const UNLOCK_EVENTS = ['pointerdown', 'touchend', 'click', 'keydown'];
  function unlockAudio() {
    Engine.ensure();
    UNLOCK_EVENTS.forEach((name) => doc.removeEventListener(name, unlockAudio, true));
  }

  /* dvh has been in Safari since 16.4. Where it is missing the layout would
     otherwise use the toolbars-hidden height and push the tab bar off the
     bottom of the screen, so the height is measured instead. */
  function watchViewport() {
    const supported = global.CSS && global.CSS.supports && global.CSS.supports('height', '100dvh');
    if (supported) return;
    /* Written as an inline height on the surfaces themselves rather than as a
       custom property the stylesheet has to substitute — a var() that resolves
       to something the engine cannot parse invalidates the whole declaration
       rather than falling back to the one before it. */
    const set = () => {
      const px = global.innerHeight + 'px';
      [app, $('#intro'), $('#countIn'), doc.querySelector('.sheet-host')]
        .forEach((node) => { if (node) node.style.height = px; });
    };
    set();
    global.addEventListener('resize', set);
    global.addEventListener('orientationchange', () => global.setTimeout(set, 240));
    /* The sheet host is created lazily by src/ios.js, so re-run once anything
       has had a chance to mount it. */
    global.setTimeout(set, 600);
  }

  /* =============================================================== wiring */

  $('#playButton').addEventListener('click', togglePlayback);
  $('#countInCancel').addEventListener('click', () => { cancelCountIn(); announce('Count-in cancelled'); });

  $('#loopButton').addEventListener('click', function () {
    loopOn = !loopOn;
    this.setAttribute('aria-pressed', loopOn ? 'true' : 'false');
    Engine.setLoop(loopOn);
    UI.haptic(6);
    toast(loopOn ? 'Looping' : 'Playing once');
  });

  $('#soloButton').addEventListener('click', function () {
    soloOn = !soloOn;
    this.setAttribute('aria-pressed', soloOn ? 'true' : 'false');
    applySolo();
    UI.haptic(6);
    syncTransportReadout();
    toast(soloOn ? `Solo — ${PARTS.find((p) => p.id === part).label} only` : 'All parts');
  });

  $('#themeButton').addEventListener('click', () => {
    const light = !doc.body.classList.contains('light');
    applyTheme(light);
    store.set(STORE.theme, light ? 'light' : 'dark');
  });

  $('#shareButton').addEventListener('click', openShare);
  $('#undoButton').addEventListener('click', undo);
  $('#setupButton').addEventListener('click', openSetup);

  $('#tabbar').addEventListener('click', (event) => {
    const button = event.target.closest('.tab');
    if (button) { setTab(button.dataset.tab); UI.haptic(6); }
  });

  /* `scroll` does not bubble, so the listener has to capture — but that means
     it also fires for every nested horizontal scroller on the screen, and
     syncScrolled reads scrollTop. Filtering on the target keeps the flick of a
     rail from forcing a layout read sixty times a second. */
  $('#screens').addEventListener('scroll', (event) => {
    if (event.target.classList && event.target.classList.contains('screen')) syncScrolled();
  }, { passive: true, capture: true });

  faceBay.addEventListener('scroll', syncFaceEdges, { passive: true });

  /* The lane yields to the finger. Pointer events rather than touch events, so
     a trackpad drag counts too. */
  ['pointerdown', 'touchstart'].forEach((name) =>
    laneScroll.addEventListener(name, () => { laneHeld = true; }, { passive: true }));
  ['pointerup', 'pointercancel', 'touchend', 'touchcancel'].forEach((name) =>
    laneScroll.addEventListener(name, () => { laneHeld = false; laneReleased = global.performance.now(); }, { passive: true }));

  $('#genreRail').addEventListener('click', (event) => {
    const card = event.target.closest('.genre-card');
    if (!card) return;
    draft.genre = card.dataset.genre;
    Array.from($('#genreRail').children).forEach((node) => {
      const on = node === card;
      node.setAttribute('aria-checked', on ? 'true' : 'false');
      node.tabIndex = on ? 0 : -1;
    });
    $('#genreBlurb').textContent = G.GENRES[draft.genre].blurb || '';
    /* A new genre brings its own scales, tempo range and drum kit, so the
       scale row has to be rebuilt before anything is generated with it. */
    draft.scale = 'auto';
    if (!tempoTouched) draft.bpm = null;
    regenerate();
    revealGenre(true);
  });

  $('#generateButton').addEventListener('click', () => {
    regenerate();
    UI.haptic([8, 40, 8]);
    toast('New song');
    setTab('play');
  });

  const tempoRange = $('#tempoRange');
  tempoRange.addEventListener('input', () => setTempo(Number(tempoRange.value), false));
  tempoRange.addEventListener('change', () => setTempo(Number(tempoRange.value), true));

  $('#tempoReset').addEventListener('click', () => {
    tempoTouched = false;
    draft.bpm = null;
    regenerate('both');
    toast('Back to the genre tempo');
  });

  /* Tap tempo. Four taps is enough to be confident and short enough that
     nobody gives up; the window resets after two seconds of silence. */
  let taps = [];
  let tapIdle = 0;
  $('#tapTempoButton').addEventListener('click', () => {
    const now = global.performance.now();
    if (taps.length && now - taps[taps.length - 1] > 2000) taps = [];
    taps.push(now);
    UI.haptic(6);
    /* The hint is a live readout while you are tapping and has to go back to
       being an instruction afterwards, or the button spends the rest of the
       session telling you about a tempo you have since changed. */
    global.clearTimeout(tapIdle);
    tapIdle = global.setTimeout(() => { taps = []; syncTempo(); }, 2600);
    if (taps.length < 2) { $('#tapTempoHint').textContent = 'Keep tapping…'; return; }
    if (taps.length > 8) taps.shift();
    const gaps = [];
    for (let i = 1; i < taps.length; i++) gaps.push(taps[i] - taps[i - 1]);
    const average = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const range = $('#tempoRange');
    const bpm = Math.max(Number(range.min), Math.min(Number(range.max), Math.round(60000 / average)));
    $('#tapTempoHint').textContent = `${bpm} BPM from ${taps.length} taps`;
    setTempo(bpm, taps.length >= 4);
  });

  $('#arrangeMap').addEventListener('click', (event) => {
    const button = event.target.closest('.map-sec');
    if (button) toggleSection(button.dataset.section);
  });
  $('#arrangeSteps').addEventListener('click', (event) => {
    const row = event.target.closest('.section-row');
    if (row) toggleSection(row.dataset.section);
  });
  $('#arrangeReset').addEventListener('click', () => { if (activeSection) toggleSection(activeSection.id); });

  $('#intro').addEventListener('keydown', (event) => UI.trap($('#intro'), event));
  $('#countIn').addEventListener('keydown', (event) => UI.trap($('#countIn'), event));

  $('#introNext').addEventListener('click', () => {
    if (introPage === 2) finishIntro();
    else goIntro(introPage + 1);
  });
  $('#introSkip').addEventListener('click', finishIntro);
  $('#introDots').addEventListener('click', (event) => {
    const dot = event.target.closest('[data-go]');
    if (dot) goIntro(Number(dot.dataset.go));
  });
  $('#introPages').addEventListener('scroll', () => {
    const pages = $('#introPages');
    const page = Math.round(pages.scrollLeft / Math.max(1, pages.clientWidth));
    if (page !== introPage) { introPage = page; syncIntro(); }
  }, { passive: true });

  /* A hardware keyboard is a real input on iPad and on every desktop the app
     also runs on. Nothing here fires while a text field has focus. */
  doc.addEventListener('keydown', (event) => {
    const target = event.target;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return;
    /* A focused control owns its own keys. Space activates a button and Enter
       follows a link; a global shortcut that fires first takes the keyboard
       away from every control in the app. The shortcuts are for when nothing
       in particular is focused, which is the state you play in. */
    if (target && target !== doc.body && target.closest &&
        target.closest('button, a[href], summary, [role="switch"], [contenteditable]')) return;
    /* And they belong to the app, not to whatever is covering it. Escape is
       the exception: it is how you get the cover off. */
    if (event.key !== 'Escape' && (UI.isOpen() || !$('#intro').hidden || !$('#countIn').hidden)) return;
    if (event.metaKey || event.ctrlKey) {
      if (event.key === 'z' || event.key === 'Z') { event.preventDefault(); undo(); }
      return;
    }
    if (event.key === ' ' || event.key === 'Spacebar') { event.preventDefault(); togglePlayback(); }
    else if (event.key === 'Escape') {
      if (countInTimer) cancelCountIn();
      else if (!$('#intro').hidden) finishIntro();
      else UI.close();
    } else if (event.key >= '1' && event.key <= '5') { setTab('play'); setPart(PARTS[Number(event.key) - 1].id); }
    else if (event.key === 'g' || event.key === 'G') { regenerate(); toast('New song'); }
    else if (event.key === 'ArrowRight' && event.altKey) stepPart(1);
    else if (event.key === 'ArrowLeft' && event.altKey) stepPart(-1);
  });

  global.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstall = event;
    renderAbout();
  });
  global.addEventListener('appinstalled', () => {
    deferredInstall = null;
    renderAbout();
    toast('Downbeat installed');
  });

  /* Everything the app does works with no connection — it is a generator, not
     a client — so going offline is worth one line of reassurance and nothing
     more. Losing the network mid-session is otherwise silent and alarming. */
  const syncOnline = (announceIt) => {
    const off = global.navigator.onLine === false;
    doc.body.classList.toggle('is-offline', off);
    if (announceIt) toast(off ? 'Offline — everything still works' : 'Back online');
  };
  global.addEventListener('online', () => syncOnline(true));
  global.addEventListener('offline', () => syncOnline(true));

  /* Playback that keeps going after the app is backgrounded is a battery
     complaint and, on iOS, gets the context suspended out from under the
     scheduler anyway. Stopping is the honest behaviour. */
  doc.addEventListener('visibilitychange', () => {
    if (doc.hidden && (Engine.isPlaying() || countInTimer)) stopPlayback();
    else if (!doc.hidden && Engine.isPlaying()) requestWakeLock();
  });

  /* visibilitychange is not guaranteed on the way into the back/forward cache,
     and a page frozen with a running lookahead interval and an armed count-in
     wakes up scheduling against a clock that moved on without it. */
  global.addEventListener('pagehide', () => {
    if (Engine.isPlaying() || countInTimer) stopPlayback();
  });

  let resizeTimer = 0;
  global.addEventListener('resize', () => {
    global.clearTimeout(resizeTimer);
    resizeTimer = global.setTimeout(fitFace, 120);
  });
  global.addEventListener('orientationchange', () => global.setTimeout(fitFace, 260));

  systemTheme.addEventListener('change', (event) => {
    if (!store.get(STORE.theme)) applyTheme(event.matches);
  });

  UNLOCK_EVENTS.forEach((name) => doc.addEventListener(name, unlockAudio, true));

  /* A fixed <body> has nothing to scroll, so any offset on the document is the
     browser having moved the whole page to reveal something — most often a
     text field with the keyboard open, and on iOS also a long-press or a
     find-on-page. It never moves it back, and the result is an app sitting a
     few dozen pixels off the left edge of its own screen for the rest of the
     session. Left alone while a field genuinely has focus; put straight the
     moment it does not. */
  global.addEventListener('scroll', () => {
    const active = doc.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
    if (global.scrollX || global.scrollY) global.scrollTo(0, 0);
  }, { passive: true });
  doc.addEventListener('focusout', () => {
    global.setTimeout(() => { if (global.scrollX || global.scrollY) global.scrollTo(0, 0); }, 60);
  });

  /* ================================================================ boot */

  const storedTheme = store.get(STORE.theme);
  applyTheme(storedTheme ? storedTheme === 'light' : systemTheme.matches);
  watchViewport();
  if (Mark) {
    Mark.favicon();
    Mark.render($('#libraryMark'), { size: 72 });
  }

  /* Three ways in, in order of how deliberate they are: a link someone sent
     you, the sketch you were working on last time, or a fresh one. The broken
     link is tested for separately because decode() returns null both for "no
     link" and for "a link that did not survive being pasted" — without the
     second read a mangled share link silently produces an unrelated random
     song and nobody ever finds out why. */
  const hadLink = /[#&]s=/.test(global.location.hash || '');
  const shared = Library.fromHash();
  const restored = shared ? null : readDraft();

  if (shared) {
    const opts = Library.optionsOf(shared);
    applyOptionsToDraft(opts);
    generate(opts);
    Library.clearHash();
    toast('Someone shared this sketch with you');
  } else if (restored) {
    const opts = Library.optionsOf(restored);
    applyOptionsToDraft(opts);
    generate(opts);
  } else {
    generate(optionsFromDraft());
    if (hadLink) {
      Library.clearHash();
      toast('That link was incomplete — here is a fresh sketch');
    }
  }

  app.dataset.part = part;
  renderLibrary();
  renderAbout();
  Engine.setLoop(loopOn);
  syncOnline(false);

  const storedTab = store.get(STORE.tab);
  if (storedTab && storedTab !== 'play') { tab = 'play'; setTab(storedTab); }

  if (!store.get(STORE.seen)) global.setTimeout(() => showIntro(false), 400);

  if ('serviceWorker' in global.navigator) {
    global.navigator.serviceWorker.register('./sw.js').then((registration) => {
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && global.navigator.serviceWorker.controller) {
            toast('Update ready for next launch');
          }
        });
      });
    }).catch(() => { /* the app is fully usable without installation */ });
  }
})(window);
