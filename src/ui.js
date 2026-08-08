/* Downbeat — the desk.

   The hardware is the app. It sits in #rig and never moves; #stage carries
   whichever part you are playing — its shape on the grid, the pads to press
   for it, and the recipe for setting the device up. Song creation and the
   arrangement guide open as sheets *inside* #stage, which is what lets you
   change the song without ever losing sight of the faceplate. */
(function (global) {
  'use strict';

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
    $('#tempoReset').hidden = !value;
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
    if (!global.navigator || typeof global.navigator.vibrate !== 'function') return;
    try { global.navigator.vibrate(pattern || 8); } catch (e) { /* optional capability */ }
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
    $('#undoButton').hidden = history.length === 0;
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
    $('#tempoValue').textContent = `${song.bpm} bpm`;
    clearAudition();
    render();
    saveDraft();
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

  /* Reroll one half of the sketch while holding the other steady. */
  function rerollMelody() {
    if (!song) return generate();
    generate({ harmonySeed: song.harmonySeed, scale: song.scaleName, bars: song.bars });
  }

  function rerollChords() {
    if (!song) return generate();
    generate({ melodySeed: song.melodySeed });
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

  function clearAudition() {
    auditioning = null;
    auditionMuted = [];
    const reset = $('#arrangeReset');
    if (reset) reset.hidden = true;
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
    $('#arrangeReset').hidden = false;
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
    $('#songTitle').textContent = song.title;
    $('#songMeta').textContent = `${song.genre.label} · ${song.key.rootName} ${song.scaleName} · ${song.bpm} bpm`;
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

  /* Five buttons, one per part, each carrying its own colour. Picking one is
     the main gesture in the app, so they are the first thing under the bar. */
  function renderParts() {
    const parts = $('#parts');
    parts.innerHTML = Devices.TRACKS.map((t) => {
      const on = t.id === deviceState.track;
      const available = hasPart(t.id);
      return `<button class="part${on ? ' is-on' : ''}${hasPart(t.id) ? '' : ' is-empty'}"` +
        ` data-part="${t.id}" aria-pressed="${on}" aria-current="${on ? 'true' : 'false'}"` +
        ` aria-label="${t.label}${available ? '' : ', unavailable in this song'}"${available ? '' : ' disabled'}>${t.label}</button>`;
    }).join('');
    Array.from(parts.children).forEach((chip) => {
      chip.onclick = () => selectPart(chip.dataset.part);
    });
  }

  function selectPart(id) {
    if (!Devices.TRACKS.some((t) => t.id === id) || !hasPart(id)) return;
    deviceState.track = id;
    saveDeviceState();
    renderParts();
    renderPart();
    const track = Devices.TRACKS.find((item) => item.id === id);
    if (track) {
      $('#performancePart').textContent = track.label;
      announce(`${track.label} selected`);
    }
    haptic(6);
    // Solo follows the part you are looking at, which is the point of it.
    applyMutes();
    // Five chips will not sit across a phone, so the row scrolls — keep the
    // one you just chose in view, however you chose it.
    const chip = $(`.part[data-part="${id}"]`);
    if (chip && chip.scrollIntoView) {
      chip.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
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
  function setPerformance(on) {
    performanceOn = !!on;
    if (performanceOn && openName) closeSheet();
    document.body.classList.toggle('is-performing', performanceOn);
    $('#performanceChrome').hidden = !performanceOn;
    $('#performButton').setAttribute('aria-pressed', String(performanceOn));
    try { localStorage.setItem(PERFORMANCE_STORE, performanceOn ? '1' : '0'); } catch (e) { /* private mode */ }
    syncChrome();
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

  function renderPart() {
    if (!song) return;
    const part = deviceState.track;
    const deviceId = deviceState.device;
    desk.dataset.part = part;
    const track = Devices.TRACKS.find((item) => item.id === part);
    if (track) $('#performancePart').textContent = track.label;

    renderDevices(deviceId);
    renderLane(part);

    const view = Devices.build(song, part, deviceId);
    mounted = Devices.mount(view, {
      stage: $('#rigStage'), sequence: $('#run'), setup: $('#recipeSteps')
    });
    cropFaceplate();

    const run = $('#run');
    run.classList.toggle('is-chords', part === 'chords');
    /* A genre with no kit hands back no chips at all; an empty box under a
       heading reads as something failing rather than something absent. */
    if (!run.children.length) run.innerHTML = '<p class="seq-empty">Nothing to play on this part.</p>';
    $('#recipeSummary').textContent = `How to set up the ${Devices.DEVICES[deviceId].label}`;

    if (Engine.isPlaying()) mounted.update(mod(Engine.position(), song.totalSteps));
  }

  function renderDevices(deviceId) {
    const box = $('#rigDevices');
    box.innerHTML = Object.keys(Devices.DEVICES).map((id) => {
      const d = Devices.DEVICES[id];
      const on = id === deviceId;
      return `<button class="device${on ? ' is-on' : ''}" data-device="${id}" aria-pressed="${on}">` +
        `${d.label}<small>${d.maker}</small></button>`;
    }).join('');
    Array.from(box.children).forEach((option) => {
      option.onclick = () => {
        deviceState.device = option.dataset.device;
        saveDeviceState();
        renderPart();
      };
    });
  }

  /* On a phone the display and the function rows are pixels you cannot press,
     so the faceplate crops to the pads themselves. The viewBox is an attribute
     rather than a style, so it is retargeted here instead of in the sheet. */
  /* The pad grid runs y 196–447 on the K.O. II and the keybed y 190–304 on the
     FM-1; the crops stop just short of the fader and the function rows so no
     half a control is left hanging at the edge. */
  const CROP = { ep133: '14 180 336 272', fm1: '10 182 662 126' };
  function cropFaceplate() {
    const svg = $('#rigStage').querySelector('svg');
    if (!svg) return;
    const full = svg.dataset.full || svg.getAttribute('viewBox');
    svg.dataset.full = full;
    /* Keyed on the same band as the thumb: a phone on its side is 390px tall
       and needs the crop just as much as one held upright, but it is 844px
       wide, so width alone never saw it. */
    const tight = global.matchMedia('(max-width: 699px)').matches ||
      global.matchMedia('(max-height: 500px) and (max-width: 1199px)').matches;
    svg.setAttribute('viewBox', tight ? (CROP[deviceState.device] || full) : full);
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

  function renderLane(part) {
    const bars = $('#laneBars');
    bars.innerHTML = '';
    bars.style.setProperty('--bars', String(song.bars));
    for (let bar = 0; bar < song.bars; bar++) {
      const cell = document.createElement('span');
      cell.textContent = String(bar + 1);
      bars.append(cell);
    }

    lane.innerHTML = '';
    lane.className = 'lane ' + (part === 'drums' ? 'is-drums' : 'is-pitched');
    lane.style.setProperty('--steps', String(song.totalSteps));
    lane.style.setProperty('--bars', String(song.bars));

    if (part === 'drums') return renderDrumLane();

    const notes = notesFor(part);
    if (!notes.length) {
      lane.classList.remove('is-pitched');
      $('#laneDescription').textContent = part === 'counter' ? 'No second melody in this song.' : 'No notes in this part.';
      lane.innerHTML = `<span class="tl-off">${part === 'counter'
        ? 'No second line — switch it on in New song.'
        : 'Nothing on this part.'}</span>`;
      return;
    }

    let low = Math.min.apply(null, notes.map((n) => n.midi));
    let high = Math.max.apply(null, notes.map((n) => n.midi));
    const floor = part === 'bass' ? 5 : 7;
    if (high - low < floor) {
      const pad = Math.ceil((floor - (high - low)) / 2);
      low -= pad; high += pad;
    }
    const rows = high - low + 1;
    const track = Devices.TRACKS.find((item) => item.id === part);
    const lowName = `${song.key.nameForPc(low)}${Math.floor(low / 12 - 1)}`;
    const highName = `${song.key.nameForPc(high)}${Math.floor(high / 12 - 1)}`;
    $('#laneDescription').textContent = `${track.label} contour across ${song.bars} bars, from ${lowName} to ${highName}. ` +
      'The exact playable sequence follows.';
    lane.style.setProperty('--rows', String(rows));
    /* The lane gets a fixed slice of the stage and the rows divide it, rather
       than the rows setting the height and the run taking what is left — a
       wide-ranging melody would otherwise push the pads off the screen. */
    const target = global.matchMedia('(max-width: 699px)').matches ? 118 : 210;
    const rowH = Math.max(8, Math.min(24, Math.floor(target / rows)));
    lane.style.setProperty('--row-h', `${rowH}px`);

    /* Past a certain narrowness a note cannot carry its own name — either the
       row is too short for the type or the column is too thin for two
       characters — so the lane shows shape only and the run carries the names. */
    const dense = song.totalSteps > 96 || rowH < 15;
    const patches = song.genre.patches || {};
    const patch = { melody: patches.lead, counter: patches.counter, chords: patches.chord, bass: patches.bass }[part];

    notes.forEach((note) => {
      const block = document.createElement('div');
      block.className = `tl-note is-${part}` + (part === 'bass' ? ` role-${note.role}` : '');
      if (dense) block.classList.add('is-dense');
      block.style.gridColumn = `${Math.round(note.start) + 1} / span ${Math.max(1, Math.round(note.dur))}`;
      block.style.gridRow = `${high - note.midi + 1} / span 1`;
      block.dataset.label = part === 'bass' ? (ROLE_LETTER[note.role] || '') : (note.name || song.key.nameForPc(note.midi));
      block.title = `${song.key.nameForPc(note.midi)}${Math.floor(note.midi / 12 - 1)}` +
        (part === 'bass' ? ` — ${note.role} of ${note.chord}` : '');
      block.setAttribute('aria-hidden', 'true');
      block.onclick = () => Engine.preview(note.midi, patch, 0.7, part);
      lane.append(block);
    });

    renderRoleKey(part, notes);
  }

  /* The bass letters need a key, and only the bass part does. */
  function renderRoleKey(part, notes) {
    const existing = $('#roleKey');
    if (existing) existing.remove();
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
      $('#laneDescription').textContent = 'This song has no drum pattern.';
      lane.innerHTML = '<span class="tl-off">This genre plays without drums.</span>';
      return;
    }

    $('#laneDescription').textContent = `Drum pattern across ${song.bars} bars with ${voices.length} voices. ` +
      'The exact playable sequence follows.';

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
      const hits = byVoice[voice.id];
      for (let step = 0; step < song.totalSteps; step++) {
        const cell = document.createElement('span');
        const inCell = hits.filter((hit) => Math.floor(hit.step) === step);
        cell.className = 'drum-cell' + (step % 4 === 0 ? ' is-beat' : '') + (step % 16 === 0 ? ' is-bar' : '');
        if (inCell.length === 1) {
          cell.classList.add('is-hit');
          cell.style.setProperty('--strength', inCell[0].velocity.toFixed(2));
          if (inCell[0].velocity < 0.45) cell.classList.add('is-ghost');
          cell.title = `${voice.label} · bar ${Math.floor(step / 16) + 1} beat ${(step % 16) / 4 + 1}`;
        } else if (inCell.length > 1) {
          cell.classList.add('is-roll');
          cell.title = `${voice.label} roll — ${inCell.length} hits inside one sixteenth`;
        }
        cells.append(cell);
      }
      row.append(cells);
      row.onclick = () => Engine.playDrum(voice.id, 0, 0.9);
      lane.append(row);
    });
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

    let html = '<span class="map-corner"></span>';
    plan.sections.forEach((s) => {
      html += `<button class="map-head" data-section="${s.id}"><b>${s.name}</b>` +
        `<small>${s.bars} bar${s.bars === 1 ? '' : 's'}</small></button>`;
    });
    html += '<span class="map-track">Energy</span>';
    plan.sections.forEach((s) => {
      html += `<span class="map-energy" data-section="${s.id}">` +
        `<i style="height:${Math.round(s.intensity * 100)}%"></i></span>`;
    });
    plan.tracks.forEach((track) => {
      html += `<span class="map-track">${track.label}</span>`;
      plan.sections.forEach((s) => {
        const on = s.tracks.indexOf(track.id) >= 0;
        html += `<span class="map-cell is-${track.id}${on ? ' is-on' : ''}" data-section="${s.id}"` +
          ` title="${track.label} ${on ? 'plays' : 'is out'} in ${s.name}"></span>`;
      });
    });
    map.innerHTML = html;

    $('#arrangeSteps').innerHTML = plan.sections.map((s) => {
      const outs = s.muted.length
        ? `<span class="drop-note">out: ${s.muted.map((id) =>
            Arrange.TRACKS.filter((t) => t.id === id)[0].label.toLowerCase()).join(', ')}</span>`
        : '<span class="drop-note is-full">everything in</span>';
      return `<li data-section="${s.id}"><span class="step-n">${s.loops}×</span><div>` +
        `<b>${s.name}<small> · bars ${s.start + 1}–${s.start + s.bars}</small></b>` +
        `<p>${s.how}</p>${outs}</div></li>`;
    }).join('');

    $('#arrangeTips').innerHTML = Object.keys(Arrange.DEVICE_TIPS).map((id) =>
      `<p><b>${Devices.DEVICES[id].label}</b> ${Arrange.DEVICE_TIPS[id]}</p>`).join('');

    const byId = {};
    plan.sections.forEach((s) => { byId[s.id] = s; });
    Array.from(map.querySelectorAll('.map-head')).forEach((head) => {
      head.onclick = () => auditionSection(byId[head.dataset.section]);
    });
    Array.from($('#arrangeSteps').children).forEach((item) => {
      item.onclick = () => auditionSection(byId[item.dataset.section]);
    });
    $('#arrangeReset').onclick = (event) => { event.stopPropagation(); clearAudition(); };
  }

  /* -------------------------------------------------------- saved sketches */

  function renderLibrary() {
    const entries = Library.list();
    const count = $('#libraryCount');
    count.textContent = String(entries.length);
    count.hidden = entries.length === 0;
    $('#libraryEmpty').hidden = entries.length > 0;

    const current = song ? Library.encode(Library.recipeOf(song)) : '';
    $('#libraryList').innerHTML = entries.map((entry) =>
      `<article class="lib-card${entry.key === current ? ' is-current' : ''}" data-id="${entry.id}">` +
      `<button class="lib-load"><b>${escapeHtml(entry.title)}</b>` +
      `<small>${escapeHtml(entry.meta)}</small><em>${Library.when(entry.savedAt)}</em></button>` +
      `<div class="lib-actions">` +
      `<button class="lib-icon" data-act="link" title="Copy a link" aria-label="Copy link for ${escapeHtml(entry.title)}">⇗</button>` +
      `<button class="lib-icon" data-act="delete" title="Delete" aria-label="Delete ${escapeHtml(entry.title)}">✕</button>` +
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
        del.textContent = '✕';
        del.setAttribute('aria-label', deleteLabel);
        del.classList.remove('is-armed');
      };
      del.onclick = () => {
        // Two taps rather than a dialog: the first arms it, the second does it.
        if (del.dataset.armed) {
          Library.remove(id);
          renderLibrary();
          toast('Deleted');
          announce(`${savedTitle} deleted`);
          haptic(8);
          return;
        }
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

  function openSheet(name) {
    if (openName === name) return closeSheet();
    returnFocus = document.activeElement;
    openName = name;
    $('#sheetHost').hidden = false;
    SHEETS.forEach((id) => { $('#' + id).hidden = id !== name; });
    setSheetBackground(true);
    const sheet = $('#' + name);
    // Focus the dialog itself so assistive technology announces its title and
    // touch users do not see a picker highlighted before they choose it.
    sheet.focus({ preventScroll: true });
  }

  function closeSheet() {
    if (!openName) return;
    openName = null;
    $('#sheetHost').hidden = true;
    SHEETS.forEach((id) => { $('#' + id).hidden = true; });
    setSheetBackground(false);
    if (returnFocus && returnFocus.isConnected) returnFocus.focus();
    returnFocus = null;
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

  function applyLane() {
    document.body.classList.toggle('lane-slim', laneSlim);
    $('#laneToggle').setAttribute('aria-expanded', String(!laneSlim));
    $('#laneToggle').querySelector('.lane-toggle-label').textContent = laneSlim ? 'Shape' : 'Hide shape';
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
    overlay.hidden = !on;
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
    $('#playButton').classList.toggle('is-playing', playing);
    $('#playButton').classList.toggle('is-counting', countingIn);
    $('#playButton').setAttribute('aria-label', action);
    $('#playButton').setAttribute('aria-pressed', String(playing || countingIn));
    $('#performancePlay').textContent = text;
    $('#performancePlay').classList.toggle('is-playing', playing);
    $('#performancePlay').setAttribute('aria-label', action);
    $('#performancePlay').setAttribute('aria-pressed', String(playing || countingIn));
  }

  function beginPlayback() {
    if (!song) return;
    countingIn = false;
    setCountInOverlay(false);
    Engine.start(song, {
      loop: $('#loopButton').getAttribute('aria-pressed') === 'true',
      onStop: stopPlayback
    });
    syncTransport(true);
    $('#laneHead').hidden = false;
    holdScreenAwake(true);
    announce('Playback started');
    haptic(10);
    followPlayhead();
  }

  function startCountIn(bars) {
    if (!song || countingIn) return;
    Engine.ensure();
    countingIn = true;
    const total = Math.max(1, bars * 4);
    let beat = 0;
    const interval = 60000 / song.bpm;
    const overlay = $('#countIn');
    setCountInOverlay(true);
    syncTransport(false, 'Cancel');
    announce(`${bars} bar count in`);
    const tick = () => {
      if (!countingIn) return;
      if (beat >= total) {
        countInTimer = null;
        return beginPlayback();
      }
      const beatInBar = (beat % 4) + 1;
      $('#countInBeat').textContent = String(beatInBar);
      overlay.classList.remove('pulse');
      void overlay.offsetWidth;
      overlay.classList.add('pulse');
      Engine.playDrum(beatInBar === 1 ? 'rim' : 'hat', null, beatInBar === 1 ? 0.9 : 0.55);
      haptic(beatInBar === 1 ? 18 : 7);
      beat += 1;
      countInTimer = global.setTimeout(tick, interval);
    };
    tick();
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
    $('#barProgress').style.width = '0';
    $('#barPos').textContent = '';
    $('#performancePosition').textContent = '';
    $('#laneHead').hidden = true;
    if (mounted) mounted.update(null);
    holdScreenAwake(false);
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
     step with what you are hearing. */
  let lastNow = null;
  function followPlayhead() {
    const step = Engine.position();
    const ratio = song.totalSteps ? step / song.totalSteps : 0;
    $('#barProgress').style.width = `${ratio * 100}%`;
    const position = `bar ${Math.min(song.bars, Math.floor(step / 16) + 1)}/${song.bars}`;
    $('#barPos').textContent = position;
    $('#performancePosition').textContent = position;
    $('#laneHead').style.setProperty('--head', ratio.toFixed(5));
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
    const box = $('#run');
    const hold = () => { runHeldByUser = true; };
    const releaseSoon = () => { global.setTimeout(() => { runHeldByUser = false; }, 2500); };
    box.addEventListener('pointerdown', hold, { passive: true });
    box.addEventListener('pointerup', releaseSoon, { passive: true });
    box.addEventListener('pointercancel', releaseSoon, { passive: true });
  })();

  function followRun() {
    if (runHeldByUser) return;
    const box = $('#run');
    const now = box.querySelector('.now');
    if (!now || now === lastNow) return;
    lastNow = now;
    if (box.scrollHeight > box.clientHeight + 1) {
      box.scrollTo({ top: now.offsetTop - (box.clientHeight - now.offsetHeight) / 2, behavior: 'smooth' });
    }
  }

  /* ---------------------------------------------------------------- misc */

  let toastTimer = null;
  function toast(message) {
    const element = $('#toast');
    if (toastTimer) global.clearTimeout(toastTimer);
    element.textContent = message;
    element.classList.add('show');
    toastTimer = global.setTimeout(() => {
      element.classList.remove('show');
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

  $('#saveButton').onclick = () => {
    const result = Library.save(song);
    renderLibrary();
    if (result.duplicate) toast('Already saved');
    else if (result.stored) { toast(`Saved “${song.title}”`); announce('Song saved'); }
    else toast('Storage unavailable');
  };
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
  function renderOnboarding() {
    const titleIds = ['onboardingTitle', 'onboardingHardwareTitle', 'onboardingPerformTitle'];
    Array.from(document.querySelectorAll('[data-onboarding-page]')).forEach((page, index) => {
      const on = index === onboardingPage;
      page.hidden = !on;
      page.classList.toggle('is-on', on);
    });
    Array.from(document.querySelectorAll('.onboarding-dots i')).forEach((dot, index) => {
      dot.classList.toggle('is-on', index === onboardingPage);
    });
    $('#onboarding').setAttribute('aria-labelledby', titleIds[onboardingPage]);
    $('#onboardingNext').textContent = onboardingPage === 2 ? 'Start creating' : 'Continue';
  }

  function showOnboarding() {
    if (openName) closeSheet();
    onboardingPage = 0;
    $('#onboarding').hidden = false;
    [$('#bar'), desk, $('#thumb'), $('#performanceChrome')].forEach((el) => {
      if (el && !el.hidden) el.setAttribute('inert', '');
    });
    renderOnboarding();
    $('#onboardingNext').focus({ preventScroll: true });
  }

  function finishOnboarding() {
    $('#onboarding').hidden = true;
    [$('#bar'), desk, $('#thumb'), $('#performanceChrome')].forEach((el) => {
      if (el) el.removeAttribute('inert');
    });
    try { localStorage.setItem(ONBOARDING_STORE, 'complete'); } catch (e) { /* private mode */ }
    $('#songButton').focus({ preventScroll: true });
  }

  $('#onboardingNext').onclick = () => {
    if (onboardingPage < 2) {
      onboardingPage += 1;
      renderOnboarding();
      const title = document.getElementById($('#onboarding').getAttribute('aria-labelledby'));
      if (title) announce(title.textContent);
      haptic(6);
    } else {
      finishOnboarding();
      openSheet('songSheet');
    }
  };
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
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isStandalone = global.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (isIos && !isStandalone) {
    $('#installButton').hidden = false;
    $('#installButton').textContent = 'Add to Home Screen';
  }
  global.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event;
    $('#installButton').hidden = false;
  });
  $('#installButton').onclick = async () => {
    if (!installPrompt) {
      if (isIos && !isStandalone) {
        $('#installHelp').hidden = false;
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
    $('#installButton').hidden = true;
    $('#installHelp').hidden = true;
  };
  global.addEventListener('appinstalled', () => {
    installPrompt = null;
    $('#installButton').hidden = true;
    $('#installHelp').hidden = true;
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
    const reset = $('#arrangeReset');
    if (reset) reset.hidden = true;
    Array.from(document.querySelectorAll('.is-auditioning'))
      .forEach((el) => el.classList.remove('is-auditioning'));
  }

  /* Follow the device until the person makes an explicit choice. */
  const THEME_STORE = global.Store.key('theme');
  const systemTheme = global.matchMedia('(prefers-color-scheme: light)');
  function applyTheme(light) {
    document.body.classList.toggle('light', light);
    Array.from(document.querySelectorAll('meta[name="theme-color"]')).forEach((meta) => {
      meta.setAttribute('content', light ? '#f2f2f7' : '#09090b');
    });
    $('#themeButton').setAttribute('aria-label', light ? 'Use dark appearance' : 'Use light appearance');
    $('#themeButton').setAttribute('title', light ? 'Use dark appearance' : 'Use light appearance');
    $('#themeButton').textContent = light ? '☼' : '☾';
  }
  const storedTheme = (() => {
    try { return localStorage.getItem(THEME_STORE); } catch (e) { return null; }
  })();
  applyTheme(storedTheme ? storedTheme === 'light' : systemTheme.matches);
  const followSystemTheme = (event) => {
    let preference = null;
    try { preference = localStorage.getItem(THEME_STORE); } catch (e) { /* private mode */ }
    if (!preference) applyTheme(event.matches);
  };
  if (systemTheme.addEventListener) systemTheme.addEventListener('change', followSystemTheme);
  else systemTheme.addListener(followSystemTheme);
  $('#themeButton').onclick = () => {
    const light = !document.body.classList.contains('light');
    applyTheme(light);
    try { localStorage.setItem(THEME_STORE, light ? 'light' : 'dark'); } catch (e) { /* fine */ }
  };

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !$('#onboarding').hidden) {
      event.preventDefault();
      return finishOnboarding();
    }
    if (event.key === 'Escape' && openName) { event.preventDefault(); return closeSheet(); }
    if (event.target.matches('input, select, textarea')) return;
    if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      return undoLastChange();
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.code === 'Space') {
      // Space belongs to whatever control has focus — pressing it on Save
      // should save, not save and start playing.
      if (event.target.closest('button, a, summary')) return;
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
  function placeControls() {
    const down = phone.matches || shortways.matches;
    const controls = $('#barControls');
    const parts = $('#parts');
    thumb.hidden = !down;
    if (down) {
      if (parts.parentNode !== thumb) thumb.append(parts);
      if (controls.parentNode !== thumb) thumb.append(controls);
    } else {
      // Appearance is a trailing toolbar action on wide layouts. Inserting
      // the controls before it also keeps song identity adjacent to playback.
      if (controls.parentNode !== bar) bar.insertBefore(controls, $('#themeButton'));
      if (parts.parentNode !== $('#stageBody')) $('#stageBody').prepend(parts);
    }
    document.body.classList.toggle('has-thumb', down);
    syncChrome();
  }

  if (global.ResizeObserver) {
    const ro = new global.ResizeObserver(syncChrome);
    ro.observe(bar);
    ro.observe(thumb);
    ro.observe($('#performanceChrome'));
  }
  global.addEventListener('resize', syncChrome);

  /* Crossing a band changes how much faceplate fits, how much height the lane
     may spend, and where the controls live. */
  const onBand = () => { placeControls(); if (song) renderPart(); };
  [phone, shortways].forEach((q) => {
    if (q.addEventListener) q.addEventListener('change', onBand);
    else q.addListener(onBand);
  });
  placeControls();

  syncSolo();
  refreshScales();

  /* A shared link wins over a local draft. Otherwise the exact current sketch
     returns after a refresh, browser eviction, or accidental tab close. */
  const shared = Library.fromHash();
  let draft = null;
  try { draft = JSON.parse(localStorage.getItem(DRAFT_STORE)); } catch (e) { /* no usable draft */ }
  let firstRun = false;
  if (shared) {
    loadRecipe(shared, { noHistory: true });
    Library.clearHash();
    toast('Opened a shared sketch');
  } else if (draft && draft.g) {
    loadRecipe(draft, { noHistory: true });
  } else {
    firstRun = true;
    generate(null, { noHistory: true });
  }
  syncUndo();

  if (firstRun) {
    let introduced = false;
    try { introduced = localStorage.getItem(ONBOARDING_STORE) === 'complete'; } catch (e) { /* private mode */ }
    if (!introduced) global.setTimeout(showOnboarding, 180);
  }

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
