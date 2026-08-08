/* Downbeat — hardware performance views.

   Draws a stylised faceplate of a real device and shows how to play each
   track of the sketch on it: which pads or keys to hit, in what order, with
   the buttons lighting up in time with playback.

   Two devices are modelled, against their current firmware:
   - teenage engineering EP-133 K.O. II on OS 2.5 (calculator-keypad pads,
     KEYS-mode scale & key as system codes, root on pad "1", TIMING+pads
     arpeggio)
   - M-VAVE FM-1 on firmware V15 (27 keys F3–G5, OCT ±3, mono/poly, glide,
     ARP with latch, 16-step sequencer)

   The faceplates are simplified — enough geometry to find the right control
   on the real unit, not a photograph. */
(function (global) {
  'use strict';

  const T = global.Theory;
  const mod = T.mod;

  const TRACKS = [
    { id: 'melody', label: 'Melody' },
    { id: 'counter', label: 'Counter' },
    { id: 'chords', label: 'Chords' },
    { id: 'bass', label: 'Bass' },
    { id: 'drums', label: 'Drums' }
  ];

  const DEVICES = {
    ep133: {
      id: 'ep133',
      label: 'EP-133 K.O. II',
      maker: 'teenage engineering',
      firmware: 'OS 2.5'
    },
    fm1: {
      id: 'fm1',
      label: 'FM-1',
      maker: 'M-VAVE',
      firmware: 'V15'
    }
  };

  /* Where the picker starts before anyone has chosen — the first device in the
     list, nothing cleverer. You play on the hardware you own, so the choice is
     yours to make once and ours to keep: it holds for every track and across
     reloads until you pick the other one. */
  const DEFAULT_DEVICE = 'ep133';

  /* What is actually silkscreened on the twelve pads: a calculator keypad, not
     P1–P12. Index 0 is the bottom-left pad, and KEYS mode runs the scale up
     from there, left to right, bottom to top.

         7  8  9
         4  5  6
         1  2  3
         .  0  ENTER                                                        */
  const EP_PAD_LABELS = ['.', '0', 'ENTER', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

  /* The root lands on the pad marked "1" by default, which is the fourth pad
     counting from the bottom left — so three scale degrees sit *below* it, on
     ".", "0" and "ENTER". (Hold KEYS and press any pad to move it.) */
  const EP_ROOT_INDEX = 3;

  /* KEYS-mode scales are chosen by typing a numeric code into the system
     settings, not by turning a knob. These are the codes as of OS 2.5; the key
     is a second code, 320 + pitch class, running C to B.

     Downbeat can write harmonic minor, melodic minor and phrygian dominant,
     none of which the K.O. II offers — those fall back to 12T and the pads run
     chromatically instead. Locrian is on the device but Downbeat never picks
     it; it is listed so it works if that ever changes. */
  const EP_SCALES = {
    'Major (Ionian)':   { code: '311', label: 'maj' },
    'Natural Minor':    { code: '312', label: 'min' },
    'Dorian':           { code: '313', label: 'dor' },
    'Phrygian':         { code: '314', label: 'phr' },
    'Lydian':           { code: '315', label: 'lyd' },
    'Mixolydian':       { code: '316', label: 'mix' },
    'Locrian':          { code: '317', label: 'loc' },
    'Major Pentatonic': { code: '318', label: 'ma.p' },
    'Minor Pentatonic': { code: '319', label: 'mi.p' }
  };
  const EP_CHROMATIC = { code: '310', label: '12T' };

  /* Drum voices in the order they get dealt onto pads / keys. */
  const DRUM_ORDER = ['kick', 'snare', 'rim', 'clap', 'hat', 'openHat', 'ride', 'crash'];
  const DRUM_LABEL = {
    kick: 'Kick', snare: 'Snare', rim: 'Rim', clap: 'Clap',
    hat: 'Hat', openHat: 'Open', ride: 'Ride', crash: 'Crash'
  };
  /* On the FM-1 a kit is played as pitches — low keys thump, high keys hiss. */
  const FM_DRUM_KEY = { kick: 0, snare: 7, rim: 5, clap: 9, hat: 12, openHat: 14, ride: 16, crash: 19 };

  const octaveOf = (midi) => Math.floor(midi / 12 - 1);
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  function noteName(song, midi) {
    return song.key.nameForPc(midi) + octaveOf(midi);
  }

  /* ------------------------------------------------------- track material */

  /* One flat list of pitched events per track, in playing order. */
  function pitchedEvents(song, trackId) {
    const source = {
      melody: song.melody,
      counter: song.counter || [],
      chords: song.chordTrack || [],
      bass: song.bass
    }[trackId] || [];
    return source.map((n) => ({
      start: n.start, dur: Math.max(1, Math.round(n.dur)), midi: n.midi, role: n.role || null
    })).sort((a, b) => a.start - b.start || a.midi - b.midi);
  }

  function usedDrums(song) {
    const seen = new Set(song.drums.map((h) => h.instrument));
    return DRUM_ORDER.filter((id) => seen.has(id));
  }

  /* ------------------------------------------------- EP-133 note mapping */

  /* KEYS mode lays the chosen scale across the 12 pads, ascending from the
     bottom left. The root is not the first pad: it sits on the pad marked "1",
     three degrees up the run, so the three pads underneath it play the degrees
     below the root. Notes past the twelfth pad belong to the next octave (hold
     KEYS and press +); notes outside the scale have no pad at all. */
  function epMapping(song, trackId) {
    const events = pitchedEvents(song, trackId);
    const scale = EP_SCALES[song.scaleName] || null;
    const rootPc = song.key.scalePcs[0];
    const pcs = scale ? song.key.scalePcs : Array.from({ length: 12 }, (_, i) => mod(rootPc + i, 12));
    const inScale = (m) => pcs.indexOf(mod(m, 12)) >= 0;

    const pool = events.map((e) => e.midi);
    if (trackId === 'chords') (song.spans || []).forEach((s) => pool.push.apply(pool, s.voicing));

    /* The twelve pads for a given root: walk down the scale to find where the
       run starts, then back up filling every pad. */
    function runFor(root) {
      let start = root;
      for (let i = 0; i < EP_ROOT_INDEX; i++) {
        let m = start - 1;
        while (m > 0 && !inScale(m)) m--;
        start = m;
      }
      const notes = [];
      for (let m = start; notes.length < 12 && m < 128; m++) if (inScale(m)) notes.push(m);
      return notes;
    }

    /* One octave setting has to serve the whole track, so pick the root octave
       that puts the most of it under the pads — the same choice fmMapping
       makes for its OCT shift, ties broken toward the middle of the grid. */
    let root = rootPc + 48;
    let padNotes = runFor(root);
    let bestScore = -1;
    for (let r = mod(rootPc, 12); r < 120; r += 12) {
      const notes = runFor(r);
      if (notes.length < 12) continue;
      const at = {};
      notes.forEach((m, i) => { at[m] = i; });
      let hits = 0;
      let spread = 0;
      pool.forEach((m) => { if (at[m] !== undefined) { hits++; spread += Math.abs(at[m] - 5.5); } });
      const score = hits * 1000 - (hits ? spread / hits : 999);
      if (score > bestScore) { bestScore = score; root = r; padNotes = notes; }
    }

    const start = padNotes.length ? padNotes[0] : root;
    const idFor = (midi) => {
      if (!inScale(midi) || midi < start) return null;
      let pos = 0;
      for (let m = start; m < midi; m++) if (inScale(m)) pos++;
      const index = mod(pos, 12);
      return {
        id: 'p' + (index + 1), pad: index + 1, index,
        label: EP_PAD_LABELS[index], oct: Math.floor(pos / 12)
      };
    };

    return {
      events, idFor, padNotes, root, start, scale,
      scaleCode: scale ? scale.code : EP_CHROMATIC.code,
      scaleLabel: scale ? scale.label : EP_CHROMATIC.label,
      keyCode: String(320 + mod(rootPc, 12))
    };
  }

  /* --------------------------------------------------- FM-1 note mapping */

  /* The keybed spans F3–G5 (MIDI 53–79). One OCT setting has to serve the
     whole track, so pick the shift that keeps the most notes under the
     fingers, breaking ties toward the middle of the keyboard. */
  function fmMapping(song, trackId) {
    const events = pitchedEvents(song, trackId);
    const midis = events.map((e) => e.midi);
    if (trackId === 'chords') (song.spans || []).forEach((s) => midis.push.apply(midis, s.voicing));

    let best = 0;
    let bestScore = -1;
    for (let oct = -3; oct <= 3; oct++) {
      let hits = 0;
      let center = 0;
      midis.forEach((m) => {
        const idx = m - 53 - oct * 12;
        if (idx >= 0 && idx <= 26) { hits++; center += Math.abs(idx - 13); }
      });
      const score = hits * 1000 - (hits ? center / hits : 999) - Math.abs(oct);
      if (score > bestScore) { bestScore = score; best = oct; }
    }

    const idFor = (midi) => {
      const idx = midi - 53 - best * 12;
      return idx >= 0 && idx <= 26 ? { id: 'k' + idx, idx } : null;
    };
    return { events, idFor, oct: best };
  }

  /* ------------------------------------------------------ EP-133 faceplate */

  const EP_PAD_GRID = { x: 96, y: 196, w: 74, h: 56, gapX: 10, gapY: 9 };

  function epPadRect(pad) {
    /* Pad 1 sits bottom left; numbers climb left-to-right, bottom-to-top. */
    const col = (pad - 1) % 3;
    const row = 3 - Math.floor((pad - 1) / 3);
    const g = EP_PAD_GRID;
    return { x: g.x + col * (g.w + g.gapX), y: g.y + row * (g.h + g.gapY) };
  }

  function epSvg(song, trackId, mapping, isDrums) {
    const smallKey = (x, y, w, label, on) =>
      `<g class="dev-key${on ? ' is-on' : ''}"><rect x="${x}" y="${y}" width="${w}" height="21" rx="4"/>` +
      `<text x="${x + w / 2}" y="${y + 14}">${label}</text></g>`;

    const knob = (x, y, label, id) =>
      `<g class="dev-knob"${id ? ` data-el="${id}"` : ''}><circle cx="${x}" cy="${y}" r="13"/>` +
      `<line x1="${x}" y1="${y - 4}" x2="${x}" y2="${y - 11}"/>` +
      `<text x="${x}" y="${y + 27}">${label}</text></g>`;

    let pads = '';
    for (let pad = 1; pad <= 12; pad++) {
      const { x, y } = epPadRect(pad);
      let note = '';
      let sub = '';
      let used = false;
      if (isDrums) {
        const voice = mapping.padVoices[pad - 1];
        if (voice) { note = DRUM_LABEL[voice]; sub = 'GROUP A'; used = true; }
      } else if (mapping.padNotes[pad - 1] !== undefined) {
        const m = mapping.padNotes[pad - 1];
        note = noteName(song, m);
        used = mapping.usedPads.has(pad);
        /* Degrees are counted from the root, which is three pads up the run —
           so the bottom three read as the degrees below it. */
        const rel = (pad - 1) - EP_ROOT_INDEX;
        const size = mapping.scale ? song.key.scalePcs.length : 12;
        const deg = mod(rel, size);
        sub = deg === 0 ? 'root' : 'deg ' + (deg + 1);
      }
      pads +=
        `<g class="dev-pad${used ? ' used' : ''}" data-el="p${pad}" data-pad="${pad}">` +
        `<rect x="${x}" y="${y}" width="${EP_PAD_GRID.w}" height="${EP_PAD_GRID.h}" rx="8"/>` +
        `<text class="pad-id" x="${x + 8}" y="${y + 15}">${EP_PAD_LABELS[pad - 1]}</text>` +
        `<text class="pad-main" x="${x + EP_PAD_GRID.w / 2}" y="${y + 34}">${esc(note)}</text>` +
        `<text class="pad-sub" x="${x + EP_PAD_GRID.w / 2}" y="${y + 48}">${sub}</text></g>`;
    }

    const groups = ['A', 'B', 'C', 'D'].map((letter, i) => {
      const y = EP_PAD_GRID.y + i * (EP_PAD_GRID.h + EP_PAD_GRID.gapY) + 11;
      const on = isDrums ? letter === 'A' : letter === mapping.groupHint;
      return `<g class="dev-key dev-group${on ? ' is-on' : ''}"><rect x="22" y="${y}" width="56" height="34" rx="6"/>` +
        `<text x="50" y="${y + 22}">${letter}</text></g>`;
    }).join('');

    return `<svg class="dev-svg dev-ep" viewBox="0 0 356 496" aria-hidden="true" focusable="false">
      <rect class="dev-body" x="2" y="2" width="352" height="492" rx="16"/>
      <text class="dev-brand" x="22" y="26">teenage engineering</text>
      <text class="dev-model" x="334" y="26" text-anchor="end">EP–133 K.O. II</text>
      <g class="dev-display"><rect x="20" y="36" width="316" height="56" rx="7"/>
        <text class="seg seg-left" x="32" y="59" data-el="disp-mode"></text>
        <text class="seg seg-left seg-dim" x="32" y="80" data-el="disp-sub"></text>
        <text class="seg seg-right" x="324" y="70" text-anchor="end" data-el="disp-note"></text></g>
      ${smallKey(20, 106, 70, 'main')} ${smallKey(96, 106, 70, 'sample')} ${smallKey(172, 106, 70, 'tempo')}
      ${smallKey(20, 133, 70, 'keys', !isDrums)} ${smallKey(96, 133, 70, 'fx')} ${smallKey(172, 133, 70, 'timing', trackId === 'chords')}
      ${knob(266, 122, 'a', 'knob-a')} ${knob(316, 122, 'b', 'knob-b')}
      <text class="dev-hintline" x="20" y="176">groups</text>
      <text class="dev-hintline" x="${EP_PAD_GRID.x}" y="176">${isDrums ? 'pads — one voice each' : 'pads — root on 1, scale climbs to 9'}</text>
      ${groups}
      ${pads}
      <g class="dev-key" data-el="key-minus"><rect x="22" y="458" width="26" height="21" rx="4"/><text x="35" y="472">−</text></g>
      <g class="dev-key" data-el="key-plus"><rect x="52" y="458" width="26" height="21" rx="4"/><text x="65" y="472">+</text></g>
      <g class="dev-fader"><rect class="fader-track" x="96" y="464" width="150" height="9" rx="4.5"/>
        <rect class="fader-cap" x="150" y="458" width="26" height="21" rx="4"/></g>
      <g class="dev-key"><rect x="262" y="458" width="40" height="21" rx="4"/><text x="282" y="472">play</text></g>
      <g class="dev-key dev-rec"><rect x="308" y="458" width="26" height="21" rx="4"/><text x="321" y="473">●</text></g>
    </svg>`;
  }

  /* ------------------------------------------------------- FM-1 faceplate */

  /* 27 silicone keys, F3 to G5. White keys are drawn first, black keys on
     top; each carries data-el="k<index>" where index is semitones above F3. */
  const FM_WHITE = [0, 2, 4, 6, 7, 9, 11, 12, 14, 16, 18, 19, 21, 23, 24, 26];
  const FM_BLACK = [1, 3, 5, 8, 10, 13, 15, 17, 20, 22, 25];

  function fmSvg(song, trackId, mapping, isDrums) {
    const knob = (x, y, label, small) =>
      `<g class="dev-knob"><circle cx="${x}" cy="${y}" r="${small ? 11 : 13}"/>` +
      `<line x1="${x}" y1="${y - 3}" x2="${x}" y2="${y - (small ? 9 : 11)}"/>` +
      `<text x="${x}" y="${y + 26}">${label}</text></g>`;

    const KEY_W = 40.25;
    const KEY_X = 19;
    const KEY_Y = 190;
    const whiteIndexOf = {};
    FM_WHITE.forEach((idx, i) => { whiteIndexOf[idx] = i; });

    let keys = '';
    FM_WHITE.forEach((idx, i) => {
      const x = KEY_X + i * KEY_W;
      const midi = 53 + idx + mapping.oct * 12;
      const label = isDrums
        ? (mapping.keyVoices['k' + idx] ? DRUM_LABEL[mapping.keyVoices['k' + idx]] : '')
        : (mod(midi, 12) === 0 || mapping.usedKeys.has('k' + idx) ? noteName(song, midi) : '');
      keys += `<g class="dev-wkey${mapping.usedKeys.has('k' + idx) ? ' used' : ''}" data-el="k${idx}">` +
        `<rect x="${x}" y="${KEY_Y}" width="${KEY_W}" height="114" rx="4"/>` +
        `<text x="${x + KEY_W / 2}" y="${KEY_Y + 103}">${esc(label)}</text></g>`;
    });
    FM_BLACK.forEach((idx) => {
      const wi = whiteIndexOf[idx - 1];
      const x = KEY_X + (wi + 1) * KEY_W - 12.5;
      keys += `<g class="dev-bkey${mapping.usedKeys.has('k' + idx) ? ' used' : ''}" data-el="k${idx}">` +
        `<rect x="${x}" y="${KEY_Y}" width="25" height="70" rx="3"/></g>`;
    });

    const fnKey = (x, y, w, label, id, on) =>
      `<g class="dev-key${on ? ' is-on' : ''}"${id ? ` data-el="${id}"` : ''}>` +
      `<rect x="${x}" y="${y}" width="${w}" height="19" rx="9.5"/>` +
      `<text x="${x + w / 2}" y="${y + 13}">${label}</text></g>`;

    const row1 = ['fx', 'sel', 'env', 'lfo', 'edit', 'glo', 'home·bt'];
    const row2 = ['save', 'arp', 'seq', 'play', 'rec', 'oct−', 'oct+'];
    let fns = '';
    row1.forEach((label, i) => { fns += fnKey(19 + i * 92, 132, 86, label, null, false); });
    row2.forEach((label, i) => {
      const id = label === 'oct−' ? 'oct-down' : label === 'oct+' ? 'oct-up' : null;
      const on = (label === 'oct−' && mapping.oct < 0) || (label === 'oct+' && mapping.oct > 0);
      fns += fnKey(19 + i * 92, 158, 86, label, id, on);
    });

    return `<svg class="dev-svg dev-fm" viewBox="0 0 682 322" aria-hidden="true" focusable="false">
      <rect class="dev-body" x="2" y="2" width="678" height="318" rx="16"/>
      <text class="dev-brand" x="20" y="26">M-VAVE</text>
      <text class="dev-model" x="82" y="26">FM-1 · 6-OP FM</text>
      ${knob(48, 74, 'master')} ${knob(112, 74, 'select')} ${knob(176, 74, 'presets')} ${knob(240, 74, 'algo')}
      <g class="dev-display dev-tft"><rect x="284" y="40" width="164" height="74" rx="7"/>
        <text class="tft t1" x="296" y="62" data-el="disp-mode"></text>
        <text class="tft t2" x="296" y="80" data-el="disp-sub"></text>
        <text class="tft t3" x="296" y="100" data-el="disp-note"></text></g>
      ${knob(492, 74, 'knob 1', true)} ${knob(548, 74, 'knob 2', true)} ${knob(604, 74, 'knob 3', true)} ${knob(656, 74, 'knob 4', true)}
      ${fns}
      ${keys}
    </svg>`;
  }

  /* ------------------------------------------------------- setup recipes */

  function epSetup(song, trackId, mapping) {
    const keyName = song.key.rootName;
    if (trackId === 'drums') {
      return [
        ['Load your kit into group A', 'One sound per pad — the map on the faceplate shows which voice lives where. Punchy one-shots work best.'],
        ['Follow the drum grid above', 'Section 03 shows every hit on the sixteenth grid. The pads flash here in time with playback.'],
        ['Let the fader help', 'On OS 2.5 the fader rides group level by default — pull it for instant drops.']
      ];
    }
    const octNote = mapping.maxOct > 0
      ? ' A few notes sit an octave up — hold <b>keys</b> and tap <b>+</b> when you see the ↑ marker, or park the whole part one octave higher.'
      : '';
    const scaleLine = mapping.scale
      ? `In system settings, enter <b>${mapping.scaleCode}</b> for ${mapping.scaleLabel}, then <b>${mapping.keyCode}</b> for the key of ${esc(keyName)}. The pads then run ${esc(keyName)} ${mapping.scaleLabel} instead of chromatically.`
      : `${esc(song.scaleName)} isn’t one of the K.O. II’s scales, so leave it on <b>310</b> (12T) — the pads run chromatically and every note is still reachable.`;
    const steps = [
      [`Pick a ${trackId === 'bass' ? 'bass' : 'melodic'} sound`, `Select its pad${trackId === 'bass' ? ' (group B is the usual home for bass)' : ''} and press <b>keys</b> — the sound spreads across all 12 pads.`],
      [mapping.scale ? `Set the scale and key` : 'Leave the scale on 12T', scaleLine],
      ['Put the root on pad 1', `Hold <b>keys</b> and press <b>−</b>/<b>+</b> until pad <b>1</b> plays ${esc(noteName(song, mapping.root))}. That is where the root sits by default, with <b>.</b> <b>0</b> <b>enter</b> underneath it playing the degrees below.${octNote}`]
    ];
    if (trackId === 'chords') {
      steps.push(['Play each stack together', 'Press every pad in a card at once. For a broken-chord feel, OS 2.5 will do it for you: hold <b>timing</b> and press the pads to arpeggiate — the sample has to be set to oneshot or legato (<b>shift</b> + <b>sound</b>) for that to work.']);
    } else {
      steps.push(['Play the run', 'Follow the pad chips in order — the rhythm lives in the timeline above. For long notes, set the sound to legato in sound edit.']);
    }
    return steps;
  }

  function fmSetup(song, trackId, mapping) {
    const octLabel = mapping.oct === 0
      ? 'The part sits in the home octave — both OCT LEDs stay dark.'
      : `Press <b>oct${mapping.oct > 0 ? '+' : '−'}</b> ${Math.abs(mapping.oct)}× (the LED ${Math.abs(mapping.oct) === 1 ? 'blinks slowly' : Math.abs(mapping.oct) === 2 ? 'blinks fast' : 'goes solid'} at ±${Math.abs(mapping.oct)}).`;
    if (trackId === 'drums') {
      return [
        ['Find a percussive patch', 'Turn <b>presets</b> to something short and clicky — tight envelopes read as drums. V15 can also import DX7 percussion banks over SysEx.'],
        ['Keys become drums', 'Each voice gets one key, marked on the keybed — kick low, cymbals high. The FM-1 is a synth, not a sampler, so this is FM percussion with its own character.'],
        ['Or sequence it', 'Press <b>seq</b>, then <b>rec</b>, and step the pattern in — 16 steps per pattern, and V15 lets you customise step length.']
      ];
    }
    const steps = [
      ['Choose a voice', trackId === 'bass'
        ? 'Turn <b>presets</b> to an FM bass. V15 added two-mode glide — worth switching on for a slinky low end.'
        : trackId === 'chords'
          ? 'Turn <b>presets</b> to an FM e-piano or pad — the classic DX-7 sounds live here. Make sure the patch is set to <b>POLY</b>.'
          : 'Turn <b>presets</b> to a lead you like — a bright FM bell or e-piano carries a tune well.'],
      ['Set the octave', octLabel]
    ];
    if (trackId === 'chords') {
      steps.push(['Play each stack together', 'The FM-1 is fully polyphonic, so every voicing lands as written. Latch <b>arp</b> if you’d rather hear the stacks broken.']);
    } else {
      steps.push([trackId === 'bass' ? 'Walk the line' : 'Play the run', 'Follow the key chips in order — lit keys on the faceplate mirror playback. MONO mode (in edit) keeps overlapping notes clean.']);
      steps.push(['Let the sequencer hold it', 'Press <b>seq</b> then <b>rec</b> and play the phrase once — the 16-step sequencer loops it while you jam on top.']);
    }
    return steps;
  }

  /* ------------------------------------------------------ sequence chips */

  function chipHTML(idInfo, main, sub, extra) {
    const off = !idInfo;
    const light = idInfo ? ` data-light="${idInfo.id}"` : '';
    const up = idInfo && idInfo.oct > 0 ? '<i class="chip-oct">↑</i>' : '';
    return `<button class="seq-chip${off ? ' is-off' : ''}"${light}${extra || ''}>` +
      `<b>${main}${up}</b><small>${sub}</small></button>`;
  }

  function pitchedChips(song, trackId, mapping, deviceId) {
    const events = mapping.events;
    if (!events.length) {
      return trackId === 'counter'
        ? '<p class="seq-empty">The second line is switched off. Turn on “Add a countermelody” in Setup to see it here.</p>'
        : '<p class="seq-empty">Nothing to play on this track.</p>';
    }
    let bar = -1;
    let html = '';
    events.forEach((e) => {
      const b = Math.floor(e.start / 16);
      if (b !== bar) { bar = b; html += `<span class="seq-bar">${b + 1}</span>`; }
      const info = mapping.idFor(e.midi);
      const main = info
        ? (deviceId === 'ep133' ? 'pad ' + info.label : esc(noteName(song, e.midi)))
        : 'OFF';
      const sub = deviceId === 'ep133'
        ? esc(noteName(song, e.midi)) + (e.role ? ' · ' + e.role : '')
        : (info ? 'key ' + (info.idx + 1) : 'out of range') + (e.role ? ' · ' + e.role : '');
      html += chipHTML(info, main, sub, ` data-midi="${e.midi}"`);
    });
    return html;
  }

  function chordChips(song, mapping, deviceId) {
    return (song.spans || []).map((s) => {
      const parts = [];
      let off = 0;
      const lights = [];
      s.voicing.forEach((m) => {
        const info = mapping.idFor(m);
        if (!info) { off++; return; }
        lights.push(info.id);
        parts.push(deviceId === 'ep133'
          ? info.label + (info.oct > 0 ? '↑' : '')
          : esc(noteName(song, m)));
      });
      const offNote = off ? `<small class="chord-off">+${off} out of reach</small>` : '';
      return `<button class="seq-chord" data-lights="${lights.join(' ')}" data-chord="${esc(s.chord.symbol)}">` +
        `<span class="seq-chord-name">${esc(s.chord.symbol)}</span>` +
        `<span class="seq-chord-keys">${parts.join(' + ') || '—'}</span>${offNote}</button>`;
    }).join('');
  }

  function drumChips(mapping, deviceId, song) {
    return mapping.voices.map((voice) => {
      const id = mapping.idsByVoice[voice];
      const where = deviceId === 'ep133'
        ? 'pad ' + EP_PAD_LABELS[Number(id.slice(1)) - 1]
        : esc(noteName(song, 53 + Number(id.slice(1)) + mapping.oct * 12));
      return `<button class="seq-chip" data-light="${id}" data-drum="${voice}">` +
        `<b>${where}</b><small>${DRUM_LABEL[voice]}</small></button>`;
    }).join('');
  }

  /* ------------------------------------------------------------ the view */

  function build(song, trackId, deviceId) {
    const isDrums = trackId === 'drums';
    let mapping;
    let svg;

    if (deviceId === 'ep133') {
      if (isDrums) {
        const voices = usedDrums(song);
        const padVoices = [];
        const idsByVoice = {};
        voices.forEach((v, i) => { padVoices[i] = v; idsByVoice[v] = 'p' + (i + 1); });
        mapping = { events: [], voices, padVoices, idsByVoice, padNotes: [], scale: null, scaleCode: '', scaleLabel: '', groupHint: 'A', usedPads: new Set() };
      } else {
        mapping = epMapping(song, trackId);
        mapping.groupHint = trackId === 'bass' ? 'B' : 'C';
        mapping.usedPads = new Set();
        let maxOct = 0;
        const consider = mapping.events.map((e) => e.midi)
          .concat(trackId === 'chords' ? [].concat.apply([], (song.spans || []).map((s) => s.voicing)) : []);
        consider.forEach((m) => {
          const info = mapping.idFor(m);
          if (info) { mapping.usedPads.add(info.pad); maxOct = Math.max(maxOct, info.oct); }
        });
        mapping.maxOct = maxOct;
      }
      svg = epSvg(song, trackId, mapping, isDrums);
    } else {
      if (isDrums) {
        const voices = usedDrums(song);
        const idsByVoice = {};
        const keyVoices = {};
        voices.forEach((v) => { idsByVoice[v] = 'k' + FM_DRUM_KEY[v]; keyVoices['k' + FM_DRUM_KEY[v]] = v; });
        mapping = { events: [], voices, idsByVoice, keyVoices, oct: 0, usedKeys: new Set(Object.keys(keyVoices)) };
      } else {
        mapping = fmMapping(song, trackId);
        mapping.usedKeys = new Set();
        const consider = mapping.events.map((e) => e.midi)
          .concat(trackId === 'chords' ? [].concat.apply([], (song.spans || []).map((s) => s.voicing)) : []);
        consider.forEach((m) => {
          const info = mapping.idFor(m);
          if (info) mapping.usedKeys.add(info.id);
        });
      }
      svg = fmSvg(song, trackId, mapping, isDrums);
    }

    const setup = deviceId === 'ep133' ? epSetup(song, trackId, mapping) : fmSetup(song, trackId, mapping);
    const chips = isDrums
      ? drumChips(mapping, deviceId, song)
      : trackId === 'chords'
        ? chordChips(song, mapping, deviceId)
        : pitchedChips(song, trackId, mapping, deviceId);

    return { song, trackId, deviceId, isDrums, mapping, svg, setup, chips };
  }

  /* Mount the view into the stage / setup / sequence containers and wire the
     hover-to-light and click-to-hear behaviour. Returns an updater that the
     playhead loop drives. */
  /* Everything here is scoped to the elements passed in — the faceplate is
     addressed through data-el attributes inside its own SVG, never through
     document ids — so a view can be mounted anywhere, and more than once.
     `setup` is optional: a caller that has nowhere to put the recipe simply
     leaves it out. */
  function mount(view, els) {
    const { song, trackId, deviceId, mapping, isDrums } = view;
    els.stage.innerHTML = view.svg;
    if (els.setup) {
      els.setup.innerHTML = view.setup.map((s, i) =>
        `<li><span class="step-n">${i + 1}</span><div><b>${s[0]}</b><p>${s[1]}</p></div></li>`).join('');
    }
    els.sequence.innerHTML = view.chips;
    els.sequence.classList.toggle('is-chords', trackId === 'chords');

    const svg = els.stage.querySelector('svg');
    const elFor = (id) => svg.querySelector(`[data-el="${id}"]`);
    const disp = {
      mode: elFor('disp-mode'), sub: elFor('disp-sub'), note: elFor('disp-note')
    };

    const device = DEVICES[deviceId];
    const track = TRACKS.find((item) => item.id === trackId);
    els.stage.setAttribute('role', 'img');
    els.stage.setAttribute('aria-label', `${device.label} faceplate set for ${track.label} in ` +
      `${song.key.rootName} ${song.scaleName} at ${song.bpm} BPM. The exact playable sequence follows.`);
    els.sequence.setAttribute('role', 'group');
    els.sequence.setAttribute('aria-label', `${track.label} playable sequence on ${device.label}`);
    if (disp.mode) {
      disp.mode.textContent = isDrums
        ? (deviceId === 'ep133' ? 'PADS · GRP A' : 'FM PERC')
        : deviceId === 'ep133'
          ? `KEYS · ${song.key.rootName} ${mapping.scaleLabel}`
          : `${song.key.rootName} ${song.scaleName}`.toUpperCase();
    }
    if (disp.sub) {
      disp.sub.textContent = deviceId === 'ep133'
        ? `${song.bpm} BPM · ${TRACKS.find((t) => t.id === trackId).label.toUpperCase()}`
        : (isDrums ? 'SHORT ENVELOPES' : `OCT ${mapping.oct > 0 ? '+' : ''}${mapping.oct} · ${trackId === 'chords' ? 'POLY' : 'MONO OK'}`);
    }

    let flashTimer = null;
    const setLit = (ids) => {
      svg.querySelectorAll('.lit').forEach((el) => el.classList.remove('lit'));
      ids.forEach((id) => { const el = elFor(id); if (el) el.classList.add('lit'); });
    };
    const flash = (ids, names) => {
      setLit(ids);
      if (disp.note) disp.note.textContent = names || '';
      if (flashTimer) clearTimeout(flashTimer);
      flashTimer = setTimeout(() => { setLit([]); if (disp.note) disp.note.textContent = ''; }, 450);
    };

    const patches = song.genre.patches || {};
    const patchFor = { melody: patches.lead, counter: patches.counter, chords: patches.chord, bass: patches.bass }[trackId];

    els.sequence.querySelectorAll('.seq-chip').forEach((chip) => {
      const id = chip.dataset.light;
      chip.addEventListener('mouseenter', () => { if (id) flash([id], chip.querySelector('small').textContent); });
      chip.addEventListener('click', () => {
        if (chip.dataset.drum) global.Engine.playDrum(chip.dataset.drum, 0, 0.9);
        else if (chip.dataset.midi) global.Engine.preview(Number(chip.dataset.midi), patchFor, 0.7, trackId);
        if (id) flash([id], chip.querySelector('small').textContent);
      });
    });
    els.sequence.querySelectorAll('.seq-chord').forEach((card, i) => {
      const ids = (card.dataset.lights || '').split(' ').filter(Boolean);
      card.addEventListener('mouseenter', () => flash(ids, card.dataset.chord));
      card.addEventListener('click', () => {
        const span = song.spans[i];
        if (span) global.Engine.preview(span.voicing.concat([span.bassMidi]), patches.chord, 1.1);
        flash(ids, card.dataset.chord);
      });
    });

    /* Pads and keys are playable straight off the faceplate too. */
    svg.querySelectorAll('[data-el^="p"], [data-el^="k"]').forEach((el) => {
      const id = el.dataset.el;
      if (!/^[pk]\d+$/.test(id)) return;
      el.addEventListener('click', () => {
        if (isDrums) {
          const voice = deviceId === 'ep133' ? mapping.padVoices[Number(id.slice(1)) - 1] : mapping.keyVoices[id];
          if (voice) { global.Engine.playDrum(voice, 0, 0.9); flash([id], DRUM_LABEL[voice]); }
        } else {
          const midi = deviceId === 'ep133'
            ? mapping.padNotes[Number(id.slice(1)) - 1]
            : 53 + Number(id.slice(1)) + mapping.oct * 12;
          if (midi !== undefined) { global.Engine.preview(midi, patchFor, 0.7, trackId); flash([id], noteName(song, midi)); }
        }
      });
    });

    /* ------------------------------------------------- playback lighting */

    const chipEls = Array.from(els.sequence.querySelectorAll('.seq-chip, .seq-chord'));
    let lastKey = '';

    function update(step) {
      if (step === null) {
        if (lastKey !== 'off') {
          lastKey = 'off';
          setLit([]);
          if (disp.note) disp.note.textContent = '';
          chipEls.forEach((c) => c.classList.remove('now'));
        }
        return;
      }
      const ids = [];
      const names = [];
      const activeChips = new Set();

      if (isDrums) {
        song.drums.forEach((hit) => {
          if (step >= hit.step && step < hit.step + 1.2) {
            const id = mapping.idsByVoice[hit.instrument];
            if (id) { ids.push(id); names.push(DRUM_LABEL[hit.instrument]); }
          }
        });
        chipEls.forEach((c) => { if (c.dataset.drum && names.indexOf(DRUM_LABEL[c.dataset.drum]) >= 0) activeChips.add(c); });
      } else {
        mapping.events.forEach((e, i) => {
          if (step >= e.start && step < e.start + e.dur) {
            const info = mapping.idFor(e.midi);
            if (info) { ids.push(info.id); names.push(noteName(song, e.midi)); }
          }
        });
        if (trackId === 'chords') {
          const active = song.spans.reduce((found, s, i) => (step >= s.start ? i : found), 0);
          if (chipEls[active]) activeChips.add(chipEls[active]);
        } else {
          let index = -1;
          mapping.events.forEach((e, i) => { if (step >= e.start && step < e.start + e.dur) index = i; });
          if (index >= 0 && chipEls[index]) activeChips.add(chipEls[index]);
        }
      }

      const key = ids.join(',');
      if (key !== lastKey) {
        lastKey = key;
        if (flashTimer) { clearTimeout(flashTimer); flashTimer = null; }
        setLit(ids);
        if (disp.note) {
          const unique = names.filter((n, i) => names.indexOf(n) === i);
          disp.note.textContent = unique.slice(0, 3).join(' ');
        }
        chipEls.forEach((c) => c.classList.toggle('now', activeChips.has(c)));
      }
    }

    return { update };
  }

  global.Devices = { TRACKS, DEVICES, DEFAULT_DEVICE, build, mount };
})(window);
