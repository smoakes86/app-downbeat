/* Downbeat — music theory engine.
   Note spelling, scales, roman-numeral parsing, chord construction and voice leading.
   Everything downstream works in MIDI pitch numbers; this file is what maps
   scale degrees onto real pitches without the octave discontinuities that make
   a "one step up" turn into a descending seventh. */
(function (global) {
  'use strict';

  const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
  const ACCIDENTAL = { '-2': 'bb', '-1': 'b', '0': '', '1': '#', '2': '##' };
  const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  const mod = (n, m) => ((n % m) + m) % m;

  /* ---------------------------------------------------------------- spelling */

  // Spell a pitch class using a specific letter, e.g. (10, letter B) -> "Bb".
  // Returns null when the letter would need more than a double accidental.
  function spellWithLetter(pc, letterIndex) {
    const letter = LETTERS[mod(letterIndex, 7)];
    let diff = mod(pc - LETTER_PC[mod(letterIndex, 7)], 12);
    if (diff > 6) diff -= 12;
    const acc = ACCIDENTAL[String(diff)];
    return acc === undefined ? null : letter + acc;
  }

  // The 12 keys, each with the letter its canonical name is built on.
  const KEYS = [
    { pc: 0, letter: 0, label: 'C' },
    { pc: 1, letter: 1, label: 'D♭ / C♯' },
    { pc: 2, letter: 1, label: 'D' },
    { pc: 3, letter: 2, label: 'E♭' },
    { pc: 4, letter: 2, label: 'E' },
    { pc: 5, letter: 3, label: 'F' },
    { pc: 6, letter: 3, label: 'F♯ / G♭' },
    { pc: 7, letter: 4, label: 'G' },
    { pc: 8, letter: 5, label: 'A♭' },
    { pc: 9, letter: 5, label: 'A' },
    { pc: 10, letter: 6, label: 'B♭' },
    { pc: 11, letter: 6, label: 'B' }
  ];

  /* ------------------------------------------------------------------ scales */

  // `degrees` maps each scale step onto a diatonic degree (0-6) so that letter
  // names come out right even for five- and six-note scales. In C blues the
  // b5 and 5 both sit on the letter G, giving "Gb G" rather than "F# G".
  const SCALES = {
    'Major (Ionian)':    { steps: [0, 2, 4, 5, 7, 9, 11], degrees: [0, 1, 2, 3, 4, 5, 6], flavour: 'major' },
    'Natural Minor':     { steps: [0, 2, 3, 5, 7, 8, 10], degrees: [0, 1, 2, 3, 4, 5, 6], flavour: 'minor' },
    'Dorian':            { steps: [0, 2, 3, 5, 7, 9, 10], degrees: [0, 1, 2, 3, 4, 5, 6], flavour: 'minor' },
    'Phrygian':          { steps: [0, 1, 3, 5, 7, 8, 10], degrees: [0, 1, 2, 3, 4, 5, 6], flavour: 'minor' },
    'Lydian':            { steps: [0, 2, 4, 6, 7, 9, 11], degrees: [0, 1, 2, 3, 4, 5, 6], flavour: 'major' },
    'Mixolydian':        { steps: [0, 2, 4, 5, 7, 9, 10], degrees: [0, 1, 2, 3, 4, 5, 6], flavour: 'major' },
    'Harmonic Minor':    { steps: [0, 2, 3, 5, 7, 8, 11], degrees: [0, 1, 2, 3, 4, 5, 6], flavour: 'minor' },
    'Melodic Minor':     { steps: [0, 2, 3, 5, 7, 9, 11], degrees: [0, 1, 2, 3, 4, 5, 6], flavour: 'minor' },
    'Phrygian Dominant': { steps: [0, 1, 4, 5, 7, 8, 10], degrees: [0, 1, 2, 3, 4, 5, 6], flavour: 'major' }
  };

  // Melody-only note pools, given as offsets from the tonic. Harmony is always
  // built from the seven-note scale above; a pentatonic or blues melody just
  // draws from a subset (plus, for blues, notes outside the parent scale).
  const MELODY_POOLS = {
    diatonic:           null,
    'Major Pentatonic': { steps: [0, 2, 4, 7, 9], degrees: [0, 1, 2, 4, 5] },
    'Minor Pentatonic': { steps: [0, 3, 5, 7, 10], degrees: [0, 2, 3, 4, 6] },
    'Blues':            { steps: [0, 3, 5, 6, 7, 10], degrees: [0, 2, 3, 4, 4, 6] }
  };

  /* Build a key context: root, scale, spelled note names, pitch-class lookup. */
  function makeKey(rootPc, scaleName, melodyPoolName) {
    const scale = SCALES[scaleName] || SCALES['Major (Ionian)'];
    const keyEntry = KEYS.find((k) => k.pc === mod(rootPc, 12)) || KEYS[0];

    // Try the canonical letter first; fall back to an enharmonic root if that
    // spelling would need double accidentals (e.g. Eb Phrygian).
    let rootLetter = keyEntry.letter;
    const candidates = [rootLetter, mod(rootLetter + 1, 7), mod(rootLetter - 1, 7)];
    let best = null;
    for (const letter of candidates) {
      if (spellWithLetter(rootPc, letter) === null) continue;
      const names = spellScale(rootPc, scale, letter);
      if (!names) continue;
      // Double accidentals are heavily penalised; the key's canonical letter
      // wins ties so that E flat Phrygian stays in flats rather than flipping
      // to D sharp just because that needs one accidental fewer.
      let cost = names.reduce((sum, n) => sum + (n.length - 1) * (n.length > 2 ? 4 : 1), 0);
      if (letter !== keyEntry.letter) cost += 3;
      if (!best || cost < best.cost) best = { cost, letter, names };
    }
    if (!best) best = { letter: rootLetter, names: scale.steps.map((s) => SHARP_NAMES[mod(rootPc + s, 12)]) };
    rootLetter = best.letter;

    const pool = MELODY_POOLS[melodyPoolName] || null;
    const key = {
      rootPc: mod(rootPc, 12),
      rootLetter,
      scaleName,
      scale,
      flavour: scale.flavour,
      scaleNames: best.names,
      scalePcs: scale.steps.map((s) => mod(rootPc + s, 12)),
      melodyPoolName: melodyPoolName || 'diatonic',
      melodyPcs: (pool ? pool.steps : scale.steps).map((s) => mod(rootPc + s, 12)),
      rootName: best.names[0]
    };

    // Name lookup for any pitch class, preferring the in-scale spelling.
    const byPc = new Map();
    key.scalePcs.forEach((pc, i) => byPc.set(pc, key.scaleNames[i]));
    if (pool) {
      pool.steps.forEach((s, i) => {
        const pc = mod(rootPc + s, 12);
        if (!byPc.has(pc)) {
          const spelled = spellWithLetter(pc, rootLetter + pool.degrees[i]);
          if (spelled) byPc.set(pc, spelled);
        }
      });
    }
    key.nameForPc = (pc) => byPc.get(mod(pc, 12)) || chromaticName(mod(pc, 12), key);
    key.nameForMidi = (midi) => key.nameForPc(midi) + Math.floor(midi / 12 - 1);
    return key;
  }

  function spellScale(rootPc, scale, rootLetter) {
    const names = [];
    for (let i = 0; i < scale.steps.length; i++) {
      const name = spellWithLetter(mod(rootPc + scale.steps[i], 12), rootLetter + scale.degrees[i]);
      if (name === null) return null;
      names.push(name);
    }
    return names;
  }

  // Chromatic passing notes get spelled in the direction the key leans.
  function chromaticName(pc, key) {
    const flatKey = key.scaleNames.some((n) => n.includes('b'));
    if (!flatKey) return SHARP_NAMES[pc];
    const sharp = SHARP_NAMES[pc];
    if (!sharp.includes('#')) return sharp;
    const letterIndex = LETTERS.indexOf(sharp[0]);
    return spellWithLetter(pc, letterIndex + 1) || sharp;
  }

  /* ------------------------------------------------------------------ chords */

  const CHORD_TYPES = {
    major:   { iv: [0, 4, 7], sym: '' },
    minor:   { iv: [0, 3, 7], sym: 'm' },
    dim:     { iv: [0, 3, 6], sym: '°' },
    aug:     { iv: [0, 4, 8], sym: '+' },
    five:    { iv: [0, 7], sym: '5' },
    sus2:    { iv: [0, 2, 7], sym: 'sus2' },
    sus4:    { iv: [0, 5, 7], sym: 'sus4' },
    six:     { iv: [0, 4, 7, 9], sym: '6' },
    m6:      { iv: [0, 3, 7, 9], sym: 'm6' },
    maj7:    { iv: [0, 4, 7, 11], sym: 'maj7' },
    dom7:    { iv: [0, 4, 7, 10], sym: '7' },
    m7:      { iv: [0, 3, 7, 10], sym: 'm7' },
    mMaj7:   { iv: [0, 3, 7, 11], sym: 'mMaj7' },
    m7b5:    { iv: [0, 3, 6, 10], sym: 'ø7' },
    dim7:    { iv: [0, 3, 6, 9], sym: '°7' },
    add9:    { iv: [0, 4, 7, 14], sym: 'add9' },
    madd9:   { iv: [0, 3, 7, 14], sym: 'm(add9)' },
    sixNine: { iv: [0, 4, 7, 9, 14], sym: '6/9' },
    maj9:    { iv: [0, 4, 7, 11, 14], sym: 'maj9' },
    dom9:    { iv: [0, 4, 7, 10, 14], sym: '9' },
    m9:      { iv: [0, 3, 7, 10, 14], sym: 'm9' },
    m11:     { iv: [0, 3, 7, 10, 14, 17], sym: 'm11' },
    dom13:   { iv: [0, 4, 7, 10, 14, 21], sym: '13' },
    maj13:   { iv: [0, 4, 7, 11, 14, 21], sym: 'maj13' },
    dom7b9:  { iv: [0, 4, 7, 10, 13], sym: '7♭9' },
    dom7s9:  { iv: [0, 4, 7, 10, 15], sym: '7♯9' },
    dom7s11: { iv: [0, 4, 7, 10, 18], sym: '7♯11' },
    alt:     { iv: [0, 4, 10, 13, 20], sym: '7alt' },
    sus7:    { iv: [0, 5, 7, 10], sym: '7sus4' }
  };

  const SUFFIX_TO_TYPE = {
    '': null, 'maj': 'major', 'm': 'minor', 'min': 'minor',
    'dim': 'dim', '°': 'dim', 'aug': 'aug', '+': 'aug', '5': 'five',
    'sus2': 'sus2', 'sus4': 'sus4', 'sus': 'sus4', '7sus4': 'sus7', 'sus7': 'sus7',
    '6': 'six', 'm6': 'm6', 'min6': 'm6', '6/9': 'sixNine', '69': 'sixNine',
    'maj7': 'maj7', 'M7': 'maj7', '△7': 'maj7',
    '7': 'dom7', 'm7': 'm7', 'min7': 'm7', 'mMaj7': 'mMaj7',
    'm7b5': 'm7b5', 'ø7': 'm7b5', 'ø': 'm7b5', 'dim7': 'dim7', '°7': 'dim7',
    'add9': 'add9', 'madd9': 'madd9', 'm(add9)': 'madd9',
    'maj9': 'maj9', '9': 'dom9', 'm9': 'm9', 'm11': 'm11', '11': 'm11',
    '13': 'dom13', 'maj13': 'maj13',
    '7b9': 'dom7b9', '7#9': 'dom7s9', '7#11': 'dom7s11', 'alt': 'alt', '7alt': 'alt'
  };

  const ROMAN_VALUE = { i: 0, ii: 1, iii: 2, iv: 3, v: 4, vi: 5, vii: 6 };
  const ROMAN_UPPER = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

  // Diatonic triad/seventh quality for each degree of a seven-note scale,
  // derived from the scale itself rather than hardcoded per mode.
  function diatonicType(scale, degree, withSeventh) {
    const at = (i) => scale.steps[mod(i, 7)] + 12 * Math.floor(i / 7);
    const root = at(degree);
    const third = at(degree + 2) - root;
    const fifth = at(degree + 4) - root;
    const seventh = at(degree + 6) - root;
    if (!withSeventh) {
      if (third === 4 && fifth === 7) return 'major';
      if (third === 3 && fifth === 7) return 'minor';
      if (third === 3 && fifth === 6) return 'dim';
      if (third === 4 && fifth === 8) return 'aug';
      return third === 3 ? 'minor' : 'major';
    }
    if (third === 4 && fifth === 7 && seventh === 11) return 'maj7';
    if (third === 4 && fifth === 7 && seventh === 10) return 'dom7';
    if (third === 3 && fifth === 7 && seventh === 10) return 'm7';
    if (third === 3 && fifth === 6 && seventh === 10) return 'm7b5';
    if (third === 3 && fifth === 6 && seventh === 9) return 'dim7';
    if (third === 3 && fifth === 7 && seventh === 11) return 'mMaj7';
    if (third === 4 && fifth === 8 && seventh === 11) return 'maj7';
    return third === 3 ? 'm7' : 'maj7';
  }

  const ROMAN_RE = /^(b|#)?([ivIV]+)(.*)$/;

  /* Parse one roman numeral into a chord in the given key.
     Understands: quality suffixes (ii7, Imaj7, V7sus4), chromatic roots (bVII,
     #iv°7), modal interchange (iv in a major key), secondary chords (V7/vi,
     viiº/V) and inversions (I/3, V7/5). */
  function parseChord(symbol, key, opts) {
    const options = opts || {};
    let text = String(symbol).trim();
    let inversion = 0;
    let secondary = null;

    const slash = text.lastIndexOf('/');
    if (slash > 0) {
      const after = text.slice(slash + 1);
      if (/^[357]$/.test(after)) {
        inversion = { 3: 1, 5: 2, 7: 3 }[after];
        text = text.slice(0, slash);
      } else if (ROMAN_RE.test(after) && !/^sus|^\d/.test(after)) {
        secondary = after;
        text = text.slice(0, slash);
      }
    }

    // A secondary chord is read in the major key of whatever it tonicises.
    let workingKey = key;
    if (secondary) {
      const target = parseChord(secondary, key, { withSeventh: false });
      workingKey = makeKey(target.rootPc, 'Major (Ionian)');
    }

    const match = ROMAN_RE.exec(text);
    if (!match) return null;
    const [, accidental, numeral, rawSuffix] = match;
    const degree = ROMAN_VALUE[numeral.toLowerCase()];
    if (degree === undefined) return null;

    const suffix = rawSuffix.trim().replace('♭', 'b').replace('♯', '#');
    const upper = numeral === numeral.toUpperCase();
    const chromatic = accidental ? (accidental === 'b' ? -1 : 1) : 0;
    const rootPc = mod(workingKey.rootPc + workingKey.scale.steps[degree] + chromatic, 12);
    const isDiatonicRoot = !chromatic && !secondary;

    // Bare number suffixes read off the case: V7 is a dominant, ii7 is a minor
    // seventh. Anything spelled out (m7b5, sus4, maj9) is taken literally.
    let type = null;
    let borrowedByCase = false;
    const bareNumber = /^(6|7|9|11|13)$/.test(suffix);

    if (suffix && !bareNumber) {
      type = SUFFIX_TO_TYPE[suffix];
    }

    if (!type) {
      const wantsSeventh = bareNumber || !!options.withSeventh;
      if (isDiatonicRoot) {
        type = diatonicType(workingKey.scale, degree, wantsSeventh);
        // A numeral written against the mode is modal interchange: iv in a
        // major key, I in a minor one.
        if (family(type) !== (upper ? 'major' : 'minor')) {
          // A bare number on an uppercase numeral (V9, VI13) reads as a
          // dominant; only a bare numeral with no figure implies a major 7th.
          type = upper
            ? (wantsSeventh ? (bareNumber ? 'dom7' : 'maj7') : 'major')
            : (wantsSeventh ? 'm7' : 'minor');
          borrowedByCase = true;
        } else if (upper && bareNumber && type === 'maj7') {
          // I7, IV9, V13 written as plain figures mean dominants. A major
          // seventh has to be asked for by name (Imaj7, IVmaj9).
          type = 'dom7';
        }
      } else {
        type = upper
          ? (bareNumber || (options.withSeventh && secondary) ? 'dom7' : 'major')
          : (bareNumber || options.withSeventh ? 'm7' : 'minor');
      }
      // Widen to the requested extension where one exists.
      if (bareNumber && suffix !== '7') {
        const widen = {
          '6': { major: 'six', dom7: 'six', maj7: 'six', minor: 'm6', m7: 'm6' },
          '9': { dom7: 'dom9', maj7: 'maj9', major: 'dom9', m7: 'm9', minor: 'm9' },
          '11': { m7: 'm11', minor: 'm11', dom7: 'm11', major: 'm11', maj7: 'm11' },
          '13': { dom7: 'dom13', maj7: 'maj13', major: 'dom13', m7: 'm11', minor: 'm11' }
        }[suffix];
        if (widen && widen[type]) type = widen[type];
      }
    }

    const spec = CHORD_TYPES[type] || CHORD_TYPES.major;
    const letterIndex = workingKey.rootLetter + workingKey.scale.degrees[degree];
    const rootName = spellWithLetter(rootPc, letterIndex) || chromaticName(rootPc, key);

    const intervals = spec.iv.slice();
    const pcs = intervals.map((iv) => mod(rootPc + iv, 12));
    const uniquePcs = [];
    pcs.forEach((pc) => { if (!uniquePcs.includes(pc)) uniquePcs.push(pc); });

    let bassPc = rootPc;
    let bassName = '';
    if (inversion && intervals[inversion] !== undefined) {
      bassPc = mod(rootPc + intervals[inversion], 12);
      bassName = '/' + key.nameForPc(bassPc);
    }

    const romanLabel =
      (accidental || '') +
      (isMinorish(type) ? numeral.toLowerCase() : ROMAN_UPPER[degree]) +
      romanSuffix(type) +
      (secondary ? '/' + secondary : '') +
      (inversion ? '/' + [0, 3, 5, 7][inversion] : '');

    return {
      source: symbol,
      rootPc,
      rootName,
      type,
      intervals,
      pcs: uniquePcs,
      bassPc,
      inversion,
      secondary,
      borrowed: !!chromatic || borrowedByCase || !!secondary,
      symbol: rootName + spec.sym + bassName,
      roman: romanLabel,
      // Chord-tone roles, used by the melody generator to weight targets.
      thirdPc: intervals.length > 1 ? mod(rootPc + intervals[1], 12) : null,
      seventhPc: seventhOf(rootPc, intervals)
    };
  }

  function seventhOf(rootPc, intervals) {
    const iv = intervals.find((n) => n === 10 || n === 11 || n === 9);
    return iv === undefined ? null : mod(rootPc + iv, 12);
  }

  function isMinorish(type) {
    return ['minor', 'm7', 'm9', 'm11', 'm6', 'madd9', 'mMaj7', 'dim', 'dim7', 'm7b5'].includes(type);
  }

  function family(type) {
    return isMinorish(type) ? 'minor' : 'major';
  }

  function romanSuffix(type) {
    const map = {
      dim: '°', dim7: '°7', m7b5: 'ø7', aug: '+',
      maj7: 'maj7', dom7: '7', m7: '7', mMaj7: 'maj7', six: '6', m6: '6',
      sus2: 'sus2', sus4: 'sus4', sus7: '7sus4', add9: 'add9', madd9: 'add9',
      maj9: 'maj9', dom9: '9', m9: '9', m11: '11', dom13: '13', maj13: 'maj13',
      dom7b9: '7♭9', dom7s9: '7♯9', dom7s11: '7♯11', alt: '7alt', sixNine: '6/9', five: '5'
    };
    return map[type] || '';
  }

  /* ---------------------------------------------------------------- voicings */

  /* Pick actual pitches for a chord, moving as little as possible from the
     previous voicing. This is what stops the harmony from lurching around in
     parallel root position. */
  function voiceChord(chord, prev, opts) {
    const o = opts || {};
    const low = o.low !== undefined ? o.low : 52;
    const high = o.high !== undefined ? o.high : 79;
    const style = o.style || 'close';

    let pcs = chord.pcs.slice();
    if (style === 'shell' && chord.intervals.length >= 4) {
      // 3rd and 7th carry the harmony; extensions ride on top, root goes to bass.
      pcs = chord.pcs.slice(1).filter((_, i) => i !== 1);
      if (!pcs.length) pcs = chord.pcs.slice();
    } else if (style === 'open' && chord.pcs.length > 3) {
      pcs = chord.pcs.filter((_, i) => i !== 2);
    } else if (style === 'power') {
      pcs = [chord.pcs[0], mod(chord.rootPc + 7, 12)];
    }
    if (o.maxVoices && pcs.length > o.maxVoices) pcs = pcs.slice(0, o.maxVoices);

    const centre = (low + high) / 2;
    const chosen = [];
    for (const pc of pcs) {
      let best = null;
      let bestScore = Infinity;
      for (let m = low; m <= high; m++) {
        if (mod(m, 12) !== mod(pc, 12) || chosen.includes(m)) continue;
        const motion = prev && prev.length
          ? Math.min.apply(null, prev.map((p) => Math.abs(p - m)))
          : Math.abs(m - centre) * 0.6;
        const crowd = chosen.length ? Math.min.apply(null, chosen.map((c) => Math.abs(c - m))) : 99;
        const score = motion + (crowd < 3 ? (3 - crowd) * 2.5 : 0) + Math.abs(m - centre) * 0.12;
        if (score < bestScore) { bestScore = score; best = m; }
      }
      if (best !== null) chosen.push(best);
    }
    if (style === 'drop2' && chosen.length >= 3) {
      chosen.sort((a, b) => a - b);
      chosen[chosen.length - 2] -= 12;
    }
    return chosen.sort((a, b) => a - b);
  }

  /* Bass pitch for a chord, kept in a sensible register. */
  function bassPitch(pc, low, high) {
    let m = mod(pc, 12) + 24;
    while (m < low) m += 12;
    while (m > high) m -= 12;
    return m;
  }

  /* -------------------------------------------------------------- pitch sets */

  /* Every MIDI note in [low, high] whose pitch class is in `pcs`, ascending.
     Melody generation walks this array, so "one step" is always one scale step
     — never an accidental octave jump. */
  function pitchSet(pcs, low, high) {
    const set = new Set(pcs.map((p) => mod(p, 12)));
    const out = [];
    for (let m = low; m <= high; m++) if (set.has(mod(m, 12))) out.push(m);
    return out;
  }

  function nearestIn(list, target) {
    let best = list[0];
    let bestDist = Infinity;
    for (const value of list) {
      const d = Math.abs(value - target);
      if (d < bestDist) { bestDist = d; best = value; }
    }
    return best;
  }

  /* Is this pitch class a clash if held on a strong beat over this chord?
     The classic cases: the 11th over a major triad, the b13 over a minor 7. */
  function isAvoidTone(pc, chord) {
    const iv = mod(pc - chord.rootPc, 12);
    const has = (n) => chord.intervals.some((x) => mod(x, 12) === n);
    if (iv === 5 && has(4) && !has(5)) return true;   // 4 against a major 3rd
    if (iv === 8 && has(3) && has(10)) return true;   // b13 over a minor 7th
    if (iv === 1 && !has(1)) return true;             // b9 against the root
    return false;
  }

  global.Theory = {
    mod, KEYS, SCALES, MELODY_POOLS, CHORD_TYPES,
    makeKey, parseChord, voiceChord, bassPitch, pitchSet, nearestIn,
    isAvoidTone, spellWithLetter, diatonicType
  };
})(window);
