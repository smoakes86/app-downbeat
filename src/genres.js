/* Downbeat — genre definitions.
   Pure data. Each genre says which scales it lives in, which progressions it
   draws on, how the melody breathes, how the chords are voiced and comped,
   what the bass does and what the drums play. Adding a genre means adding
   one object here — no engine changes. */
(function (global) {
  'use strict';

  /* Rhythm cells: durations in sixteenth-note steps, summing to 16 (one bar).
     A negative value is a rest of that length. The melody generator builds
     bars out of these, then develops them motivically. */
  const CELLS = {
    simple:     [[4, 4, 4, 4], [8, 4, 4], [4, 4, 8], [8, 8], [4, 8, 4], [16]],
    flowing:    [[4, 2, 2, 4, 4], [2, 2, 4, 4, 4], [4, 4, 2, 2, 4], [2, 2, 2, 2, 8], [4, 4, 4, 2, 2], [2, 2, 4, 8]],
    syncopated: [[3, 3, 2, 4, 4], [2, 6, 4, 4], [6, 2, 4, 4], [3, 3, 3, 3, 4], [2, 4, 2, 4, 4], [4, 3, 3, 2, 4]],
    swung:      [[2, 2, 4, 4, 4], [4, 2, 2, 4, 4], [2, 2, 2, 2, 4, 4], [4, 4, 2, 2, 4], [2, 4, 4, 2, 4]],
    laidback:   [[-2, 2, 4, 4, 4], [4, -2, 2, 4, 4], [-4, 4, 4, 4], [2, 2, 4, -2, 2, 4], [-2, 6, 4, 4]],
    sparse:     [[-4, 4, 8], [-8, 4, 4], [8, -4, 4], [16], [-4, 8, 4], [12, -4], [-8, 8]],
    busy:       [[2, 1, 1, 2, 2, 4, 4], [1, 1, 2, 4, 4, 4], [2, 2, 1, 1, 2, 4, 4], [1, 1, 1, 1, 4, 4, 4], [2, 2, 2, 1, 1, 4, 4]],
    airy:       [[16], [8, 8], [12, 4], [-4, 12], [-4, 8, 4], [8, -4, 4]],
    anthemic:   [[4, 4, 4, 4], [8, 4, 4], [4, 4, 4, 2, 2], [6, 2, 8], [4, 2, 2, 8]]
  };

  const bank = function () {
    const out = [];
    for (let i = 0; i < arguments.length; i++) out.push.apply(out, CELLS[arguments[i]]);
    return out;
  };

  /* Drum patterns. One character per sixteenth; patterns may be 16 or 32 steps
     and are looped. 'x' hit, 'o' open/accent, 'g' ghost note, '.' silence. */
  const GENRES = {
    pop: {
      label: 'Pop',
      blurb: 'Bright diatonic harmony and a hook that keeps coming back.',
      tempo: [98, 122],
      swing: 0,
      swingUnit: 8,
      extensions: 'triads',
      voicing: { style: 'close', low: 55, high: 79, maxVoices: 4 },
      chordRhythm: 'eighths',
      bass: 'rootFifth',
      patches: { chord: 'pluck', lead: 'softLead', counter: 'nylon', bass: 'fingerBass' },
      drums: {
        kick:  'x.....x...x.....',
        snare: '....x.......x...',
        hat:   'x.x.x.x.x.x.x.x.',
        clap:  '....x.......x...'
      },
      melody: { range: [62, 81], restiness: 0.12, leapiness: 0.28, pentatonicBias: 0.45, cells: bank('simple', 'flowing', 'anthemic') },
      progressions: [
        { scale: 'Major (Ionian)', chords: ['I', 'V', 'vi', 'IV'] },
        { scale: 'Major (Ionian)', chords: ['vi', 'IV', 'I', 'V'] },
        { scale: 'Major (Ionian)', chords: ['I', 'vi', 'IV', 'V'] },
        { scale: 'Major (Ionian)', chords: ['IV', 'I', 'V', 'vi'] },
        { scale: 'Major (Ionian)', chords: ['I', 'V/vi', 'vi', 'IV'] },
        { scale: 'Major (Ionian)', chords: ['I', 'V', 'vi', 'iii', 'IV', 'I', 'IV', 'V'] },
        { scale: 'Major (Ionian)', chords: ['vi', 'IV', 'I', 'V', 'vi', 'IV', 'ii', 'V'] },
        { scale: 'Natural Minor', chords: ['i', 'VI', 'III', 'VII'] },
        { scale: 'Natural Minor', chords: ['i', 'iv', 'VI', 'V'] },
        { scale: 'Natural Minor', chords: ['i', 'VII', 'VI', 'VII'] }
      ]
    },

    lofi: {
      label: 'Lo-fi Hip-Hop',
      blurb: 'Dusty seventh chords, swung sixteenths and a melody in no hurry.',
      tempo: [68, 86],
      swing: 0.3,
      swingUnit: 16,
      extensions: 'sevenths',
      voicing: { style: 'drop2', low: 52, high: 76, maxVoices: 4 },
      chordRhythm: 'laidback',
      bass: 'roots',
      patches: { chord: 'wurli', lead: 'softLead', counter: 'nylon', bass: 'upright' },
      drums: {
        kick:  'x.......x.x.....',
        snare: '....x.......x...',
        hat:   'x..xx..xx..xx..x',
        rim:   '..............x.'
      },
      melody: { range: [62, 79], restiness: 0.3, leapiness: 0.18, pentatonicBias: 0.6, chromaticApproach: 0.12, cells: bank('laidback', 'sparse', 'swung') },
      progressions: [
        { scale: 'Dorian', chords: ['i9', 'IV9', 'i9', 'IV9'] },
        { scale: 'Natural Minor', chords: ['i7', 'VII', 'VI', 'V7'] },
        { scale: 'Major (Ionian)', chords: ['Imaj7', 'vi7', 'ii7', 'V7'] },
        { scale: 'Major (Ionian)', chords: ['ii7', 'V7', 'Imaj7', 'Imaj7'] },
        { scale: 'Major (Ionian)', chords: ['Imaj7', 'iii7', 'vi7', 'IV'] },
        { scale: 'Natural Minor', chords: ['i7', 'iv7', 'VII', 'III'] },
        { scale: 'Natural Minor', chords: ['i7', 'VI', 'III', 'iv7', 'i7', 'VI', 'iiø7', 'V7'] }
      ]
    },

    jazz: {
      label: 'Jazz',
      blurb: 'Two-fives, shell voicings and a walking bass under a swung line.',
      tempo: [118, 168],
      swing: 0.58,
      swingUnit: 8,
      extensions: 'sevenths',
      voicing: { style: 'shell', low: 55, high: 78, maxVoices: 4 },
      chordRhythm: 'comp',
      bass: 'walking',
      patches: { chord: 'epiano', lead: 'sineLead', counter: 'nylon', bass: 'upright' },
      drums: {
        ride:  'x.xxx.xxx.xxx.xx',
        hat:   '....x.......x...',
        kick:  'x..............x',
        snare: '......g...g.....'
      },
      melody: { range: [62, 82], restiness: 0.18, leapiness: 0.35, pentatonicBias: 0.15, chromaticApproach: 0.38, cells: bank('swung', 'flowing', 'syncopated') },
      progressions: [
        { scale: 'Major (Ionian)', chords: ['ii7|V7', 'Imaj7', 'ii7|V7', 'Imaj7'] },
        { scale: 'Major (Ionian)', chords: ['Imaj7', 'vi7', 'ii7', 'V7'] },
        { scale: 'Major (Ionian)', chords: ['iii7', 'VI7', 'ii7', 'V7'] },
        { scale: 'Major (Ionian)', chords: ['Imaj7', 'VI7', 'ii7', 'V7', 'iii7', 'VI7', 'ii7', 'V7'] },
        { scale: 'Major (Ionian)', chords: ['Imaj7', 'I7', 'IVmaj7', '#iv°7', 'Imaj7|VI7', 'ii7|V7', 'Imaj7', 'V7'] },
        { scale: 'Melodic Minor', chords: ['iiø7', 'V7b9', 'i', 'i'] },
        { scale: 'Natural Minor', chords: ['iiø7|V7b9', 'i7', 'iv7|VII7', 'III'] }
      ]
    },

    blues: {
      label: 'Blues',
      blurb: 'Twelve bars, dominant sevenths throughout, blue notes on top.',
      tempo: [76, 132],
      swing: 0.6,
      swingUnit: 8,
      extensions: 'sevenths',
      voicing: { style: 'close', low: 52, high: 74, maxVoices: 4 },
      chordRhythm: 'quarters',
      bass: 'walking',
      patches: { chord: 'organ', lead: 'brightLead', counter: 'guitar', bass: 'upright' },
      drums: {
        ride:  'x.xxx.xxx.xxx.xx',
        snare: '....x.......x...',
        kick:  'x.......x.......'
      },
      melody: { range: [60, 79], restiness: 0.26, leapiness: 0.3, pentatonicBias: 0.85, blueNotes: true, cells: bank('swung', 'sparse', 'syncopated') },
      progressions: [
        { scale: 'Mixolydian', chords: ['I7', 'I7', 'I7', 'I7', 'IV7', 'IV7', 'I7', 'I7', 'V7', 'IV7', 'I7', 'V7'] },
        { scale: 'Mixolydian', chords: ['I7', 'IV7', 'I7', 'I7', 'IV7', 'IV7', 'I7', 'VI7', 'ii7', 'V7', 'I7', 'V7'] },
        { scale: 'Mixolydian', chords: ['I7', 'IV7', 'I7', 'V7'] },
        { scale: 'Natural Minor', chords: ['i7', 'i7', 'i7', 'i7', 'iv7', 'iv7', 'i7', 'i7', 'VI7', 'V7', 'i7', 'V7'] }
      ]
    },

    rock: {
      label: 'Rock',
      blurb: 'Flat-seven guitar harmony, driving eighths and a singable hook.',
      tempo: [112, 152],
      swing: 0,
      swingUnit: 8,
      extensions: 'triads',
      voicing: { style: 'open', low: 52, high: 74, maxVoices: 4 },
      chordRhythm: 'eighths',
      bass: 'driving8',
      patches: { chord: 'guitar', lead: 'brightLead', counter: 'organ', bass: 'fingerBass' },
      drums: {
        kick:  'x...x..x..x.x...',
        snare: '....x.......x...',
        hat:   'x.x.x.x.x.x.x.x.',
        crash: 'x...............'
      },
      melody: { range: [60, 79], restiness: 0.16, leapiness: 0.32, pentatonicBias: 0.7, cells: bank('simple', 'anthemic', 'syncopated') },
      progressions: [
        { scale: 'Mixolydian', chords: ['I', 'VII', 'IV', 'I'] },
        { scale: 'Mixolydian', chords: ['I', 'IV', 'VII', 'IV'] },
        { scale: 'Major (Ionian)', chords: ['vi', 'IV', 'I', 'V'] },
        { scale: 'Major (Ionian)', chords: ['I', 'V', 'bVII', 'IV'] },
        { scale: 'Natural Minor', chords: ['i', 'VI', 'VII', 'i'] },
        { scale: 'Natural Minor', chords: ['i', 'VII', 'VI', 'VII'] },
        { scale: 'Natural Minor', chords: ['i', 'iv', 'VI', 'VII', 'i', 'iv', 'V', 'i'] }
      ]
    },

    rnb: {
      label: 'R&B / Neo-Soul',
      blurb: 'Ninths and elevenths, ghost-note drums and a melody that leans back.',
      tempo: [66, 92],
      swing: 0.24,
      swingUnit: 16,
      extensions: 'sevenths',
      voicing: { style: 'drop2', low: 52, high: 78, maxVoices: 5 },
      chordRhythm: 'laidback',
      bass: 'syncopated',
      patches: { chord: 'epiano', lead: 'softLead', counter: 'bell', bass: 'fingerBass' },
      drums: {
        kick:  'x.....x...x...x.',
        snare: '....x.......x...',
        hat:   'x.xxx.xxx.xxx.xx',
        rim:   '..g..g...g..g...'
      },
      melody: { range: [62, 81], restiness: 0.28, leapiness: 0.24, pentatonicBias: 0.5, chromaticApproach: 0.15, cells: bank('laidback', 'busy', 'flowing') },
      progressions: [
        { scale: 'Dorian', chords: ['i9', 'IV9', 'i9', 'IV9'] },
        { scale: 'Dorian', chords: ['i9', 'VII', 'IV9', 'i9'] },
        { scale: 'Major (Ionian)', chords: ['Imaj7', 'iii7', 'vi9', 'ii9'] },
        { scale: 'Major (Ionian)', chords: ['ii9', 'V7', 'Imaj7', 'vi9'] },
        { scale: 'Major (Ionian)', chords: ['Imaj7', 'IVmaj7', 'iii7', 'vi7', 'ii7', 'V7', 'Imaj7', 'V7'] },
        { scale: 'Natural Minor', chords: ['i7', 'iv7', 'VII', 'VImaj7'] }
      ]
    },

    house: {
      label: 'House',
      blurb: 'Four on the floor, offbeat stabs and an octave bass underneath.',
      tempo: [118, 128],
      swing: 0,
      swingUnit: 16,
      extensions: 'sevenths',
      voicing: { style: 'close', low: 55, high: 79, maxVoices: 4 },
      chordRhythm: 'offbeats',
      bass: 'octaves',
      patches: { chord: 'stab', lead: 'pluck', counter: 'bell', bass: 'synthBass' },
      drums: {
        kick:    'x...x...x...x...',
        clap:    '....x.......x...',
        hat:     'x...x...x...x...',
        openHat: '..o...o...o...o.'
      },
      melody: { range: [64, 84], restiness: 0.24, leapiness: 0.3, pentatonicBias: 0.55, cells: bank('syncopated', 'flowing', 'busy') },
      progressions: [
        { scale: 'Natural Minor', chords: ['i7', 'VImaj7', 'III', 'VII'] },
        { scale: 'Natural Minor', chords: ['i7', 'iv7', 'VI', 'V7'] },
        { scale: 'Dorian', chords: ['i9', 'IV9', 'i9', 'IV9'] },
        { scale: 'Major (Ionian)', chords: ['ii7', 'V7', 'Imaj7', 'vi7'] },
        { scale: 'Natural Minor', chords: ['i7', 'VII', 'VI', 'VII', 'i7', 'VII', 'iiø7', 'V7'] }
      ]
    },

    synthwave: {
      label: 'Synthwave',
      blurb: 'Arpeggiated minor triads, gated snare and a neon lead on top.',
      tempo: [86, 118],
      swing: 0,
      swingUnit: 8,
      extensions: 'triads',
      voicing: { style: 'close', low: 55, high: 79, maxVoices: 4 },
      chordRhythm: 'arpUp',
      bass: 'octaves',
      patches: { chord: 'supersaw', lead: 'brightLead', counter: 'pluck', bass: 'synthBass' },
      drums: {
        kick:  'x.......x.......',
        snare: '....x.......x...',
        hat:   'x.x.x.x.x.x.x.x.',
        clap:  '....x.......x...'
      },
      melody: { range: [64, 84], restiness: 0.14, leapiness: 0.34, pentatonicBias: 0.5, cells: bank('anthemic', 'simple', 'flowing') },
      progressions: [
        { scale: 'Natural Minor', chords: ['i', 'VI', 'III', 'VII'] },
        { scale: 'Natural Minor', chords: ['i', 'VII', 'VI', 'V'] },
        { scale: 'Natural Minor', chords: ['i', 'III', 'VII', 'VI'] },
        { scale: 'Major (Ionian)', chords: ['vi', 'IV', 'I', 'V'] },
        { scale: 'Dorian', chords: ['i', 'IV', 'VII', 'i'] }
      ]
    },

    ambient: {
      label: 'Ambient / Cinematic',
      blurb: 'Wide suspended pads, no pulse to speak of, a melody with room to ring.',
      tempo: [54, 76],
      swing: 0,
      swingUnit: 8,
      extensions: 'sevenths',
      voicing: { style: 'open', low: 48, high: 80, maxVoices: 5 },
      chordRhythm: 'sustain',
      bass: 'pedal',
      patches: { chord: 'pad', lead: 'bell', counter: 'sineLead', bass: 'subSine' },
      drums: {},
      melody: { range: [64, 84], restiness: 0.42, leapiness: 0.2, pentatonicBias: 0.6, cells: bank('airy', 'sparse') },
      progressions: [
        { scale: 'Lydian', chords: ['Imaj7', 'II', 'Imaj7', 'vi7'] },
        { scale: 'Lydian', chords: ['Imaj7', 'iii7', 'II', 'Imaj7'] },
        { scale: 'Major (Ionian)', chords: ['Imaj7', 'IVmaj7', 'vi7', 'V'] },
        { scale: 'Major (Ionian)', chords: ['vi7', 'IVmaj7', 'Imaj7', 'V'] },
        { scale: 'Natural Minor', chords: ['i7', 'VImaj7', 'III', 'iv7'] },
        { scale: 'Dorian', chords: ['i7', 'IV', 'i7', 'VII'] }
      ]
    },

    folk: {
      label: 'Folk',
      blurb: 'Open strummed triads and a plain, stepwise tune you could sing.',
      tempo: [84, 118],
      swing: 0.14,
      swingUnit: 8,
      extensions: 'triads',
      voicing: { style: 'open', low: 52, high: 76, maxVoices: 4 },
      chordRhythm: 'strum',
      bass: 'rootFifth',
      patches: { chord: 'nylon', lead: 'nylon', counter: 'guitar', bass: 'upright' },
      drums: {
        kick:  'x.......x.......',
        snare: '....x.......x...',
        hat:   '..x...x...x...x.'
      },
      melody: { range: [60, 79], restiness: 0.18, leapiness: 0.16, pentatonicBias: 0.55, cells: bank('simple', 'flowing') },
      progressions: [
        { scale: 'Major (Ionian)', chords: ['I', 'IV', 'V', 'I'] },
        { scale: 'Major (Ionian)', chords: ['I', 'V', 'vi', 'IV'] },
        { scale: 'Major (Ionian)', chords: ['I', 'IV', 'I', 'V'] },
        { scale: 'Major (Ionian)', chords: ['I', 'IV', 'V', 'vi', 'IV', 'I', 'V', 'I'] },
        { scale: 'Mixolydian', chords: ['I', 'VII', 'IV', 'I'] },
        { scale: 'Natural Minor', chords: ['i', 'VII', 'VI', 'V'] }
      ]
    },

    trap: {
      label: 'Trap',
      blurb: 'Half-time 808s, hat rolls and a sparse minor motif with space around it.',
      tempo: [130, 152],
      swing: 0,
      swingUnit: 16,
      extensions: 'triads',
      voicing: { style: 'close', low: 55, high: 79, maxVoices: 3 },
      chordRhythm: 'sustain',
      bass: 'sub808',
      patches: { chord: 'bell', lead: 'pluck', counter: 'sineLead', bass: 'sub808' },
      drums: {
        kick:  'x.......x.....x.',
        snare: '........x.......',
        hat:   'x.x.xxx.x.xxx.xx',
        rim:   '................'
      },
      hatRolls: 0.35,
      melody: { range: [64, 84], restiness: 0.3, leapiness: 0.22, pentatonicBias: 0.75, cells: bank('sparse', 'syncopated', 'flowing') },
      progressions: [
        { scale: 'Natural Minor', chords: ['i', 'VI', 'VII', 'v'] },
        { scale: 'Natural Minor', chords: ['i', 'iv', 'VI', 'V'] },
        { scale: 'Harmonic Minor', chords: ['i', 'VI', 'V', 'i'] },
        { scale: 'Phrygian', chords: ['i', 'II', 'i', 'VII'] },
        { scale: 'Phrygian', chords: ['i', 'VI', 'II', 'i'] }
      ]
    },

    bossa: {
      label: 'Bossa Nova',
      blurb: 'Charleston comping, a soft rim pulse and a cool, even melody.',
      tempo: [124, 148],
      swing: 0,
      swingUnit: 16,
      extensions: 'sevenths',
      voicing: { style: 'drop2', low: 55, high: 78, maxVoices: 4 },
      chordRhythm: 'charleston',
      bass: 'bossa',
      patches: { chord: 'nylon', lead: 'sineLead', counter: 'guitar', bass: 'upright' },
      drums: {
        rim:   'x..x..x...x..x..',
        hat:   'x.x.x.x.x.x.x.x.',
        kick:  'x.....x.x.....x.'
      },
      melody: { range: [62, 81], restiness: 0.24, leapiness: 0.22, pentatonicBias: 0.35, chromaticApproach: 0.18, cells: bank('flowing', 'syncopated', 'simple') },
      progressions: [
        { scale: 'Major (Ionian)', chords: ['Imaj7', 'ii7', 'V7', 'Imaj7'] },
        { scale: 'Major (Ionian)', chords: ['ii7', 'V7', 'Imaj7', 'VI7'] },
        { scale: 'Major (Ionian)', chords: ['Imaj7', 'VI7', 'ii7', 'V7', 'iii7', 'VI7', 'ii7', 'V7'] },
        { scale: 'Natural Minor', chords: ['i7', 'iiø7', 'V7b9', 'i7'] },
        { scale: 'Dorian', chords: ['i7', 'IV7', 'i7', 'IV7'] }
      ]
    },

    funk: {
      label: 'Funk',
      blurb: 'One-chord vamps, sixteenth-note stabs and a bass that never sits still.',
      tempo: [94, 118],
      swing: 0.16,
      swingUnit: 16,
      extensions: 'sevenths',
      voicing: { style: 'shell', low: 55, high: 79, maxVoices: 4 },
      chordRhythm: 'stabs16',
      bass: 'funk16',
      patches: { chord: 'guitar', lead: 'brightLead', counter: 'organ', bass: 'fingerBass' },
      drums: {
        kick:  'x...x..x..x.....',
        snare: '....x.......x...',
        hat:   'xxxxxxxxxxxxxxxx',
        rim:   '..g...g...g...g.'
      },
      melody: { range: [62, 82], restiness: 0.3, leapiness: 0.32, pentatonicBias: 0.75, blueNotes: true, cells: bank('busy', 'syncopated', 'laidback') },
      progressions: [
        { scale: 'Dorian', chords: ['i9', 'i9', 'IV9', 'i9'] },
        { scale: 'Dorian', chords: ['i9', 'IV9', 'i9', 'IV9'] },
        { scale: 'Mixolydian', chords: ['I9', 'I9', 'IV9', 'I9'] },
        { scale: 'Mixolydian', chords: ['I9', 'IV9', 'I9', 'V9'] },
        { scale: 'Natural Minor', chords: ['i7', 'iv7', 'i7', 'V7'] }
      ]
    },

    gospel: {
      label: 'Gospel',
      blurb: 'Passing diminisheds, secondary dominants and a full, moving inner voice.',
      tempo: [72, 104],
      swing: 0.34,
      swingUnit: 8,
      extensions: 'sevenths',
      voicing: { style: 'close', low: 52, high: 79, maxVoices: 5 },
      chordRhythm: 'gospel',
      bass: 'gospelWalk',
      patches: { chord: 'organ', lead: 'softLead', counter: 'nylon', bass: 'fingerBass' },
      drums: {
        kick:  'x.....x...x.....',
        snare: '....x.......x...',
        hat:   'x..x..x..x..x..x',
        rim:   '............g...'
      },
      melody: { range: [62, 82], restiness: 0.2, leapiness: 0.3, pentatonicBias: 0.5, chromaticApproach: 0.2, cells: bank('swung', 'flowing', 'anthemic') },
      progressions: [
        { scale: 'Major (Ionian)', chords: ['Imaj7', 'V7/vi', 'vi7', 'V7'] },
        { scale: 'Major (Ionian)', chords: ['I', 'I/3', 'IV', 'iv'] },
        { scale: 'Major (Ionian)', chords: ['Imaj7', 'vi7', 'ii7', 'V7'] },
        { scale: 'Major (Ionian)', chords: ['I', 'V7/IV', 'IV', '#iv°7', 'I/5', 'V7/ii', 'ii7', 'V7'] },
        { scale: 'Major (Ionian)', chords: ['IV', '#iv°7', 'I/5', 'V7'] },
        { scale: 'Natural Minor', chords: ['i7', 'iv7', 'V7', 'i7'] }
      ]
    }
  };

  /* Energy nudges the same genre toward calmer or busier output without
     changing what makes it that genre.

     Five of these run in a line from nearly still to flat out. The last two
     step off that line, because busy and loud are not the same axis: a
     half-time beat can hit hard while playing almost nothing, and a bossa can
     be full of notes and still be quiet. A single ramp cannot ask for either.

       tempo      where to sit in the genre's own range — 0 its slowest, 1 its fastest
       restiness  added to the genre's taste for rests
       leapiness  added to its taste for leaps over steps
       density    which rhythm cells get the weight; negative favours the sparse ones
       velocity   how hard the whole thing is played
       ghosts     whether the kit keeps its quietest colour hits
       fill       scales the odds of the fill going into the loop point

     The middle three are the settings this app shipped with and their numbers
     are left exactly as they were. They are baked into every saved sketch and
     every shared link — the seeds only replay if the weights they were rolled
     against are the same — so a nudge here would quietly rewrite the lot. New
     settings go around them, never through them. */
  const ENERGY = {
    still:   { tempo: 0,    restiness: 0.26,  leapiness: -0.15, density: -1.9, velocity: 0.62, ghosts: false, fill: 0.2 },
    soft:    { tempo: 0.12, restiness: 0.14,  leapiness: -0.08, density: -1,   velocity: 0.78, ghosts: true,  fill: 1 },
    flow:    { tempo: 0.5,  restiness: 0,     leapiness: 0,     density: 0,    velocity: 0.9,  ghosts: true,  fill: 1 },
    bright:  { tempo: 0.9,  restiness: -0.1,  leapiness: 0.08,  density: 1,    velocity: 1,    ghosts: true,  fill: 1 },
    driving: { tempo: 1,    restiness: -0.2,  leapiness: 0.16,  density: 1.9,  velocity: 1.05, ghosts: true,  fill: 1.7 },
    heavy:   { tempo: 0.06, restiness: 0.18,  leapiness: -0.02, density: -1.2, velocity: 1.05, ghosts: false, fill: 0.7 },
    hushed:  { tempo: 0.8,  restiness: -0.16, leapiness: 0.05,  density: 1.5,  velocity: 0.68, ghosts: true,  fill: 1.2 }
  };

  /* What each drum voice is called on the grid, in playing order top to bottom. */
  const DRUM_VOICES = [
    { id: 'crash',   label: 'Crash',    how: 'Marks the top of the loop.' },
    { id: 'ride',    label: 'Ride',     how: 'Keeps the pulse ticking over the top.' },
    { id: 'openHat', label: 'Open hat', how: 'Lifts the offbeats.' },
    { id: 'hat',     label: 'Hi-hat',   how: 'The subdivision you count along to.' },
    { id: 'clap',    label: 'Clap',     how: 'Doubles the backbeat.' },
    { id: 'rim',     label: 'Rim',      how: 'Quiet colour between the main hits.' },
    { id: 'snare',   label: 'Snare',    how: 'The backbeat, usually beats 2 and 4.' },
    { id: 'kick',    label: 'Kick',     how: 'Where the bar lands.' }
  ];

  global.Genres = {
    GENRES,
    ENERGY,
    CELLS,
    DRUM_VOICES,
    order: ['pop', 'lofi', 'rock', 'rnb', 'jazz', 'blues', 'house', 'synthwave', 'trap', 'funk', 'gospel', 'bossa', 'folk', 'ambient'],
    scalesFor: function (id) {
      const genre = GENRES[id];
      if (!genre) return [];
      const seen = [];
      genre.progressions.forEach((p) => { if (!seen.includes(p.scale)) seen.push(p.scale); });
      return seen;
    }
  };
})(window);
