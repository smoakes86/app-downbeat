/* Downbeat — Standard MIDI File export.
   Hand-rolled format 1 bytes, no dependency. Five parts: melody,
   countermelody, chords, bass, and drums on channel 10. */
(function (global) {
  'use strict';

  const TICKS_PER_QUARTER = 480;
  const TICKS_PER_STEP = TICKS_PER_QUARTER / 4;

  /* Downbeat patch -> General MIDI program number. */
  const PROGRAMS = {
    epiano: 4, wurli: 4, pad: 89, pluck: 81, stab: 81, supersaw: 81,
    organ: 16, guitar: 27, nylon: 24, bell: 9,
    sineLead: 80, softLead: 81, brightLead: 81,
    upright: 32, fingerBass: 33, synthBass: 38, sub808: 38, subSine: 38
  };

  /* Downbeat drum name -> General MIDI percussion key. */
  const DRUM_KEYS = {
    kick: 36, snare: 38, hat: 42, openHat: 46, clap: 39,
    rim: 37, ride: 51, crash: 49
  };

  function variableLength(value) {
    const bytes = [value & 0x7f];
    let rest = value >> 7;
    while (rest > 0) {
      bytes.unshift((rest & 0x7f) | 0x80);
      rest >>= 7;
    }
    return bytes;
  }

  function text(value) {
    const out = [];
    for (let i = 0; i < value.length; i++) out.push(value.charCodeAt(i) & 0x7f);
    return out;
  }

  function chunk(id, body) {
    const length = body.length;
    return text(id).concat([
      (length >> 24) & 0xff, (length >> 16) & 0xff, (length >> 8) & 0xff, length & 0xff
    ], body);
  }

  /* Turn absolute-time events into a delta-encoded track chunk. */
  function track(name, events) {
    const sorted = events.slice().sort((a, b) => (a.tick - b.tick) || (a.order - b.order));
    const body = [].concat(
      variableLength(0), [0xff, 0x03, name.length], text(name)
    );
    let previous = 0;
    sorted.forEach((event) => {
      const delta = Math.max(0, Math.round(event.tick) - previous);
      previous = Math.round(event.tick);
      body.push.apply(body, variableLength(delta));
      body.push.apply(body, event.data);
    });
    body.push.apply(body, variableLength(0));
    body.push(0xff, 0x2f, 0x00);
    return chunk('MTrk', body);
  }

  function noteEvents(list, channel, tickOf, velocityOf) {
    const events = [];
    list.forEach((note) => {
      const start = tickOf(note);
      const velocity = Math.max(1, Math.min(127, Math.round((velocityOf(note)) * 127)));
      const length = Math.max(TICKS_PER_STEP / 4, Math.round(note.dur * TICKS_PER_STEP * 0.94));
      events.push({ tick: start, order: 1, data: [0x90 | channel, note.midi & 0x7f, velocity] });
      events.push({ tick: start + length, order: 0, data: [0x80 | channel, note.midi & 0x7f, 0x40] });
    });
    return events;
  }

  function programChange(channel, patch) {
    return { tick: 0, order: 0, data: [0xc0 | channel, (PROGRAMS[patch] || 0) & 0x7f] };
  }

  function build(song) {
    const patches = song.genre.patches || {};
    const tickOf = (note) => Math.round((note.start !== undefined ? note.start : note.step) * TICKS_PER_STEP);

    // Track 0 carries tempo and metre only.
    const microsecondsPerQuarter = Math.round(60000000 / song.bpm);
    const conductor = track('Downbeat', [
      { tick: 0, order: 0, data: [0xff, 0x51, 0x03,
        (microsecondsPerQuarter >> 16) & 0xff,
        (microsecondsPerQuarter >> 8) & 0xff,
        microsecondsPerQuarter & 0xff] },
      { tick: 0, order: 1, data: [0xff, 0x58, 0x04, 4, 2, 24, 8] }
    ]);

    const melody = track('Melody', [programChange(0, patches.lead)]
      .concat(noteEvents(song.melody, 0, tickOf, (n) => n.velocity)));

    const counter = track('Countermelody', [programChange(3, patches.counter)]
      .concat(noteEvents(song.counter || [], 3, tickOf, (n) => n.velocity)));

    const chords = track('Chords', [programChange(1, patches.chord)]
      .concat(noteEvents(song.chordTrack || [], 1, tickOf, (n) => n.velocity)));

    const bass = track('Bass', [programChange(2, patches.bass)]
      .concat(noteEvents(song.bass, 2, tickOf, (n) => n.velocity)));

    const drumEvents = [];
    (song.drums || []).forEach((hit) => {
      const key = DRUM_KEYS[hit.instrument];
      if (!key) return;
      const start = Math.round(hit.step * TICKS_PER_STEP);
      const velocity = Math.max(1, Math.min(127, Math.round(hit.velocity * 127)));
      drumEvents.push({ tick: start, order: 1, data: [0x99, key, velocity] });
      drumEvents.push({ tick: start + TICKS_PER_STEP / 2, order: 0, data: [0x89, key, 0x40] });
    });
    const drums = track('Drums', drumEvents);

    const header = chunk('MThd', [
      0, 1,          // format 1
      0, 6,          // six tracks
      (TICKS_PER_QUARTER >> 8) & 0xff, TICKS_PER_QUARTER & 0xff
    ]);

    return new Uint8Array(header.concat(conductor, melody, counter, chords, bass, drums));
  }

  function filename(song) {
    const safe = (value) => String(value).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
    return `downbeat-${safe(song.genre.label)}-${safe(song.key.rootName)}-${safe(song.scaleName)}.mid`;
  }

  function download(song) {
    const blob = new Blob([build(song)], { type: 'audio/midi' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename(song);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return link.download;
  }

  global.Midi = { build, download, filename, PROGRAMS, DRUM_KEYS };
})(window);
