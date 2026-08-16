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

  /* A finger has no hover, but WebKit synthesises a mouseenter on tap and
     sends no matching mouseleave until you touch something else — so the
     preview highlight stays lit on whatever you last touched, and the display
     keeps printing its note. Binding the pair only where a real pointer can
     hover is the fix; touch already has the click path, which strikes the pad
     and releases on its own timer. */
  const HOVERS = typeof global.matchMedia === 'function'
    ? global.matchMedia('(hover: hover) and (pointer: fine)').matches
    : true;

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
    /* Velocity comes along. compose.js works it out for every note on every
       track — accents on the strong slots, ghosts between them — and this map
       used to drop it on the floor, which is why every pad lit at exactly the
       same brightness no matter how hard the part hits. It is the peak the pad
       decays from; the fallback only covers material that predates it. */
    return source.map((n) => ({
      start: n.start, dur: Math.max(1, Math.round(n.dur)), midi: n.midi, role: n.role || null,
      velocity: typeof n.velocity === 'number' ? n.velocity : 0.85
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

  /* ------------------------------------------------------- faceplate parts */

  /* Coordinates get two decimal places and no more. A 98.66666666666667 in an
     attribute is noise in the diff and noise in the DOM inspector, and no
     renderer can tell the difference. */
  const n2 = (v) => Math.round(v * 100) / 100;

  /* Every faceplate gets its own <defs>, and every id in it is namespaced with
     the mount's serial. Two faceplates are briefly in the tree together during a
     device cross-fade, and url(#pad-lit) resolves to the *first* matching id in
     the document — so a shared id would silently point the incoming unit's pads
     at the outgoing unit's gradient. */
  let faceSeq = 0;

  /* The whole reason the hardware used to read as a diagram rather than an
     object: there was not one gradient, filter, pattern or clip path anywhere in
     the app. Every fill was flat and nothing cast a shadow, so the device was
     printed on the panel instead of resting on it.

     Six of these are shared by both units and two differ, because a segment LCD
     and a colour TFT do not look alike — the LCD gets a dot matrix, the TFT gets
     a sharper non-dotted pixel grid and colder glass.

     One deliberate departure from §6.14: the cast filter hangs off the body rect
     rather than off a <g> wrapping the whole faceplate. The silhouette that
     should throw a shadow is the chassis, and filtering the group instead would
     re-rasterise all twelve pads, the keybed and the display on every frame of a
     lamp decay — the exact per-frame cost §5.7 rejects. Same shadow, one
     surface. */
  function defs(uid, isEp) {
    const grid = isEp
      /* 1x1 cells on a 2-unit pitch: the gaps *between* the dots are what the
         eye reads as a matrix. Near-black rather than #000 — nothing in this
         system is pure black. */
      ? `<pattern id="${uid}-grid" width="2" height="2" patternUnits="userSpaceOnUse">
           <rect class="g-dot" width="1" height="1"/></pattern>`
      : `<pattern id="${uid}-grid" width="3" height="3" patternUnits="userSpaceOnUse">
           <rect class="g-dot" width="1" height="3"/></pattern>`;

    return `<defs>
      <linearGradient id="${uid}-body" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" class="g-body-a"/><stop offset="1" class="g-body-b"/></linearGradient>
      <linearGradient id="${uid}-cap" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" class="g-cap-a"/><stop offset="1" class="g-cap-b"/></linearGradient>
      <linearGradient id="${uid}-glass" x1="0" y1="0" x2="0" y2="1" gradientTransform="rotate(12 .5 .5)">
        <stop offset="0" class="g-glass-a"/><stop offset=".34" class="g-glass-b"/></linearGradient>
      <radialGradient id="${uid}-ground">
        <stop offset="0" class="g-ground-a"/><stop offset="1" class="g-ground-b"/></radialGradient>
      <radialGradient id="${uid}-lit" cx=".5" cy=".42" r=".62">
        <stop offset="0" class="g-lit-a"/><stop offset="1" class="g-lit-b"/></radialGradient>
      <filter id="${uid}-cast" x="-12%" y="-8%" width="124%" height="122%">
        <feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity=".45"/>
        <feDropShadow dx="0" dy="22" stdDeviation="26" flood-opacity=".38"/></filter>
      <filter id="${uid}-bloom" x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="4" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      <filter id="${uid}-segbloom" x="-25%" y="-60%" width="150%" height="220%">
        <feGaussianBlur stdDeviation="2.2"/></filter>
      <filter id="${uid}-drop" x="-30%" y="-30%" width="160%" height="180%">
        <feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-opacity=".5"/></filter>
      ${grid}
    </defs>`;
  }

  /* How large one user unit of a mounted plate actually is, in CSS pixels.

     The two objects are drawn at very different unit densities — 356 units
     across the rig opening for the EP-133, 682 for the FM-1 — so a font-size
     written in user units renders at two different physical sizes on the two
     plates, and §3.8's table is a statement about the physical size ("7px on a
     plate that renders at a third of its layout width was never actually
     readable"). css/faceplate.css divides its target pixel size by this number
     to get the units that produce it, and clamps the answer to what the plate's
     own geometry can hold.

     A ResizeObserver rather than one measurement at mount, because the rig
     column is a clamp against the desk and changes at every breakpoint; and
     rather than a resize listener, because the column also changes when the
     desk re-grids for performance mode with no window resize behind it.
     min(w/vbW, h/vbH) rather than w/vbW alone: preserveAspectRatio letterboxes
     the drawing whenever the box and the viewBox disagree, which the short
     landscape layouts deliberately allow, and the smaller ratio is the one the
     glyphs are actually scaled by. Setting a font-size inside a viewBox cannot
     change the box being observed, so there is no feedback loop here to guard.

     Silent no-op where ResizeObserver is missing: faceplate.css's var()
     fallback of 1 reproduces the literal sizes the table was written as. */
  function watchScale(svg) {
    if (typeof global.ResizeObserver !== 'function') return null;
    const vb = (svg.getAttribute('viewBox') || '').split(/[\s,]+/);
    const vw = Number(vb[2]);
    const vh = Number(vb[3]);
    if (!(vw > 0) || !(vh > 0)) return null;
    let last = 0;
    const obs = new global.ResizeObserver((entries) => {
      const box = entries[0].contentRect;
      if (!box.width || !box.height) return;
      /* Three decimals is a tenth of a pixel on a 9px legend — finer than that
         is a style invalidation nobody can see. */
      const u = Math.round(Math.min(box.width / vw, box.height / vh) * 1000) / 1000;
      if (u === last) return;
      last = u;
      svg.style.setProperty('--dev-u', u);
    });
    obs.observe(svg);
    return obs;
  }

  /* A legend is printed *on* plastic. It gets a 0.4px duplicate of itself in the
     body colour at 35% behind it — a one-line emboss, which is the cheapest
     honest way to make ink sit on a surface rather than float above it.

     Data never gets this. The device's own permanent legends and Downbeat's
     generated instructions used to be identical in face, weight and fill, so the
     eye could not separate what the hardware says from what the app is telling
     you; the emboss plus the weight split (300 against 620) is that separation.

     Both copies are aria-hidden. A legend is silkscreen: the container already
     announces which device this is and each pad announces what it plays, so
     reading "teenage engineering · main · sample · tempo · groups" out loud
     before any of that is noise, not information. */
  function legend(cls, x, y, text, opts) {
    const o = opts || {};
    const attrs = (o.anchor ? ` text-anchor="${o.anchor}"` : '') + (o.extra || '') + ' aria-hidden="true"';
    return `<text class="${cls} legend-emboss" x="${x}" y="${n2(y + 0.4)}"${attrs}` +
      `${o.id ? ` data-el="${o.id}-e"` : ''}>${text}</text>` +
      `<text class="${cls}" x="${x}" y="${y}"${attrs}${o.id ? ` data-el="${o.id}"` : ''}>${text}</text>`;
  }

  /* A cap is a shape sitting in a well, lit from top-centre, and the four
     elements below are the whole material recipe: the recess it drops into, the
     cap itself on a two-stop gradient, a specular hairline along its top edge and
     an occlusion hairline where it meets the body. The tint and bar layers carry
     the used state as *opacity*, not as a fill swap, so they can be transitioned
     — a fill cannot cross-fade to a gradient. */
  function capLayers(x, y, w, h, uid, cls) {
    return `<rect class="${cls}-well" x="${n2(x - 1)}" y="${n2(y - 1)}" width="${n2(w + 2)}" height="${n2(h + 2)}" rx="9"/>` +
      `<rect class="${cls}-face" x="${n2(x)}" y="${n2(y)}" width="${n2(w)}" height="${n2(h)}" rx="8" fill="url(#${uid}-cap)"/>` +
      `<rect class="${cls}-tint" x="${n2(x)}" y="${n2(y)}" width="${n2(w)}" height="${n2(h)}" rx="8"/>` +
      `<rect class="${cls}-bar" x="${n2(x + 6)}" y="${n2(y + h - 4)}" width="${n2(w - 12)}" height="3" rx="1.5"/>` +
      `<rect class="${cls}-glow" x="${n2(x)}" y="${n2(y)}" width="${n2(w)}" height="${n2(h)}" rx="8" fill="url(#${uid}-lit)"/>` +
      `<path class="${cls}-spec" d="M${n2(x + 3)},${n2(y + 1.2)} h${n2(w - 6)}"/>` +
      `<path class="${cls}-occ" d="M${n2(x + 3)},${n2(y + h - 0.5)} h${n2(w - 6)}"/>` +
      ring(x, y, w, h, 8, cls);
  }

  /* The focus ring is its own element, drawn last, because every other layer on
     a cap is painted over the one below it: stroking the face rect puts the ring
     underneath the used tint and the hot core, so focusing a pad that happens to
     be played showed nothing at all. Invisible until :focus-visible, and never a
     hit target. */
  function ring(x, y, w, h, rx, cls) {
    return `<rect class="${cls}-ring dev-ring" x="${n2(x)}" y="${n2(y)}" ` +
      `width="${n2(w)}" height="${n2(h)}" rx="${rx}"/>`;
  }

  /* Four layers, because a backlit display is not a rectangle with text in it:
     a recess it is set into, the dot matrix, the segment bloom behind the glyphs
     and a sheen across the glass. The dot rect is painted *over* the text on the
     EP so the matrix breaks the glyphs the way a real segment LCD does.

     The note line gets a fifth thing: its own clipped group, so it can slot-cut
     (§5.6) — text that replaces text travels, it does not cross-fade. Without
     the clip the outgoing name would ride straight out of the glass and across
     the chassis, which is the one thing a display physically cannot do. The band
     covers the note row only, so the mode and status lines above it stay put; a
     whole display scrolling every time you brush a chip would be a slot machine,
     not a readout. */
  function displayLayers(x, y, w, h, uid, texts, band) {
    const r = 7;
    const dark = `M${x + 0.5},${n2(y + h - r)} V${y + r} Q${x + 0.5},${y + 0.5} ${x + r},${y + 0.5} H${n2(x + w - r)}`;
    const lite = `M${n2(x + w - 0.5)},${y + r} V${n2(y + h - r)} Q${n2(x + w - 0.5)},${n2(y + h - 0.5)} ${n2(x + w - r)},${n2(y + h - 0.5)} H${x + r}`;
    return `<rect class="lcd-face" x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"/>` +
      `<clipPath id="${uid}-noteclip">` +
        `<rect x="${x}" y="${band.y}" width="${w}" height="${band.h}"/></clipPath>` +
      `<g class="lcd-bloom" filter="url(#${uid}-segbloom)" aria-hidden="true">${texts.bloom}</g>` +
      texts.face +
      `<g class="lcd-note" data-el="note-slot" data-travel="${band.h}" clip-path="url(#${uid}-noteclip)">` +
        `<g class="lcd-bloom" filter="url(#${uid}-segbloom)" aria-hidden="true">${texts.noteBloom}</g>` +
        texts.noteFace + '</g>' +
      `<rect class="lcd-dots" x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="url(#${uid}-grid)"/>` +
      `<rect class="lcd-glass" x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="url(#${uid}-glass)"/>` +
      `<path class="lcd-recess-dark" d="${dark}"/><path class="lcd-recess-lite" d="${lite}"/>`;
  }

  /* ------------------------------------------------------ EP-133 faceplate */

  /* One module, and every horizontal coordinate on the plate derives from it.
     Before this the K.O. II had three different right margins (334, 336, 338),
     two different gutters (6 and 10) and a function-key row that did not line up
     with the pad columns it labels. Nobody can name that drift on sight, but
     everybody reads it as "drawn" rather than "photographed", and no amount of
     optical correction rescues geometry that is mathematically wrong. */
  const EP = { M: 20, W: 316, COLS: 3, GAP: 10 };
  EP.PAD_W = (EP.W - EP.GAP * (EP.COLS - 1)) / EP.COLS;   /* 98.67 */
  EP.R = EP.M + EP.W;                                     /* 336 — the one right edge */
  const epCol = (i) => EP.M + i * (EP.PAD_W + EP.GAP);

  const EP_PAD_GRID = { y: 196, h: 56, gapY: 9, w: EP.PAD_W };
  /* Four group buttons on the same module, four-up instead of three. They used
     to be a column beside the pads, which is what forced the pad grid off the
     module in the first place. */
  const EP_GROUP = { y: 158, h: 20, w: (EP.W - EP.GAP * 3) / 4 };

  function epPadRect(pad) {
    /* Pad 1 sits bottom left; numbers climb left-to-right, bottom-to-top. */
    const col = (pad - 1) % 3;
    const row = 3 - Math.floor((pad - 1) / 3);
    return { x: epCol(col), y: EP_PAD_GRID.y + row * (EP_PAD_GRID.h + EP_PAD_GRID.gapY) };
  }

  /* What a given pad says, in one place, so the initial markup and every later
     repaint cannot drift apart. */
  function epPadContent(song, mapping, isDrums, pad) {
    const label = EP_PAD_LABELS[pad - 1];
    if (isDrums) {
      const voice = mapping.padVoices[pad - 1];
      return voice
        ? { main: DRUM_LABEL[voice], sub: 'GROUP A', used: true, live: true, aria: `Pad ${label}, ${DRUM_LABEL[voice]}` }
        : { main: '', sub: '', used: false, live: false, aria: `Pad ${label}, no voice loaded` };
    }
    const m = mapping.padNotes[pad - 1];
    if (m === undefined) return { main: '', sub: '', used: false, live: false, aria: `Pad ${label}, unassigned` };
    const name = noteName(song, m);
    /* Degrees are counted from the root, which is three pads up the run — so the
       bottom three read as the degrees below it. */
    const rel = (pad - 1) - EP_ROOT_INDEX;
    const size = mapping.scale ? song.key.scalePcs.length : 12;
    const deg = mod(rel, size);
    const sub = deg === 0 ? 'root' : 'deg ' + (deg + 1);
    const used = mapping.usedPads.has(pad);
    return { main: name, sub, used, live: true,
      aria: `Pad ${label}, ${name}, ${sub}${used ? ', played in this part' : ''}` };
  }

  function epSvg(song, trackId, mapping, isDrums, uid) {
    const fnKey = (col, y, label, id, on) => {
      const x = epCol(col);
      return `<g class="dev-key${on ? ' is-on' : ''}"${id ? ` data-el="${id}"` : ''} aria-hidden="true">` +
        `<rect x="${n2(x)}" y="${y}" width="${n2(EP.PAD_W)}" height="22" rx="4"/>` +
        legend('dev-fn', n2(x + EP.PAD_W / 2), y + 14.5, label, { anchor: 'middle' }) + '</g>';
    };

    const knob = (cx, cy, label, id) =>
      `<g class="dev-knob"${id ? ` data-el="${id}"` : ''} aria-hidden="true">` +
      `<circle cx="${cx}" cy="${cy}" r="13"/>` +
      `<line x1="${cx}" y1="${cy - 4}" x2="${cx}" y2="${cy - 11}"/>` +
      legend('dev-knob-cap', cx, cy + 26, label, { anchor: 'middle' }) + '</g>';

    let pads = '';
    let glows = '';
    for (let pad = 1; pad <= 12; pad++) {
      const { x, y } = epPadRect(pad);
      const c = epPadContent(song, mapping, isDrums, pad);
      const w = EP_PAD_GRID.w;
      const h = EP_PAD_GRID.h;
      /* Reading order, not pad order. The tint arrives from the top-left corner
         of the grid and travels down and across, which is the direction the eye
         is already moving; pad 1 is bottom-left, so its number is no use here. */
      const readingIndex = (3 - Math.floor((pad - 1) / 3)) * 3 + ((pad - 1) % 3);
      glows += `<rect class="pad-glow-b" data-glow="p${pad}" x="${n2(x)}" y="${y}" ` +
        `width="${n2(w)}" height="${h}" rx="8" fill="url(#${uid}-lit)"/>`;
      pads +=
        /* A pad with nothing under it stays focusable and announces why, per
           §9.6 — a control removed from the tab order is a control the keyboard
           user has to guess the absence of. It is not dimmed: on the real unit
           an empty pad looks exactly like a loaded one, and greying it out would
           be the diagram creeping back in. */
        `<g class="dev-pad${c.used ? ' used' : ''}" data-el="p${pad}" data-pad="${pad}" ` +
        `style="--pad-i:${readingIndex}" role="button" tabindex="0"` +
        `${c.live ? '' : ' aria-disabled="true"'} aria-label="${esc(c.aria)}">` +
        capLayers(x, y, w, h, uid, 'pad') +
        `<text class="pad-id" x="${n2(x + 8)}" y="${y + 15}">${esc(EP_PAD_LABELS[pad - 1])}</text>` +
        `<text class="pad-main" x="${n2(x + w / 2)}" y="${y + 35}">${esc(c.main)}</text>` +
        `<text class="pad-sub" x="${n2(x + w / 2)}" y="${y + 47}">${esc(c.sub)}</text></g>`;
    }

    const groups = ['A', 'B', 'C', 'D'].map((letter, i) => {
      const x = EP.M + i * (EP_GROUP.w + EP.GAP);
      const on = isDrums ? letter === 'A' : letter === mapping.groupHint;
      return `<g class="dev-key dev-group${on ? ' is-on' : ''}" data-el="grp-${letter}" aria-hidden="true">` +
        `<rect x="${n2(x)}" y="${EP_GROUP.y}" width="${n2(EP_GROUP.w)}" height="${EP_GROUP.h}" rx="5"/>` +
        legend('dev-group-id', n2(x + EP_GROUP.w / 2), EP_GROUP.y + 14, letter, { anchor: 'middle' }) + '</g>';
    }).join('');

    /* The segment text is drawn twice: once through the bloom filter and once
       crisp on top. Both copies carry a data-el so a repaint keeps them in step.
       .seg-right is end-anchored, and SVG leaves the final glyph's letter-spacing
       hanging past the anchor, so it is nudged back by dx="1.5". */
    /* Three baselines, not two-plus-a-column. A three-note chord readback and a
       "120 BPM · MELODY" status line will not both fit on one row of a 230 unit
       display, and the note is the line you actually read mid-take, so it gets
       the bottom of the glass to itself — and its own clipped group, so it can
       slot. */
    const segs = (bloom) => {
      const s = bloom ? ' seg-bloom' : '';
      const b = bloom ? '-b' : '';
      return `<text class="seg seg-left${s}" x="32" y="51" data-el="disp-mode${b}"></text>` +
        `<text class="seg seg-left seg-dim${s}" x="32" y="66" data-el="disp-sub${b}"></text>`;
    };
    /* SVG hangs the letter-spacing off the *last* glyph too, so an end-anchored
       run of tracked text sits a full track short of where it looks like it
       should. dx pushes it back: .145em of the 15-unit note line is 2.2. */
    const segNote = (bloom) =>
      `<text class="seg seg-right${bloom ? ' seg-bloom' : ''}" x="238" y="79" text-anchor="end" ` +
      `dx="2.2" data-el="disp-note${bloom ? '-b' : ''}"></text>`;

    return `<svg class="dev-svg dev-ep" viewBox="0 0 356 540">
      ${defs(uid, true)}
      <ellipse class="dev-ground" cx="178" cy="502" rx="187" ry="20" fill="url(#${uid}-ground)"/>
      <rect class="dev-body" x="2" y="2" width="352" height="492" rx="16"
            fill="url(#${uid}-body)" filter="url(#${uid}-cast)"/>
      <g class="dev-face">
        ${legend('dev-brand', EP.M, 26, 'teenage engineering')}
        ${legend('dev-model', EP.R, 26, 'EP-133 K.O. II', { anchor: 'end' })}
        <g class="dev-display" aria-hidden="true">
          ${displayLayers(EP.M, 34, 230, 50, uid,
            { bloom: segs(true), face: segs(false), noteBloom: segNote(true), noteFace: segNote(false) },
            { y: 67, h: 17 })}
        </g>
        ${knob(280, 54, 'a', 'knob-a')} ${knob(322, 54, 'b', 'knob-b')}
        ${fnKey(0, 92, 'main')} ${fnKey(1, 92, 'sample')} ${fnKey(2, 92, 'tempo')}
        ${fnKey(0, 120, 'keys', 'fn-keys', !isDrums)} ${fnKey(1, 120, 'fx')}
        ${fnKey(2, 120, 'timing', 'fn-timing', trackId === 'chords')}
        ${legend('dev-hintline', EP.M, 151, 'groups')}
        ${groups}
        ${legend('dev-hintline', EP.M, 191,
          isDrums ? 'pads — one voice each' : 'pads — root on 1, scale climbs to 9', { id: 'hint-pads' })}
        <g class="pad-glows" filter="url(#${uid}-bloom)" aria-hidden="true">${glows}</g>
        <g class="dev-pads">${pads}</g>
        <g class="dev-key" data-el="key-minus" aria-hidden="true">
          <rect x="20" y="458" width="26" height="21" rx="4"/>${legend('dev-fn', 33, 472, '−', { anchor: 'middle' })}</g>
        <g class="dev-key" data-el="key-plus" aria-hidden="true">
          <rect x="52" y="458" width="26" height="21" rx="4"/>${legend('dev-fn', 65, 472, '+', { anchor: 'middle' })}</g>
        <g class="dev-fader" aria-hidden="true"><rect class="fader-track" x="96" y="464" width="150" height="9" rx="4.5"/>
          <rect class="fader-cap" x="150" y="458" width="26" height="21" rx="4"/></g>
        <g class="dev-key" aria-hidden="true"><rect x="262" y="458" width="44" height="21" rx="4"/>
          ${legend('dev-fn', 284, 472, 'play', { anchor: 'middle' })}</g>
        <g class="dev-key dev-rec" aria-hidden="true"><rect x="310" y="458" width="26" height="21" rx="4"/>
          <circle class="rec-dot" cx="323" cy="468.5" r="4"/></g>
      </g>
    </svg>`;
  }

  /* ------------------------------------------------------- FM-1 faceplate */

  /* 27 silicone keys, F3 to G5. White keys are drawn first, black keys on
     top; each carries data-el="k<index>" where index is semitones above F3. */
  const FM_WHITE = [0, 2, 4, 6, 7, 9, 11, 12, 14, 16, 18, 19, 21, 23, 24, 26];
  const FM_BLACK = [1, 3, 5, 8, 10, 13, 15, 17, 20, 22, 25];

  /* One module, same discipline as the EP. The FM-1 had left edges at 19 and 35
     and right edges at 657, 663 and 667 — three of them, on a panel whose whole
     visual argument is that it is a single extruded object. */
  const FM = { M: 19, R: 663 };
  FM.W = FM.R - FM.M;                 /* 644 */
  FM.KEY_W = FM.W / 16;               /* 40.25 — sixteen white keys, edge to edge */
  const FM_KEY_Y = 190;
  const FM_BKEY_W = 25;

  /* Black keys dead-centred on every seam is the classic tell of a drawn
     keyboard; a musician clocks it before they have looked at anything else. On
     a real instrument the white-key tails either side of a black key are equal,
     which pushes the outer black keys of each group outward and leaves only the
     middle one of the three-key group on its seam. Offsets are in units of a
     40.25-wide white key and scale with it. */
  const FM_BLACK_OFFSET = { 1: -4, 3: 0, 5: 4, 8: -3, 10: 3 };
  const fmBlackShift = (idx) => (FM_BLACK_OFFSET[mod(idx, 12)] || 0) * (FM.KEY_W / 40.25);

  function fmKeyContent(song, mapping, isDrums, idx) {
    const id = 'k' + idx;
    const used = mapping.usedKeys.has(id);
    if (isDrums) {
      const voice = mapping.keyVoices[id];
      return { main: voice ? DRUM_LABEL[voice] : '', used, live: !!voice,
        aria: `Key ${idx + 1}${voice ? ', ' + DRUM_LABEL[voice] : ', no voice'}` };
    }
    const midi = 53 + idx + mapping.oct * 12;
    const name = noteName(song, midi);
    /* Every C is named whether it is played or not — that is how you find your
       place on a keybed — and every key the part actually uses names itself. */
    const show = mod(midi, 12) === 0 || used;
    return { main: show ? name : '', used, live: true,
      aria: `Key ${idx + 1}, ${name}${used ? ', played in this part' : ''}` };
  }

  function fmSvg(song, trackId, mapping, isDrums, uid) {
    const knob = (cx, cy, label, small) => {
      const r = small ? 11 : 13;
      return `<g class="dev-knob" aria-hidden="true"><circle cx="${cx}" cy="${cy}" r="${r}"/>` +
        `<line x1="${cx}" y1="${cy - 3}" x2="${cx}" y2="${cy - (small ? 9 : 11)}"/>` +
        legend('dev-knob-cap', cx, cy + (small ? 24 : 26), label, { anchor: 'middle' }) + '</g>';
    };

    const whiteIndexOf = {};
    FM_WHITE.forEach((idx, i) => { whiteIndexOf[idx] = i; });

    let whites = '';
    let blacks = '';
    /* Two bloom layers rather than one, because the keybed is two planes: a
       white key's spill has to sit under the white bed and a black key's has to
       sit over it. One shared layer would bury every black-key bloom under the
       naturals it is supposed to be floating above. */
    let glowsW = '';
    let glowsB = '';
    FM_WHITE.forEach((idx, i) => {
      /* 0.75 off each side turns the shared edge between two keys into a real
         1.5px dark gap, which is the only reason a white keybed reads as
         separate keys rather than as one striped panel. */
      const x = FM.M + i * FM.KEY_W + 0.75;
      const w = FM.KEY_W - 1.5;
      const h = 114;
      const c = fmKeyContent(song, mapping, isDrums, idx);
      glowsW += `<rect class="key-glow-b" data-glow="k${idx}" x="${n2(x)}" y="${FM_KEY_Y}" ` +
        `width="${n2(w)}" height="${h}" rx="4" fill="url(#${uid}-lit)"/>`;
      whites += `<g class="dev-wkey${c.used ? ' used' : ''}" data-el="k${idx}" style="--pad-i:${i}" ` +
        `role="button" tabindex="0"${c.live ? '' : ' aria-disabled="true"'} aria-label="${esc(c.aria)}">` +
        `<rect class="wkey-face" x="${n2(x)}" y="${FM_KEY_Y}" width="${n2(w)}" height="${h}" rx="4" fill="url(#${uid}-cap)"/>` +
        `<rect class="wkey-tint" x="${n2(x)}" y="${FM_KEY_Y}" width="${n2(w)}" height="${h}" rx="4"/>` +
        `<rect class="wkey-bar" x="${n2(x + 4)}" y="${FM_KEY_Y + 101}" width="${n2(w - 8)}" height="3" rx="1.5"/>` +
        `<rect class="wkey-glow" x="${n2(x)}" y="${FM_KEY_Y}" width="${n2(w)}" height="${h}" rx="4" fill="url(#${uid}-lit)"/>` +
        /* A 4px front chamfer with a 1px highlight above it: the lip you see on
           the front edge of every real key, and the thing that tells you the key
           has thickness rather than being a painted rectangle. */
        `<path class="wkey-chamfer" d="M${n2(x)},${FM_KEY_Y + 110} h${n2(w)} a4,4 0 0 1 -4,4 h${n2(-(w - 8))} a4,4 0 0 1 -4,-4 Z"/>` +
        `<path class="wkey-lip" d="M${n2(x + 2)},${FM_KEY_Y + 109.5} h${n2(w - 4)}"/>` +
        `<text class="wkey-name" x="${n2(x + w / 2)}" y="${FM_KEY_Y + 96}">${esc(c.main)}</text>` +
        ring(x, FM_KEY_Y, w, h, 4, 'wkey') + '</g>';
    });
    FM_BLACK.forEach((idx) => {
      const seam = FM.M + (whiteIndexOf[idx - 1] + 1) * FM.KEY_W;
      const x = seam + fmBlackShift(idx) - FM_BKEY_W / 2;
      const c = fmKeyContent(song, mapping, isDrums, idx);
      glowsB += `<rect class="key-glow-b" data-glow="k${idx}" x="${n2(x)}" y="${FM_KEY_Y}" ` +
        `width="${FM_BKEY_W}" height="70" rx="3" fill="url(#${uid}-lit)"/>`;
      blacks += `<g class="dev-bkey${c.used ? ' used' : ''}" data-el="k${idx}" ` +
        `style="--pad-i:${whiteIndexOf[idx - 1]}" role="button" tabindex="0"` +
        `${c.live ? '' : ' aria-disabled="true"'} aria-label="${esc(c.aria)}">` +
        `<rect class="bkey-face" x="${n2(x)}" y="${FM_KEY_Y}" width="${FM_BKEY_W}" height="70" rx="3"/>` +
        `<rect class="bkey-tint" x="${n2(x)}" y="${FM_KEY_Y}" width="${FM_BKEY_W}" height="70" rx="3"/>` +
        `<rect class="bkey-glow" x="${n2(x)}" y="${FM_KEY_Y}" width="${FM_BKEY_W}" height="70" rx="3" fill="url(#${uid}-lit)"/>` +
        `<path class="bkey-lip" d="M${n2(x + 3)},${FM_KEY_Y + 1.2} h${FM_BKEY_W - 6}"/>` +
        ring(x, FM_KEY_Y, FM_BKEY_W, 70, 3, 'bkey') + '</g>';
    });

    /* Seven function keys across the module: gap 6, so the row starts at 19 and
       finishes at 663 like everything else on the plate. */
    const FN_GAP = 6;
    const FN_W = (FM.W - FN_GAP * 6) / 7;
    const fnKey = (i, y, label, id, on) => {
      const x = FM.M + i * (FN_W + FN_GAP);
      return `<g class="dev-key${on ? ' is-on' : ''}"${id ? ` data-el="${id}"` : ''} aria-hidden="true">` +
        `<rect x="${n2(x)}" y="${y}" width="${n2(FN_W)}" height="19" rx="9.5"/>` +
        legend('dev-fn', n2(x + FN_W / 2), y + 13, label, { anchor: 'middle' }) + '</g>';
    };

    const row1 = ['fx', 'sel', 'env', 'lfo', 'edit', 'glo', 'home·bt'];
    const row2 = ['save', 'arp', 'seq', 'play', 'rec', 'oct−', 'oct+'];
    let fns = '';
    row1.forEach((label, i) => { fns += fnKey(i, 132, label, null, false); });
    row2.forEach((label, i) => {
      const id = label === 'oct−' ? 'oct-down' : label === 'oct+' ? 'oct-up' : null;
      const on = (label === 'oct−' && mapping.oct < 0) || (label === 'oct+' && mapping.oct > 0);
      fns += fnKey(i, 158, label, id, on);
    });

    const tftX = (FM.M + FM.R) / 2 - 82;
    const tfts = (bloom) => {
      const s = bloom ? ' seg-bloom' : '';
      const b = bloom ? '-b' : '';
      return `<text class="tft t1${s}" x="${tftX + 12}" y="62" data-el="disp-mode${b}"></text>` +
        `<text class="tft t2${s}" x="${tftX + 12}" y="80" data-el="disp-sub${b}"></text>`;
    };
    const tftNote = (bloom) =>
      `<text class="tft t3${bloom ? ' seg-bloom' : ''}" x="${tftX + 12}" y="100" ` +
      `data-el="disp-note${bloom ? '-b' : ''}"></text>`;

    return `<svg class="dev-svg dev-fm" viewBox="0 0 682 366">
      ${defs(uid, false)}
      <ellipse class="dev-ground" cx="341" cy="328" rx="359" ry="20" fill="url(#${uid}-ground)"/>
      <rect class="dev-body" x="2" y="2" width="678" height="318" rx="16"
            fill="url(#${uid}-body)" filter="url(#${uid}-cast)"/>
      <g class="dev-face">
        ${legend('dev-brand', FM.M, 26, 'M-VAVE')}
        ${legend('dev-model', 82, 26, 'FM-1 · 6-OP FM')}
        ${knob(32, 74, 'master')} ${knob(96, 74, 'select')} ${knob(160, 74, 'presets')} ${knob(224, 74, 'algo')}
        <g class="dev-display dev-tft" aria-hidden="true">
          ${displayLayers(tftX, 40, 164, 74, uid,
            { bloom: tfts(true), face: tfts(false), noteBloom: tftNote(true), noteFace: tftNote(false) },
            { y: 89, h: 16 })}
        </g>
        ${knob(484, 74, 'knob 1', true)} ${knob(540, 74, 'knob 2', true)}
        ${knob(596, 74, 'knob 3', true)} ${knob(652, 74, 'knob 4', true)}
        ${fns}
        <g class="key-glows" filter="url(#${uid}-bloom)" aria-hidden="true">${glowsW}</g>
        <g class="dev-wkeys">${whites}</g>
        <g class="key-glows" filter="url(#${uid}-bloom)" aria-hidden="true">${glowsB}</g>
        <g class="dev-bkeys" filter="url(#${uid}-drop)">${blacks}</g>
      </g>
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

  /* A chip carries the two things the rest of §7.5 has to read off it without
     going back through the DOM: which pad it names, and what that pad is called
     on the glass. Scraping the second line for the name looked equivalent and
     was not — on the FM-1 that line reads "key 12 · lead", so the display
     printed the caption instead of the note, and ui.js rewrites the same line
     again for an out-of-range chip.

     A note with no pad under it is not a control. There is nothing on the
     hardware to press and nothing an audition could demonstrate, so it takes
     aria-disabled: it keeps its place and its full contrast because it is the
     one chip in the run that needs acting on (§6.13), it stays focusable so the
     fix on its second line can be read, and it answers on the glass when you
     activate it — but it stops claiming to be pressable. That is exactly the
     bargain the empty pad already makes at the other end of the chain. */
  function chipHTML(idInfo, main, sub, name, extra) {
    const off = !idInfo;
    const light = idInfo ? ` data-light="${idInfo.id}"` : '';
    const up = idInfo && idInfo.oct > 0 ? '<i class="chip-oct">↑</i>' : '';
    return `<button class="seq-chip${off ? ' is-off' : ''}"${light}` +
      ` data-name="${name}"${off ? ' aria-disabled="true"' : ''}${extra || ''}>` +
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
      html += chipHTML(info, main, sub, esc(noteName(song, e.midi)), ` data-midi="${e.midi}"`);
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
      return `<button class="seq-chip" data-light="${id}" data-drum="${voice}" ` +
        `data-name="${DRUM_LABEL[voice]}">` +
        `<b>${where}</b><small>${DRUM_LABEL[voice]}</small></button>`;
    }).join('');
  }

  /* ------------------------------------------------------------ the view */

  function build(song, trackId, deviceId) {
    const isDrums = trackId === 'drums';
    let mapping;

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
    }

    const setup = deviceId === 'ep133' ? epSetup(song, trackId, mapping) : fmSetup(song, trackId, mapping);
    const chips = isDrums
      ? drumChips(mapping, deviceId, song)
      : trackId === 'chords'
        ? chordChips(song, mapping, deviceId)
        : pitchedChips(song, trackId, mapping, deviceId);

    /* The SVG is a function rather than a string now, and it is only ever called
       when a faceplate is actually created — which is once per device, not once
       per part switch. Its ids have to be namespaced to the mount that owns
       them, and the mount does not exist yet at build time. */
    const render = (uid) => (deviceId === 'ep133'
      ? epSvg(song, trackId, mapping, isDrums, uid)
      : fmSvg(song, trackId, mapping, isDrums, uid));

    return { song, trackId, deviceId, isDrums, mapping, render, setup, chips };
  }

  /* ------------------------------------------------------ the live faceplate */

  /* Text on the plate exists in up to three copies: the crisp glyph, a 0.4px
     emboss duplicate behind it (legends) and a blurred duplicate behind it (the
     display). They are all one string, so they are all written at once — a
     repaint that updates two of the three is how you get a ghost of the previous
     note hanging behind the current one. */
  function setText(face, id, text) {
    ['', '-b', '-e'].forEach((suffix) => {
      const el = face.refs.get(id + suffix);
      if (el) el.textContent = text;
    });
  }

  function toggleOn(face, id, on) {
    const el = face.refs.get(id);
    if (el) el.classList.toggle('is-on', on);
  }

  /* Three different things can light a pad and they are deliberately not the
     same event, which is the whole of §7.2 and §7.5:

       play — the transport, at the note's own velocity. A strike.
       tap  — a click or Enter on the hardware or on a run chip, at 1.0. A
              strike, and a louder one than most of what plays.
       hold — a hover. A *preview* at .55, held for exactly as long as the
              pointer is there, so the chip, the pad and the display read as one
              object rather than as three things that flashed near each other.

     A strike attacks in 40ms and decays on the beat; a preview arrives in 110ms
     and simply stays. Getting those two the same is how a preview ends up
     feeling like a note you played by accident. A strike over a held preview
     falls back to .55 rather than to black, so brushing a chip and clicking it
     is one continuous gesture. */
  function litFor(face, id) {
    const hit = face.play[id] !== undefined ? face.play[id]
      : face.tap[id] !== undefined ? face.tap[id] : undefined;
    const hold = face.hold[id];
    return { hit, hold: hold === undefined ? 0 : hold };
  }

  /* --lit is registered `inherits:false`, deliberately — an inherited numeric
     property written twelve times a bar would invalidate every descendant of the
     pad. The cost is that the value has to be written onto each of the three
     nodes that read it rather than onto a common parent. */
  function paintLamps(face) {
    const token = ++face.token;
    let struck = false;

    face.lamps.forEach((nodes, id) => {
      const v = litFor(face, id);
      const level = v.hit === undefined ? v.hold : v.hit;
      if (v.hit !== undefined) struck = true;
      nodes.forEach((node) => {
        if (v.hit !== undefined) {
          node.removeAttribute('data-preview');
          node.setAttribute('data-struck', '');
        } else {
          node.removeAttribute('data-struck');
          if (v.hold) node.setAttribute('data-preview', '');
          else node.removeAttribute('data-preview');
        }
        node.style.setProperty('--lit', level.toFixed(2));
      });
    });

    if (face.raf) global.cancelAnimationFrame(face.raf);
    face.raf = 0;
    if (!struck) return;
    /* Two frames, because the attack has to be committed as a style change
       before the release can be a second one. If rAF never runs — a background
       tab — the pad simply holds at its peak until the next change, which is the
       old behaviour and not a broken one. */
    face.raf = global.requestAnimationFrame(() => {
      face.raf = global.requestAnimationFrame(() => {
        face.raf = 0;
        if (face.token !== token) return;
        face.lamps.forEach((nodes, id) => {
          const rest = face.hold[id] === undefined ? 0 : face.hold[id];
          nodes.forEach((node) => {
            if (!node.hasAttribute('data-struck')) return;
            node.removeAttribute('data-struck');
            if (rest) node.setAttribute('data-preview', '');
            node.style.setProperty('--lit', rest.toFixed(2));
          });
        });
      });
    });
  }

  /* The note line slot-cuts (§5.6): the outgoing name rides up out of the glass
     and the incoming one rises into it. Text that replaces text travels — a
     character shuffle is a keygen effect and §5.9 rejects it by name.

     Only for a read-back. During playback the note line changes on every event
     and a display that slotted eight times a second would be unreadable and
     would allocate two animations a beat for the length of a song, so the
     transport writes it straight. */
  function setNote(face, text, animate) {
    const next = text == null ? '' : String(text);
    /* Compared against the intended value, not against what is currently in the
       DOM: for the 130ms the outgoing name is riding up, the element still holds
       the *old* string, and reading that is how a fast hover-out-hover-in ends
       up cancelling itself and leaving a name on the glass with nothing under
       the pointer. */
    if (face.noteText === next) return;
    face.noteText = next;

    if (face.slotTimer) { clearTimeout(face.slotTimer); face.slotTimer = null; }
    if (face.slotAnim) { face.slotAnim.cancel(); face.slotAnim = null; }

    const g = face.noteGroup;
    const M = global.Motion;
    if (!animate || !g || typeof g.animate !== 'function' || !M || M.reduced()) {
      setText(face, 'disp-note', next);
      return;
    }
    const d = face.noteTravel;
    face.slotAnim = g.animate(
      [{ transform: 'translateY(0)' }, { transform: 'translateY(' + (-d) + 'px)' }],
      { duration: 130, easing: M.EASE.close, fill: 'forwards' });
    face.slotTimer = setTimeout(() => {
      face.slotTimer = null;
      setText(face, 'disp-note', next);
      if (face.slotAnim) { face.slotAnim.cancel(); face.slotAnim = null; }
      g.animate([{ transform: 'translateY(' + d + 'px)' }, { transform: 'translateY(0)' }],
        { duration: 240, easing: M.EASE.detent });
    }, 130);
  }

  /* What the glass says, in priority order. The transport owns the line while it
     is running — hijacking it on hover mid-take would be taking the readout away
     from the only thing that needs it. */
  function paintNote(face) {
    if (face.driven) { setNote(face, face.playName, false); return; }
    setNote(face, face.tapName || face.holdName || '', true);
  }

  function paint(face) {
    paintLamps(face);
    paintNote(face);
  }

  /* Build the faceplate for a device exactly once and keep it. The old code did
     `stage.innerHTML = svg` on every part switch, every device switch and every
     breakpoint cross — tearing the hero down five times as you tab through the
     parts, mid-playback, discarding every lit pad and showing an unstyled frame
     while the new markup found its stylesheet. A part switch now touches text
     content and two class lists. */
  function ensureFace(host, view) {
    const existing = host._dbFace;
    if (existing && existing.deviceId === view.deviceId && existing.svg.parentNode === host) {
      return existing;
    }

    const uid = 'dv' + (++faceSeq);
    const holder = document.createElement('div');
    holder.innerHTML = view.render(uid);
    const svg = holder.firstElementChild;
    const old = existing ? existing.svg : host.querySelector('svg');
    /* The outgoing plate stops being measured before the incoming one starts.
       An observer left on a node the swap is about to remove is a callback
       firing against a detached element for the length of the session. */
    if (existing && existing.scaleObs) existing.scaleObs.disconnect();

    /* The incoming plate goes in first, so anything that asks the stage for
       "the" SVG — the phone crop in ui.js does — gets the one that is arriving
       rather than the one on its way out. Device switch is the one case that is
       allowed to replace the faceplate, and even that cross-fades.

       143, not the 130 Motion.swap defaults to. §5.3's rule is one number for
       the whole app — an exit is 0.55 of its own entrance — and 130 is half of
       260, which is a different, invisible-looking ratio that nonetheless makes
       this the one dismissal in Downbeat leaving on a clock nothing else uses.
       The value is written here rather than argued for in the helper because
       this is the only caller that names its durations. */
    host.insertBefore(svg, host.firstChild);
    if (old) {
      old.style.pointerEvents = 'none';
      if (global.Motion) global.Motion.swap(old, svg, { in: 260, out: 143 });
      else if (old.parentNode) old.parentNode.removeChild(old);
    }

    const face = {
      uid, svg, host, deviceId: view.deviceId,
      refs: new Map(), lamps: new Map(),
      current: null, token: 0, raf: 0,
      /* Three independent light sources and the display line each owns. */
      play: {}, tap: {}, hold: {},
      playName: '', tapName: '', holdName: '',
      driven: false, tapTimer: null, slotTimer: null, slotAnim: null,
      noteText: '', noteGroup: null, noteTravel: 0
    };
    face.scaleObs = watchScale(svg);
    svg.querySelectorAll('[data-el]').forEach((el) => face.refs.set(el.dataset.el, el));
    face.noteGroup = face.refs.get('note-slot') || null;
    face.noteTravel = face.noteGroup ? Number(face.noteGroup.dataset.travel) || 16 : 0;

    /* A lit pad is three nodes, and that is a consequence of --lit being
       registered `inherits:false`: the group (which carries the depression), the
       hot-core rect inside it (which carries the fill) and its twin out in the
       bloom layer (which carries the spill). A non-inheriting property does not
       reach a child, so the value is written to each of them rather than to a
       common parent — which is the right trade, because an inherited number
       written twelve times a bar would invalidate style for every node under it.

       The bloom filter is on that layer once, never on a pad: twelve per-pad
       filters is twelve extra raster surfaces on every frame of a decay. */
    const halos = new Map();
    svg.querySelectorAll('[data-glow]').forEach((el) => halos.set(el.dataset.glow, el));
    face.refs.forEach((el, id) => {
      if (!/^[pk]\d+$/.test(id)) return;
      const nodes = [el];
      const core = el.querySelector('.pad-glow, .wkey-glow, .bkey-glow');
      if (core) nodes.push(core);
      const halo = halos.get(id);
      if (halo) nodes.push(halo);
      face.lamps.set(id, nodes);
    });

    /* The preview. Held, not flashed: it lasts exactly as long as the pointer
       does. .55 against the 1.0 of a real hit, so the two can never read as the
       same event — one is what the pad *would* do, the other is what it just
       did. */
    face.preview = (ids, name) => {
      face.hold = {};
      (ids || []).forEach((id) => { face.hold[id] = 0.55; });
      face.holdName = name || '';
      paint(face);
    };
    face.clearPreview = () => {
      if (!face.holdName && !Object.keys(face.hold).length) return;
      face.hold = {};
      face.holdName = '';
      paint(face);
    };

    /* The other direction of §7.5. The chain ran chip -> pad -> glass and
       stopped there, so the chip and the pad were one object only when you
       approached it from the run. Set per song by the mount below, which is the
       scope that knows where the chips are; a no-op here so a face built before
       a song exists still hovers. */
    face.link = () => {};

    /* The strike. A tap has no pointer to leave, so it expires on its own —
       long enough to read the name off the glass, short enough that the display
       is not still reporting a note you played half a second ago. */
    face.strike = (ids, name) => {
      face.tap = {};
      (ids || []).forEach((id) => { face.tap[id] = 1; });
      face.tapName = name || '';
      paint(face);
      if (face.tapTimer) clearTimeout(face.tapTimer);
      face.tapTimer = setTimeout(() => {
        face.tapTimer = null;
        face.tap = {};
        face.tapName = '';
        paint(face);
      }, 450);
    };

    /* Kept because it is the name §7.5 uses for the chain and because a caller
       outside this file may still hold it: a level of 1 is a strike, anything
       else is a preview. */
    face.flash = (ids, names, level) => {
      if (level === undefined || level < 1) face.preview(ids, names);
      else face.strike(ids, names);
    };

    /* What a pad is worth to the display, without playing it. Hovering a pad
       used to change nothing at all despite the pointer cursor; this is the same
       chain the run chips fire, entered from the hardware end. */
    face.nameFor = (id) => {
      const c = face.current;
      if (!c) return '';
      if (c.isDrums) {
        const voice = c.deviceId === 'ep133'
          ? c.mapping.padVoices[Number(id.slice(1)) - 1]
          : c.mapping.keyVoices[id];
        return voice ? DRUM_LABEL[voice] : '';
      }
      const midi = c.deviceId === 'ep133'
        ? c.mapping.padNotes[Number(id.slice(1)) - 1]
        : 53 + Number(id.slice(1)) + c.mapping.oct * 12;
      return midi === undefined ? '' : noteName(c.song, midi);
    };

    /* Handlers are bound to the geometry, once, and read whatever part is
       current through face.current. Rebinding them on every part switch is
       exactly the thing that made tearing the SVG down look necessary. */
    face.lamps.forEach((nodes, id) => {
      const el = nodes[0];
      const play = () => {
        const c = face.current;
        if (!c) return;
        if (c.isDrums) {
          const voice = c.deviceId === 'ep133'
            ? c.mapping.padVoices[Number(id.slice(1)) - 1]
            : c.mapping.keyVoices[id];
          if (voice) global.Engine.playDrum(voice, 0, 0.9);
          /* An empty pad still answers. §9.6: an unavailable control stays
             focusable and explains itself on activation — and the honest answer
             from a sampler with nothing in that slot is a dash on the glass, not
             silence and no acknowledgement at all. */
          face.strike(voice ? [id] : [], voice ? DRUM_LABEL[voice] : '—');
          return;
        }
        const midi = c.deviceId === 'ep133'
          ? c.mapping.padNotes[Number(id.slice(1)) - 1]
          : 53 + Number(id.slice(1)) + c.mapping.oct * 12;
        if (midi === undefined) { face.strike([], '—'); return; }
        global.Engine.preview(midi, c.patchFor, 0.7, c.trackId);
        face.strike([id], noteName(c.song, midi));
      };
      el.addEventListener('click', play);
      el.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') return;
        event.preventDefault();
        play();
      });
      /* §7.5 entered from the hardware end. Hovering a pad used to change
         nothing at all despite the pointer cursor; now the cap blooms, the
         object's own screen prints what is under your finger and the chip in
         the run that names this pad lights with it. Keyboard focus gets the
         same chain, because a pad you have tabbed to is a pad you are pointing
         at.

         The third argument is "and bring that chip into view", and only the
         keyboard asks for it. A chip that lights below the fold is not a chain,
         it is a class name — but clicking a pad focuses it too, and a run that
         scrolls under the hand that has just pointed at something is the
         interface moving away from you. */
      const enter = (event) => {
        face.preview([id], face.nameFor(id) || '—');
        face.link(id, true, !!event && event.type === 'focus' && keyFocused(el));
      };
      const leave = () => { face.clearPreview(); face.link(id, false); };
      if (HOVERS) { el.addEventListener('mouseenter', enter); el.addEventListener('mouseleave', leave); }
      el.addEventListener('focus', enter);
      el.addEventListener('blur', leave);
    });

    host._dbFace = face;
    return face;
  }

  /* Everything a part switch is allowed to change: three strings per pad, two
     class lists, the display and the hint line. No geometry, no listeners, no
     new nodes. */
  function repaint(face, view) {
    const { song, trackId, deviceId, mapping, isDrums } = view;
    const patches = song.genre.patches || {};
    face.current = {
      song, trackId, deviceId, mapping, isDrums,
      patchFor: { melody: patches.lead, counter: patches.counter, chords: patches.chord, bass: patches.bass }[trackId]
    };

    if (deviceId === 'ep133') {
      for (let pad = 1; pad <= 12; pad++) {
        const g = face.refs.get('p' + pad);
        if (!g) continue;
        const c = epPadContent(song, mapping, isDrums, pad);
        g.classList.toggle('used', c.used);
        g.setAttribute('aria-label', c.aria);
        /* Which pads have anything under them changes with the part, so the
           disabled flag has to move with it — a pad that was a note in Melody
           and is empty in Drums must stop claiming to be pressable. */
        if (c.live) g.removeAttribute('aria-disabled');
        else g.setAttribute('aria-disabled', 'true');
        const main = g.querySelector('.pad-main');
        const sub = g.querySelector('.pad-sub');
        if (main) main.textContent = c.main;
        if (sub) sub.textContent = c.sub;
      }
      ['A', 'B', 'C', 'D'].forEach((letter) => {
        toggleOn(face, 'grp-' + letter, isDrums ? letter === 'A' : letter === mapping.groupHint);
      });
      toggleOn(face, 'fn-keys', !isDrums);
      toggleOn(face, 'fn-timing', trackId === 'chords');
      setText(face, 'hint-pads',
        isDrums ? 'pads — one voice each' : 'pads — root on 1, scale climbs to 9');
      setText(face, 'disp-mode', isDrums
        ? 'PADS · GRP A'
        : `KEYS · ${song.key.rootName} ${mapping.scaleLabel}`);
      setText(face, 'disp-sub',
        `${song.bpm} BPM · ${TRACKS.find((t) => t.id === trackId).label.toUpperCase()}`);
    } else {
      FM_WHITE.concat(FM_BLACK).forEach((idx) => {
        const g = face.refs.get('k' + idx);
        if (!g) return;
        const c = fmKeyContent(song, mapping, isDrums, idx);
        g.classList.toggle('used', c.used);
        g.setAttribute('aria-label', c.aria);
        if (c.live) g.removeAttribute('aria-disabled');
        else g.setAttribute('aria-disabled', 'true');
        const name = g.querySelector('.wkey-name');
        if (name) name.textContent = c.main;
      });
      toggleOn(face, 'oct-down', mapping.oct < 0);
      toggleOn(face, 'oct-up', mapping.oct > 0);
      setText(face, 'disp-mode', isDrums
        ? 'FM PERC'
        : `${song.key.rootName} ${song.scaleName}`.toUpperCase());
      setText(face, 'disp-sub', isDrums
        ? 'SHORT ENVELOPES'
        : `OCT ${mapping.oct > 0 ? '+' : ''}${mapping.oct} · ${trackId === 'chords' ? 'POLY' : 'MONO OK'}`);
    }

    /* A part switch is not a hover and it is not a hit, so everything the
       previous part had lit goes with it — including a preview whose pointer is
       still sitting where a pad used to mean something else. */
    if (face.tapTimer) { clearTimeout(face.tapTimer); face.tapTimer = null; }
    face.play = {}; face.tap = {}; face.hold = {};
    face.playName = ''; face.tapName = ''; face.holdName = '';
    paintLamps(face);
    setNote(face, '', false);
  }

  /* §7.5 runs in both directions at once, so a chip can be marked as linked by
     two independent things: its own focus, and a pointer resting on the pad it
     names. A single boolean class loses one of them — tab to a chip, brush the
     pad it points at, move off the pad, and the release takes the keyboard's
     mark with it, leaving a focused chip with no chain. Counting the sources
     costs one Set per chip and makes the two ends of the chain independent. */
  function markLink(node, source, on) {
    const live = node._dbLink || (node._dbLink = new Set());
    if (on) live.add(source); else live.delete(source);
    node.classList.toggle('is-linked', live.size > 0);
  }

  /* :focus-visible is the browser's own answer to "did they mean to focus
     this", and it is a better one than any heuristic this file could keep:
     the UA already knows whether the last input was a key or a pointer. An
     engine that will not evaluate it on an SVG group throws rather than
     answering, and the honest fallback there is yes — a focus we cannot
     classify is more likely to be a tab than a click, and the cost of being
     wrong is one scroll. */
  function keyFocused(el) {
    try { return el.matches(':focus-visible'); } catch (e) { return true; }
  }

  /* Bring a linked chip into view, but only when it is genuinely out of sight.
     §6.13 asks for exactly this on the playhead marker and the same rule
     applies to the chain: scrolling a panel that is already showing you the
     thing it is about to highlight is motion with nothing behind it.

     Two tests rather than one, because whether the run is its own scroller or
     just tall inside the page is a layout decision that has changed twice and
     may change again. Out of the run's box or off the screen both count. */
  function revealChip(node, box) {
    if (!node || !box || typeof node.scrollIntoView !== 'function') return;
    const chip = node.getBoundingClientRect();
    const run = box.getBoundingClientRect();
    const fold = global.innerHeight || document.documentElement.clientHeight || 0;
    const inRun = chip.top >= run.top && chip.bottom <= run.bottom;
    const onScreen = chip.top >= 0 && chip.bottom <= fold;
    if (inRun && onScreen) return;
    node.scrollIntoView({
      block: 'nearest', inline: 'nearest',
      behavior: global.Motion && global.Motion.reduced() ? 'auto' : 'smooth'
    });
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
    const face = ensureFace(els.stage, view);
    repaint(face, view);

    if (els.setup) {
      els.setup.innerHTML = view.setup.map((s, i) =>
        `<li><span class="step-n">${i + 1}</span><div><b>${s[0]}</b><p>${s[1]}</p></div></li>`).join('');
    }
    els.sequence.innerHTML = view.chips;
    els.sequence.classList.toggle('is-chords', trackId === 'chords');

    const device = DEVICES[deviceId];
    const track = TRACKS.find((item) => item.id === trackId);
    /* A group, not an image. Every pad inside is a real button with a real
       label now, and role="img" would make the whole subtree presentational —
       which is how a hero with a click handler on all twelve of its controls
       ended up unreachable by anything but a mouse. */
    els.stage.setAttribute('role', 'group');
    els.stage.setAttribute('aria-label', `${device.label} faceplate set for ${track.label} in ` +
      `${song.key.rootName} ${song.scaleName} at ${song.bpm} BPM. The exact playable sequence follows.`);
    els.sequence.setAttribute('role', 'group');
    els.sequence.setAttribute('aria-label', `${track.label} playable sequence on ${device.label}`);

    const patches = song.genre.patches || {};
    const patchFor = { melody: patches.lead, counter: patches.counter, chords: patches.chord, bass: patches.bass }[trackId];

    /* §7.5, from the chip end. The chip lifts, the pad blooms and the glass
       prints the name — one object, three places — and all three end together
       when the pointer leaves, which is the half that was missing: a preview
       with no release is just a flash with extra steps. Focus is wired
       alongside hover so the chain is reachable from the keyboard. */
    els.sequence.querySelectorAll('.seq-chip').forEach((chip) => {
      const id = chip.dataset.light;
      /* The name comes off the chip's own data, not off its second line: ui.js
         rewrites that line for an out-of-range note and on the FM-1 it says
         "key 12 · lead", neither of which is a note name. */
      const name = chip.dataset.name || '';
      const dead = () => chip.getAttribute('aria-disabled') === 'true';
      /* The chip marks itself, rather than relying on :focus-visible alone. A
         chip focused by a click does not match :focus-visible, so approaching
         the run with the mouse used to light the pad and leave the chip that
         lit it looking untouched — half a chain. An out-of-range chip has no
         pad to light and still prints its note, because "this one you cannot
         play" is exactly the readout worth having. */
      const enter = () => { markLink(chip, 'self', true); face.preview(id ? [id] : [], name); };
      const leave = () => { markLink(chip, 'self', false); face.clearPreview(); };
      if (HOVERS) { chip.addEventListener('mouseenter', enter); chip.addEventListener('mouseleave', leave); }
      chip.addEventListener('focus', enter);
      chip.addEventListener('blur', leave);
      chip.addEventListener('click', () => {
        /* aria-disabled is not [disabled]: the control still answers, it just
           answers honestly. A dash would be a worse answer than the note you
           cannot reach, so the glass prints the note and nothing sounds. */
        if (dead()) { face.strike([], name); return; }
        if (chip.dataset.drum) global.Engine.playDrum(chip.dataset.drum, 0, 0.9);
        else if (chip.dataset.midi) global.Engine.preview(Number(chip.dataset.midi), patchFor, 0.7, trackId);
        face.strike(id ? [id] : [], name);
      });
    });
    els.sequence.querySelectorAll('.seq-chord').forEach((card, i) => {
      const ids = (card.dataset.lights || '').split(' ').filter(Boolean);
      const enter = () => { markLink(card, 'self', true); face.preview(ids, card.dataset.chord); };
      const leave = () => { markLink(card, 'self', false); face.clearPreview(); };
      if (HOVERS) { card.addEventListener('mouseenter', enter); card.addEventListener('mouseleave', leave); }
      card.addEventListener('focus', enter);
      card.addEventListener('blur', leave);
      card.addEventListener('click', () => {
        const span = song.spans[i];
        if (span) global.Engine.preview(span.voicing.concat([span.bassMidi]), patches.chord, 1.1);
        face.strike(ids, card.dataset.chord);
      });
    });

    /* The return leg of §7.5, now that both ends of the run are indexed: touch
       a pad and the chip that points at it lifts and takes the part colour, the
       same mark it wears when you approach from the other side. .is-linked is
       the class run.css already styles identically to :focus-visible — it was
       written for this and nothing had ever set it. */
    const byPad = new Map();
    els.sequence.querySelectorAll('[data-light], [data-lights]').forEach((node) => {
      (node.dataset.lights || node.dataset.light || '').split(' ').filter(Boolean)
        .forEach((id) => {
          if (!byPad.has(id)) byPad.set(id, []);
          byPad.get(id).push(node);
        });
    });
    face.link = (id, on, reveal) => {
      const nodes = byPad.get(id);
      if (!nodes) return;
      nodes.forEach((node) => markLink(node, 'pad', !!on));
      if (on && reveal) revealChip(nodes[0], els.sequence);
    };

    /* ------------------------------------------------- playback lighting */

    const chipEls = Array.from(els.sequence.querySelectorAll('.seq-chip, .seq-chord'));
    /* A sentinel rather than the empty string, because "no pads lit" is a real
       key and the first frame of playback is very often exactly that. Starting
       at '' meant that frame was skipped, and with it the flag that hands the
       display over to the transport — so a hover during the first bar could
       take the readout away from the notes that were sounding.

       A word rather than a control character: ids.join(',') only ever spells
       pad ids, so anything containing a letter is unreachable, and the raw NUL
       that used to sit here made the whole file binary to git and to grep. */
    let lastKey = 'init';

    function update(step) {
      if (step === null) {
        if (lastKey !== 'off') {
          lastKey = 'off';
          face.driven = false;
          face.play = {};
          face.playName = '';
          /* Handing the glass back: whatever the pointer is resting on takes
             the line again the moment the transport lets go of it. */
          paint(face);
          chipEls.forEach((c) => c.classList.remove('now'));
        }
        return;
      }
      const ids = [];
      const names = [];
      /* The peak each pad decays from. Two voices landing on one pad in the same
         window take the louder of the two, because that is what you would hear. */
      const peaks = {};
      const activeChips = new Set();
      const light = (id, name, velocity) => {
        ids.push(id);
        names.push(name);
        peaks[id] = Math.max(peaks[id] || 0, velocity);
      };

      if (isDrums) {
        song.drums.forEach((hit) => {
          if (step >= hit.step && step < hit.step + 1.2) {
            const id = mapping.idsByVoice[hit.instrument];
            if (id) light(id, DRUM_LABEL[hit.instrument], typeof hit.velocity === 'number' ? hit.velocity : 0.85);
          }
        });
        chipEls.forEach((c) => { if (c.dataset.drum && names.indexOf(DRUM_LABEL[c.dataset.drum]) >= 0) activeChips.add(c); });
      } else {
        mapping.events.forEach((e) => {
          if (step >= e.start && step < e.start + e.dur) {
            const info = mapping.idFor(e.midi);
            if (info) light(info.id, noteName(song, e.midi), e.velocity);
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
        /* The transport outranks a tap: a note that is actually sounding is
           more informative than one you auditioned half a second ago. */
        if (face.tapTimer) { clearTimeout(face.tapTimer); face.tapTimer = null; }
        face.tap = {};
        face.tapName = '';
        face.driven = true;
        face.play = peaks;
        const unique = names.filter((n, i) => names.indexOf(n) === i);
        face.playName = unique.slice(0, 3).join(' ');
        paint(face);
        chipEls.forEach((c) => c.classList.toggle('now', activeChips.has(c)));
      }
    }

    return { update };
  }

  global.Devices = { TRACKS, DEVICES, DEFAULT_DEVICE, build, mount };
})(window);
