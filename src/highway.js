/* Downbeat — the highway.

   One part of the song as a road of notes running down onto the EP-133's
   twelve pads, the way Guitar Hero runs a chart down onto five frets. Each
   note is a gem in the lane of the pad that plays it, labelled with what is
   silkscreened on that pad, and it reaches the line at the bottom of the road
   exactly when you hear it. A held note trails a tail as long as it is held.

   The lanes are the twelve pads in the order KEYS mode climbs them — `.` `0`
   `ENTER`, then `1` to `9` — gathered into the keypad's four rows of three,
   so where a gem sits inside its group of three is which column of the pad
   grid it is in, and which group is which row. Lanes this part never touches
   are drawn narrower rather than left out: the unit has twelve pads whatever
   the part does, and a lane that moved between songs would teach nothing.

   Everything here is a picture of the mapping src/devices.js already makes —
   the same pad for the same note, the same octave shift, the same kit — so the
   highway can never disagree with the faceplate about where a note lives.

   It draws from the unfolded transport clock (Engine.elapsed), not from the
   folded position the faceplate reads, because a road shows the music that is
   COMING, and at the end of a pass what is coming is the next pass — or the
   chorus, or the bridge. */
(function (global) {
  'use strict';

  const doc = global.document;

  /* How the road leans back. TILT is the angle; FAR is how wide the far end
     reads against the near one. Mild on purpose: the far end is where a gem
     first appears, and a gem you cannot read until it is nearly on the line
     is a gem you miss. */
  const TILT = 30;
  const FAR = 0.66;
  const RAD = TILT * Math.PI / 180;

  /* Seconds of music on the road. Time rather than steps, so a fast tempo
     shows more of the bar rather than the same bar arriving faster — which is
     how a note highway has always worked — with a floor on the spacing, so
     two sixteenths on one pad never draw as one smear on a short screen. */
  const LOOK = 2.4;
  const MIN_PPS = 13;

  /* A lane this part never plays, against one it does. */
  const UNUSED = 0.55;

  /* The shortest note that trails a tail, in sixteenths, and how far short
     of its end the tail stops — so a note held into the next one on the same
     pad still shows as two. */
  const HELD = 3;
  const TAIL_GAP = 0.4;

  const FIELD = { melody: 'melody', counter: 'counter', chords: 'chordTrack', bass: 'bass', drums: 'drums' };
  const NOUN = { melody: 'melody', counter: 'second line', chords: 'chords', bass: 'bass', drums: 'drums' };

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const noteName = (song, midi) => song.key.nameForPc(midi) + (Math.floor(midi / 12) - 1);

  /* The engine moves the offbeats late by this much — the same arithmetic as
     swingOffset in src/audio.js, in steps instead of seconds — and a gem
     drawn on the straight grid would reach the line a swung sixteenth before
     the note it stands for. */
  function swingSteps(song, step) {
    if (!song.swing) return 0;
    if (song.swingUnit === 16) return step % 2 === 1 ? song.swing * 0.5 : 0;
    return step % 4 === 2 ? song.swing * 0.66 : 0;
  }

  function sectionsOf(song) {
    return song.sections && song.sections.length ? song.sections : [song];
  }

  /* One section's part, in the shape the engine's own laid-out events have,
     so the loop and the form go through the same door below. */
  function rawOf(section, part) {
    if (part === 'drums') {
      return (section.drums || []).map((d) => (
        { step: d.step, drum: d.instrument, velocity: d.velocity, nudge: d.nudge || 0 }));
    }
    return (section[FIELD[part]] || []).map((n) => (
      { step: n.start, dur: n.dur || 1, midi: n.midi, velocity: n.velocity }));
  }

  /* Which pad a note lands on, and how many octaves off the twelve it is. */
  function padOf(mapping, part, e) {
    if (part === 'drums') {
      const id = mapping.idsByVoice[e.drum];
      return id ? { lane: Number(id.slice(1)) - 1, oct: 0 } : null;
    }
    const info = mapping.idFor(e.midi);
    return info ? { lane: info.index, oct: info.oct || 0 } : null;
  }

  function toNotes(song, part, mapping, raw, stepSec) {
    const labels = global.Devices.DRUM_LABEL;
    const out = [];
    const seen = {};
    raw.forEach((e) => {
      const pad = padOf(mapping, part, e);
      if (!pad) return;
      const note = {
        step: e.step,
        at: e.step + swingSteps(song, e.step) + (e.nudge || 0) / stepSec,
        /* Only a note that is genuinely held gets a tail — a dotted eighth or
           longer. A comped stab an eighth long drawn with one runs into the
           next stab, and eight repeated hits read as one long sustain. A drum
           has no length worth drawing at all. */
        dur: part === 'drums' || !((e.dur || 0) >= HELD) ? 0 : e.dur,
        lane: pad.lane,
        oct: pad.oct,
        velocity: typeof e.velocity === 'number' ? e.velocity : 0.85,
        name: part === 'drums' ? labels[e.drum] || e.drum : noteName(song, e.midi)
      };
      /* Two notes of one voicing on one pad, an octave apart, are one press
         with a shift — the one further from home is the one worth showing,
         because it is the reason the stack cannot be played in one go. */
      const key = pad.lane + '@' + e.step;
      const prior = seen[key];
      if (prior) {
        if (Math.abs(note.oct) > Math.abs(prior.oct)) { prior.oct = note.oct; prior.name = note.name; }
        prior.dur = Math.max(prior.dur, note.dur);
        return;
      }
      seen[key] = note;
      out.push(note);
    });
    return out.sort((a, b) => a.at - b.at || a.lane - b.lane);
  }

  /* The first index whose note starts at or after `at`. */
  function lowerBound(notes, at) {
    let lo = 0;
    let hi = notes.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (notes[mid].at < at) lo = mid + 1; else hi = mid;
    }
    return lo;
  }

  /* --------------------------------------------------------------- model */

  /* Everything the road draws for one part of one song: the twelve lanes and
     what each pad holds, the notes of each section, and — when the form is
     armed — the whole form laid out flat by the engine itself, so a section
     that drops this part is a stretch of empty road rather than a guess. */
  function model(song, part, plan) {
    const Devices = global.Devices;
    const view = Devices.build(song, part, 'ep133');
    const mapping = view.mapping;
    const stepSec = 60 / song.bpm / 4;
    const isDrums = part === 'drums';

    const bySection = {};
    sectionsOf(song).forEach((s) => {
      bySection[s.id || '_'] = toNotes(song, part, mapping, rawOf(s, part), stepSec);
    });

    let form = null;
    if (plan && global.Engine && global.Engine.arrange) {
      const laid = global.Engine.arrange(song, plan);
      const raw = laid.events.filter((e) => e.track === part).map((e) => (
        { step: e.step, dur: e.dur, midi: e.midi, drum: e.drum, velocity: e.velocity, nudge: e.nudge }));
      form = {
        notes: toNotes(song, part, mapping, raw, stepSec),
        total: laid.totalSteps,
        marks: laid.spans.map((span, i) => ({
          at: span.start,
          label: span.name,
          rests: (plan.sections[i].tracks || []).indexOf(part) < 0
        }))
      };
    }

    /* A pad is "used" if either section plays it, so the lanes do not change
       width as the loop goes from the verse to the chorus. */
    const used = new Array(12).fill(false);
    let count = 0;
    let maxDur = 0;
    Object.keys(bySection).forEach((id) => {
      count += bySection[id].length;
      bySection[id].forEach((n) => { used[n.lane] = true; maxDur = Math.max(maxDur, n.dur); });
    });

    const lanes = Devices.PAD_LABELS.map((label, i) => {
      const held = isDrums
        ? (mapping.padVoices[i] ? Devices.DRUM_LABEL[mapping.padVoices[i]] : '')
        : (mapping.padNotes[i] !== undefined ? noteName(song, mapping.padNotes[i]) : '');
      return { label, short: label === 'ENTER' ? 'ENT' : label, held, used: used[i] };
    });

    /* Lane geometry as fractions of the width that is left once the three
       gaps between the keypad's rows are taken out. The stylesheet does the
       rest, so the road and the pads under it — which share a width — cannot
       drift apart. */
    const weights = lanes.map((lane) => (lane.used ? 1 : UNUSED));
    const total = weights.reduce((a, b) => a + b, 0);
    let x = 0;
    lanes.forEach((lane, i) => {
      lane.l = x / total;
      lane.w = weights[i] / total;
      lane.row = Math.floor(i / 3);
      x += weights[i];
    });

    /* The setting the unit has to be on for the pads to mean what the road
       says: the scale and key codes for KEYS mode, or 12T. */
    const grid = isDrums
      ? 'Group A'
      : `${song.key.rootName} ${mapping.scaleLabel} · ${mapping.scaleCode}${mapping.scale ? ' + ' + mapping.keyCode : ''}`;

    return {
      song, part, isDrums, lanes, bySection, form, count, maxDur, stepSec, grid,
      length: song.totalSteps,
      labels: (song.sections || []).reduce((map, s) => { map[s.id] = s.label; return map; }, {})
    };
  }

  /* ---------------------------------------------------------------- view */

  /* `els` names the pieces index.html lays out: the stage that carries the
     perspective, the road inside it, and the row of pads under it. Nodes for
     gems, beat lines and section marks are pooled and recycled as the music
     moves, so a twelve-bar form costs the same per frame as a four-bar loop:
     only what is on the road exists. */
  function mount(els) {
    const stage = els.stage;
    const road = els.road;
    const notesBox = els.notes;
    const beatsBox = els.beats;
    const marksBox = els.marks;
    const lanesBox = els.lanes;
    const padsBox = els.pads;

    let m = null;
    let H = 0;
    let pps = 20;
    let headPx = 14;
    const gems = [];
    const beats = [];
    const marks = [];
    let padEls = [];
    let litKey = 'init';
    let nextKey = 'init';

    function pooled(pool, box, make) {
      return (i) => {
        if (!pool[i]) { pool[i] = make(); box.appendChild(pool[i]); }
        return pool[i];
      };
    }
    const gemAt = pooled(gems, notesBox, () => {
      const g = doc.createElement('i');
      g.className = 'hw-gem';
      g.innerHTML = '<i class="hw-tail"></i><b class="hw-head"></b>';
      g._head = g.lastChild;
      g._lane = -1; g._text = null; g._oct = null; g._h = -1; g._y = null; g._shown = true;
      return g;
    });
    const beatAt = pooled(beats, beatsBox, () => {
      const b = doc.createElement('i');
      b.className = 'hw-beat';
      b._bar = null; b._y = null; b._shown = true;
      return b;
    });
    const markAt = pooled(marks, marksBox, () => {
      const k = doc.createElement('span');
      k.className = 'hw-mark';
      k._text = null; k._y = null; k._shown = true;
      return k;
    });

    const show = (node, on) => {
      if (node._shown === on) return;
      node._shown = on;
      node.style.display = on ? '' : 'none';
    };
    const lift = (node, y) => {
      /* Whole device pixels are not worth chasing on a surface that is
         being projected anyway, but a tenth of a pixel is a style write
         nobody can see. */
      const v = Math.round(y * 10) / 10;
      if (node._y === v) return;
      node._y = v;
      node.style.transform = `translate3d(0,${-v}px,0)`;
    };
    const placeLane = (node, lane) => {
      node.style.setProperty('--l', lane.l);
      node.style.setProperty('--w', lane.w);
      node.style.setProperty('--c', lane.row);
    };

    /* The lanes and the pads change only with the part or the song. */
    function load(next) {
      m = next;
      litKey = 'init';
      nextKey = 'init';
      lanesBox.innerHTML = m.lanes.map((lane, i) => (
        `<i class="hw-lane" data-row="${lane.row % 2 ? 'odd' : 'even'}"${lane.used ? ' data-used="true"' : ''} ` +
        `style="--l:${lane.l};--w:${lane.w};--c:${lane.row}" data-lane="${i}"></i>`)).join('');
      padsBox.innerHTML = m.lanes.map((lane, i) => (
        `<span class="hw-pad"${lane.used ? ' data-used="true"' : ''} data-lane="${i}" ` +
        `style="--l:${lane.l};--w:${lane.w};--c:${lane.row}">` +
        `<b class="hw-pad-id">${esc(lane.short)}</b>` +
        `<small class="hw-pad-note">${lane.used ? esc(lane.held) : ''}</small></span>`)).join('');
      padEls = Array.from(padsBox.children);
      gems.forEach((g) => { g._lane = -1; });
      fit();
    }

    /* Measure the opening and lean the road back into it. The road is tilted
       about its own bottom edge, which therefore stays exactly where layout
       put it — level with the pads, at their width — while the far end
       recedes. With the eye at the top of the stage, the far end lands on the
       stage's top edge when the road is A / cos(tilt) long, whatever the
       perspective; the perspective then only decides how narrow it gets. */
    function fit() {
      if (!m) return false;
      const A = stage.clientHeight;
      if (!A || !stage.clientWidth) return false;
      H = A / Math.cos(RAD);
      const depth = (FAR / (1 - FAR)) * A * Math.tan(RAD);
      stage.style.perspective = Math.round(depth) + 'px';
      road.style.height = Math.round(H) + 'px';
      road.style.transform = `rotateX(${TILT}deg)`;
      const steps = Math.min(LOOK / m.stepSec, H / MIN_PPS);
      pps = H / steps;
      headPx = Math.max(10, Math.min(18, pps * 0.62));
      road.style.setProperty('--hw-head', headPx.toFixed(1) + 'px');
      gems.forEach((g) => { g._h = -1; g._y = null; });
      return true;
    }

    /* Draw the road at an unfolded step. `passOf(step)` says which section the
       bare loop plays at that step and where that pass starts, or null where
       nothing plays; the form ignores it and lays itself out. */
    function draw(pos, passOf, looping) {
      if (!m || !H) return;
      const ahead = H / pps;
      const tailRoom = (headPx / pps) + 0.5;
      const lo = pos - m.maxDur - tailRoom;
      const hi = pos + ahead + 1;
      /* "Next" looks further than the road does: a part that rests through
         an intro, or comes in a bar late, still names the note it comes in
         on rather than reading a dash until it is nearly here. */
      const far = pos + Math.max(ahead, m.form ? m.form.total : m.length) + 1;
      let used = 0;
      const lit = {};
      let soonest = Infinity;
      let soon = [];

      const place = (n, off) => {
        const at = n.at + off;
        if (at > far) return false;
        if (at > pos + 0.02) {
          if (at < soonest - 0.01) { soonest = at; soon = [n]; } else if (at - soonest <= 0.01) soon.push(n);
        }
        if (at > hi) return soon.length === 0 || at < soonest + 0.02;
        if (at + n.dur < pos - tailRoom) return true;
        const g = gemAt(used++);
        show(g, true);
        if (g._lane !== n.lane) { g._lane = n.lane; placeLane(g, m.lanes[n.lane]); }
        const text = m.lanes[n.lane].short + (n.oct ? (n.oct > 0 ? '↑' : '↓') : '');
        if (g._text !== text) { g._text = text; g._head.textContent = text; }
        if (g._oct !== n.oct) {
          g._oct = n.oct;
          if (n.oct) g.dataset.oct = n.oct > 0 ? 'up' : 'dn'; else delete g.dataset.oct;
        }
        const h = n.dur ? Math.round((n.dur - TAIL_GAP) * pps) : 0;
        if (g._h !== h) { g._h = h; g.style.height = h + 'px'; }
        lift(g, (at - pos) * pps);
        /* Lit while it sounds, and for most of a sixteenth after a strike, so
           a drum hit is a flash you can see rather than one frame. */
        if (at <= pos && pos < at + Math.max(n.dur, 0.9)) {
          if (lit[n.lane] === undefined || Math.abs(n.oct) > Math.abs(lit[n.lane])) lit[n.lane] = n.oct;
        }
        return true;
      };
      const scan = (notes, off) => {
        for (let i = lowerBound(notes, lo - off); i < notes.length; i++) {
          if (!place(notes[i], off)) break;
        }
      };

      /* Section marks across the road, collected while the passes are walked:
         where the loop turns into the other section, and where each section
         of the form begins — said even when this part rests through it. */
      const flags = [];

      if (m.form) {
        const T = m.form.total;
        for (let k = Math.max(0, Math.floor(lo / T)); k * T < (soon.length ? hi : far); k++) {
          if (k > 0 && !looping) break;
          scan(m.form.notes, k * T);
          m.form.marks.forEach((mk) => {
            const at = mk.at + k * T;
            if (at >= pos - 1 && at < hi) flags.push({ at, text: mk.rests ? `${mk.label} · ${NOUN[m.part]} rests` : mk.label });
          });
        }
      } else if (passOf) {
        const L = m.length;
        let before = null;
        for (let k = Math.max(0, Math.floor(lo / L)); k * L < (soon.length ? hi : far); k++) {
          const pass = passOf(k * L + 1e-6);
          if (!pass) break;
          const notes = m.bySection[pass.section] || m.bySection._ || m.bySection[Object.keys(m.bySection)[0]] || [];
          scan(notes, pass.start);
          if (before === null && k > 0) {
            const prior = passOf((k - 1) * L + 1e-6);
            before = prior ? prior.section : null;
          }
          if (pass.start >= pos - 1 && pass.start < hi && (k === 0 || pass.section !== before) && m.labels[pass.section]) {
            flags.push({ at: pass.start, text: m.labels[pass.section] });
          }
          before = pass.section;
        }
      }
      for (let i = used; i < gems.length; i++) show(gems[i], false);

      /* A line on every beat and a firmer one on every bar, running with the
         music — through the count-in too, which is four real beats. */
      let b = 0;
      for (let step = Math.ceil((pos - 0.5) / 4) * 4; step < pos + ahead; step += 4) {
        const line = beatAt(b++);
        show(line, true);
        const bar = step % 16 === 0;
        if (line._bar !== bar) { line._bar = bar; line.classList.toggle('is-bar', bar); }
        lift(line, (step - pos) * pps);
      }
      for (let i = b; i < beats.length; i++) show(beats[i], false);

      flags.forEach((flag, i) => {
        const node = markAt(i);
        show(node, true);
        if (node._text !== flag.text) { node._text = flag.text; node.textContent = flag.text; }
        lift(node, (flag.at - pos) * pps);
      });
      for (let i = flags.length; i < marks.length; i++) show(marks[i], false);

      light(lit);
      tellNext(soon);
    }

    /* The pads under the road light as their notes reach the line, in the part
       colour — or, for a note off the twelve, in the colour of the shift that
       reaches it, as the faceplate's pads do. */
    function light(lit) {
      const key = Object.keys(lit).map((k) => k + ':' + lit[k]).join(',');
      if (key === litKey) return;
      litKey = key;
      padEls.forEach((pad, i) => {
        const on = lit[i] !== undefined;
        pad.classList.toggle('is-on', on);
        if (on && lit[i]) pad.dataset.oct = lit[i] > 0 ? 'up' : 'dn';
        else delete pad.dataset.oct;
      });
    }

    /* What is coming next, in words, under the pads: which pad, which note,
       and the shift if it needs one — the one line you can read without
       tracking a gem down the road. */
    function tellNext(soon) {
      const key = soon.map((n) => n.lane + ':' + n.oct).join(',');
      if (key === nextKey || !els.next) return;
      nextKey = key;
      if (!soon.length) { els.next.innerHTML = '<span class="hw-next-k">Next</span> —'; return; }
      const pads = soon.map((n) => m.lanes[n.lane].label + (n.oct ? (n.oct > 0 ? '↑' : '↓') : ''));
      const names = soon.map((n) => n.name).filter((name, i, all) => all.indexOf(name) === i);
      const up = soon.some((n) => n.oct > 0);
      const down = soon.some((n) => n.oct < 0);
      const shift = up && down ? 'keys + and −' : up ? 'keys +' : down ? 'keys −' : '';
      els.next.innerHTML = '<span class="hw-next-k">Next</span> ' +
        `<b>${pads.length > 1 ? 'pads' : 'pad'} ${esc(pads.join(' + '))}</b> · ${esc(names.join(m.isDrums ? ' + ' : ' '))}` +
        (shift ? ` · <span class="hw-next-shift">${shift}</span>` : '');
    }

    function clear() {
      light({});
    }

    /* Where the first note of a section — or of the form — falls, so a road
       at rest can be set back no further than keeps it in sight. */
    function firstAt(section) {
      if (!m) return 0;
      const notes = m.form ? m.form.notes : (m.bySection[section] || m.bySection._ || []);
      return notes.length ? Math.max(0, notes[0].at) : 0;
    }

    return { load, fit, draw, clear, firstAt, model: () => m, ahead: () => (H ? H / pps : 0) };
  }

  global.Highway = { model, mount, TILT, LOOK };
})(window);
