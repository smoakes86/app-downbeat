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

  /* Feel: how far behind or in front of the grid each voice sits, in
     milliseconds. Positive drags, negative pushes.

     This is the difference between a beat that is in time and one that is in
     the pocket, and it is not swing — swing moves the offbeats of every part
     at once, which the engine already does. This moves ONE VOICE against the
     others and leaves the grid alone: a lo-fi snare twenty milliseconds late
     against a hat that is not is the entire sound of the genre, and no amount
     of swing produces it.

     Milliseconds rather than a fraction of a beat, because a player's push
     and drag is motor timing and stays roughly constant as the tempo moves —
     which is also why the same twenty milliseconds reads as a lazy sprawl at
     72 BPM and as an edge at 160.

     The kick is left alone almost everywhere. It is the floor; if it moves,
     nothing has moved relative to it and the feel just becomes latency. */
  const FEEL = {
    pop:       {},
    lofi:      { snare: 24, rim: 20, hat: 6 },
    rock:      { snare: -3 },
    rnb:       { snare: 16, hat: 4 },
    jazz:      { snare: 9, ride: -4 },
    blues:     { snare: 11 },
    house:     { hat: -4, openHat: -4, clap: 3 },
    synthwave: {},
    trap:      { hat: -2, snare: 6 },
    funk:      { hat: -5, snare: 4 },
    gospel:    { snare: 8, hat: 3 },
    bossa:     { rim: 6, hat: -2 },
    folk:      { snare: 5 },
    ambient:   {}
  };

  /* Drum patterns. One character per sixteenth; patterns are looped, so a
     16-step one repeats every bar and a 32- or 64-step one takes two or four
     bars to come round. 'x' hit, 'o' open/accent, 'g' ghost note, '.' silence.

     Each genre carries SEVERAL beats rather than one, and the composer draws
     from them. A generator whose harmony and melody are different every time
     but whose drums are byte-identical forever is a generator that writes one
     song; house, bossa and ambient did exactly that. Each entry is named
     because the name is information — "Boom-bap" and "Straight eights" are
     instructions to a player, and the app is in the business of telling you
     how to play the thing.

     A pattern longer than sixteen is written as one string per bar, joined —
     `'x.....x...x.....' + '..x...x...x.....'` — because the bar line is the
     thing you read a drum pattern against, and a thirty-two character run
     with no break in it hides exactly the information the second bar exists
     to carry. Voices within one beat may be different lengths: a hat that
     keeps time under a kick that answers itself every other bar is two bars
     of music written as one bar and two. */
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
      drums: [
        { name: 'Straight pop',
          kick:  'x.....x...x.....',
          snare: '....x.......x...',
          hat:   'x.x.x.x.x.x.x.x.',
          clap:  '....x.......x...' },
        { name: 'Four on the floor',
          kick:  'x...x...x...x...',
          snare: '....x.......x...',
          hat:   '..x...x...x...x.',
          clap:  '....x.......x...' },
        { name: 'Half-time anthem',
          kick:  'x.......x..x....',
          snare: '........x.......',
          hat:   'x.x.x.x.x.x.x.x.',
          clap:  '........x.......' },
        { name: 'Syncopated',
          kick:  'x.....x..x..x...' + 'x.....x..x..x.x.',
          snare: '....x.......x...',
          hat:   'xx.xxx.xxx.xxx.x',
          clap:  '....x.......x...' }
      ],
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
      drums: [
        { name: 'Dusty',
          kick:  'x.......x.x.....',
          snare: '....x.......x...',
          hat:   'x..xx..xx..xx..x',
          rim:   '..............x.' },
        { name: 'Boom-bap',
          kick:  'x.....x.....x...' + 'x.....x...x.....',
          snare: '....x.......x...',
          hat:   'x.x.x.x.x.x.x.x.',
          rim:   '..........g.....' + '..............g.' },
        { name: 'Long dust',
          /* Four bars before it comes round: the kick moves, the rim answers
             on the third bar, and the hat never changes. The whole appeal of
             the genre is a loop you stop noticing, which needs a loop long
             enough to stop noticing. */
          kick:  'x.......x.x.....' + 'x.......x.......'
               + 'x...........x...' + 'x.......x.x...x.',
          snare: '....x.......x...',
          hat:   'x..xx..xx..xx..x',
          rim:   '................' + '................'
               + '..........g.....' + '..............g.' },
        { name: 'Sparse',
          kick:  'x...........x...',
          snare: '....x.......x...',
          hat:   'x..x..x..x..x..x' },
        { name: 'Busy hats',
          kick:  'x..x....x.x..x..',
          snare: '....x.......x...',
          hat:   'xx.xxx.xxx.xxx.x',
          rim:   '......g.......g.' }
      ],
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
      drums: [
        { name: 'Ride and comp',
          ride:  'x.xxx.xxx.xxx.xx',
          hat:   '....x.......x...',
          kick:  'x..............x',
          snare: '......g...g.....' },
        { name: 'Feathered four',
          ride:  'x.xxx.xxx.xxx.xx',
          hat:   '....x.......x...',
          kick:  'x...x...x...x...',
          snare: '..g.....g...g...' },
        { name: 'Two feel',
          ride:  'x...x...x...x...',
          hat:   '....x.......x...',
          kick:  'x.......x.......',
          snare: '........g.......' },
        { name: 'Trading',
          /* Two bars, because trading is a two-bar idea: the drums answer in
             the second what the horn played in the first. */
          ride:  'x.xxx.xxx.xxx.xx' + 'x.xxx.xx........',
          hat:   '....x.......x...',
          kick:  '......x.....x...' + '......x.x...x.x.',
          snare: 'g..g..g...g..g..' + 'g..g..g.x.x.x.xx' }
      ],
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
      drums: [
        { name: 'Shuffle',
          ride:  'x.xxx.xxx.xxx.xx',
          snare: '....x.......x...',
          kick:  'x.......x.......' },
        { name: 'Slow blues',
          ride:  'x.xxx.xxx.xxx.xx',
          snare: '....x.......x...' + '....x.....g.x...',
          kick:  'x.....x.x.......' + 'x.....x.x.....x.',
          rim:   '..........g.....' },
        { name: 'Hats up',
          hat:   'x.xxx.xxx.xxx.xx',
          snare: '....x.......x...',
          kick:  'x..x....x..x....' },
        { name: 'Stop time',
          ride:  'x.......x.......',
          snare: '....x...........',
          kick:  'x...x...x.......',
          crash: 'x...............' }
      ],
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
      drums: [
        { name: 'Driving',
          kick:  'x...x..x..x.x...' + 'x...x..x..x.x.x.',
          snare: '....x.......x...',
          hat:   'x.x.x.x.x.x.x.x.',
          crash: 'x...............' + '................' },
        { name: 'Straight eights',
          kick:  'x.......x.......',
          snare: '....x.......x...',
          hat:   'x.x.x.x.x.x.x.x.',
          crash: 'x...............' },
        { name: 'Sixteenth hats',
          kick:  'x..x..x...x.x...',
          snare: '....x.......x...',
          hat:   'xxxxxxxxxxxxxxxx' },
        { name: 'Half-time',
          kick:  'x.......x...x...',
          snare: '........x.......',
          hat:   'x.x.x.x.x.x.x.x.',
          crash: 'x...............' }
      ],
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
      drums: [
        { name: 'Neo-soul',
          kick:  'x.....x...x...x.',
          snare: '....x.......x...',
          hat:   'x.xxx.xxx.xxx.xx',
          rim:   '..g..g...g..g...' },
        { name: 'Laid back',
          kick:  'x.......x.....x.',
          snare: '....x.......x...',
          hat:   'x..x..x..x..x..x',
          shaker: '..x...x...x...x.',
          rim:   '......g.......g.' },
        { name: 'Pocket',
          kick:  'x..x..x...x.x...' + 'x..x..x.....x...',
          snare: '....x.......x...' + '....x.....g.x...',
          hat:   'x.x.x.x.x.x.x.x.',
          rim:   '..g...g...g...g.' },
        { name: 'Half-time swing',
          kick:  'x.........x.....',
          snare: '........x.......',
          hat:   'x.xxx.xxx.xxx.xx',
          rim:   '..g..g...g..g...' }
      ],
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
      drums: [
        { name: 'Four to the floor',
          kick:    'x...x...x...x...',
          clap:    '....x.......x...',
          hat:     'x...x...x...x...',
          openHat: '..o...o...o...o.' },
        { name: 'Deep',
          kick:    'x...x...x...x...',
          clap:    '....x.......x...',
          hat:     '..x...x...x...x.',
          rim:     '......g.......g.' },
        { name: 'Shuffled hats',
          kick:    'x...x...x...x...',
          clap:    '....x.......x...',
          hat:     'x..xx..xx..xx..x',
          openHat: '......o.......o.' },
        { name: 'Rolling',
          /* Four bars. The kick never moves — it cannot, it is the floor —
             so the variation lives in the open hat and the rim, which is
             where it lives on the record too. */
          kick:    'x...x...x...x...',
          clap:    '....x.......x...',
          hat:     'x.x.x.x.x.x.x.x.',
          openHat: '..o...o...o...o.' + '..o...o...o...o.'
                 + '..o...o...o...o.' + '..o...o...o.o.o.',
          rim:     '................' + '...g...g...g...g'
                 + '................' + '...g...g...g..gg' }
      ],
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
      drums: [
        { name: 'Gated eights',
          kick:  'x.......x.......',
          snare: '....x.......x...',
          hat:   'x.x.x.x.x.x.x.x.',
          clap:  '....x.......x...' },
        { name: 'Driving',
          kick:  'x...x...x...x...',
          snare: '....x.......x...',
          hat:   'x.x.x.x.x.x.x.x.',
          openHat: '......o.......o.' + '......o...o...o.' },
        { name: 'Sixteenth pulse',
          kick:  'x.......x...x...',
          snare: '....x.......x...',
          hat:   'xxxxxxxxxxxxxxxx',
          clap:  '....x.......x...' },
        { name: 'Big snare',
          kick:  'x.....x.x.......',
          snare: '....x.......x...',
          hat:   '..x...x...x...x.',
          crash: 'x...............' }
      ],
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
      /* Ambient keeps its silence. It is the one genre whose Drums part is
         deliberately empty — the whole point of the form is what enters and
         leaves, slowly — and the app already says so where the part switcher
         and the mix row would otherwise offer you a control that does
         nothing. */
      drums: [{ name: 'None' }],
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
      drums: [
        { name: 'Open',
          kick:  'x.......x.......',
          snare: '....x.......x...',
          hat:   '..x...x...x...x.' },
        { name: 'Brushed',
          kick:  'x.......x.......',
          snare: '....g...x...g...',
          shaker: 'x.x.x.x.x.x.x.x.' },
        { name: 'Stomp and clap',
          kick:  'x...x...x...x...' + 'x...x...x...x.x.',
          clap:  '....x.......x...',
          rim:   '..g...g...g...g.' },
        { name: 'Waltzing eight',
          kick:  'x.....x.......x.',
          snare: '....x.......x...',
          hat:   'x..x..x..x..x..x' }
      ],
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
      drums: [
        { name: 'Half-time trap',
          kick:  'x.......x.....x.',
          snare: '........x.......',
          hat:   'x.x.xxx.x.xxx.xx' },
        { name: 'Rolling hats',
          /* Four bars: the hat thins out and comes back, which is the one
             thing a trap loop does that a listener notices. */
          kick:  'x.....x.x.......' + 'x.....x.....x...'
               + 'x.....x.x.......' + 'x...x.....x.x...',
          snare: '........x.......',
          hat:   'xxxxxxxxxxxxxxxx' + 'x.x.x.x.x.x.x.x.'
               + 'xxxxxxxxxxxxxxxx' + 'xxxxxxxxxxxxxxxx' },
        { name: 'Sparse and heavy',
          kick:  'x...........x...',
          snare: '........x.......',
          hat:   'x...x...x...x...',
          openHat: '..............o.' },
        { name: 'Double time',
          kick:  'x...x.....x.x...',
          snare: '....x.......x...',
          hat:   'x.xxx.xxx.xxx.xx' }
      ],
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
      drums: [
        /* Son clave is a TWO-bar figure and always was — three strokes in the
           first bar, two in the second. Writing it into sixteen steps folded
           both halves onto each other and produced a bar that repeats where
           the real thing alternates, which is the one rhythmic fact about
           this music. 3-2 and 2-3 are the two ways round, and they are
           different beats rather than the same beat rotated. */
        { name: 'Clave 3-2',
          rim:   'x..x..x.........' + '..x...x.........',
          hat:   'x.x.x.x.x.x.x.x.',
          kick:  'x.....x.x.....x.' },
        { name: 'Clave 2-3',
          rim:   '..x...x.........' + 'x..x..x.........',
          hat:   'x.x.x.x.x.x.x.x.',
          kick:  'x.....x.x.....x.' },
        { name: 'Brushed samba',
          rim:   'x..x..x.........' + '..x...x.........',
          hat:   'x.xxx.xxx.xxx.xx',
          kick:  'x..x..x.x..x..x.' },
        { name: 'Quiet',
          rim:   'x.....x...x.....',
          shaker: 'xxxxxxxxxxxxxxxx',
          kick:  'x.......x.......' }
      ],
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
      drums: [
        { name: 'On the one',
          kick:  'x...x..x..x.....',
          snare: '....x.......x...',
          hat:   'xxxxxxxxxxxxxxxx',
          rim:   '..g...g...g...g.' },
        { name: 'Syncopated',
          kick:  'x..x..x..x..x..x',
          snare: '....x.......x...',
          hat:   'x.xxx.xxx.xxx.xx',
          rim:   '...g...g...g...g' },
        { name: 'Ghost heavy',
          kick:  'x.....x...x.x...',
          snare: '..g.x..g..g.x..g',
          hat:   'xxxxxxxxxxxxxxxx' },
        { name: 'Broken',
          kick:  'x.x.....x.....x.' + 'x.x...x.......x.',
          snare: '....x.....g.x...' + '....x.g...g.x..g',
          hat:   'x.x.x.x.x.x.x.x.',
          rim:   '......g.......g.' }
      ],
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
      drums: [
        { name: 'Shuffle',
          kick:  'x.....x...x.....',
          snare: '....x.......x...',
          hat:   'x..x..x..x..x..x',
          rim:   '............g...' },
        { name: 'Two and four',
          kick:  'x.......x.......',
          snare: '....x.......x...',
          hat:   'x.xxx.xxx.xxx.xx',
          clap:  '....x.......x...',
          tamb:  '....x.......x...' },
        { name: 'Driving praise',
          kick:  'x...x...x...x...' + 'x...x...x...x.x.',
          snare: '....x.......x...',
          hat:   'x.x.x.x.x.x.x.x.',
          clap:  '....x.......x...',
          tamb:  '..x...x...x...x.',
          crash: 'x...............' + '................' },
        { name: 'Half-time',
          kick:  'x.........x.....',
          snare: '........x.......',
          hat:   'x..x..x..x..x..x',
          rim:   '..g..g...g..g...' }
      ],
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

  /* Every genre knows its own key. The object is reached through GENRES[id]
     almost everywhere, but anything handed the object alone — the drum
     builder, given a genre and asked for its feel — had no way back to the
     name without threading it through as a second argument. */
  Object.keys(GENRES).forEach((id) => { GENRES[id].id = id; });

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
  /* Loudest and highest first: this is the order the kit is laid out in on the
     faceplates, and it reads down the way a drummer's reach does. */
  const DRUM_VOICES = [
    { id: 'crash',   label: 'Crash',    how: 'Marks the top of the loop.' },
    { id: 'ride',    label: 'Ride',     how: 'Keeps the pulse ticking over the top.' },
    { id: 'openHat', label: 'Open hat', how: 'Lifts the offbeats.' },
    { id: 'hat',     label: 'Hi-hat',   how: 'The subdivision you count along to.' },
    { id: 'tamb',    label: 'Tambourine', how: 'Rides the backbeat without competing with it.' },
    { id: 'shaker',  label: 'Shaker',   how: 'Keeps sixteenths going under everything else.' },
    { id: 'clap',    label: 'Clap',     how: 'Doubles the backbeat.' },
    { id: 'rim',     label: 'Rim',      how: 'Quiet colour between the main hits.' },
    { id: 'snare',   label: 'Snare',    how: 'The backbeat, usually beats 2 and 4.' },
    { id: 'tomHigh', label: 'High tom', how: 'The top of a fill.' },
    { id: 'tomMid',  label: 'Mid tom',  how: 'The middle of a fill.' },
    { id: 'tomLow',  label: 'Floor tom', how: 'The bottom of a fill, and the weight under one.' },
    { id: 'kick',    label: 'Kick',     how: 'Where the bar lands.' }
  ];

  /* Which kit the genre is played on. The patterns say what is hit; this says
     what it sounds like when it is, and it is at least as much of what makes a
     beat belong to a genre — the same sixteen steps on an 808 and on a jazz
     kit with brushes are not the same beat. */
  const KIT = {
    pop: 'acoustic', lofi: 'dusty', rock: 'acoustic', rnb: 'dusty',
    jazz: 'brushes', blues: 'acoustic', house: 'machine', synthwave: 'machine',
    trap: 'eight08', funk: 'acoustic', gospel: 'acoustic', bossa: 'brushes',
    folk: 'acoustic', ambient: 'acoustic'
  };

  /* Attached to the genre rather than looked up, because the audio engine is
     handed a song and should not have to know that a table exists. KIT is
     declared below GENRES, so this is a second pass rather than part of the
     one that stamps the ids. */
  Object.keys(GENRES).forEach((id) => { GENRES[id].kit = KIT[id] || 'acoustic'; });

  /* Which fills a genre reaches for. Every fill in the app used to be a snare
     run down the last four sixteenths, in every genre, which is one drummer
     with one idea. A house record does not fill — it drops out, and the hole
     is the fill. Jazz trades. Rock goes round the toms.

     Listed in order of preference; the draw is weighted toward the front, so
     the first is the genre's usual answer and the others are what it does
     when it wants a change. Ambient does not fill because ambient does not
     have drums. */
  const FILLS = {
    pop:       ['snareRun', 'tomFall', 'lift'],
    lofi:      ['flam', 'snareRun'],
    rock:      ['tomFall', 'tomRoll', 'trade'],
    rnb:       ['flam', 'snareRun', 'tomFall'],
    jazz:      ['trade', 'snareRun'],
    blues:     ['trade', 'snareRun'],
    house:     ['drop', 'lift'],
    synthwave: ['tomFall', 'lift', 'drop'],
    trap:      ['drop', 'flam', 'snareRun'],
    funk:      ['trade', 'snareRun', 'tomFall'],
    gospel:    ['snareRun', 'tomRoll', 'trade'],
    bossa:     ['flam', 'snareRun'],
    folk:      ['snareRun', 'tomFall'],
    ambient:   []
  };

  global.Genres = {
    GENRES,
    ENERGY,
    CELLS,
    DRUM_VOICES,
    FEEL,
    KIT,
    FILLS,
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
