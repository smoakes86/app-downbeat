/* Downbeat — arrangement guide.

   The generator writes a verse and a chorus. This turns them into a song: a
   section plan that says how long each part of the form runs, which of the
   two sections it plays, which of the five parts play in it, and what to
   actually do — which is the step most loop-based tools leave you to guess
   at.

   Plans are built from the loops rather than fixed: a section of the form is
   a whole number of passes of the verse or of the chorus, so nothing ever
   lands mid-progression. */
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

  /* Each entry: [name, loops, plays, tracks, intensity, how].
     `plays` is which of the song's two sections this one is made of — the
     verse's chords and tune, or the chorus's — and `loops` is how many times
     that section repeats. `tracks` is what plays; anything the song doesn't
     have is dropped later.

     The two sections are not the same music with parts muted: the verse sits
     lower and rests more, and its changes are chosen so the chorus lands. So
     a form leans on that. Where a section wants to state the tune and hold
     back, it is the verse; where it wants the lift, it is the chorus; and a
     stripped section is the verse stripped, so the full chorus after it
     changes the harmony and the weight at once. */
  const ALL = ['melody', 'counter', 'chords', 'bass', 'drums'];
  const FORMS = {
    song: {
      label: 'Verse / chorus',
      note: 'The everyday shape: state it, lift it, break it, lift it higher.',
      sections: [
        ['Intro', 1, 'verse', ['chords'], 0.2,
          'The verse’s progression on its own, no drums and no tune. Two or four bars is plenty — you are just setting the key.'],
        ['Verse', 2, 'verse', ['melody', 'chords', 'bass', 'drums'], 0.5,
          'The verse: its own changes and its own tune, lower and more spoken than the hook. Groove in under it and keep the second line out.'],
        ['Chorus', 2, 'chorus', ALL, 0.9,
          'New changes, new tune, everything in. The hook arriving over a lift in the harmony is what makes it land.'],
        ['Verse 2', 2, 'verse', ['melody', 'counter', 'chords', 'bass', 'drums'], 0.6,
          'The verse again, with the second line under it this time, so the repeat is not identical.'],
        ['Chorus 2', 2, 'chorus', ALL, 0.9,
          'Straight back in. Resist adding anything new — you want the third lift to have somewhere to go.'],
        ['Bridge', 1, 'verse', ['melody', 'chords'], 0.35,
          'The verse stripped to its tune and its chords. The drop-out is the point, and coming from here the last chorus changes the harmony and the weight at once.'],
        ['Last chorus', 2, 'chorus', ALL, 1,
          'Loudest version. Double the melody an octave up if you have the voices for it.'],
        ['Outro', 1, 'chorus', ['chords'], 0.2,
          'The chorus’s progression alone, so the last chord rings where the song lives, with everything else taken away.']
      ]
    },
    dance: {
      label: 'Build / drop',
      note: 'Tension and release: the drums are the spine, everything else comes and goes.',
      sections: [
        ['Intro', 2, 'verse', ['drums'], 0.3,
          'Drums alone. Long enough to beatmatch — this is the DJ-friendly top of the track.'],
        ['Build', 1, 'verse', ['chords', 'bass', 'drums'], 0.6,
          'The verse’s bass and chords join. Open a filter across the bar and pull the hats up as you go.'],
        ['Drop', 2, 'chorus', ALL, 1,
          'Everything at once, on the chorus’s changes — the tune arrives with a lift in the harmony under it.'],
        ['Breakdown', 1, 'verse', ['melody', 'chords'], 0.3,
          'Drums and bass out. The verse’s own tune over pads, with reverb up, resets the ear.'],
        ['Second drop', 2, 'chorus', ALL, 1,
          'Back in without a build — arriving early is the trick that makes it feel bigger.'],
        ['Outro', 1, 'chorus', ['drums', 'bass'], 0.35,
          'Strip back to drums and bass so the next track has somewhere to come in.']
      ]
    },
    head: {
      label: 'Head and solos',
      note: 'State the tune, blow over the changes, state it again.',
      sections: [
        ['Head', 1, 'chorus', ['melody', 'chords', 'bass', 'drums'], 0.75,
          'The tune with the rhythm section, played fairly straight. This is the one everyone has to remember.'],
        ['Solo', 1, 'verse', ['chords', 'bass', 'drums'], 0.65,
          'The verse’s changes with no written line on them — blow over these. Comp lighter than you think you should.'],
        ['Second solo', 1, 'verse', ['counter', 'chords', 'bass', 'drums'], 0.8,
          'Second time round, lift it. The verse’s second line is a good source of ideas to develop.'],
        ['Trade', 1, 'verse', ['melody', 'chords', 'bass', 'drums'], 0.85,
          'The verse’s own tune, traded four bars at a time with the drums — or bass and tune alone for one pass.'],
        ['Head out', 1, 'chorus', ALL, 0.9,
          'The tune again, everyone in, and take the last chord out of tempo if it suits.']
      ]
    },
    loop: {
      label: 'Fade up, fade down',
      note: 'No big lifts — the interest is in what enters and leaves, slowly.',
      sections: [
        ['Emerge', 1, 'verse', ['chords'], 0.15,
          'The verse’s chords alone, filtered dark, faded in over the whole section rather than switched on.'],
        ['Settle', 2, 'verse', ['chords', 'bass', 'drums'], 0.45,
          'Low end and pulse arrive. Keep the tune out — the groove should feel like it could go forever.'],
        ['Full', 2, 'chorus', ALL, 0.8,
          'The chorus: its own changes, and its tune in. This is as loud as it gets, which is not very loud.'],
        ['Drift', 2, 'verse', ['melody', 'chords'], 0.4,
          'Drums and bass away. The verse’s sparser tune wanders over the pad with more space between notes.'],
        ['Fade', 1, 'verse', ['chords'], 0.15,
          'The verse’s chords only, fading out. Ending away from the chorus keeps it from feeling finished.']
      ]
    }
  };

  /* Getting the arrangement onto the hardware, per device. */
  const DEVICE_TIPS = {
    ep133: 'Each section is a <b>scene</b>. Commit the verse and the chorus to a pattern each, copy each across the scenes that play it, then mute groups per scene so the parts drop in and out — the fader rides group level for the builds. Chain the scenes in <b>song</b> mode when it plays right.',
    fm1: 'The sequencer holds 16 patterns, so the verse and the chorus get one each with room to spare. V15 lets you bind a voice to a pattern, so a section can change sound as well as notes — a filtered version of the same part reads as a whole new section.'
  };

  function timeOf(bars, bpm) {
    const seconds = bars * 4 * (60 / bpm);
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  /* Which parts this song actually has — no point telling someone to drop a
     countermelody they never generated. Either section counts: a part that
     is in one of them is in the song. */
  function availableTracks(song) {
    const sections = song.sections && song.sections.length ? song.sections : [song];
    const any = (id) => sections.some((s) => s[id] && s[id].length > 0);
    return { melody: any('melody'), counter: any('counter'), chords: true, bass: any('bass'), drums: any('drums') };
  }

  function plan(song) {
    const familyId = FAMILY[song.genreId] || 'song';
    const form = FORMS[familyId];
    const has = availableTracks(song);
    /* The verse and the chorus are written to the same length, so one number
       is the length of either. */
    const loop = song.bars;
    /* A twelve-bar loop is already long; doubling every section would give a
       six-minute sketch, so only short loops get repeated sections. */
    const scale = loop <= 8 ? 1 : 0.5;

    let bar = 0;
    const sections = form.sections.map((spec, i) => {
      const [name, loops, plays, tracks, intensity, how] = spec;
      const count = Math.max(1, Math.round(loops * scale));
      const bars = count * loop;
      const active = tracks.filter((id) => has[id]);
      /* Which of the song's sections this one is passes of. A song from
         before there were two has none to name, and plays what it always
         played. */
      const played = (song.sections || []).find((s) => s.id === plays) || null;
      const section = {
        id: `s${i}`, name, bars, loops: count, start: bar,
        plays: played ? played.id : null,
        playsLabel: played ? played.label : '',
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
