/* Downbeat — composition engine.

   The melody is built rhythm-first and motivically: a one-bar idea is stated,
   then repeated and developed across a phrase plan, re-anchored to each new
   chord. Pitch choice happens in absolute MIDI space over the scale's pitch
   set, so "one step up" is always one scale step. Strong beats take chord
   tones, weak beats fill in with passing and neighbour notes, leaps resolve by
   contrary step, each phrase has a single climax, and the last bar cadences.

   A song is two sections, a verse and a chorus, written whole — each with its
   own progression, tune, second line, comping, bass and drums — against one
   key, one tempo, one beat and one energy. The chorus is the loop this engine
   has always written; the verse is the same engine asked for a line that sits
   under it. See `compose` for how the two are drawn.

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

  /* Which engine writes a new song. A saved sketch is a recipe of seeds, and
     seeds replay only against the engine that rolled them, so the engine is
     part of the recipe: a sketch written on engine 1 is composed on engine 1
     for ever, note for note, and everything engine 2 adds is behind a check
     for it. Engine 2 is the one that chooses — between comping patterns,
     bass lines, voicings, substitutions, beats, fills, motif developments
     and ways to write a second line — where engine 1 had one answer each. */
  const ENGINE = 2;
  const moreOf = (genre) => genre.more || {};

  /* Draw from a list that leans toward its front: the first entry is the
     genre's usual answer and is drawn about a third of the time, and each one
     after it a little less often than the one before. */
  function leanPick(rng, list) {
    if (!list || !list.length) return null;
    return list[Math.min(list.length - 1, Math.floor(-Math.log(1 - rng.next()) * 2.2))];
  }

  /* -------------------------------------------------------------- harmony */

  function pickProgression(genre, scaleName, bars, rng, extra) {
    const all = extra && extra.length ? genre.progressions.concat(extra) : genre.progressions;
    const inScale = all.filter((p) => p.scale === scaleName);
    const pool = inScale.length ? inScale : all;
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
  function buildChords(progression, key, genre, bars, voicing) {
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
      span.voicing = T.voiceChord(span.chord, prev, voicing || genre.voicing);
      if (span.voicing.length) prev = span.voicing;
      span.bassMidi = T.bassPitch(span.chord.bassPc, bassRange[0], bassRange[1]);
      span.rootMidi = T.bassPitch(span.chord.rootPc, bassRange[0], bassRange[1]);
    });

    return { spans, totalBars };
  }

  /* ------------------------------------------------------ reharmonisation

     Engine 2 does not play a progression as written. It plays it the way a
     player who knows the genre would, which means reaching for the things
     players reach for: a secondary dominant into the chord that follows, a
     tritone substitute in place of a V7, a suspension that resolves inside
     the bar, a turnaround in the last bar, a passing diminished, the minor iv
     after the IV, the backdoor ii–V, a slash chord that walks the bass, an
     added ninth. Each genre says how readily it does each one, so a trap
     loop stays plain and a gospel one rarely does.

     Everything is written back as roman numerals in the same notation the
     genre tables use — `ii7|V7` for two chords in one bar — so the result is
     parsed, voiced and described exactly like a hand-written progression,
     and a substitution that fails to parse is simply not made. */
  const NUMERAL_RE = /^(b|#)?([ivIV]+)/;
  const ROMAN_UP = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

  function reharmonise(chords, weights, key, genre, rng) {
    const out = chords.slice();
    const sevenths = genre.extensions === 'sevenths';
    const major = key.flavour !== 'minor';
    const parse = (token) => T.parseChord(String(token).split('|')[0], key, { withSeventh: sevenths });
    const lastOf = (token) => T.parseChord(String(token).split('|').pop(), key, { withSeventh: sevenths });
    const degreeOf = (chord) => (chord ? mod(chord.rootPc - key.rootPc, 12) : null);
    const split = (token) => String(token).indexOf('|') >= 0;
    const plain = (token) => !split(token) && String(token).indexOf('/') < 0;
    /* A numeral for a root a given number of semitones above the tonic, on a
       given degree of the scale — with whatever accidental this mode needs.
       bVII is VII in a minor key, and II is bII in phrygian. */
    const numeral = (degree, semis, upper) => {
      const diff = mod(semis - key.scale.steps[degree], 12);
      const accidental = diff === 11 ? 'b' : diff === 1 ? '#' : diff === 0 ? '' : null;
      if (accidental === null) return null;
      const name = ROMAN_UP[degree];
      return accidental + (upper ? name : name.toLowerCase());
    };
    const n = out.length;
    const wants = (name) => rng.chance(weights[name] || 0);
    const pickIndex = (test) => {
      const found = [];
      for (let i = 0; i < n; i++) if (test(i)) found.push(i);
      return found.length ? rng.pick(found) : -1;
    };
    const valid = (token) => String(token).split('|').every((part) => !!T.parseChord(part, key, { withSeventh: sevenths }));
    const set = (i, token) => { if (token && valid(token)) out[i] = token; };
    const next = (i) => out[(i + 1) % n];
    const isDominant = (chord) => chord && ['dom7', 'dom9', 'dom13', 'dom7b9', 'dom7s9', 'alt'].indexOf(chord.type) >= 0;

    /* Colour: an added ninth or a sus2 on a triad, a ninth on a seventh. */
    if (wants('colour')) {
      const count = rng.int(1, 2);
      for (let c = 0; c < count; c++) {
        const i = pickIndex((j) => plain(out[j]) && /^(b|#)?[ivIV]+(maj7|7)?$/.test(out[j]));
        if (i < 0) break;
        const token = out[i];
        const chord = parse(token);
        if (!chord) continue;
        const base = NUMERAL_RE.exec(token)[0];
        const minorish = base === base.toLowerCase();
        let options;
        if (/maj7$/.test(token)) options = [base + 'maj9'];
        else if (/7$/.test(token)) options = minorish ? [base + '9', base + '11'] : [base + '9', base + '13'];
        else if (chord.type === 'dim' || chord.type === 'aug') options = [];
        else if (minorish) options = [base + 'm(add9)', base + '7', base + 'sus2'];
        else options = [base + 'add9', base + 'sus2', base + (degreeOf(chord) === 7 ? '7' : 'maj7')];
        /* Colour, not a change of key: the note it adds has to be one the
           key already has, so iii does not grow an F sharp in C. */
        const inKey = (symbol) => {
          const coloured = T.parseChord(symbol, key, { withSeventh: sevenths });
          return coloured && coloured.pcs.every((pc) => chord.pcs.indexOf(pc) >= 0 || key.scalePcs.indexOf(pc) >= 0);
        };
        options = options.filter(inKey);
        if (options.length) set(i, rng.pick(options));
      }
    }

    /* Relative substitution: I for its vi, IV for its ii, away from the ends. */
    if (major && wants('relative') && n >= 4) {
      const i = pickIndex((j) => j > 0 && j < n - 1 && (out[j] === 'I' || out[j] === 'IV'));
      if (i >= 0) set(i, out[i] === 'I' ? rng.pick(['vi', 'iii']) : 'ii');
    }

    /* A slash chord that turns the bass into a line: I/3 on the way to IV or
       ii, V/3 stepping down to vi, i/5 leaning onto VI. */
    if (wants('inversion')) {
      const i = pickIndex((j) => {
        if (!plain(out[j]) || j === n - 1) return false;
        const here = degreeOf(parse(out[j]));
        const there = degreeOf(parse(next(j)));
        return (here === 0 && (there === 5 || there === 2)) || (here === 7 && there === 9) || (here === 0 && there === 8);
      });
      if (i >= 0) {
        const here = degreeOf(parse(out[i]));
        const there = degreeOf(parse(next(i)));
        const base = NUMERAL_RE.exec(out[i])[0];
        if (here === 7) set(i, base + '/3');
        else if (there === 8) set(i, base + '|' + base + '/5');
        else set(i, base + '|' + base + '/3');
      }
    }

    /* IV, then iv, then home: the minor plagal. */
    if (major && wants('minorIV')) {
      const i = pickIndex((j) => out[j] === 'IV' && degreeOf(parse(next(j))) === 0);
      if (i >= 0) set(i, 'IV|iv');
    }

    /* A suspension on the dominant, resolved in the same bar. */
    if (wants('sus')) {
      const i = pickIndex((j) => out[j] === 'V' || out[j] === 'V7');
      if (i >= 0) set(i, out[i] === 'V' ? 'Vsus4|V' : 'V7sus4|V7');
    }

    /* A secondary dominant in the back half of the bar before its target. */
    if (wants('secondary')) {
      const i = pickIndex((j) => {
        if (j === 0 || !plain(out[j]) || split(out[j - 1])) return false;
        const target = parse(out[j]);
        const degree = degreeOf(target);
        if (degree === 0 || degree === null || target.type === 'dim' || target.type === 'm7b5') return false;
        return NUMERAL_RE.test(out[j]);
      });
      if (i >= 0) set(i - 1, out[i - 1] + '|V7/' + NUMERAL_RE.exec(out[i])[0]);
    }

    /* The tritone substitute: a V7 that resolves home becomes bII7. */
    if (wants('tritone')) {
      const sub = numeral(1, 1, true);
      const candidates = [];
      out.forEach((token, i) => {
        const parts = String(token).split('|');
        parts.forEach((part, p) => {
          const following = p + 1 < parts.length ? parts[p + 1] : String(next(i)).split('|')[0];
          const chord = T.parseChord(part, key, { withSeventh: sevenths });
          const target = T.parseChord(following, key, { withSeventh: sevenths });
          if (isDominant(chord) && !chord.secondary && degreeOf(chord) === 7 && degreeOf(target) === 0) candidates.push([i, p]);
        });
      });
      if (sub && candidates.length) {
        const [i, p] = rng.pick(candidates);
        const parts = String(out[i]).split('|');
        parts[p] = sub + (rng.chance(0.5) ? '7' : '9');
        set(i, parts.join('|'));
      }
    }

    /* The backdoor: iv7 to bVII7 instead of the V7 that goes home. */
    if (wants('backdoor')) {
      const iv = numeral(3, 5, false);
      const flatSeven = numeral(6, 10, true);
      const i = pickIndex((j) => plain(out[j]) && degreeOf(parse(out[j])) === 7 && degreeOf(parse(next(j))) === 0);
      if (i >= 0 && iv && flatSeven) set(i, iv + '7|' + flatSeven + '7');
    }

    /* A passing diminished: I to #i°7 to ii, or IV to #iv°7 to V. */
    if (wants('passingDim')) {
      const i = pickIndex((j) => {
        if (!plain(out[j])) return false;
        const here = degreeOf(parse(out[j]));
        const there = degreeOf(parse(next(j)));
        return (here === 0 && there === 2) || (here === 5 && there === 7);
      });
      if (i >= 0) {
        const here = degreeOf(parse(out[i]));
        const dim = here === 0 ? numeral(0, 1, false) : numeral(3, 6, false);
        if (dim) set(i, out[i] + '|' + dim + '°7');
      }
    }

    /* A turnaround in the last bar, pointing back at the top of the loop. */
    if (wants('turnaround') && n >= 4 && plain(out[n - 1])) {
      const last = lastOf(out[n - 1]);
      const first = parse(out[0]);
      const degree = degreeOf(last);
      const two = sevenths ? (major ? 'ii7' : 'iiø7') : (major ? 'ii' : 'iv');
      const five = sevenths ? 'V7' : 'V';
      let options = [];
      if (degree === 7) options = major ? [two + '|' + five, 'IV|' + five] : ['iv|' + five, two + '|' + five];
      else if (degree === 0 && degreeOf(first) === 0) options = major ? [out[n - 1] + '|' + five, out[n - 1] + '|vi'] : [out[n - 1] + '|' + five];
      else if (degree === 5 && degreeOf(first) === 0) options = [out[n - 1] + '|' + five];
      if (options.length) set(n - 1, rng.pick(options));
    }

    return out;
  }

  /* A progression as this section will play it: perhaps at half the
     harmonic speed — each chord held two bars where the form has room — and
     then reharmonised. */
  function develop(progression, o) {
    const { genre, key, bars, rng } = o;
    const more = moreOf(genre);
    let chords = progression.chords.slice();
    let stretched = false;
    if (bars !== 'auto' && chords.length <= 4 && bars % (chords.length * 2) === 0
      && rng.chance(more.stretch === undefined ? 0.3 : more.stretch)) {
      chords = chords.reduce((acc, c) => acc.concat([c, c]), []);
      stretched = true;
    }
    chords = reharmonise(chords, more.reharm || {}, key, genre, rng);
    return { scale: progression.scale, chords, base: progression, stretched };
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

  /* Engine 2's phrase plans, added to the ones above. Between them they cover
     the shapes tunes actually take: a motif stated and answered (A B A C),
     one stated three times and capped (A A2 A3 C, the sentence), two ideas
     traded (A B A2 B2), and a line that never repeats at all (A B C D) —
     which is rare, and should be. */
  const FORMS_2 = {
    4: [
      ['A', 'B', 'A', 'C'],
      ['A', 'A', 'B', 'C'],
      ['A', 'A2', 'A', 'C'],
      ['A', 'B', 'B2', 'C'],
      ['A', 'B', 'C', 'D']
    ],
    8: [
      ['A', 'A2', 'A3', 'B', 'A', 'A2', 'A3', 'C'],
      ['A', 'B', 'C', 'B2', 'A', 'B', 'C', 'D'],
      ['A', 'A2', 'B', 'B2', 'C', 'C2', 'A', 'D'],
      ['A', 'B', 'A2', 'B2', 'C', 'C2', 'B3', 'D'],
      ['A', 'A', 'B', 'C', 'A', 'A', 'B', 'D']
    ],
    12: [
      ['A', 'A2', 'B', 'C', 'A', 'A3', 'B', 'C2', 'D', 'D2', 'A', 'E'],
      ['A', 'B', 'A2', 'C', 'A', 'B', 'A3', 'C2', 'D', 'B2', 'A', 'E']
    ]
  };

  function chooseForm(totalBars, rng, v2) {
    if (v2 && FORMS[totalBars]) return rng.pick(FORMS[totalBars].concat(FORMS_2[totalBars] || [])).slice();
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

  /* One note fewer in a bar, by resting the first or tying two together —
     and never an empty bar. */
  function breathe(cell, rng) {
    const wanted = rng.chance(0.5) ? 'restFirst' : 'mergePair';
    const out = RHYTHM_OPS.find((fn) => fn.name === wanted)(cell, rng);
    return cellNotes(out) ? out : cell;
  }

  function varyRhythm(cell, times, rng) {
    let out = cell.slice();
    for (let i = 0; i < times; i++) out = RHYTHM_OPS[rng.int(0, RHYTHM_OPS.length - 1)](out, rng);
    // Never leave a bar entirely empty.
    if (!cellNotes(out)) out = cell.slice();
    return out;
  }

  /* The motif an eighth late: the same figure, starting off the beat. Only
     where the last value can give up the time, so the bar still adds up. */
  function displace(cell) {
    const last = cell[cell.length - 1];
    if (Math.abs(last) < 4) return null;
    const out = [-2].concat(cell.slice(0, -1), [Math.sign(last) * (Math.abs(last) - 2)]);
    return cellNotes(out) ? out : null;
  }

  /* How engine 2 develops a motif it has stated before. Engine 1 only ever
     changed the rhythm; these are the other things composers do with a bar
     they want you to recognise: play it again exactly, move it up or down the
     scale (a sequence), turn it upside down, play it backwards, or start it
     late. Weighted toward the plain ones, because development that is all
     cleverness stops sounding like the same idea. */
  const DEVELOPMENTS = [
    { op: 'rhythm', w: 3 }, { op: 'exact', w: 2 }, { op: 'sequence', w: 3 },
    { op: 'invert', w: 1.2 }, { op: 'retro', w: 0.8 }, { op: 'displace', w: 1 }
  ];

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
    /* What kind of line this is. The chorus is the genre's melody exactly as
       it has always been written; the verse is the same generator told to sit
       lower, rest more, step rather than leap and leave its last note hanging
       — see verseCharacter. Every field is optional and every default is the
       chorus, so a line with no character draws precisely the notes it always
       did, from precisely the same random draws. */
    const character = ctx.character || {};
    const v2 = !!ctx.v2;

    const lo = character.range ? character.range[0] : spec.range[0];
    const hi = character.range ? character.range[1] : spec.range[1];
    const wantRest = clamp(spec.restiness + energyMod.restiness + (character.restiness || 0), 0, 0.6);
    const baseLeap = clamp((spec.leapiness || 0.25) + energyMod.leapiness + (character.leapiness || 0), 0.05, 0.7);
    let pentBias = spec.pentatonicBias || 0;
    const chromatic = spec.chromaticApproach || 0;
    const cells = v2 && moreOf(genre).cells ? spec.cells.concat(moreOf(genre).cells) : spec.cells;

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

    /* Engine 2 gives every line a temperament of its own, inside the genre's:
       how willing it is to repeat a note — which is most of what makes a hook
       a hook — how far it will leap, how much it leans on the pentatonic and
       how tightly it hugs its contour. Two lines in one genre used to share
       one set of instincts and differ only in where the dice fell. */
    /* One song, one singer: a verse takes the chorus's temperament rather
       than rolling its own, so that the verse-and-chorus difference is the
       one verseCharacter draws and not two strangers'. */
    const rolled = v2 ? lineTemper(makeRng(Math.floor(rng.next() * 0x7fffffff))) : null;
    const temper = v2 ? ctx.temper || rolled : null;
    const leapiness = temper ? clamp(baseLeap * temper.leap, 0.05, 0.75) : baseLeap;
    if (temper) pentBias *= temper.pent;

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
    const climaxStep = Math.floor(totalSteps * (v2 ? rng.range(0.4, 0.82) : rng.range(0.55, 0.76)));
    const shape = rng.pick(character.shapes || (v2 ? SHAPES_2 : ['arch', 'arch', 'rise', 'fall', 'wave']));

    // Where the line should sit at a given moment, and how high it may go.
    // `seat` is the slice of the range the contour moves through: the upper
    // three quarters by default, lower for a verse.
    const seat = character.seat || [0.25, 1];
    function targetAt(step) {
      const t = step / Math.max(1, totalSteps - 1);
      const low = lo + 2;
      const high = hi - 3;
      let f;
      if (shape === 'arch') f = Math.sin(Math.PI * t);
      else if (shape === 'rise') f = t;
      else if (shape === 'fall') f = 1 - t;
      else if (shape === 'valley') f = 1 - Math.sin(Math.PI * t);
      else if (shape === 'late') f = t < 0.8 ? Math.pow(t / 0.8, 2) : 1 - (t - 0.8) * 2;
      else if (shape === 'early') f = t < 0.3 ? t / 0.3 : 1 - (t - 0.3);
      else if (shape === 'stairs') f = Math.min(1, Math.floor(t * 4) / 3);
      else f = 0.5 + 0.5 * Math.sin(Math.PI * 2 * t - Math.PI / 2);
      return low + (high - low) * (seat[0] + (seat[1] - seat[0]) * f);
    }
    function ceilingAt(step) {
      return Math.abs(step - climaxStep) < STEPS_PER_BAR ? hi : hi - 3;
    }

    const form = ctx.form || chooseForm(totalBars, rng, v2);
    const halfBar = Math.ceil(totalBars / 2) - 1;

    const rhythms = {};   // base letter -> the motif's rhythm
    const contours = {};  // base letter -> relative motion, in scale-index deltas
    const starts = {};    // base letter -> where its first statement began, as a scale index
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
        rhythms[base] = pickCell(cells, rng, clamp(wantRest + (temper ? temper.rest : 0), 0, 0.6),
          energyMod.density + (character.density || 0) + (temper ? temper.density : 0), isCadenceBar);
        /* A verse breathes: some of its motifs start after the downbeat or tie
           two notes into one, so it has fewer notes than the hook whatever the
           genre's cells offer — most banks carry no rests at all, and a taste
           for rests can only choose among cells that have them. Only a line
           with `breath` draws for this, so the chorus draws nothing. */
        if (character.breath && rng.chance(character.breath)) rhythms[base] = breathe(rhythms[base], rng);
      }
      let rhythm;
      let development = 'rhythm';
      if (v2 && variation && contours[base]) {
        development = weightedPick(rng, DEVELOPMENTS).op;
        if (development === 'retro' && isCadenceBar) development = 'rhythm';
      }
      if (!variation) rhythm = rhythms[base].slice();
      else if (development === 'rhythm') rhythm = varyRhythm(rhythms[base], variation, rng);
      else if (development === 'retro') rhythm = rhythms[base].slice().reverse();
      else if (development === 'displace') rhythm = displace(rhythms[base]) || varyRhythm(rhythms[base], 1, rng);
      else rhythm = rhythms[base].slice();
      if (!cellNotes(rhythm)) rhythm = rhythms[base].slice();
      if (isCadenceBar && rhythm[rhythm.length - 1] < 4) rhythm = varyRhythm(rhythm, 1, rng);
      /* Engine 2: a pickup. When the next bar restates the opening idea, the
         end of this one may give up an eighth to lead into it — the upbeat a
         singer takes a breath before. */
      if (v2 && !isCadenceBar && form[bar + 1] && form[bar + 1][0] === form[0][0]
        && Math.abs(rhythm[rhythm.length - 1]) >= 4 && rng.chance(0.4)) {
        const last = rhythm.pop();
        rhythm.push(Math.sign(last) * (Math.abs(last) - 2), 2);
      }

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
      let contour = contours[base];
      let startIdx;
      if (contour && development !== 'rhythm') {
        if (development === 'invert') contour = contour.map((d, i) => (i ? -d : d));
        else if (development === 'retro') contour = [0].concat(contour.slice(1).reverse().map((d) => -d));
        else if (development === 'sequence') startIdx = starts[base] + rng.pick([-2, -1, 1, 2]);
      }
      let barPitches = contour && contour.length
        ? replayContour(contour, slots, { pitches, indexOfPitch, prevPitch, lo, hi, startIdx })
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
          repeat: temper ? temper.repeat : undefined,
          pull: temper ? temper.pull : undefined,
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
        /* A verse does not close. It leaves its last note hanging the way the
           midpoint does, so the chorus has something to resolve. */
        barPitches[last] = character.open
          ? openNote(barPitches[last], slots[last].chord, key, pitches, indexOfPitch)
          : cadenceNote(
            barPitches[last - 1] !== undefined ? barPitches[last - 1] : prevPitch,
            slots[last].chord, key, pitches, indexOfPitch
          );
      } else if (isHalfCadenceBar) {
        const last = slots.length - 1;
        barPitches[last] = openNote(barPitches[last], slots[last].chord, key, pitches, indexOfPitch);
      }

      if (!contours[base]) {
        contours[base] = toContour(barPitches, indexOfPitch);
        starts[base] = indexOfPitch(barPitches[0]);
      }

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
    /* A developed motif — inverted, reversed, moved up the scale — can land
       more than an octave from the note before it, which nobody sings. The
       same pitch an octave nearer is the same note of the chord. */
    const tame = () => {
      if (!v2) return;
      for (let i = 1; i < notes.length; i++) {
        const before = notes[i - 1].midi;
        while (notes[i].midi - before > 12 && notes[i].midi - 12 >= lo) notes[i].midi -= 12;
        while (before - notes[i].midi > 12 && notes[i].midi + 12 <= hi) notes[i].midi += 12;
      }
    };
    const settle = () => { tame(); for (let pass = 0; pass < 6 && repairMelody(notes, repairOpts); pass++); };
    settle();
    if (notes.length) {
      // The repair pass may have moved the last note; put the ending back.
      const final = notes[notes.length - 1];
      final.midi = character.open
        ? openNote(final.midi, chordAt(final.start), key, pitches, indexOfPitch)
        : cadenceNote(
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
    if (temper) notes.temper = temper;
    return notes;
  }

  /* Engine 2's contours, beside engine 1's: a line can dip and come back
     (valley), save its peak for the end (late), peak almost at once and
     spend the rest coming down (early), or climb a step each phrase. */
  const SHAPES_2 = ['arch', 'arch', 'rise', 'fall', 'wave', 'valley', 'late', 'early', 'stairs'];

  function lineTemper(rng) {
    return {
      repeat: rng.pick([0.3, 0.3, 0.55, 0.9]),
      leap: rng.range(0.75, 1.35),
      pent: rng.range(0.6, 1.4),
      pull: rng.range(0.85, 1.25),
      density: rng.range(-0.7, 0.7),
      rest: rng.range(-0.06, 0.1)
    };
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
    const { pitches, indexOfPitch, prevPitch, lo, hi, startIdx } = opts;
    const count = Math.min(contour.length, slots.length);
    if (!count) return [];

    // Anchor the restatement on a chord tone near where the last bar left off
    // — or, for a sequence, a step or two from where the motif first began,
    // so that it is heard as the same figure moved rather than a new one.
    const anchorChord = slots[0].chord;
    const from = prevPitch === null ? Math.round((lo + hi) / 2) : prevPitch;
    let idx = startIdx === undefined
      ? nearestChordToneIndex(indexOfPitch(from), anchorChord, pitches, 4)
      : clamp(startIdx, 0, pitches.length - 1);

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
      if (stepDist === 0) w *= o.repeat === undefined ? 0.3 : o.repeat;
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
      w *= Math.exp(-Math.abs(midi - target) / (o.pull === undefined ? 6.5 : 6.5 * o.pull));

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

    /* Engine 2 writes the second line one of three ways. `fills` is engine
       1's: it moves in the melody's gaps. `sustain` is a held line, a note or
       two per chord, the way strings pad under a vocal. `echo` imitates — it
       plays the tune's own rhythm and contour back a beat or two behind it,
       an octave or a sixth below, which is the oldest way there is of
       writing a second voice that sounds like it belongs to the first. */
    const mode = ctx.v2 ? leanPick(rng, moreOf(genre).counter || ['fills']) : 'fills';
    const preset = new Map();

    // Rhythm: favour the gaps. Silence first, then sustains, and stay off the
    // melody's own attacks so the two lines do not move as one block.
    const slots = [];
    if (mode === 'sustain') {
      spans.forEach((span) => {
        slots.push(span.start);
        if (span.length >= 16 && rng.chance(0.45)) slots.push(span.start + 8);
      });
    } else if (mode === 'echo') {
      const delay = rng.pick([4, 8, 8, 6]);
      const below = rng.pick([12, 9, 8]);
      melody.forEach((note) => {
        const step = note.start + delay;
        if (step >= totalSteps || preset.has(step)) return;
        slots.push(step);
        preset.set(step, note.midi - below);
      });
      if (!slots.length) slots.push(0);
    }
    for (let bar = 0; mode === 'fills' && bar < totalBars; bar++) {
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
      const echoed = preset.get(step);
      const midi = echoed !== undefined ? pitches[indexOfPitch(echoed)] : chooseNext({
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
    const style = ctx.style || genre.chordRhythm || 'sustain';
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

        /* Engine 2's patterns. None of these names is any genre's
           chordRhythm, so engine 1 never reaches them. */
        case 'halfNotes':
          hit(0, 7.5, 0.64);
          hit(8, 7.5, 0.54);
          break;
        case 'pushes':
          // One, the and of two, the and of three: the pop piano's push.
          hit(0, 5.5, 0.66);
          hit(6, 3.5, 0.54);
          hit(10, 5.5, 0.58);
          break;
        case 'tresillo':
          hit(0, 5.5, 0.68);
          hit(6, 5.5, 0.56);
          hit(12, 3.5, 0.6);
          break;
        case 'syncoStabs':
          [0, 3, 6, 8, 11, 14].forEach((offset) => hit(offset, 1.2, offset % 8 === 0 ? 0.7 : 0.54));
          break;
        case 'gallop':
          for (let s = 0; s < len; s += 4) {
            hit(s, 1.8, 0.66);
            hit(s + 2, 0.9, 0.48);
            hit(s + 3, 0.9, 0.5);
          }
          break;
        case 'skank':
          for (let s = 4; s < len; s += 8) hit(s, 1, 0.64);
          break;
        case 'chank':
          [2, 6, 10, 14].forEach((offset) => hit(offset, 0.6, 0.6));
          [7, 15].forEach((offset) => hit(offset, 0.4, 0.34));
          break;
        case 'backbeat':
          hit(0, 1.5, 0.46);
          for (let s = 4; s < len; s += 8) hit(s, 3, 0.64);
          break;
        case 'pulse8':
          for (let s = 0; s < len; s += 2) hit(s, 0.9, 0.42 + 0.2 * ((s % 4) / 2));
          break;
        case 'rolled':
          hit(0, len, 0.6, 0.35);
          break;
        case 'swells':
          voicing.forEach((midi, i) => {
            const offset = i * 2;
            if (offset >= len) return;
            events.push({ start: at + offset, dur: len - offset, midi, velocity: clamp((0.4 + i * 0.06) * energyMod.velocity, 0.2, 1) });
          });
          break;
        case 'bossaPartido':
          hit(0, 2.5, 0.68);
          hit(3, 2.5, 0.52);
          hit(6, 3.5, 0.58);
          hit(10, 1.5, 0.5);
          hit(12, 3.5, 0.56);
          break;
        case 'broken':
        case 'travis':
        case 'stride': {
          /* One hand's worth of the chord at a time: the low note and the
             rest of it in turn (broken), a thumb alternating between two low
             strings under the top ones (travis), or bass on one and three
             under the chord on two and four (stride). */
          const low = voicing[0];
          const upper = voicing.slice(1);
          const one = (offset, notes, dur, velocity) => {
            if (offset >= len) return;
            notes.forEach((midi) => events.push({
              start: at + offset, dur: Math.max(0.5, Math.min(dur, len - offset)), midi,
              velocity: clamp(velocity * energyMod.velocity, 0.2, 1)
            }));
          };
          for (let s = 0; s < len; s += style === 'stride' ? 4 : 2) {
            if (style === 'broken') {
              const phase = (s / 2) % 4;
              one(s, phase === 0 ? [low] : phase === 2 ? [voicing[Math.min(1, voicing.length - 1)]] : upper,
                1.9, phase === 0 ? 0.66 : 0.5);
            } else if (style === 'travis') {
              if (s % 4 === 0) one(s, [(s / 4) % 2 ? voicing[Math.min(1, voicing.length - 1)] : low], 3.8, 0.64);
              else one(s, [upper[((s - 2) / 4) % 2 ? Math.max(0, upper.length - 2) : upper.length - 1] || low], 1.8, 0.5);
            } else if (s % 8 === 0) one(s, [low], 3.6, 0.66);
            else one(s, upper.length ? upper : [low], 3, 0.54);
          }
          break;
        }
        case 'arpDown':
        case 'arpUpDown':
        case 'arp16':
        case 'dotted': {
          const n = voicing.length;
          const every = style === 'arp16' ? 1 : style === 'dotted' ? 3 : 2;
          const cycle = n > 1 ? 2 * n - 2 : 1;
          let k = 0;
          for (let s = 0; s < len; s += every, k++) {
            let idx;
            if (style === 'arpDown') idx = n - 1 - (k % n);
            else if (style === 'dotted') idx = k % n;
            else { const c = k % cycle; idx = c < n ? c : cycle - c; }
            events.push({
              start: at + s, dur: every === 1 ? 0.95 : every === 3 ? 2.8 : 1.9, midi: voicing[idx],
              velocity: clamp((s % 8 === 0 ? 0.66 : 0.5) * energyMod.velocity, 0.2, 1)
            });
          }
          break;
        }
        default:
          hit(0, len, 0.6);
      }
    });

    /* A push: the next chord struck an eighth early, on the and of four, and
       held over the bar line. It is the commonest thing a band does to make
       a loop lean forward, and engine 1 never did it at all. Only on bar
       lines, never into the top of the loop, and only for patterns that
       strike the chord as a block. */
    const push = ctx.push || 0;
    const ARPS = ['arpUp', 'arpDown', 'arpUpDown', 'arp16', 'dotted', 'broken', 'travis', 'stride', 'swells'];
    if (push > 0 && ARPS.indexOf(style) < 0) {
      spans.forEach((span, index) => {
        if (index === 0 || span.start % STEPS_PER_BAR !== 0 || !rng.chance(push)) return;
        const early = span.start - 2;
        const previous = spans[index - 1];
        if (previous.start >= early) return;
        for (let i = events.length - 1; i >= 0; i--) {
          const e = events[i];
          if (e.start >= early && e.start < span.start) events.splice(i, 1);
          else if (e.start < early && e.start + e.dur > early) e.dur = Math.max(0.5, early - e.start);
        }
        events.forEach((e) => {
          if (e.start === span.start) { e.start = early; e.dur += 2; e.velocity = clamp(e.velocity * 1.06, 0.2, 1); }
        });
      });
    }

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
    funk16:     { label: 'Sixteenth funk', how: 'Root anchoring beat 1, then octave pops and fifths scattered across the sixteenths.' },
    kickLock:   { label: 'Locked to the kick', how: 'A note on every kick — the bass and the bass drum as one instrument, the root mostly, an octave or a fifth for lift.' },
    arp:        { label: 'Arpeggio', how: 'Root, third, fifth and octave on the eighths, up and back down.' },
    melodic:    { label: 'Melodic', how: 'Root on the one, chord tones through the bar, then a scale step into the next chord.' },
    walking2:   { label: 'Two feel', how: 'Root and fifth on half notes, with the odd eighth-note skip into the next chord.' },
    offbeat8:   { label: 'Offbeat eighths', how: 'Nothing on the beat, the root on every and — the pump under a four-to-the-floor kick.' },
    gallop:     { label: 'Gallop', how: 'An eighth and two sixteenths on every beat, all on the root.' },
    pulse16:    { label: 'Sixteenth pulse', how: 'The root on every sixteenth, accented on the beat — the motor under a synth track.' },
    anticipate: { label: 'Anticipated', how: 'Root on the one, then the next chord\u2019s root an eighth early, tied across the bar line.' },
    sparse:     { label: 'Sparse', how: 'The root on the one and one short note later in the bar. Most of it is space.' },
    boogie:     { label: 'Boogie', how: 'Root, third, fifth, sixth, flat seven and back down, on the eighths.' },
    shuffle56:  { label: 'Five–six shuffle', how: 'Root, then the fifth and sixth rocking on the eighths — the shuffle guitar figure, an octave down.' },
    rootFifthWalk: { label: 'Boom-chick walk', how: 'Root on one, fifth on three, and two eighths walking up or down into each new chord.' }
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
    const style = ctx.style || genre.bass || 'roots';
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

        /* Engine 2's lines. None of these names is any genre's `bass`, so
           engine 1 never reaches them. */
        case 'kickLock': {
          const kick = ctx.beat && ctx.beat.kick;
          const totalSteps = totalBars * STEPS_PER_BAR;
          const loop = kick ? (totalSteps % kick.length === 0 ? kick.length : STEPS_PER_BAR) : 0;
          const hits = [];
          for (let s = 0; s < len; s++) {
            const symbol = kick ? kick[(at + s) % loop] : null;
            if (symbol === 'x' || symbol === 'o') hits.push(s);
          }
          if (hits[0] !== 0) hits.unshift(0);
          hits.forEach((s, j) => {
            const end = j + 1 < hits.length ? hits[j + 1] : len;
            const lift = j > 0 && rng.chance(0.28);
            push(at + s, Math.max(0.9, Math.min(end - s, 8) - 0.2),
              lift ? (rng.chance(0.5) ? root + 12 : fifth) : root, j === 0 ? 0.95 : 0.8);
          });
          break;
        }

        case 'arp': {
          const third = span.rootMidi + (span.chord.intervals[1] || 4);
          const tones = [root, third, span.rootMidi + 7, root + 12].map((m) => {
            let v = m;
            while (v < root) v += 12;
            while (v > root + 14) v -= 12;
            return v;
          });
          const order = [0, 1, 2, 3, 2, 1, 2, 1];
          for (let s = 0; s < len; s += 2) push(at + s, 1.8, tones[order[(s / 2) % order.length]], s % 8 === 0 ? 0.9 : 0.72);
          break;
        }

        case 'melodic': {
          const target = nearestOctave(next.bassMidi, root);
          const third = span.rootMidi + (span.chord.intervals[1] || 4);
          const beats = len / 4;
          for (let b = 0; b < beats; b++) {
            let midi;
            let role = null;
            if (b === 0) midi = root;
            else if (b === beats - 1 && target !== root) {
              midi = scaleNeighbour(ctx.key, target, root < target ? -1 : 1);
              role = 'approach';
            } else midi = rng.pick([third, root + 7, root + 7, root + 12]);
            while (midi > root + 14) midi -= 12;
            while (midi < root - 7) midi += 12;
            if (b === 2 && rng.chance(0.3)) {
              push(at + 8, 1.8, midi, 0.8, role);
              push(at + 10, 1.8, scaleNeighbour(ctx.key, midi, 1), 0.7);
            } else push(at + b * 4, 3.6, midi, b === 0 ? 0.92 : 0.78, role);
          }
          break;
        }

        case 'walking2': {
          if (len < 16) { push(at, len - 0.4, root, 0.9); break; }
          push(at, 7.6, root, 0.9);
          const skip = next.bassMidi !== root && rng.chance(0.4);
          push(at + 8, skip ? 5.6 : 7.6, fifth > root + 12 ? root - 5 : fifth, 0.78);
          if (skip) push(at + 14, 1.8, next.bassMidi + (next.bassMidi >= root ? -1 : 1), 0.7, 'approach');
          break;
        }

        case 'offbeat8':
          for (let s = 2; s < len; s += 4) push(at + s, 1.6, s === 14 && rng.chance(0.3) ? root + 12 : root, 0.88);
          break;

        case 'gallop':
          for (let s = 0; s < len; s += 4) {
            const midi = s === 8 && rng.chance(0.3) ? fifth : root;
            push(at + s, 1.8, midi, 0.92);
            push(at + s + 2, 0.9, midi, 0.7);
            push(at + s + 3, 0.9, midi, 0.74);
          }
          break;

        case 'pulse16':
          for (let s = 0; s < len; s++) push(at + s, 0.85, root, s % 4 === 0 ? 0.92 : 0.64);
          break;

        case 'anticipate': {
          const nextRoot = nearestOctave(next.bassMidi, root);
          if (len >= 16) {
            push(at, 5.6, root, 0.92);
            push(at + 6, 3.6, root, 0.72);
            push(at + 10, 3.6, rng.chance(0.5) ? fifth : root, 0.74);
            push(at + 14, 2, nextRoot, 0.84);
          } else {
            push(at, len - 2.4, root, 0.92);
            push(at + len - 2, 2, nextRoot, 0.82);
          }
          break;
        }

        case 'sparse':
          push(at, Math.min(len, 5.6), root, 0.9);
          if (len >= 16) push(at + rng.pick([7, 10, 10]), 1.8, rng.pick([root, fifth, root + 12]), 0.72);
          break;

        case 'boogie':
        case 'shuffle56': {
          const third = span.chord.intervals[1] === 3 ? 3 : 4;
          const figure = style === 'boogie' ? [0, third, 7, 9, 10, 9, 7, third] : [0, 0, 7, 7, 9, 9, 7, 7];
          for (let s = 0; s < len; s += 2) push(at + s, 1.8, span.rootMidi + figure[(s / 2) % 8], s % 8 === 0 ? 0.92 : 0.74);
          break;
        }

        case 'rootFifthWalk': {
          const low = fifth > root + 12 ? root - 5 : fifth;
          push(at, 3.6, root, 0.92);
          const target = nearestOctave(next.bassMidi, root);
          if (len >= 16 && target !== root) {
            push(at + 8, 3.6, low, 0.8);
            const dir = target > root ? -1 : 1;
            const a = scaleNeighbour(ctx.key, target, dir);
            push(at + 12, 1.8, scaleNeighbour(ctx.key, a, dir), 0.72);
            push(at + 14, 1.8, a, 0.76);
          } else if (len >= 8) push(at + len / 2, len / 2 - 0.4, low, 0.8);
          break;
        }

        default:
          push(at, len, root, 0.85);
      }
    });

    /* Engine 2: the bass walks into the top of the loop. The last beat of
       the last bar is given over to a run — two eighths or four sixteenths
       — stepping through the scale onto the first chord's root, which is
       what a bass player does at the end of every phrase they want you to
       notice the start of. Every time round, unlike a drum fill: it replaces
       what the bass would have played there, and leaving it out on the
       inner passes would leave the last beat empty rather than plain. */
    const totalSteps = totalBars * STEPS_PER_BAR;
    const lastSpan = spans[spans.length - 1];
    const fillOdds = ctx.fill || 0;
    if (fillOdds > 0 && lastSpan && totalBars >= 2 && rng.chance(fillOdds)) {
      const from = totalSteps - 4;
      current = spans.filter((sp) => sp.start <= from).pop() || lastSpan;
      const target = nearestOctave(spans[0].bassMidi, current.bassMidi);
      const count = rng.chance(0.5) ? 2 : 4;
      const dir = target >= current.bassMidi ? -1 : 1;
      const run = [];
      let midi = target;
      for (let i = 0; i < count; i++) { midi = scaleNeighbour(ctx.key, midi, dir); run.unshift(midi); }
      for (let i = events.length - 1; i >= 0; i--) {
        const e = events[i];
        if (e.start >= from) events.splice(i, 1);
        else if (e.start + e.dur > from) e.dur = Math.max(0.5, from - e.start);
      }
      const each = 4 / count;
      run.forEach((m, i) => push(from + i * each, each * 0.9, m, 0.7 + i * 0.05));
    }

    const kept = events.filter((e) => e.start < totalSteps);
    /* One string, one note at a time. A pattern written for a whole bar
       overlaps itself once a substitution splits that bar in two, and a bass
       that sounds two notes at once is a chord nobody wrote. Engine 2 cuts
       each note at the next, and at the end of the loop. */
    if (ctx.v2) {
      kept.sort((a, b) => a.start - b.start);
      kept.forEach((e, i) => {
        const end = i + 1 < kept.length ? kept[i + 1].start : totalSteps;
        if (e.start + e.dur > end) e.dur = Math.max(0.4, end - e.start - 0.1);
      });
      return kept.filter((e, i) => i === 0 || e.start > kept[i - 1].start);
    }
    return kept;
  }

  /* The octave of `pc`'s note nearest to `near`. */
  function nearestOctave(midi, near) {
    let m = midi;
    while (m - near > 6) m -= 12;
    while (near - m > 6) m += 12;
    return m;
  }

  /* One step along the key's scale from a note, up (+1) or down (−1). A
     note outside the scale steps to the nearest scale note that way. */
  function scaleNeighbour(key, midi, dir) {
    const scale = new Set(key.scalePcs);
    let m = midi + dir;
    while (!scale.has(mod(m, 12))) m += dir;
    return m;
  }

  /* ----------------------------------------------------------------- drums */

  /* Which beat this song plays. A genre carries several and the draw is
     seeded, so the same recipe gives the same beat back — but two songs in the
     same genre no longer arrive with the identical drum part. */
  function pickBeat(genre, rng, v2) {
    let list = Array.isArray(genre.drums) ? genre.drums : [genre.drums || {}];
    if (v2 && moreOf(genre).drums && moreOf(genre).drums.length) list = list.concat(moreOf(genre).drums);
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

  /* Fills, as a vocabulary rather than as one shape.

     Each returns the events it adds and, optionally, how much of the last bar
     to take away first — because the strongest fill in several genres is the
     one where everything stops. `bar` is the first step of the bar being
     filled, so a shape is written in steps 0–15 of its own bar. */
  const FILL_SHAPES = {
    snareRun: (f) => ({ add: [12, 13, 14, 15]
      .filter(() => f.rng.chance(0.75))
      .map((s, i) => ({ step: f.bar + s, instrument: 'snare', velocity: 0.45 + i * 0.12 })) }),

    /* Down the kit. The point of a tom fill is that it descends, so the
       velocities rise as the pitch falls and the floor tom lands hardest. */
    tomFall: (f) => ({ add: [['tomHigh', 12, 0.62], ['tomHigh', 13, 0.66],
      ['tomMid', 14, 0.78], ['tomLow', 15, 0.92]]
      .map(([instrument, s, velocity]) => ({ step: f.bar + s, instrument, velocity })) }),

    tomRoll: (f) => ({ add: [['tomHigh', 10, 0.5], ['tomHigh', 11, 0.55],
      ['tomMid', 12, 0.62], ['tomMid', 13, 0.68], ['tomLow', 14, 0.8], ['tomLow', 15, 0.95]]
      .map(([instrument, s, velocity]) => ({ step: f.bar + s, instrument, velocity })) }),

    /* Kick and snare answering each other, which is what a trade is. */
    trade: (f) => ({ add: [['kick', 12, 0.8], ['snare', 13, 0.62],
      ['kick', 14, 0.82], ['snare', 15, 0.9]]
      .map(([instrument, s, velocity]) => ({ step: f.bar + s, instrument, velocity })) }),

    /* The open hat pulls the ear up into the next bar. */
    lift: (f) => ({ add: [
      { step: f.bar + 14, instrument: 'openHat', velocity: 0.8 },
      { step: f.bar + 15, instrument: 'snare', velocity: 0.85 }
    ] }),

    /* Two snares a thirty-second apart: a hand, not a machine. */
    flam: (f) => ({ add: [
      { step: f.bar + 14, instrument: 'snare', velocity: 0.5 },
      { step: f.bar + 14.5, instrument: 'snare', velocity: 0.72 },
      { step: f.bar + 15, instrument: 'snare', velocity: 0.88 }
    ] }),

    /* Everything stops for the last beat. Nothing is added at all. */
    drop: () => ({ clear: 12, add: [] }),

    /* Engine 2's shapes. A snare roll over the last two beats, rising. */
    snareBuild: (f) => ({ add: [8, 9, 10, 11, 12, 13, 14, 15]
      .map((s, i) => ({ step: f.bar + s, instrument: 'snare', velocity: 0.32 + i * 0.085 })) }),

    /* Kick and snare alternating on the sixteenths, the snare getting the last word. */
    kickSnare: (f) => ({ clear: 12, add: [['kick', 12, 0.78], ['snare', 13, 0.6], ['kick', 14, 0.8],
      ['snare', 15, 0.92]].map(([instrument, s, velocity]) => ({ step: f.bar + s, instrument, velocity })) }),

    /* The band stops for half a bar and the kit says one thing into the hole. */
    stop: (f) => ({ clear: 8, add: [
      { step: f.bar + 8, instrument: 'kick', velocity: 0.86 },
      { step: f.bar + 14, instrument: 'snare', velocity: 0.7 },
      { step: f.bar + 15, instrument: 'snare', velocity: 0.9 }
    ] }),

    /* Round the kit over two beats. */
    halfBarTom: (f) => ({ clear: 8, add: [['snare', 8, 0.6], ['tomHigh', 9, 0.55], ['tomHigh', 10, 0.62],
      ['tomMid', 11, 0.66], ['tomMid', 12, 0.72], ['tomLow', 13, 0.78], ['tomLow', 14, 0.86], ['kick', 15, 0.8]]
      .map(([instrument, s, velocity]) => ({ step: f.bar + s, instrument, velocity })) })
  };
  const DEFAULT_FILLS = ['snareRun', 'tomFall', 'trade'];

  function buildDrums(ctx) {
    const { genre, totalBars, rng, energy } = ctx;
    const patterns = ctx.beat || pickBeat(genre, rng, ctx.v2);
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
      /* A crash marks the top of the loop, which is what the faceplate has
         always said it does — so it is stamped once rather than looped. Left
         to repeat, a one-bar `crash: 'x...'` fired on every bar of the song,
         which is not a crash, it is a car alarm. */
      const reach = instrument === 'crash' ? Math.min(span, totalSteps) : totalSteps;
      for (let step = 0; step < reach; step++) {
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

    /* Engine 2: the drummer does not play the same bar four times. On the
       second bar of each pair it may push a kick into the and of four, slip a
       ghost note in front of the backbeat, open the hat going into the next
       bar, or leave a kick out — one small thing, so the bar is still
       recognisably the beat. Only on one-bar patterns: a beat written two or
       four bars long already says what its second bar does. */
    if (ctx.v2 && totalBars >= 2) varyGroove(events, patterns, totalBars, makeRng(Math.floor(rng.next() * 0x7fffffff)), energyMod, nudgeFor);

    /* ------------------------------------------------- hearing the band

       Until here the kit has been deaf. It knows the genre, the energy and
       its own pattern, and nothing whatever about the music it is playing
       under — which is how you get four layers that start together rather
       than a rhythm section.

       Three things it can hear, all of them cheap and none of them rewriting
       the pattern. Rewriting is the temptation and it is wrong: the beats are
       hand-written and idiomatic, and a generator that second-guesses them
       ends up with neither the pattern nor an idea of its own. */
    const spans = ctx.spans || [];
    const bassLine = ctx.bass || [];

    if (spans.length) {
      /* A drummer marks the chord change. Anything already landing on one
         gets played a little harder — the change is a fact about the bar and
         the kit should sound like it knows. */
      const changes = new Set(spans.map((s) => s.start));
      events.forEach((e) => {
        if (changes.has(e.step)) e.velocity = clamp(e.velocity * 1.1, 0.14, 1);
      });

      /* And where a change lands on a bar line with no kick anywhere near it,
         the kit puts one there. Only into a hole: a pattern that already has
         a kick on the change is already doing this, and four-on-the-floor
         never has a hole to fill.

         Only if the beat has a kick at all, which is the difference between
         filling a hole and inventing a drum part. Ambient has no kit and is
         not asking for one. */
      const kicks = events.filter((e) => e.instrument === 'kick');
      if (patterns.kick) spans.forEach((span) => {
        if (span.start % STEPS_PER_BAR !== 0) return;
        const near = kicks.some((k) => Math.abs(k.step - span.start) <= 1);
        if (near) return;
        events.push({
          step: span.start, instrument: 'kick', ghost: false,
          nudge: nudgeFor('kick'),
          velocity: clamp(0.78 * energyMod.velocity * arcAt(span.start, totalSteps, climax), 0.14, 1)
        });
      });
    }

    /* Where the kick and the bass land together they should sound like they
       meant to. This is the whole difference between a rhythm section and two
       parts that happen to be in the same song. */
    if (bassLine.length) {
      const onsets = new Set(bassLine.map((n) => Math.round(n.start)));
      events.forEach((e) => {
        if (e.instrument === 'kick' && onsets.has(Math.round(e.step))) {
          e.velocity = clamp(e.velocity * 1.08, 0.14, 1);
          e.locked = true;
        }
      });
    }

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

    /* The fill going into the loop point. The draw is taken either way — only
       the odds move with the energy — so a settings change does not shift
       which fills land, only whether they do. */
    const fillOdds = 0.55 * (energyMod.fill === undefined ? 1 : energyMod.fill);
    let shapes = (G.FILLS && G.FILLS[genre.id]) || DEFAULT_FILLS;
    if (ctx.v2 && moreOf(genre).fills && shapes.length) shapes = shapes.concat(moreOf(genre).fills);
    if (shapes.length && totalBars > 2 && rng.chance(fillOdds)) {
      const bar = (totalBars - 1) * STEPS_PER_BAR;
      /* Weighted toward the front of the list: the first shape is what this
         genre usually does, the rest are what it does for a change. */
      const shape = shapes[Math.min(shapes.length - 1, Math.floor(-Math.log(1 - rng.next()) * (ctx.v2 ? 1.8 : 0.9)))];
      const fill = FILL_SHAPES[shape];
      if (fill) {
        const made = fill({ bar, rng, nudgeFor, patterns });
        /* A drop is a fill made of silence, so it takes the last beat away
           rather than adding to it. The hole IS the fill, and it is the one
           house and trap actually use. */
        if (made.clear) {
          for (let i = events.length - 1; i >= 0; i--) {
            if (events[i].step >= bar + made.clear) events.splice(i, 1);
          }
        }
        made.add.forEach((e) => {
          e.nudge = e.nudge === undefined ? nudgeFor(e.instrument) : e.nudge;
          /* A fill keeps its own shape — that is what makes it a fill — but it
             is still played by the same drummer in the same room, so it takes
             the energy and the arc like everything else. Left as literals, a
             fill was exactly as loud in a hushed sketch as in a driving one. */
          e.velocity = clamp(e.velocity * energyMod.velocity
            * arcAt(e.step, totalSteps, climax), 0.14, 1);
          /* Marked, so the arrangement can decide where a fill belongs: at
             the end of a SECTION rather than at the end of every pass of the
             loop inside one. */
          e.fill = true;
          events.push(e);
        });
      }
    }

    return events.sort((a, b) => a.step - b.step);
  }

  function varyGroove(events, patterns, totalBars, rng, energyMod, nudgeFor) {
    const oneBar = (voice) => patterns[voice] && patterns[voice].length === STEPS_PER_BAR;
    const at = (instrument, step) => events.findIndex((e) => e.instrument === instrument && e.step === step);
    const near = (instrument, step) => events.some((e) => e.instrument === instrument && Math.abs(e.step - step) <= 1);
    const add = (instrument, step, velocity, ghost) => events.push({
      step, instrument, ghost: !!ghost, nudge: nudgeFor(instrument),
      velocity: clamp(velocity * energyMod.velocity, 0.14, 1)
    });
    for (let bar = 1; bar < totalBars; bar += 2) {
      if (!rng.chance(0.55)) continue;
      const b = bar * STEPS_PER_BAR;
      const ops = [];
      if (oneBar('kick')) {
        if (!near('kick', b + 14) && !patterns.kick.startsWith('x...x...x...x')) ops.push('kickPush');
        const offs = events.filter((e) => e.instrument === 'kick' && e.step >= b && e.step < b + 16 && (e.step - b) % 4 !== 0);
        if (offs.length) ops.push('dropKick');
      }
      if (oneBar('snare') && energyMod.ghosts !== false) {
        const spot = [b + 7, b + 15, b + 9].find((s) => !near('snare', s) && !near('clap', s));
        if (spot !== undefined) ops.push('ghost');
      }
      if (oneBar('hat') && (at('hat', b + 14) >= 0 || at('hat', b + 6) >= 0)) ops.push('openHat');
      if (!ops.length) continue;
      const op = rng.pick(ops);
      if (op === 'kickPush') add('kick', b + rng.pick([14, 10, 7].filter((s) => !near('kick', b + s))), 0.74);
      else if (op === 'dropKick') {
        const offs = events.filter((e) => e.instrument === 'kick' && e.step >= b && e.step < b + 16 && (e.step - b) % 4 !== 0);
        events.splice(events.indexOf(rng.pick(offs)), 1);
      } else if (op === 'ghost') {
        add('snare', [b + 7, b + 15, b + 9].find((s) => !near('snare', s) && !near('clap', s)), 0.3, true);
      } else {
        const i = at('hat', b + 14) >= 0 ? at('hat', b + 14) : at('hat', b + 6);
        events[i].instrument = 'openHat';
        events[i].velocity = clamp(0.86 * energyMod.velocity, 0.14, 1);
      }
    }
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

  /* One section, as a clause: "over I – V – vi – IV, closes with a perfect
     cadence; brings the opening bar's idea back twice". The song's own note
     puts a subject in front of it. */
  function describe(section, key, genre, v2) {
    const { spans, melody, form } = section;
    const parts = [];
    const romans = spans.map((s) => s.chord.roman);

    const last = spans[spans.length - 1].chord;
    const secondLast = spans.length > 1 ? spans[spans.length - 2].chord : null;
    const degreeOf = (chord) => mod(chord.rootPc - key.rootPc, 12);
    if (secondLast) {
      const from = degreeOf(secondLast);
      const to = degreeOf(last);
      if (from === 7 && to === 0) parts.push('closes with a perfect cadence, V back to I');
      else if (from === 5 && to === 0) parts.push('closes plagally, IV falling to I');
      else if (from === 7 && (to === 9 || to === 8)) parts.push('sidesteps into a deceptive cadence on vi');
      else if (to === 7) parts.push('leaves the door open, resting on V');
      else if (from === to) parts.push(`settles on ${last.roman}`);
      else parts.push(`turns around on ${last.roman}`);
    }

    /* Engine 2 writes secondary dominants and tritone substitutes on purpose,
       so it names them for what they are rather than lumping them in with
       chords borrowed from the parallel mode. */
    const unique = (list) => list.filter((roman, i) => list.indexOf(roman) === i);
    const tritone = (s) => s.chord.rootPc === mod(key.rootPc + 1, 12) && /^dom/.test(s.chord.type);
    if (v2) {
      const secondaries = unique(spans.filter((s) => s.chord.secondary).map((s) => s.chord.roman));
      if (secondaries.length) parts.push(`leans into ${secondaries.join(' and ')} — ${secondaries.length > 1 ? 'secondary dominants' : 'a secondary dominant'}`);
      const subs = unique(spans.filter(tritone).map((s) => s.chord.roman));
      if (subs.length) parts.push(`swaps the V7 for its tritone substitute, ${subs.join(' and ')}`);
      if (section.progression && section.progression.stretched) parts.push('holds each chord for two bars');
    }
    const borrowed = spans.filter((s) => s.chord.borrowed && !(v2 && (s.chord.secondary || tritone(s))));
    if (borrowed.length) {
      const names = [];
      borrowed.forEach((s) => { if (names.indexOf(s.chord.roman) < 0) names.push(s.chord.roman); });
      parts.push(`borrows ${names.join(' and ')} from outside the key`);
    }

    const repeated = form.filter((label) => label[0] === form[0][0]).length;
    if (repeated > 1) {
      const times = repeated - 1;
      parts.push(`brings the opening bar's idea back ${times === 1 ? 'once' : times === 2 ? 'twice' : times + ' more times'}, re-fitted to each chord`);
    }

    if (melody.some((n) => n.chromatic)) parts.push('slides chromatic approach notes into the strong beats');
    if (genre.melody.blueNotes) parts.push('colours the line with the flat third and flat fifth');

    // A twelve-bar blues is mostly one chord repeated; list what changes.
    const distinct = romans.filter((roman, i) => roman !== romans[i - 1]);
    const shown = distinct.slice(0, 6).join(' – ') + (distinct.length > 6 ? ' …' : '');
    return `over ${shown}, ${parts.length ? parts.join('; ') : 'lands every strong beat on a chord tone'}`;
  }

  function intervalName(semitones) {
    if (semitones <= 2) return 'a step';
    if (semitones <= 4) return 'a third';
    if (semitones === 5) return 'a fourth';
    if (semitones <= 7) return 'a fifth';
    if (semitones <= 9) return 'a sixth';
    if (semitones <= 11) return 'a seventh';
    return 'an octave';
  }

  /* The sentence the two sections need between them: what the verse does so
     that the chorus lands. Only claims that are true of this song are made —
     a verse that happens to sit no lower than its chorus is not said to. */
  function relate(verse, chorus, key) {
    const parts = [];
    const degreeOf = (chord) => mod(chord.rootPc - key.rootPc, 12);
    const verseOpens = verse.spans[0].chord;
    const chorusOpens = chorus.spans[0].chord;
    const verseCloses = verse.spans[verse.spans.length - 1].chord;
    if (verseOpens.roman !== chorusOpens.roman) {
      parts.push(degreeOf(chorusOpens) === 0
        ? `the verse starts out on ${verseOpens.roman} so the chorus can come home to ${chorusOpens.roman}`
        : `the verse opens on ${verseOpens.roman} and the chorus on ${chorusOpens.roman}`);
    } else if (verse.progression !== chorus.progression) {
      parts.push(`both open on ${chorusOpens.roman} and go their own way from there`);
    } else {
      parts.push('both sit on the same changes and the tune does the work');
    }
    if (degreeOf(verseCloses) === 7 && degreeOf(chorusOpens) !== 7) {
      parts.push(`the verse leaves off on ${verseCloses.roman}, which leans into the chorus`);
    }
    const mean = (notes) => (notes.length ? notes.reduce((sum, n) => sum + n.midi, 0) / notes.length : 0);
    const gap = Math.round(mean(chorus.melody) - mean(verse.melody));
    if (gap >= 2) parts.push(`the chorus tune sits about ${intervalName(gap)} above the verse`);
    if (verse.melody.length < chorus.melody.length * 0.9) parts.push('the verse rests more');
    const text = parts.join('; ');
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function describeSong(song) {
    const { key, sections } = song;
    const verse = sections[0];
    const chorus = sections[1];
    return `${key.rootName} ${key.scaleName}. The verse, ${verse.theory}. ` +
      `The chorus, ${chorus.theory}. ${relate(verse, chorus, key)}.`;
  }

  /* ------------------------------------------------------------- sections */

  /* How the verse differs from the chorus, as nudges on the genre's own
     melody spec. The top of its range comes down a fourth and its contour
     sits in the lower part of what is left, so the hook has somewhere to go;
     it rests more and steps rather than leaps, which is most of what makes a
     verse read as spoken and a chorus as sung; its contour is likelier to
     wander or fall than to arch; and it leaves its last note hanging so the
     chorus has something to resolve. */
  function verseCharacter(spec, v2) {
    const lo = spec.range[0];
    const hi = spec.range[1];
    return {
      range: [lo, Math.max(lo + 9, hi - 5)],
      seat: [0, 0.6],
      restiness: 0.08,
      leapiness: -0.06,
      density: -0.6,
      breath: 0.6,
      shapes: v2 ? ['wave', 'fall', 'wave', 'arch', 'valley', 'stairs'] : ['wave', 'fall', 'wave', 'arch'],
      open: true
    };
  }

  /* The verse's changes. A different progression from the same pool, the same
     length as the chorus so the two sit on one grid and every section of the
     form is a whole number of either, and chosen so that the chorus lands: it
     would rather open somewhere the chorus does not, and rather end on the
     dominant than at home. One of its own length beats one that has to repeat
     to fill the bars.

     Where the pool has nothing else that fits, the chorus's own changes are
     turned to start elsewhere — vi IV I V against I V vi IV — which is the
     oldest verse-and-chorus trick there is. Only for a short loop, though: a
     twelve-bar blues turned round is not a blues any more, so a form that
     long keeps its changes and lets the tune do the work. */
  function pickVerseProgression(genre, scaleName, key, chorus, bars, rng, extra) {
    const all = extra && extra.length ? genre.progressions.concat(extra) : genre.progressions;
    const inScale = all.filter((p) => p.scale === scaleName);
    const pool = inScale.length ? inScale : all;
    const spelled = (p) => p.chords.join(' ');
    const fits = (p) => p.chords.length === bars || bars % p.chords.length === 0;
    const degreeOf = (entry) => {
      const chord = T.parseChord(String(entry).split('|')[0], key, {});
      return chord ? mod(chord.rootPc - key.rootPc, 12) : null;
    };

    const candidates = pool.filter((p) => fits(p) && spelled(p) !== spelled(chorus));
    if (!candidates.length && chorus.chords.length <= 4) {
      for (let k = 1; k < chorus.chords.length; k++) {
        const chords = chorus.chords.slice(k).concat(chorus.chords.slice(0, k));
        const turned = { scale: chorus.scale, chords, turned: k };
        if (spelled(turned) !== spelled(chorus) && !candidates.some((c) => spelled(c) === spelled(turned))) {
          candidates.push(turned);
        }
      }
    }
    if (!candidates.length) return chorus;

    const chorusOpens = degreeOf(chorus.chords[0]);
    const items = candidates.map((p) => {
      let w = 1;
      const opens = degreeOf(p.chords[0]);
      const closes = degreeOf(p.chords[p.chords.length - 1]);
      if (opens === chorusOpens) w *= 0.3;
      if (closes === 7) w *= 1.6;
      else if (closes === 0) w *= 0.7;
      if (p.chords.length === bars) w *= 1.25;
      return { p, w };
    });
    return weightedPick(rng, items).p;
  }

  /* One section, written whole: its chords, its tune, its second line, its
     comping, its bass and its drums, against the key, tempo, beat and energy
     the other section shares. Each section has three seeds of its own — the
     chorus the song's, the verse three derived from them — so a section is
     reproducible on its own and a reroll of one seed moves the same thing in
     both. */
  function writeSection(ctx) {
    const { id, label, key, genre, energy, bars, progression, seeds, character } = ctx;
    const v2 = !!ctx.v2;
    const more = moreOf(genre);
    /* How this section is played, for engine 2: its voicing, its comping and
       its bass line, each drawn from the genre's own list on a stream of its
       own. Engine 1 plays every section the genre's one way. */
    const choose = v2 ? makeRng((seeds.harmony ^ 0x5bd1e995) >>> 0) : null;
    const voicingStyle = v2 ? leanPick(choose, more.voicings) : null;
    const comping = (v2 && (ctx.comping || leanPick(choose, more.comping))) || genre.chordRhythm || 'sustain';
    const bassStyle = (v2 && (ctx.bassStyle || leanPick(choose, more.bass))) || genre.bass || 'roots';
    const voicing = voicingStyle ? Object.assign({}, genre.voicing, { style: voicingStyle }) : null;

    const { spans, totalBars } = buildChords(progression, key, genre, bars, voicing);
    const form = chooseForm(totalBars, makeRng(seeds.melody ^ 0x9e3779b9), v2);
    const melody = buildMelody({ key, genre, spans, totalBars, rng: makeRng(seeds.melody), energy, form, character, v2, temper: ctx.temper });
    const chordTrack = buildChordTrack({
      genre, spans, rng: makeRng(seeds.harmony ^ 0x27d4eb2f), energy,
      style: v2 ? comping : null, push: v2 ? more.push || 0 : 0
    });
    /* The beat is drawn before the events are built so the choice can be kept
       on the song: the run of pads, the set-up notes and the arrangement all
       have to describe the beat that is actually playing, not the genre's
       first one. Both sections draw it from the same seed, so they are the
       same drummer playing the same beat; what differs is what it hears.

       It is drawn before the bass, too, because engine 2's bass can lock to
       the kick — but from its own stream, so the order changes nothing. */
    const drumRng = makeRng(seeds.drum);
    const beat = pickBeat(genre, drumRng, v2);
    const bass = buildBass({
      genre, spans, totalBars, rng: makeRng(seeds.harmony ^ 0x85ebca6b), energy, key, beat,
      style: v2 ? bassStyle : null, fill: v2 ? more.bassFill || 0 : 0, v2
    });
    const drums = buildDrums({
      genre, totalBars, rng: drumRng, energy, beat, v2,
      /* What the rest of the band is doing. The bass is built above this
         line for exactly that reason. */
      spans, bass,
      /* Where the tune peaks, as a fraction of the loop, so the kit leans in
         at the same moment the melody does. */
      climax: melody.climaxStep === undefined
        ? 0.66 : melody.climaxStep / Math.max(1, totalBars * STEPS_PER_BAR - 1)
    });
    const counter = ctx.counter
      ? buildCounter({ key, genre, spans, totalBars, rng: makeRng(seeds.melody ^ 0x165667b1), energy, v2 }, melody)
      : [];
    const section = {
      id, label, bars: totalBars, totalSteps: totalBars * STEPS_PER_BAR,
      progression, spans, melody, counter, chordTrack, bass, drums, form, beat,
      comping, bassStyle,
      bassPlan: BASS_STYLES[bassStyle] || BASS_STYLES.roots
    };
    section.theory = describe(section, key, genre, v2);
    return section;
  }

  /* One of a song's sections, as a song. Everything that draws or plays one
     pass of the music — the faceplate, the run, the lane, the transport on
     the bare loop — takes a song and reads its notes off the top level. This
     hands back one of those with a section's notes where the chorus's would
     be, and the whole song still underneath. */
  function section(song, id) {
    const found = (song.sections || []).find((s) => s.id === id);
    return found ? Object.assign({}, song, found) : song;
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
    /* Its own seed, and the reason is a user-facing one: the beat used to be
       derived from the harmony seed, so rerolling the chords silently rerolled
       the beat and rerolling the melody never could. Neither is what anyone
       asked for. Three independent things you can reroll one at a time. */
    const drumSeed = opts.drumSeed === undefined ? Math.floor(Math.random() * 1e9) : opts.drumSeed;
    const harmonyRng = makeRng(harmonySeed);
    let engine = opts.engine === undefined || opts.engine === null ? ENGINE : Number(opts.engine);
    /* A scale only the current engine writes in, asked for by name of a song
       from an older one: the older engine would quietly pick a scale of its
       own instead, so the request moves the song onto the engine that can
       honour it. */
    if (engine < ENGINE && opts.scale && G.scalesFor(genreId, engine).indexOf(opts.scale) < 0
      && G.scalesFor(genreId, ENGINE).indexOf(opts.scale) >= 0) engine = ENGINE;
    const v2 = engine >= 2;
    const extra = v2 ? moreOf(genre).progressions : null;

    const available = G.scalesFor(genreId, engine);
    const scaleName = available.indexOf(opts.scale) >= 0 ? opts.scale : harmonyRng.pick(available);
    const keyPc = opts.keyPc === undefined ? 0 : mod(opts.keyPc, 12);
    const key = T.makeKey(keyPc, scaleName);

    const bars = opts.bars === undefined ? 'auto' : opts.bars;

    /* The chorus draws first, and draws exactly what the loop always drew: the
       same progression from the same stream, the same tune from the same
       seed. Every sketch anyone has saved or shared comes back note for note,
       as the chorus of a song that now has a verse as well. */
    const progression = pickProgression(genre, scaleName, bars, harmonyRng, extra);
    /* Engine 2 plays the progression the way the genre would — perhaps at
       half speed, and reharmonised — on a stream of its own, so that what it
       does to the chorus never moves what the verse is drawn from. */
    const chorusChanges = v2
      ? develop(progression, { genre, key, bars, rng: makeRng((harmonySeed ^ 0x61c88647) >>> 0) })
      : progression;
    const chorus = writeSection({
      id: 'chorus', label: 'Chorus', key, genre, energy, bars, progression: chorusChanges,
      seeds: { harmony: harmonySeed, melody: melodySeed, drum: drumSeed },
      counter: opts.counter, v2
    });
    /* The verse draws after it: its changes from the same harmony stream, so
       they can be chosen against the chorus's, and everything else from seeds
       of its own, so the two tunes are two tunes. The drum seed is shared —
       one drummer, one beat, the whole song. */
    const verseBase = pickVerseProgression(genre, scaleName, key, progression,
      v2 && chorusChanges.stretched ? progression.chords.length : chorus.bars, harmonyRng, extra);
    /* A verse at half speed under a chorus at full speed is a real
       arrangement, and so is the other way round, so the verse decides for
       itself — but it has to come out the chorus's length, so a chorus held
       at half speed holds the verse too. */
    const verseChanges = v2
      ? develop(chorusChanges.stretched ? { scale: verseBase.scale, chords: verseBase.chords.reduce((acc, c) => acc.concat([c, c]), []) } : verseBase,
        { genre, key, bars: chorusChanges.stretched ? 'auto' : chorus.bars, rng: makeRng((harmonySeed ^ 0x2545f491) >>> 0) })
      : verseBase;
    /* Same comping and bass as the chorus about half the time — the same
       player in both — and otherwise the verse's own. */
    const sameBand = v2 && makeRng((harmonySeed ^ 0x1b873593) >>> 0).chance(0.5);
    const verse = writeSection({
      id: 'verse', label: 'Verse', key, genre, energy, bars: chorus.bars,
      progression: verseChanges,
      seeds: {
        harmony: (harmonySeed ^ 0x7f4a7c15) >>> 0,
        melody: (melodySeed ^ 0x3c6ef372) >>> 0,
        drum: drumSeed
      },
      counter: opts.counter,
      character: verseCharacter(genre.melody, v2),
      comping: sameBand ? chorus.comping : null,
      temper: chorus.melody.temper,
      bassStyle: sameBand ? chorus.bassStyle : null,
      v2
    });

    const bpm = opts.bpm !== undefined && opts.bpm !== null
      ? opts.bpm
      : Math.round(genre.tempo[0] + (genre.tempo[1] - genre.tempo[0]) * energyMod.tempo);

    /* The song is its chorus at the top level, with both sections under it.
       The top-level notes ARE the chorus's — the same arrays, not copies —
       because everything written before there was a verse reads the loop off
       the song, and the loop it should find is the one it always found. */
    const song = {
      genreId, genre, key, scaleName, bpm, bars: chorus.bars,
      totalSteps: chorus.totalSteps,
      swing: genre.swing || 0,
      swingUnit: genre.swingUnit || 8,
      progression, spans: chorus.spans, melody: chorus.melody, counter: chorus.counter,
      chordTrack: chorus.chordTrack, bass: chorus.bass, drums: chorus.drums, form: chorus.form,
      harmonySeed, melodySeed, drumSeed, energy, engine,
      beat: chorus.beat, beatName: chorus.beat.name || '',
      bassPlan: chorus.bassPlan,
      drumPlan: describeDrums(chorus.beat, energyMod),
      /* In song order: the verse comes first. */
      sections: [verse, chorus]
    };
    song.theory = describeSong(song);
    return song;
  }

  global.Compose = {
    compose, section, makeRng, STEPS_PER_BAR, chooseForm,
    buildMelody, buildCounter, buildChordTrack, buildBass, buildDrums, pickBeat,
    BASS_STYLES, describeDrums, reharmonise, ENGINE
  };
})(window);
