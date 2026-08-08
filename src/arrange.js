/* Downbeat — arrangement guide.

   The generator writes a loop. This turns that loop into a song: a section
   plan that says how long each part runs, which of the five parts play in it,
   and what to actually do — which is the step most loop-based tools leave you
   to guess at.

   Plans are built from the loop rather than fixed: a section is a whole number
   of loops, so nothing ever lands mid-progression. */
(function (global) {
  'use strict';

  const TRACKS = [
    { id: 'melody', label: 'Melody' },
    { id: 'counter', label: 'Counter' },
    { id: 'chords', label: 'Chords' },
    { id: 'bass', label: 'Bass' },
    { id: 'drums', label: 'Drums' }
  ];

  /* Which shape a genre's songs tend to take. */
  const FAMILY = {
    pop: 'song', rock: 'song', folk: 'song', rnb: 'song', gospel: 'song', funk: 'song',
    house: 'dance', trap: 'dance', synthwave: 'dance',
    jazz: 'head', blues: 'head', bossa: 'head',
    lofi: 'loop', ambient: 'loop'
  };

  /* Each entry: [name, loops, tracks, intensity, how].
     `loops` is how many times the generated loop repeats. `tracks` is what
     plays; anything the song doesn't have is dropped later. */
  const FORMS = {
    song: {
      label: 'Verse / chorus',
      note: 'The everyday shape: state it, lift it, break it, lift it higher.',
      sections: [
        ['Intro', 1, ['chords'], 0.2,
          'Progression on its own, no drums and no tune. Two or four bars is plenty — you are just setting the key.'],
        ['Verse', 2, ['chords', 'bass', 'drums'], 0.5,
          'Groove in, melody out. Leaving the hook out here is what makes it land later.'],
        ['Chorus', 2, ['melody', 'counter', 'chords', 'bass', 'drums'], 0.9,
          'Everything in — this is the loop exactly as generated. The melody arriving is the lift.'],
        ['Verse 2', 2, ['counter', 'chords', 'bass', 'drums'], 0.55,
          'Same as the first verse, but let the second line carry it so the repeat is not identical.'],
        ['Chorus 2', 2, ['melody', 'counter', 'chords', 'bass', 'drums'], 0.9,
          'Straight back in. Resist adding anything new — you want the third lift to have somewhere to go.'],
        ['Bridge', 1, ['melody', 'chords'], 0.35,
          'Strip to the tune and the chords, or halve the tempo feel. The drop-out is the point.'],
        ['Last chorus', 2, ['melody', 'counter', 'chords', 'bass', 'drums'], 1,
          'Loudest version. Double the melody an octave up if you have the voices for it.'],
        ['Outro', 1, ['chords'], 0.2,
          'Let the final chord ring and take everything else away.']
      ]
    },
    dance: {
      label: 'Build / drop',
      note: 'Tension and release: the drums are the spine, everything else comes and goes.',
      sections: [
        ['Intro', 2, ['drums'], 0.3,
          'Drums alone. Long enough to beatmatch — this is the DJ-friendly top of the track.'],
        ['Build', 1, ['chords', 'bass', 'drums'], 0.6,
          'Bass and chords join. Open a filter across the bar and pull the hats up as you go.'],
        ['Drop', 2, ['melody', 'counter', 'chords', 'bass', 'drums'], 1,
          'Everything at once. The full loop as written — no notes added, just all of it.'],
        ['Breakdown', 1, ['melody', 'chords'], 0.3,
          'Drums and bass out. The melody over pads, with reverb up, resets the ear.'],
        ['Second drop', 2, ['melody', 'counter', 'chords', 'bass', 'drums'], 1,
          'Back in without a build — arriving early is the trick that makes it feel bigger.'],
        ['Outro', 1, ['drums', 'bass'], 0.35,
          'Strip back to drums and bass so the next track has somewhere to come in.']
      ]
    },
    head: {
      label: 'Head and solos',
      note: 'State the tune, blow over the form, state it again. The chorus is the unit.',
      sections: [
        ['Head', 1, ['melody', 'chords', 'bass', 'drums'], 0.75,
          'Melody with the rhythm section, played fairly straight. This is the tune everyone has to remember.'],
        ['Solo chorus', 1, ['chords', 'bass', 'drums'], 0.65,
          'Same form, no written melody — improvise over it. Comp lighter than you think you should.'],
        ['Solo chorus 2', 1, ['counter', 'chords', 'bass', 'drums'], 0.8,
          'Second time round, lift it. The second line is a good source of ideas to develop.'],
        ['Trade', 1, ['melody', 'chords', 'bass', 'drums'], 0.85,
          'Four-bar trades with the drums, or drop to bass and melody alone for one pass.'],
        ['Head out', 1, ['melody', 'counter', 'chords', 'bass', 'drums'], 0.9,
          'Tune again, everyone in, and take the last chord out of tempo if it suits.']
      ]
    },
    loop: {
      label: 'Fade up, fade down',
      note: 'No big lifts — the interest is in what enters and leaves, slowly.',
      sections: [
        ['Emerge', 1, ['chords'], 0.15,
          'Chords alone, filtered dark, faded in over the whole section rather than switched on.'],
        ['Settle', 2, ['chords', 'bass', 'drums'], 0.45,
          'Low end and pulse arrive. Keep the tune out — the groove should feel like it could go forever.'],
        ['Full', 2, ['melody', 'counter', 'chords', 'bass', 'drums'], 0.8,
          'Melody in. This is as loud as it gets, which is not very loud.'],
        ['Drift', 2, ['melody', 'chords'], 0.4,
          'Drums and bass away. Let the tune wander over the pad with more space between notes.'],
        ['Fade', 1, ['chords'], 0.15,
          'Chords only, fading out. Ending on an unresolved chord keeps it from feeling finished.']
      ]
    }
  };

  /* Getting the arrangement onto the hardware, per device. */
  const DEVICE_TIPS = {
    ep133: 'Each section is a <b>scene</b>. Commit the loop to a pattern, copy it across scenes, then mute groups per scene so the parts drop in and out — the fader rides group level for the builds. Chain the scenes in <b>song</b> mode when it plays right.',
    fm1: 'The sequencer holds 16 patterns, so one per section is more than enough. V15 lets you bind a voice to a pattern, so a section can change sound as well as notes — a filtered version of the same part reads as a whole new section.'
  };

  function timeOf(bars, bpm) {
    const seconds = bars * 4 * (60 / bpm);
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  /* Which parts this song actually has — no point telling someone to drop a
     countermelody they never generated. */
  function availableTracks(song) {
    const has = { melody: song.melody.length > 0, chords: true, bass: song.bass.length > 0 };
    has.counter = !!(song.counter && song.counter.length);
    has.drums = song.drums.length > 0;
    return has;
  }

  function plan(song) {
    const familyId = FAMILY[song.genreId] || 'song';
    const form = FORMS[familyId];
    const has = availableTracks(song);
    const loop = song.bars;
    /* A twelve-bar loop is already long; doubling every section would give a
       six-minute sketch, so only short loops get repeated sections. */
    const scale = loop <= 8 ? 1 : 0.5;

    let bar = 0;
    const sections = form.sections.map((spec, i) => {
      const [name, loops, tracks, intensity, how] = spec;
      const count = Math.max(1, Math.round(loops * scale));
      const bars = count * loop;
      const active = tracks.filter((id) => has[id]);
      const section = {
        id: `s${i}`, name, bars, loops: count, start: bar,
        tracks: active,
        muted: TRACKS.map((t) => t.id).filter((id) => has[id] && active.indexOf(id) < 0),
        intensity, how
      };
      bar += bars;
      return section;
    });

    return {
      familyId, label: form.label, note: form.note,
      sections, loop, totalBars: bar,
      time: timeOf(bar, song.bpm),
      tracks: TRACKS.filter((t) => has[t.id])
    };
  }

  global.Arrange = { plan, TRACKS, DEVICE_TIPS };
})(window);
