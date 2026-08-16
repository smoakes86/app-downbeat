/* Downbeat — composition engine.

   The melody is built rhythm-first and motivically: a one-bar idea is stated,
   then repeated and developed across a phrase plan, re-anchored to each new
   chord. Pitch choice happens in absolute MIDI space over the scale's pitch
   set, so "one step up" is always one scale step. Strong beats take chord
   tones, weak beats fill in with passing and neighbour notes, leaps resolve by
   contrary step, each phrase has a single climax, and the last bar cadences.

   Time is measured in sixteenth-note steps. One bar of 4/4 is 16 steps. */
(function (global) {
  'use strict';

  const T = global.Theory;
  const G = global.Genres;
  const mod = T.mod;
  const STEPS_PER_BAR = 16;

  /* ------------------------------------------------------------------- rng */

  function mulberry32(a) {
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeRng(seed) {
    const next = mulberry32(seed >>> 0);
    return {
      next,
      pick: (arr) => arr[Math.floor(next() * arr.length)],
      range: (a, b) => a + next() * (b - a),
      int: (a, b) => Math.floor(a + next() * (b - a + 1)),
      chance: (p) => next() < p
    };
  }

  function weightedPick(rng, items) {
    let total = 0;
    for (const item of items) total += item.w;
    if (!(total > 0)) return items.length ? items[Math.floor(rng.next() * items.length)] : null;
    let r = rng.next() * total;
    for (const item of items) {
      r -= item.w;
      if (r <= 0) return item;
    }
    return items[items.length - 1];
  }

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  /* -------------------------------------------------------------- harmony */

  function pickProgression(genre, scaleName, bars, rng) {
    const inScale = genre.progressions.filter((p) => p.scale === scaleName);
    const pool = inScale.length ? inScale : genre.progressions;
    if (bars === 'auto') return rng.pick(pool);
    const exact = pool.filter((p) => p.chords.length === bars);
    if (exact.length) return rng.pick(exact);
    const divides = pool.filter((p) => bars % p.chords.length === 0);
    if (divides.length) return rng.pick(divides);
    return rng.pick(pool);
  }

  /* Expand a progression into per-bar chord spans, honouring the "ii7|V7"
     notation for two chords sharing a bar, and repeating the loop if the user
     asked for more bars than the progression holds. */
  function buildChords(progression, key, genre, bars, rng) {
    const withSeventh = genre.extensions === 'sevenths';
    const natural = progression.chords.length;
    const totalBars = bars === 'auto' ? natural : bars;
    const spans = [];

    for (let bar = 0; bar < totalBars; bar++) {
      const entry = progression.chords[bar % natural];
      const parts = String(entry).split('|');
      const each = STEPS_PER_BAR / parts.length;
      parts.forEach((symbol, i) => {
        const chord = T.parseChord(symbol, key, { withSeventh });
        if (!chord) return;
        spans.push({
          chord,
          bar,
          start: bar * STEPS_PER_BAR + i * each,
          length: each
        });
      });
    }

    // Voice-lead the whole sequence, then place the bass.
    const bassRange = genre.bassRange || (genre.bass === 'sub808' ? [28, 43] : [36, 50]);
    let prev = null;
    spans.forEach((span) => {
      span.voicing = T.voiceChord(span.chord, prev, genre.voicing);
      if (span.voicing.length) prev = span.voicing;
      span.bassMidi = T.bassPitch(span.chord.bassPc, bassRange[0], bassRange[1]);
      span.rootMidi = T.bassPitch(span.chord.rootPc, bassRange[0], bassRange[1]);
    });

    return { spans, totalBars };
  }

  /* ---------------------------------------------------------------- rhythm */

  // Phrase plans. Bars sharing a base letter share a motif; the digit marks a
  // variation. The last bar is always the cadence.
  const FORMS = {
    4: [
      ['A', 'A2', 'B', 'C'],
      ['A', 'A2', 'A3', 'C'],
      ['A', 'B', 'A2', 'C']
    ],
    8: [
      ['A', 'A2', 'B', 'C', 'A', 'A2', 'B', 'D'],
      ['A', 'A2', 'B', 'B2', 'A', 'A3', 'C', 'D'],
      ['A', 'B', 'A2', 'C', 'A', 'B', 'A3', 'D']
    ],
    12: [
      ['A', 'A2', 'B', 'B2', 'A', 'A3', 'B', 'B3', 'C', 'C2', 'A', 'D']
    ]
  };

  function chooseForm(totalBars, rng) {
    if (FORMS[totalBars]) return rng.pick(FORMS[totalBars]).slice();
    const form = [];
    const base = FORMS[4][0];
    for (let bar = 0; bar < totalBars; bar++) form.push(base[bar % 4]);
    form[totalBars - 1] = 'D';
    return form;
  }

  function cellNotes(cell) {
    return cell.filter((d) => d > 0).length;
  }

  function cellRest(cell) {
    return cell.reduce((sum, d) => sum + (d < 0 ? -d : 0), 0) / STEPS_PER_BAR;
  }

  /* Pick a rhythm cell whose rest content and note count sit near what the
     genre and energy setting are asking for. */
  function pickCell(cells, rng, wantRest, densityShift, needLongEnd) {
    const items = cells
      .filter((cell) => !needLongEnd || cell[cell.length - 1] >= 4)
      .map((cell) => {
        const restFit = 1 - Math.min(1, Math.abs(cellRest(cell) - wantRest) * 2.2);
        const notes = cellNotes(cell);
        const density = clamp(1 + densityShift * (notes - 4) * 0.22, 0.15, 2.2);
        return { cell, w: Math.max(0.05, restFit) * density };
      });
    const picked = weightedPick(rng, items.length ? items : cells.map((cell) => ({ cell, w: 1 })));
    return picked.cell.slice();
  }

  /* Motif development: each op preserves the bar length. */
  const RHYTHM_OPS = [
    function swapPair(cell, rng) {
      if (cell.length < 2) return cell;
      const i = rng.int(0, cell.length - 2);
      const out = cell.slice();
      const tmp = out[i];
      out[i] = out[i + 1];
      out[i + 1] = tmp;
      return out;
    },
    function splitLongest(cell, rng) {
      let best = -1;
      let bestValue = 0;
      // Only halve even values, or repeated splitting drifts off the grid.
      cell.forEach((d, i) => { if (d >= 4 && d % 2 === 0 && d > bestValue) { bestValue = d; best = i; } });
      if (best < 0) return cell;
      const out = cell.slice();
      out.splice(best, 1, bestValue / 2, bestValue / 2);
      return out;
    },
    function mergePair(cell, rng) {
      const positives = [];
      cell.forEach((d, i) => { if (d > 0 && cell[i + 1] > 0) positives.push(i); });
      if (!positives.length) return cell;
      const i = rng.pick(positives);
      const out = cell.slice();
      out.splice(i, 2, cell[i] + cell[i + 1]);
      return out;
    },
    function restFirst(cell) {
      if (cell[0] <= 0 || cell.length < 2) return cell;
      const out = cell.slice();
      out[0] = -out[0];
      return out;
    },
    function tieEnd(cell) {
      if (cell.length < 2) return cell;
      const out = cell.slice();
      const last = out.pop();
      out[out.length - 1] += Math.abs(last);
      return out;
    }
  ];

  function varyRhythm(cell, times, rng) {
    let out = cell.slice();
    for (let i = 0; i < times; i++) out = RHYTHM_OPS[rng.int(0, RHYTHM_OPS.length - 1)](out, rng);
    // Never leave a bar entirely empty.
    if (!cellNotes(out)) out = cell.slice();
    return out;
  }

  /* ---------------------------------------------------------------- melody */

  function pentatonicPcs(key) {
    const steps = key.flavour === 'minor' ? [0, 3, 5, 7, 10] : [0, 2, 4, 7, 9];
    const scale = new Set(key.scalePcs);
    return new Set(steps.map((s) => mod(key.rootPc + s, 12)).filter((pc) => scale.has(pc)));
  }

  function buildMelody(ctx) {
    const { key, genre, rng, spans, totalBars, energy } = ctx;
    const spec = genre.melody;
    const energyMod = G.ENERGY[energy] || G.ENERGY.flow;

    const lo = spec.range[0];
    const hi = spec.range[1];
    const wantRest = clamp(spec.restiness + energyMod.restiness, 0, 0.6);
    const leapiness = clamp((spec.leapiness || 0.25) + energyMod.leapiness, 0.05, 0.7);
    const pentBias = spec.pentatonicBias || 0;
    const chromatic = spec.chromaticApproach || 0;

    // Pitch pool: the scale, the chord tones of every chord in the
    // progression, and blue notes where the genre asks for them.
    //
    // Including chord tones matters. A borrowed or secondary chord brings in
    // notes the parent scale does not have — the E major V in A minor needs a
    // G sharp — and without them the melody can never play the third of that
    // chord, which is the one note the cadence is built on. Notes from outside
    // the scale are penalised below unless the chord underneath wants them.
    const poolPcs = key.scalePcs.slice();
    const outsideScale = new Set();
    spans.forEach((span) => {
      span.chord.pcs.forEach((pc) => {
        if (poolPcs.indexOf(pc) < 0) { poolPcs.push(pc); outsideScale.add(pc); }
      });
    });
    const blueSet = new Set();
    if (spec.blueNotes) {
      [3, 6, 10].forEach((s) => {
        const pc = mod(key.rootPc + s, 12);
        if (poolPcs.indexOf(pc) < 0) { poolPcs.push(pc); outsideScale.add(pc); }
        blueSet.add(pc);
      });
    }
    const pitches = T.pitchSet(poolPcs, lo, hi);
    if (pitches.length < 5) return [];
    const pentSet = pentatonicPcs(key);

    const chordAt = (step) => {
      for (let i = spans.length - 1; i >= 0; i--) if (step >= spans[i].start) return spans[i].chord;
      return spans[0].chord;
    };
    const indexOfPitch = (midi) => {
      let best = 0;
      let bestDist = Infinity;
      for (let i = 0; i < pitches.length; i++) {
        const d = Math.abs(pitches[i] - midi);
        if (d < bestDist) { bestDist = d; best = i; }
      }
      return best;
    };

    const totalSteps = totalBars * STEPS_PER_BAR;
    const climaxStep = Math.floor(totalSteps * rng.range(0.55, 0.76));
    const shape = rng.pick(['arch', 'arch', 'rise', 'fall', 'wave']);

    // Where the line should sit at a given moment, and how high it may go.
    function targetAt(step) {
      const t = step / Math.max(1, totalSteps - 1);
      const low = lo + 2;
      const high = hi - 3;
      let f;
      if (shape === 'arch') f = Math.sin(Math.PI * t);
      else if (shape === 'rise') f = t;
      else if (shape === 'fall') f = 1 - t;
      else f = 0.5 + 0.5 * Math.sin(Math.PI * 2 * t - Math.PI / 2);
      return low + (high - low) * (0.25 + 0.75 * f);
    }
    function ceilingAt(step) {
      return Math.abs(step - climaxStep) < STEPS_PER_BAR ? hi : hi - 3;
    }

    const form = ctx.form || chooseForm(totalBars, rng);
    const halfBar = Math.ceil(totalBars / 2) - 1;

    const rhythms = {};   // base letter -> the motif's rhythm
    const contours = {};  // base letter -> relative motion, in scale-index deltas
    const notes = [];
    let prevPitch = null;
    let prevInterval = 0;
    let momentum = 0;
    const advance = (state, pitch) => {
      if (state.pitch !== null && state.pitch !== undefined) {
        const interval = pitch - state.pitch;
        state.momentum = interval !== 0 && Math.sign(interval) === Math.sign(state.interval)
          ? state.momentum + 1
          : 0;
        state.interval = interval;
      }
      state.pitch = pitch;
    };

    for (let bar = 0; bar < totalBars; bar++) {
      const label = form[bar];
      const base = label[0];
      const variation = label.length > 1 ? Number(label[1]) - 1 : 0;
      const isCadenceBar = bar === totalBars - 1;
      const isHalfCadenceBar = bar === halfBar && totalBars > 4;

      if (!rhythms[base]) {
        rhythms[base] = pickCell(spec.cells, rng, wantRest, energyMod.density, isCadenceBar);
      }
      let rhythm = variation ? varyRhythm(rhythms[base], variation, rng) : rhythms[base].slice();
      if (isCadenceBar && rhythm[rhythm.length - 1] < 4) rhythm = varyRhythm(rhythm, 1, rng);

      // Lay the bar's rhythm out as absolute positions.
      const slots = [];
      let cursor = bar * STEPS_PER_BAR;
      rhythm.forEach((d) => {
        if (d > 0) slots.push({ start: cursor, dur: d });
        cursor += Math.abs(d);
      });
      if (!slots.length) continue;

      slots.forEach((slot) => {
        const inBar = slot.start % STEPS_PER_BAR;
        slot.strong = inBar === 0 || inBar === 8;
        slot.medium = inBar === 4 || inBar === 12;
        slot.long = slot.dur >= 4;
        slot.chord = chordAt(slot.start);
      });

      // Restate the motif if this letter has been heard before, then fill in
      // any notes the stored contour did not cover (the first statement of a
      // letter, or a variation whose rhythm has more notes than the original).
      let barPitches = contours[base] && contours[base].length
        ? replayContour(contours[base], slots, { pitches, indexOfPitch, prevPitch, lo, hi })
        : [];
      barPitches = barPitches.slice(0, slots.length);

      const state = { pitch: prevPitch, interval: prevInterval, momentum };
      barPitches.forEach((pitch) => advance(state, pitch));

      for (let i = barPitches.length; i < slots.length; i++) {
        const pitch = chooseNext({
          prevPitch: state.pitch,
          prevInterval: state.interval,
          momentum: state.momentum,
          slot: slots[i],
          pitches,
          indexOfPitch,
          rng,
          leapiness,
          pentSet,
          pentBias,
          blueSet,
          outsideScale,
          target: targetAt(slots[i].start),
          ceiling: ceilingAt(slots[i].start),
          floor: lo
        });
        advance(state, pitch);
        barPitches.push(pitch);
      }

      // Cadences: close the final bar on the tonic or the third of the last
      // chord, reached by the smallest move available. The midpoint bar does
      // the opposite and deliberately stays open.
      if (isCadenceBar) {
        const last = slots.length - 1;
        barPitches[last] = cadenceNote(
          barPitches[last - 1] !== undefined ? barPitches[last - 1] : prevPitch,
          slots[last].chord, key, pitches, indexOfPitch
        );
      } else if (isHalfCadenceBar) {
        const last = slots.length - 1;
        barPitches[last] = openNote(barPitches[last], slots[last].chord, key, pitches, indexOfPitch);
      }

      if (!contours[base]) contours[base] = toContour(barPitches, indexOfPitch);

      barPitches.forEach((midi, i) => {
        const slot = slots[i];
        notes.push({
          start: slot.start,
          dur: slot.dur,
          midi,
          strong: slot.strong,
          velocity: (slot.strong ? 0.95 : slot.medium ? 0.82 : 0.7) * energyMod.velocity
        });
      });

      const count = barPitches.length;
      prevPitch = barPitches[count - 1];
      prevInterval = count > 1 ? barPitches[count - 1] - barPitches[count - 2] : prevInterval;
      momentum = state.momentum;
    }

    const repairOpts = { pitches, indexOfPitch, chordAt, lo, hi };
    const settle = () => { for (let pass = 0; pass < 6 && repairMelody(notes, repairOpts); pass++); };
    settle();
    if (notes.length) {
      // The repair pass may have moved the last note; put the cadence back.
      const final = notes[notes.length - 1];
      final.midi = cadenceNote(
        notes.length > 1 ? notes[notes.length - 2].midi : null,
        chordAt(final.start), key, pitches, indexOfPitch
      );
      final.appoggiatura = false;
    }
    if (chromatic > 0) applyChromaticApproach(notes, rng, chromatic, lo, hi);
    // The cadence and the approach notes are themselves edits, and the leap
    // fix can reach backwards, so settle the line again afterwards.
    settle();
    notes.forEach((note) => {
      note.name = key.nameForPc(note.midi);
      note.octave = Math.floor(note.midi / 12) - 1;
      note.velocity = clamp(note.velocity + (rng.next() - 0.5) * 0.06, 0.35, 1);
    });
    /* Where the line peaks, carried out with it. The melody has always known
       this and kept it to itself; the drums want it too, so that the band
       arrives at the same moment rather than each part having its own idea of
       where the song is going. */
    notes.climaxStep = climaxStep;
    return notes;
  }

  /* Store a motif as relative motion through the scale, so repeating it at a
     new place in the harmony is a real diatonic sequence, not a chromatic
     transposition. */
  function toContour(barPitches, indexOfPitch) {
    const contour = [0];
    for (let i = 1; i < barPitches.length; i++) {
      contour.push(indexOfPitch(barPitches[i]) - indexOfPitch(barPitches[i - 1]));
    }
    return contour;
  }

  function replayContour(contour, slots, opts) {
    const { pitches, indexOfPitch, prevPitch, lo, hi } = opts;
    const count = Math.min(contour.length, slots.length);
    if (!count) return [];

    // Anchor the restatement on a chord tone near where the last bar left off.
    const anchorChord = slots[0].chord;
    const from = prevPitch === null ? Math.round((lo + hi) / 2) : prevPitch;
    let idx = nearestChordToneIndex(indexOfPitch(from), anchorChord, pitches, 4);

    const out = [];
    for (let i = 0; i < count; i++) {
      if (i > 0) idx += contour[i];
      idx = clamp(idx, 0, pitches.length - 1);
      const slot = slots[i];
      if ((slot.strong || slot.long) && !isChordTone(pitches[idx], slot.chord)) {
        idx = nearestChordToneIndex(idx, slot.chord, pitches, 2);
      } else if (slot.strong && T.isAvoidTone(mod(pitches[idx], 12), slot.chord)) {
        idx = nearestChordToneIndex(idx, slot.chord, pitches, 2);
      }
      out.push(pitches[clamp(idx, 0, pitches.length - 1)]);
    }
    return out;
  }

  function isChordTone(midi, chord) {
    return chord.pcs.indexOf(mod(midi, 12)) >= 0;
  }

  function nearestChordToneIndex(idx, chord, pitches, maxSearch) {
    const limit = maxSearch || pitches.length;
    for (let d = 0; d <= limit; d++) {
      if (idx - d >= 0 && isChordTone(pitches[idx - d], chord)) return idx - d;
      if (idx + d < pitches.length && isChordTone(pitches[idx + d], chord)) return idx + d;
    }
    // A narrow search can miss; widen rather than leave a clash in place.
    return limit < pitches.length ? nearestChordToneIndex(idx, chord, pitches, pitches.length) : clamp(idx, 0, pitches.length - 1);
  }

  /* Final pass over the finished line. Whatever produced a note — fresh
     generation, a restated motif, a cadence — these two rules hold by the
     time the melody leaves here: strong and long notes are consonant, and a
     leap is answered by contrary motion no larger than the leap itself. The
     one licence is a short appoggiatura that resolves by step onto a chord
     tone, which is the whole point of the device. */
  function repairMelody(notes, o) {
    const { pitches, indexOfPitch, chordAt, lo, hi } = o;
    let changed = false;
    const move = (target, midi) => {
      if (target.midi !== midi) changed = true;
      target.midi = midi;
      target.appoggiatura = false;
    };

    for (let i = 0; i < notes.length; i++) {
      const note = notes[i];
      // Chromatic approach notes are deliberate dissonances; leave them be.
      if (note.chromatic) continue;
      const chord = chordAt(note.start);
      const next = notes[i + 1];
      const needsChordTone = note.strong || note.dur >= 4;

      if (needsChordTone && !isChordTone(note.midi, chord)) {
        const resolves =
          note.dur <= 2 && next &&
          chordAt(next.start) === chord &&
          isChordTone(next.midi, chord) &&
          Math.abs(next.midi - note.midi) <= 2;
        if (resolves && !T.isAvoidTone(mod(note.midi, 12), chord)) {
          note.appoggiatura = true;
        } else {
          move(note, pitches[nearestChordToneIndex(indexOfPitch(note.midi), chord, pitches)]);
        }
      }

      if (i >= 2 && i < notes.length - 1) {
        const leap = notes[i - 1].midi - notes[i - 2].midi;
        if (Math.abs(leap) > 4) {
          const interval = note.midi - notes[i - 1].midi;
          // A leap may be answered by contrary motion, by holding the note, or
          // by a step onward. What it may not do is pile a second leap on top
          // in the same direction — unless all three notes spell the chord,
          // which is an arpeggio and sounds intended.
          const arpeggio = isChordTone(note.midi, chord) &&
            isChordTone(notes[i - 1].midi, chord) &&
            isChordTone(notes[i - 2].midi, chord);
          const answered = Math.abs(interval) <= Math.abs(leap) && (
            interval === 0 ||
            Math.sign(interval) === -Math.sign(leap) ||
            Math.abs(interval) <= 2 ||
            arpeggio
          );
          if (!answered) {
            const direction = leap > 0 ? -1 : 1;
            const from = indexOfPitch(notes[i - 1].midi);
            let resolved = false;
            for (let d = 1; d <= 5; d++) {
              const idx = from + direction * d;
              if (idx < 0 || idx >= pitches.length) break;
              const candidate = pitches[idx];
              if (candidate < lo || candidate > hi) break;
              // The answer must not be a bigger jump than the leap it answers.
              if (Math.abs(candidate - notes[i - 1].midi) > Math.abs(leap)) break;
              if (needsChordTone && !isChordTone(candidate, chord)) continue;
              move(note, candidate);
              resolved = true;
              break;
            }
            // Nowhere to resolve to — usually the line is against the top or
            // bottom of its range. Take the leap back out instead.
            if (!resolved) {
              const previous = notes[i - 1];
              const prevChord = chordAt(previous.start);
              const prevNeeds = previous.strong || previous.dur >= 4;
              const anchor = indexOfPitch(notes[i - 2].midi);
              for (let d = 1; d <= 2; d++) {
                for (const idx of [anchor + d, anchor - d]) {
                  if (idx < 0 || idx >= pitches.length) continue;
                  const candidate = pitches[idx];
                  if (candidate < lo || candidate > hi) continue;
                  if (prevNeeds && !isChordTone(candidate, prevChord)) continue;
                  if (Math.abs(note.midi - candidate) > 4) continue;
                  move(previous, candidate);
                  resolved = true;
                  break;
                }
                if (resolved) break;
              }
            }
            if (!resolved) {
              // Last resort: come straight back to where the leap started.
              const home = indexOfPitch(notes[i - 2].midi);
              const idx = needsChordTone ? nearestChordToneIndex(home, chord, pitches) : home;
              const candidate = pitches[clamp(idx, 0, pitches.length - 1)];
              if (Math.abs(candidate - notes[i - 1].midi) <= Math.abs(leap)) move(note, candidate);
            }
          }
        }
      }
    }
    return changed;
  }

  /* The single most important rule set: what note may follow what. */
  function chooseNext(o) {
    const { slot, pitches, indexOfPitch, rng, leapiness, pentSet, pentBias, blueSet, outsideScale, target, ceiling, floor } = o;
    const prev = o.prevPitch;
    const chord = slot.chord;

    if (prev === null || prev === undefined) {
      const idx = nearestChordToneIndex(indexOfPitch(target), chord, pitches, 4);
      return pitches[idx];
    }

    const prevIdx = indexOfPitch(prev);
    const leaping = Math.abs(o.prevInterval) > 4;
    const resolveDir = o.prevInterval > 0 ? -1 : 1;
    const candidates = [];

    for (let idx = Math.max(0, prevIdx - 6); idx <= Math.min(pitches.length - 1, prevIdx + 6); idx++) {
      const midi = pitches[idx];
      if (midi > ceiling || midi < floor) continue;
      const stepDist = Math.abs(idx - prevIdx);
      const interval = midi - prev;
      const chordTone = isChordTone(midi, chord);
      let w = 1;

      // Stepwise motion is the default; leaps are a seasoning.
      if (stepDist === 0) w *= 0.3;
      else if (stepDist === 1) w *= 3.4;
      else if (stepDist === 2) w *= 0.9 + leapiness;
      else if (stepDist === 3) w *= leapiness * 1.1;
      else w *= leapiness * 0.35;

      // Strong beats and long notes belong to the harmony.
      if (slot.strong || slot.long) w *= chordTone ? 2.4 : 0.012;
      else w *= chordTone ? 1.3 : 1;

      if ((slot.strong || slot.long) && T.isAvoidTone(mod(midi, 12), chord)) w *= 0.02;
      if (blueSet.has(mod(midi, 12))) w *= slot.strong || slot.long ? 0.12 : 0.95;
      if (pentSet.has(mod(midi, 12))) w *= 1 + pentBias;
      // Notes borrowed in for a chord belong to that chord, not to the key.
      if (outsideScale.has(mod(midi, 12)) && !chordTone) w *= 0.12;

      // Sit near the phrase's contour target.
      w *= Math.exp(-Math.abs(midi - target) / 6.5);

      // A leap must be answered by a step the other way.
      if (leaping) {
        if (Math.sign(interval) !== resolveDir || stepDist > 2 || stepDist === 0) w *= 0.03;
        else w *= 2.5;
      }

      // Keep a run of steps running — this is what makes passing figures.
      if (!leaping && o.momentum >= 1 && stepDist === 1 && Math.sign(interval) === Math.sign(o.prevInterval)) w *= 1.5;

      // Never jump more than an octave.
      if (Math.abs(interval) > 12) w *= 0.001;

      // Counterpoint against the line this one is answering.
      if (o.partner && o.partner.now !== null && o.partner.now !== undefined) {
        const against = Math.abs(midi - o.partner.now);
        const quality = against % 12;

        // Thirds and sixths are what two lines sound good in.
        if (quality === 3 || quality === 4 || quality === 8 || quality === 9) w *= 2.1;
        else if (quality === 0) w *= against === 0 ? 0.02 : 0.45;
        else if (quality === 7) w *= 0.5;
        else if (quality === 5) w *= 0.7;
        else w *= 0.25;

        // Keep the second line underneath so the tune stays on top.
        if (midi >= o.partner.now) w *= 0.16;
        if (against > 16) w *= 0.5;

        if (o.partner.prev !== null && o.partner.prev !== undefined && prev !== null) {
          const partnerDir = Math.sign(o.partner.now - o.partner.prev);
          const ownDir = Math.sign(interval);
          if (partnerDir !== 0 && ownDir !== 0) {
            if (ownDir === -partnerDir) w *= 1.8;
            else w *= 0.55;
            // Parallel fifths and octaves: the one thing two lines must not do.
            const before = Math.abs(prev - o.partner.prev) % 12;
            if ((quality === 7 || quality === 0) && before === quality && ownDir === partnerDir) w *= 0.01;
          }
        }
      }

      candidates.push({ midi, w });
    }

    const picked = weightedPick(rng, candidates);
    return picked ? picked.midi : pitches[nearestChordToneIndex(prevIdx, chord, pitches, 4)];
  }

  /* Resolve onto a tone of the final chord, by the smallest move available.
     The key's tonic is the first choice, but only when the closing chord
     actually contains it — landing on the tonic over a V is a clash, not a
     cadence. Otherwise the chord's own root and third take over. */
  function cadenceNote(from, chord, key, pitches, indexOfPitch) {
    const wanted = [];
    const add = (pc) => {
      if (pc === null || pc === undefined) return;
      const value = mod(pc, 12);
      if (chord.pcs.indexOf(value) >= 0 && wanted.indexOf(value) < 0) wanted.push(value);
    };
    add(key.rootPc);
    add(chord.rootPc);
    add(chord.thirdPc);
    chord.pcs.forEach(add);
    const origin = from === null || from === undefined ? Math.round(pitches[Math.floor(pitches.length / 2)]) : from;
    const fromIdx = indexOfPitch(origin);
    let best = null;
    let bestScore = Infinity;
    pitches.forEach((midi, idx) => {
      const rank = wanted.indexOf(mod(midi, 12));
      if (rank < 0) return;
      const distance = Math.abs(idx - fromIdx);
      const score = distance * 1.6 + rank * 1.2 + (distance === 0 ? 2.5 : 0);
      if (score < bestScore) { bestScore = score; best = midi; }
    });
    return best === null ? origin : best;
  }

  /* Leave the midpoint hanging: the second, the fifth or the leading tone. */
  function openNote(current, chord, key, pitches, indexOfPitch) {
    const open = [mod(key.rootPc + 7, 12), mod(key.rootPc + 2, 12), mod(key.rootPc + 11, 12)];
    const idx = indexOfPitch(current);
    let best = null;
    let bestScore = Infinity;
    pitches.forEach((midi, i) => {
      const rank = open.indexOf(mod(midi, 12));
      const distance = Math.abs(i - idx);
      if (rank < 0 || distance > 3) return;
      const score = distance * 1.5 + rank + (isChordTone(midi, chord) ? 0 : 2.5);
      if (score < bestScore) { bestScore = score; best = midi; }
    });
    return best === null ? current : best;
  }

  /* Jazz, gospel and bossa lean on chromatic approach notes: the short note
     before a strong chord tone slides into it from a semitone away. */
  function applyChromaticApproach(notes, rng, probability, lo, hi) {
    for (let i = 1; i < notes.length; i++) {
      const target = notes[i];
      const before = notes[i - 1];
      if (!target.strong || before.strong || before.dur > 2) continue;
      if (before.start + before.dur !== target.start) continue;
      if (!rng.chance(probability)) continue;
      const direction = before.midi <= target.midi ? -1 : 1;
      const approach = target.midi + direction;
      if (approach < lo || approach > hi) continue;
      before.midi = approach;
      before.chromatic = true;
    }
  }


  /* The repair and cadence passes only know about the harmony, so on their own
     they will happily park the second line on top of the tune, in unison with
     it, or in parallel octaves. This pass knows about both lines and fixes
     exactly those three things; it runs interleaved with repair until neither
     has anything left to change. */
  function fitUnderMelody(notes, o) {
    const { pitches, indexOfPitch, chordAt, melodyAt } = o;
    let changed = false;
    let previous = null;

    notes.forEach((note) => {
      const partner = melodyAt(note.start);
      if (partner === null || partner === undefined) return;
      const chord = chordAt(note.start);
      const needsTone = (note.strong || note.dur >= 4) && !note.appoggiatura;
      const acceptable = (midi) => midi < partner && (!needsTone || isChordTone(midi, chord));

      if (!acceptable(note.midi)) {
        const from = indexOfPitch(note.midi);
        for (let d = 0; d <= from; d++) {
          const candidate = pitches[from - d];
          if (acceptable(candidate)) {
            if (candidate !== note.midi) { note.midi = candidate; changed = true; }
            break;
          }
        }
      }

      if (previous) {
        const quality = Math.abs(partner - note.midi) % 12;
        const before = Math.abs(previous.partner - previous.own) % 12;
        const ownDirection = Math.sign(note.midi - previous.own);
        const partnerDirection = Math.sign(partner - previous.partner);
        const parallel = (quality === 7 || quality === 0) &&
          before === quality && ownDirection !== 0 && ownDirection === partnerDirection;
        if (parallel) {
          const from = indexOfPitch(note.midi);
          for (const offset of [-1, 1, -2, 2]) {
            const candidate = pitches[from + offset];
            if (candidate === undefined || !acceptable(candidate)) continue;
            const next = Math.abs(partner - candidate) % 12;
            if (next === 7 || next === 0) continue;
            note.midi = candidate;
            changed = true;
            break;
          }
        }
      }
      previous = { own: note.midi, partner };
    });

    return changed;
  }

  /* --------------------------------------------------------- countermelody */

  /* A second line under the tune. Three things make it work rather than just
     add notes: it moves when the melody is still, it leans the opposite way
     when the melody moves, and it meets the melody in thirds and sixths while
     never landing in parallel fifths or octaves with it. */
  function buildCounter(ctx, melody) {
    const { key, genre, rng, spans, totalBars, energy } = ctx;
    if (!melody || !melody.length) return [];

    const spec = genre.melody;
    const energyMod = G.ENERGY[energy] || G.ENERGY.flow;
    const density = clamp((genre.counterDensity || 0.62) + energyMod.density * 0.12, 0.25, 0.95);

    // Sit below the tune, but clear of the bass.
    const lo = Math.max(48, spec.range[0] - 12);
    const hi = Math.max(lo + 12, spec.range[1] - 6);

    const poolPcs = key.scalePcs.slice();
    spans.forEach((span) => span.chord.pcs.forEach((pc) => {
      if (poolPcs.indexOf(pc) < 0) poolPcs.push(pc);
    }));
    const pitches = T.pitchSet(poolPcs, lo, hi);
    if (pitches.length < 5) return [];
    const pentSet = pentatonicPcs(key);

    const totalSteps = totalBars * STEPS_PER_BAR;
    const chordAt = (step) => {
      for (let i = spans.length - 1; i >= 0; i--) if (step >= spans[i].start) return spans[i].chord;
      return spans[0].chord;
    };
    const indexOfPitch = (midi) => {
      let best = 0;
      let bestDist = Infinity;
      for (let i = 0; i < pitches.length; i++) {
        const d = Math.abs(pitches[i] - midi);
        if (d < bestDist) { bestDist = d; best = i; }
      }
      return best;
    };

    // Where the melody is attacking, and where it is making any sound at all.
    const onsets = new Set();
    const sounding = new Array(totalSteps).fill(null);
    melody.forEach((note) => {
      onsets.add(note.start);
      for (let s = note.start; s < Math.min(totalSteps, note.start + note.dur); s++) sounding[s] = note.midi;
    });
    const melodyAt = (step) => {
      for (let s = Math.min(step, totalSteps - 1); s >= 0; s--) if (sounding[s] !== null) return sounding[s];
      return null;
    };

    // Rhythm: favour the gaps. Silence first, then sustains, and stay off the
    // melody's own attacks so the two lines do not move as one block.
    const slots = [];
    for (let bar = 0; bar < totalBars; bar++) {
      const base = bar * STEPS_PER_BAR;
      const chosen = [];
      let bestFallback = { step: base, weight: -1 };
      [0, 2, 4, 6, 8, 10, 12, 14].forEach((offset) => {
        const step = base + offset;
        if (step >= totalSteps) return;
        let weight;
        if (sounding[step] === null) weight = 1;
        else if (!onsets.has(step)) weight = 0.65;
        else weight = 0.1;
        if (offset % 8 === 0) weight *= 1.5;
        else if (offset % 4 === 0) weight *= 1.15;
        if (weight > bestFallback.weight) bestFallback = { step, weight };
        if (rng.next() < weight * density) chosen.push(step);
      });
      if (!chosen.length) chosen.push(bestFallback.step);
      chosen.forEach((step) => slots.push(step));
    }

    slots.sort((a, b) => a - b);
    const notes = [];
    let prevPitch = null;
    let prevInterval = 0;
    let prevPartner = null;

    // A note runs until the next one, but never past the chord it was chosen
    // against — holding it into the next chord is how a consonance turns into
    // a clash halfway through.
    const chordEndAt = (step) => {
      for (let i = spans.length - 1; i >= 0; i--) {
        if (step >= spans[i].start) return spans[i].start + spans[i].length;
      }
      return totalSteps;
    };

    slots.forEach((step, i) => {
      const nextStep = i + 1 < slots.length ? slots[i + 1] : totalSteps;
      const dur = Math.max(1, Math.min(nextStep - step, chordEndAt(step) - step, STEPS_PER_BAR));
      const inBar = step % STEPS_PER_BAR;
      const slot = {
        start: step,
        dur,
        strong: inBar === 0 || inBar === 8,
        medium: inBar === 4 || inBar === 12,
        long: dur >= 4,
        chord: chordAt(step)
      };
      const partnerNow = melodyAt(step);
      const midi = chooseNext({
        prevPitch,
        prevInterval,
        momentum: 0,
        slot,
        pitches,
        indexOfPitch,
        rng,
        leapiness: 0.16,
        pentSet,
        pentBias: (spec.pentatonicBias || 0) * 0.5,
        blueSet: new Set(),
        outsideScale: new Set(),
        target: (lo + hi) / 2,
        ceiling: hi,
        floor: lo,
        partner: { now: partnerNow, prev: prevPartner }
      });
      if (prevPitch !== null) prevInterval = midi - prevPitch;
      prevPitch = midi;
      prevPartner = partnerNow;
      notes.push({
        start: step,
        dur,
        midi,
        strong: slot.strong,
        velocity: clamp((slot.strong ? 0.68 : 0.56) * energyMod.velocity, 0.25, 0.8)
      });
    });

    // Same invariants as the tune, plus the two-line ones.
    const repairOpts = { pitches, indexOfPitch, chordAt, lo, hi };
    const fitOpts = { pitches, indexOfPitch, chordAt, melodyAt };
    const settle = () => {
      for (let pass = 0; pass < 12; pass++) {
        const repaired = repairMelody(notes, repairOpts);
        const fitted = fitUnderMelody(notes, fitOpts);
        if (!repaired && !fitted) return;
      }
    };
    settle();

    if (notes.length) {
      const final = notes[notes.length - 1];
      // Cadence onto a chord tone, but only one that stays under the tune.
      const partner = melodyAt(final.start);
      const room = partner === null ? pitches : pitches.filter((midi) => midi < partner);
      const usable = room.length ? room : pitches;
      final.midi = cadenceNote(
        notes.length > 1 ? notes[notes.length - 2].midi : null,
        chordAt(final.start), key, usable, (midi) => {
          let best = 0;
          let bestDist = Infinity;
          usable.forEach((value, i) => {
            const d = Math.abs(value - midi);
            if (d < bestDist) { bestDist = d; best = i; }
          });
          return best;
        }
      );
      final.appoggiatura = false;
      // Treat the last note as a strong beat so the repair pass holds it to
      // the chord even when it lands on a weak sixteenth.
      final.strong = true;
      settle();
    }

    notes.forEach((note) => {
      note.name = key.nameForPc(note.midi);
      note.octave = Math.floor(note.midi / 12) - 1;
      const against = melodyAt(note.start);
      note.against = against === null ? null : Math.abs(against - note.midi);
    });
    return notes;
  }

  /* ----------------------------------------------------------- chord track */

  /* Turn each voiced chord into playable events. Comping style is what makes
     a genre recognisable as much as the chords themselves: house stabs the
     offbeats, bossa plays a charleston, synthwave arpeggiates. */
  function buildChordTrack(ctx) {
    const { genre, spans, rng } = ctx;
    const style = genre.chordRhythm || 'sustain';
    const energyMod = G.ENERGY[ctx.energy] || G.ENERGY.flow;
    const events = [];

    spans.forEach((span, index) => {
      const voicing = span.voicing;
      if (!voicing || !voicing.length) return;
      const at = span.start;
      const len = span.length;
      const hit = (offset, dur, velocity, spread) => {
        if (offset >= len) return;
        voicing.forEach((midi, i) => {
          events.push({
            start: at + offset + (spread ? i * spread : 0),
            dur: Math.max(0.5, Math.min(dur, len - offset)),
            midi,
            velocity: clamp(velocity * energyMod.velocity, 0.2, 1)
          });
        });
      };

      switch (style) {
        case 'sustain':
          hit(0, len, 0.6);
          break;
        case 'quarters':
          for (let s = 0; s < len; s += 4) hit(s, 3.5, s === 0 ? 0.72 : 0.58);
          break;
        case 'eighths':
          for (let s = 0; s < len; s += 2) hit(s, 1.8, s % 8 === 0 ? 0.7 : 0.5);
          break;
        case 'offbeats':
          for (let s = 2; s < len; s += 4) hit(s, 1.6, 0.66);
          break;
        case 'charleston':
          hit(0, 5, 0.7);
          hit(6, 4, 0.6);
          if (len >= 16) hit(12, 4, 0.58);
          break;
        case 'laidback':
          hit(0, Math.min(len, 10), 0.6);
          if (len >= 16) hit(10, 5, 0.48);
          break;
        case 'comp':
          // Sparse and syncopated, varied bar to bar so it does not lock up.
          hit(0, 5, 0.64);
          hit(index % 2 ? 6 : 7, 3, 0.54);
          if (len >= 16 && rng.chance(0.5)) hit(12, 3, 0.5);
          break;
        case 'strum':
          for (let s = 0; s < len; s += 2) hit(s, 2.4, s % 8 === 0 ? 0.68 : 0.46, (s / 2) % 2 ? -0.18 : 0.18);
          break;
        case 'arpUp':
          for (let s = 0; s < len; s += 2) {
            const midi = voicing[(s / 2) % voicing.length];
            events.push({ start: at + s, dur: 1.9, midi, velocity: clamp((s % 8 === 0 ? 0.68 : 0.52) * energyMod.velocity, 0.2, 1) });
          }
          break;
        case 'stabs16':
          [0, 3, 6, 10, 14].forEach((offset) => hit(offset, 1.2, offset === 0 ? 0.72 : 0.56));
          break;
        case 'gospel':
          hit(0, 4, 0.7);
          hit(6, 2, 0.56);
          if (len >= 16) hit(12, 4, 0.64);
          break;
        default:
          hit(0, len, 0.6);
      }
    });

    return events.sort((a, b) => a.start - b.start);
  }

  /* ------------------------------------------------------------------ bass */

  /* How each bass style is put together, in words. Shown next to the bass
     lane so the pattern on screen can be read rather than just seen. */
  const BASS_STYLES = {
    pedal:      { label: 'Pedal', how: 'One held root under the whole chord. No movement — the harmony does the work.' },
    roots:      { label: 'Root notes', how: 'The root of each chord, struck once and left to ring.' },
    rootFifth:  { label: 'Root and fifth', how: 'Root on beat 1, fifth on beat 3 — the oldest trick there is.' },
    driving8:   { label: 'Driving eighths', how: 'Root repeated on every eighth note, with the odd fifth thrown in for lift.' },
    octaves:    { label: 'Octave eighths', how: 'Root and its octave alternating on eighths, the engine under four-on-the-floor.' },
    walking:    { label: 'Walking bass', how: 'Root on beat 1, chord tones through the middle, then a chromatic step onto the next chord\u2019s root on beat 4.' },
    gospelWalk: { label: 'Gospel walk', how: 'Root, third, fifth on the strong beats, then an approach note leaning into the next chord.' },
    sub808:     { label: '808 sub', how: 'A long sub root filling the bar, sometimes jumping an octave or a fifth at the end.' },
    bossa:      { label: 'Bossa', how: 'Root, then the fifth anticipated just before beat 3 \u2014 the push that gives bossa its lilt.' },
    syncopated: { label: 'Syncopated', how: 'Root on the downbeat, then off-beat pushes and a fifth landing between the beats.' },
    funk16:     { label: 'Sixteenth funk', how: 'Root anchoring beat 1, then octave pops and fifths scattered across the sixteenths.' }
  };

  /* What job a bass note is doing against its chord. Read off the chord's own
     intervals rather than a fixed table, so a diminished or augmented fifth is
     still named the fifth instead of being written off as an approach note. */
  function bassRole(midi, chord, rootMidi) {
    const interval = mod(midi - chord.rootPc, 12);
    const inChord = chord.intervals.some((iv) => mod(iv, 12) === interval);
    if (!inChord) return 'approach';
    if (interval === 0) return midi >= rootMidi + 12 ? 'octave' : 'root';
    if (interval === 1 || interval === 2) return 'ninth';
    if (interval === 3 || interval === 4) return 'third';
    if (interval === 5) return 'fourth';
    if (interval === 6 || interval === 7) return 'fifth';
    if (interval === 8) return chord.intervals.some((iv) => mod(iv, 12) === 7) ? 'sixth' : 'fifth';
    if (interval === 9) return 'sixth';
    return 'seventh';
  }

  function buildBass(ctx) {
    const { genre, spans, totalBars, rng, energy } = ctx;
    const style = genre.bass || 'roots';
    const energyMod = G.ENERGY[energy] || G.ENERGY.flow;
    const events = [];
    let current = null;
    const push = (start, dur, midi, velocity, role) => {
      if (dur <= 0) return;
      events.push({
        start,
        dur,
        midi,
        velocity: clamp((velocity || 0.85) * energyMod.velocity, 0.3, 1),
        role: role || bassRole(midi, current.chord, current.bassMidi),
        chord: current.chord.symbol
      });
    };

    spans.forEach((span, i) => {
      current = span;
      const next = spans[i + 1] || spans[0];
      const root = span.bassMidi;
      const fifth = root + 7;
      const chordTones = span.chord.intervals.map((iv) => span.rootMidi + iv).filter((m) => m < root + 22);
      const len = span.length;
      const at = span.start;

      switch (style) {
        case 'pedal':
          push(at, len, root, 0.7);
          break;

        case 'roots':
          push(at, Math.min(len, 12), root, 0.85);
          break;

        case 'rootFifth':
          push(at, len / 2, root, 0.9);
          push(at + len / 2, len / 2, len >= 16 ? fifth : root, 0.78);
          break;

        case 'driving8':
          for (let s = 0; s < len; s += 2) {
            push(at + s, 1.8, s % 8 === 6 && rng.chance(0.3) ? fifth : root, s % 4 === 0 ? 0.95 : 0.75);
          }
          break;

        case 'octaves':
          for (let s = 0; s < len; s += 2) {
            push(at + s, 1.8, (s / 2) % 2 === 0 ? root : root + 12, s % 4 === 0 ? 0.95 : 0.72);
          }
          break;

        case 'walking': {
          const beats = len / 4;
          for (let b = 0; b < beats; b++) {
            let midi;
            let role = null;
            if (b === 0) midi = root;
            else if (b === beats - 1) {
              // Approach the next root from a semitone or a step away.
              const targetRoot = next.bassMidi;
              const dir = targetRoot >= root ? -1 : 1;
              midi = targetRoot + dir * (rng.chance(0.6) ? 1 : 2);
              role = 'approach';
            } else {
              midi = chordTones.length ? chordTones[Math.min(chordTones.length - 1, b)] : root;
            }
            while (midi < root - 7) midi += 12;
            while (midi > root + 14) midi -= 12;
            push(at + b * 4, 3.6, midi, b === 0 ? 0.92 : 0.78, role);
          }
          break;
        }

        case 'gospelWalk': {
          push(at, 4, root, 0.92);
          push(at + 4, 3.6, chordTones[1] || fifth, 0.74);
          push(at + 8, 4, fifth, 0.85);
          const approach = next.bassMidi + (next.bassMidi >= root ? -1 : 1);
          push(at + 12, 3.6, approach, 0.76, 'approach');
          break;
        }

        case 'sub808':
          push(at, Math.min(len, 14), root, 0.95);
          if (len >= 16 && rng.chance(0.5)) push(at + 12, 3, root + (rng.chance(0.5) ? 12 : 7), 0.8);
          break;

        case 'bossa':
          push(at, 7, root, 0.9);
          push(at + 7, 5, fifth, 0.76);
          if (len >= 16) push(at + 12, 4, root, 0.82);
          break;

        case 'syncopated':
          push(at, 6, root, 0.92);
          push(at + 7, 3, root, 0.7);
          push(at + 11, 2, fifth, 0.72);
          if (len >= 16) push(at + 14, 2, root + 12, 0.66);
          break;

        case 'funk16': {
          const pattern = rng.pick([
            [[0, 2, 0], [3, 1, 0], [6, 2, 12], [7, 1, 0], [10, 2, 0], [14, 2, 7]],
            [[0, 3, 0], [4, 1, 12], [6, 2, 0], [10, 2, 0], [11, 1, 7], [14, 2, 0]],
            [[0, 2, 0], [2, 1, 0], [5, 2, 7], [8, 2, 0], [11, 2, 12], [14, 2, 0]]
          ]);
          pattern.forEach(([offset, dur, interval]) => {
            if (offset >= len) return;
            push(at + offset, dur, root + interval, offset === 0 ? 0.98 : 0.74);
          });
          break;
        }

        default:
          push(at, len, root, 0.85);
      }
    });

    return events.filter((e) => e.start < totalBars * STEPS_PER_BAR);
  }

  /* ----------------------------------------------------------------- drums */

  /* Which beat this song plays. A genre carries several and the draw is
     seeded, so the same recipe gives the same beat back — but two songs in the
     same genre no longer arrive with the identical drum part. */
  function pickBeat(genre, rng) {
    const list = Array.isArray(genre.drums) ? genre.drums : [genre.drums || {}];
    return (list.length ? rng.pick(list) : {}) || {};
  }

  /* A beat is a set of named voices plus its own name, so the keys have to be
     read against the voice list rather than trusted. Stamping `name` out as a
     pattern would emit a hit on every step that happens to be a letter. */
  const VOICE_IDS = G.DRUM_VOICES.map((v) => v.id);

  /* How hard a hit lands, before energy, the arc and the humanising.

     The old answer was two numbers — 0.95 on a beat and 0.72 off it — which
     is a drum machine's answer, and it is why sixteen hats in a bar read as
     sixteen hats rather than as four beats. Each voice has its own idea of
     which positions matter, and they genuinely disagree: the bar's strongest
     position is beat one, but the snare's is the backbeat, and a snare that
     follows the bar's hierarchy plays the backbeat quieter than the thing it
     is supposed to be answering. */
  function weightFor(instrument, step) {
    const s = step % STEPS_PER_BAR;
    const onBeat = s % 4 === 0;
    const onEighth = s % 2 === 0;

    if (instrument === 'snare' || instrument === 'clap') {
      /* Wherever the snare lands on a beat IS the backbeat: two and four in a
         straight feel, three in a half-time one. Naming 2 and 4 outright made
         a half-time trap snare — which is on three — play as a passing note,
         and made folk's brushed accent on three quieter than the ghosts
         either side of it. The position it falls on is the fact; 2 and 4 were
         only ever the common case. */
      return onBeat ? 1 : onEighth ? 0.68 : 0.56;
    }
    /* A rim is colour between the main hits, by its own definition on the
       faceplate, so it never competes with the snare even on a beat. */
    if (instrument === 'rim') return onBeat ? 0.72 : onEighth ? 0.58 : 0.5;
    if (instrument === 'kick') {
      return s === 0 ? 1 : onBeat ? 0.9 : onEighth ? 0.8 : 0.72;
    }
    /* Time-keepers accent the beat and fall away across it. That decay is the
       whole difference between counting in four and counting in sixteen. */
    if (instrument === 'hat' || instrument === 'openHat' || instrument === 'ride'
      || instrument === 'shaker' || instrument === 'tambourine') {
      return onBeat ? 0.88 : onEighth ? 0.66 : 0.54;
    }
    if (instrument === 'crash') return 1;
    return onBeat ? 0.85 : onEighth ? 0.7 : 0.6;
  }

  /* The loop's own shape. A four-bar phrase that is exactly as loud at the end
     as at the start is a phrase that never goes anywhere, and the place it
     should be going is the one the melody already picked — so the drums lean
     into the same bar the tune peaks in, and ease off after it rather than
     dropping away, because a drummer does not stop playing after the chorus. */
  function arcAt(step, totalSteps, climax) {
    const t = totalSteps > 1 ? step / (totalSteps - 1) : 0;
    const c = clamp(climax, 0.15, 0.95);
    const rise = t <= c ? t / c : 1;
    const fall = t <= c ? 0 : (t - c) / (1 - c);
    return 0.9 + 0.12 * rise - 0.06 * fall;
  }

  function buildDrums(ctx) {
    const { genre, totalBars, rng, energy } = ctx;
    const patterns = ctx.beat || pickBeat(genre, rng);
    const energyMod = G.ENERGY[energy] || G.ENERGY.flow;
    const totalSteps = totalBars * STEPS_PER_BAR;
    const events = [];
    /* Humanising draws its own stream, seeded from the main one. Otherwise
       the number of draws depends on how many hits the beat happens to have,
       and every structural decision after this — the rolls, the fill — would
       shift when a pattern gained a note. Structure should not be downstream
       of how busy the hi-hat is. */
    const human = makeRng(Math.floor(rng.next() * 0x7fffffff));
    const climax = ctx.climax === undefined ? 0.66 : ctx.climax;
    const feel = (G.FEEL && G.FEEL[genre.id]) || genre.feel || {};
    /* One place, so that everything a kit plays sits in the same pocket. The
       fill and the hat rolls used to push their events straight onto the grid
       while the pattern around them leaned, which measured as a snare landing
       twelve per cent short of the drag its genre asked for — the drummer
       going rigid for the last bar and nowhere else. */
    const nudgeFor = (voice) => ((feel[voice] || 0) + (human.next() - 0.5) * 5) / 1000;

    VOICE_IDS.forEach((instrument) => {
      const pattern = patterns[instrument];
      if (!pattern) return;
      /* A pattern longer than one bar has to divide the loop, or its second
         half lands in a different place every time round and the figure stops
         being a figure. Where it does not divide, only the first bar is used
         — a plainer beat is a better answer than a two-bar idea chopped at a
         point the music never arrives at. Every length the app offers (4, 8
         and 12 bars) is divisible by two and four, so this is the guard for
         an auto length that lands somewhere odd, not the common case. */
      const span = totalSteps % pattern.length === 0
        ? pattern.length : STEPS_PER_BAR;
      for (let step = 0; step < totalSteps; step++) {
        const symbol = pattern[step % span];
        if (!symbol || symbol === '.' || symbol === '-') continue;
        /* Ghost hits are colour, not the beat, and they are the first thing a
           player drops when the room wants less — so at the calm end the kit
           thins out rather than simply turning down. */
        if (symbol === 'g' && energyMod.ghosts === false) continue;
        /* A ghost is a ghost wherever it falls — that is what makes it one —
           and an open hat is a deliberate accent, so neither takes the metric
           weight. Everything else does. */
        const base =
          symbol === 'g' ? 0.32 :
          symbol === 'o' ? 0.9 :
          weightFor(instrument, step);
        /* Last, and small: ±3.5% so that no two hits in the loop are bit
           identical. Any more reads as a drummer who cannot play; any less
           and a machine-gun hi-hat still sounds like one file played
           repeatedly, which is exactly what it is. */
        const jitter = 1 + (human.next() - 0.5) * 0.07;
        const velocity = base * energyMod.velocity * arcAt(step, totalSteps, climax) * jitter;
        const voice = symbol === 'o' && instrument === 'hat' ? 'openHat' : instrument;
        /* Where this hit sits against the grid: the genre's own feel for this
           voice, plus a couple of milliseconds of wobble so that a run of
           sixteen hats is a player rather than a metronome with a tone
           generator on it. In seconds, because that is what the scheduler
           speaks. */
        const nudge = nudgeFor(voice);
        events.push({
          step,
          instrument: voice,
          /* A ghost is a different musical object from a quiet hit, and only
             the pattern knows which this was. Carried out so that nothing
             downstream has to guess it back from the velocity. */
          ghost: symbol === 'g',
          nudge,
          velocity: clamp(velocity, 0.14, 1)
        });
      }
    });

    // Trap-style hat rolls: subdivide a few of the existing hits.
    if (genre.hatRolls) {
      const hats = events.filter((e) => e.instrument === 'hat');
      hats.forEach((hat) => {
        if (!rng.chance(genre.hatRolls * 0.25)) return;
        const divisions = rng.pick([2, 3, 4]);
        for (let d = 1; d < divisions; d++) {
          events.push({
            step: hat.step + d / divisions,
            instrument: 'hat',
            nudge: nudgeFor('hat'),
            velocity: hat.velocity * (0.55 + d * 0.08)
          });
        }
      });
    }

    /* A small fill going into the loop point. The draw is taken either way —
       only the odds move with the energy — so the settings that were here
       before still land on exactly the fills they always did. */
    const fillOdds = 0.55 * (energyMod.fill === undefined ? 1 : energyMod.fill);
    if (patterns.snare && totalBars > 2 && rng.chance(fillOdds)) {
      const lastBar = (totalBars - 1) * STEPS_PER_BAR;
      [12, 13, 14, 15].forEach((offset, i) => {
        if (rng.chance(0.7)) {
          events.push({
            step: lastBar + offset, instrument: 'snare',
            nudge: nudgeFor('snare'), velocity: 0.45 + i * 0.12
          });
        }
      });
    }

    return events.sort((a, b) => a.step - b.step);
  }

  /* Which voices the kit uses, and on which beats, read off the patterns —
     through the same energy filter buildDrums applies, or the notes would
     promise a rim shot the kit has just dropped. */
  function describeDrums(patterns, energyMod) {
    const ghosts = !energyMod || energyMod.ghosts !== false;
    const beatsOf = (pattern) => {
      const hits = [];
      for (let i = 0; i < pattern.length; i++) {
        const symbol = pattern[i];
        if (!symbol || symbol === '.' || symbol === '-') continue;
        if (symbol === 'g' && !ghosts) continue;
        hits.push(i);
      }
      return hits;
    };
    const asBeats = (hits) => {
      const beats = [];
      hits.forEach((step) => {
        const beat = step / 4 + 1;
        const label = Number.isInteger(beat) ? String(beat) : `${Math.floor(beat)}&`;
        if (beats.indexOf(label) < 0) beats.push(label);
      });
      return beats;
    };
    return G.DRUM_VOICES
      .filter((voice) => patterns[voice.id])
      .map((voice) => {
        const hits = beatsOf(patterns[voice.id]);
        return {
          id: voice.id,
          label: voice.label,
          how: voice.how,
          hits: hits.length,
          beats: asBeats(hits).join(', '),
          pattern: patterns[voice.id]
        };
      })
      // A voice that was nothing but ghost hits has gone quiet altogether.
      .filter((voice) => voice.hits > 0);
  }

  /* ------------------------------------------------------------ commentary */

  function describe(song) {
    const { spans, key, genre, melody, form } = song;
    const parts = [];
    const romans = spans.map((s) => s.chord.roman);

    const last = spans[spans.length - 1].chord;
    const secondLast = spans.length > 1 ? spans[spans.length - 2].chord : null;
    const degreeOf = (chord) => mod(chord.rootPc - key.rootPc, 12);
    if (secondLast) {
      const from = degreeOf(secondLast);
      const to = degreeOf(last);
      if (from === 7 && to === 0) parts.push('it closes with a perfect cadence, V back to I');
      else if (from === 5 && to === 0) parts.push('it closes plagally, IV falling to I');
      else if (from === 7 && (to === 9 || to === 8)) parts.push('it sidesteps into a deceptive cadence on vi');
      else if (to === 7) parts.push('it leaves the door open, resting on V');
      else if (from === to) parts.push(`it settles on ${last.roman}`);
      else parts.push(`it turns around on ${last.roman}`);
    }

    const borrowed = spans.filter((s) => s.chord.borrowed);
    if (borrowed.length) {
      const names = [];
      borrowed.forEach((s) => { if (names.indexOf(s.chord.roman) < 0) names.push(s.chord.roman); });
      parts.push(`${names.join(' and ')} ${names.length > 1 ? 'are borrowed' : 'is borrowed'} from outside the key`);
    }

    const repeated = form.filter((label) => label[0] === form[0][0]).length;
    if (repeated > 1) {
      parts.push(`the opening bar's idea comes back ${repeated - 1} more time${repeated > 2 ? 's' : ''}, re-fitted to each chord`);
    }

    if (melody.some((n) => n.chromatic)) parts.push('a few chromatic approach notes slide into the strong beats');
    if (genre.melody.blueNotes) parts.push('the flat third and flat fifth colour the line');

    // A twelve-bar blues is mostly one chord repeated; list what changes.
    const distinct = romans.filter((roman, i) => roman !== romans[i - 1]);
    const shown = distinct.slice(0, 6).join(' – ') + (distinct.length > 6 ? ' …' : '');
    const intro = `${key.rootName} ${key.scaleName} over ${shown}`;
    return `${intro}. ${parts.length ? parts.join('; ') : 'Strong beats land on chord tones throughout'}.`;
  }

  /* ------------------------------------------------------------------ main */

  function compose(options) {
    const opts = options || {};
    const genreId = opts.genre && G.GENRES[opts.genre] ? opts.genre : 'pop';
    const genre = G.GENRES[genreId];
    const energy = G.ENERGY[opts.energy] ? opts.energy : 'flow';
    const energyMod = G.ENERGY[energy];

    const harmonySeed = opts.harmonySeed === undefined ? Math.floor(Math.random() * 1e9) : opts.harmonySeed;
    const melodySeed = opts.melodySeed === undefined ? Math.floor(Math.random() * 1e9) : opts.melodySeed;
    const harmonyRng = makeRng(harmonySeed);
    const melodyRng = makeRng(melodySeed);

    const available = G.scalesFor(genreId);
    const scaleName = available.indexOf(opts.scale) >= 0 ? opts.scale : harmonyRng.pick(available);
    const keyPc = opts.keyPc === undefined ? 0 : mod(opts.keyPc, 12);
    const key = T.makeKey(keyPc, scaleName);

    const bars = opts.bars === undefined ? 'auto' : opts.bars;
    const progression = pickProgression(genre, scaleName, bars, harmonyRng);
    const { spans, totalBars } = buildChords(progression, key, genre, bars, harmonyRng);

    const bpm = opts.bpm !== undefined && opts.bpm !== null
      ? opts.bpm
      : Math.round(genre.tempo[0] + (genre.tempo[1] - genre.tempo[0]) * energyMod.tempo);

    const form = chooseForm(totalBars, makeRng(melodySeed ^ 0x9e3779b9));
    const melody = buildMelody({ key, genre, spans, totalBars, rng: melodyRng, energy, form });
    const chordTrack = buildChordTrack({ genre, spans, rng: makeRng(harmonySeed ^ 0x27d4eb2f), energy });
    const bass = buildBass({ genre, spans, totalBars, rng: makeRng(harmonySeed ^ 0x85ebca6b), energy });
    /* The beat is drawn before the events are built so the choice can be kept
       on the song: the run of pads, the set-up notes and the arrangement all
       have to describe the beat that is actually playing, not the genre's
       first one. */
    const drumRng = makeRng(harmonySeed ^ 0xc2b2ae35);
    const beat = pickBeat(genre, drumRng);
    const drums = buildDrums({
      genre, totalBars, rng: drumRng, energy, beat,
      /* Where the tune peaks, as a fraction of the loop, so the kit leans in
         at the same moment the melody does. */
      climax: melody.climaxStep === undefined
        ? 0.66 : melody.climaxStep / Math.max(1, totalBars * STEPS_PER_BAR - 1)
    });
    const counter = opts.counter
      ? buildCounter({ key, genre, spans, totalBars, rng: makeRng(melodySeed ^ 0x165667b1), energy }, melody)
      : [];

    const song = {
      genreId, genre, key, scaleName, bpm, bars: totalBars,
      totalSteps: totalBars * STEPS_PER_BAR,
      swing: genre.swing || 0,
      swingUnit: genre.swingUnit || 8,
      progression, spans, melody, counter, chordTrack, bass, drums, form,
      harmonySeed, melodySeed, energy,
      beat, beatName: beat.name || '',
      bassPlan: BASS_STYLES[genre.bass] || BASS_STYLES.roots,
      drumPlan: describeDrums(beat, energyMod)
    };
    song.theory = describe(song);
    return song;
  }

  global.Compose = {
    compose, makeRng, STEPS_PER_BAR, chooseForm,
    buildMelody, buildCounter, buildChordTrack, buildBass, buildDrums, pickBeat,
    BASS_STYLES, describeDrums
  };
})(window);
