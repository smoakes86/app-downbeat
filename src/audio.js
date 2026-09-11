/* Downbeat — audio engine.

   Synthesised voices with real envelopes and filters, drums built from
   oscillators and noise, a shared reverb send, and a lookahead scheduler
   running off the audio clock rather than setTimeout — so playback stays in
   time, loops seamlessly and works for a song of any length. */
(function (global) {
  'use strict';

  const TRACKS = ['melody', 'counter', 'chords', 'bass', 'drums'];
  const LOOKAHEAD_MS = 25;
  const SCHEDULE_AHEAD = 0.12;

  /* Voice definitions. `osc` is a stack of oscillators (relative octave,
     detune in cents, mix); `fm` adds a modulator into the carriers; `amp` and
     `filter` are ADSR envelopes in seconds. */
  const PATCHES = {
    epiano:    { gain: 0.16, reverb: 0.3, osc: [{ type: 'sine', gain: 1 }], fm: { ratio: 3, index: 320, decay: 0.42 }, amp: { a: 0.004, d: 0.5, s: 0.24, r: 0.5 }, filter: { base: 900, env: 2200, q: 0.7, a: 0.005, d: 0.5 } },
    wurli:     { gain: 0.16, reverb: 0.34, osc: [{ type: 'sine', gain: 1 }, { type: 'triangle', gain: 0.28, detune: 6 }], fm: { ratio: 2, index: 210, decay: 0.5 }, amp: { a: 0.006, d: 0.6, s: 0.2, r: 0.55 }, filter: { base: 700, env: 1500, q: 0.8, a: 0.01, d: 0.6 } },
    pad:       { gain: 0.1, reverb: 0.62, osc: [{ type: 'sawtooth', gain: 0.5, detune: -8 }, { type: 'sawtooth', gain: 0.5, detune: 9 }, { type: 'triangle', gain: 0.4, octave: -1 }], amp: { a: 0.55, d: 0.9, s: 0.75, r: 1.5 }, filter: { base: 380, env: 900, q: 0.6, a: 0.7, d: 1.4 } },
    pluck:     { gain: 0.15, reverb: 0.26, osc: [{ type: 'sawtooth', gain: 0.7 }, { type: 'square', gain: 0.25, detune: 7 }], amp: { a: 0.003, d: 0.28, s: 0.08, r: 0.22 }, filter: { base: 620, env: 3200, q: 2.4, a: 0.004, d: 0.24 } },
    stab:      { gain: 0.14, reverb: 0.36, osc: [{ type: 'sawtooth', gain: 0.5, detune: -12 }, { type: 'sawtooth', gain: 0.5, detune: 11 }], amp: { a: 0.004, d: 0.22, s: 0.03, r: 0.18 }, filter: { base: 800, env: 3600, q: 3.2, a: 0.005, d: 0.2 } },
    supersaw:  { gain: 0.1, reverb: 0.4, osc: [{ type: 'sawtooth', gain: 0.4, detune: -14 }, { type: 'sawtooth', gain: 0.4, detune: 0 }, { type: 'sawtooth', gain: 0.4, detune: 15 }], amp: { a: 0.01, d: 0.35, s: 0.45, r: 0.35 }, filter: { base: 700, env: 2600, q: 1.6, a: 0.02, d: 0.4 } },
    organ:     { gain: 0.12, reverb: 0.3, osc: [{ type: 'sine', gain: 0.6 }, { type: 'sine', gain: 0.35, octave: 1 }, { type: 'sine', gain: 0.2, octave: 1, detune: 702 }], amp: { a: 0.012, d: 0.1, s: 0.85, r: 0.12 }, filter: { base: 1400, env: 900, q: 0.5, a: 0.01, d: 0.2 } },
    guitar:    { gain: 0.13, reverb: 0.24, osc: [{ type: 'sawtooth', gain: 0.6 }, { type: 'triangle', gain: 0.4, detune: -6 }], amp: { a: 0.004, d: 0.45, s: 0.2, r: 0.3 }, filter: { base: 700, env: 2000, q: 1.4, a: 0.006, d: 0.4 } },
    nylon:     { gain: 0.16, reverb: 0.3, osc: [{ type: 'triangle', gain: 0.8 }, { type: 'sine', gain: 0.4, octave: 1 }], amp: { a: 0.005, d: 0.5, s: 0.06, r: 0.35 }, filter: { base: 900, env: 1600, q: 1, a: 0.005, d: 0.4 } },
    bell:      { gain: 0.12, reverb: 0.5, osc: [{ type: 'sine', gain: 1 }], fm: { ratio: 3.5, index: 480, decay: 0.3 }, amp: { a: 0.002, d: 0.9, s: 0.02, r: 0.7 }, filter: { base: 1800, env: 2400, q: 0.6, a: 0.003, d: 0.6 } },

    sineLead:  { gain: 0.16, reverb: 0.32, osc: [{ type: 'sine', gain: 0.85 }, { type: 'triangle', gain: 0.2, detune: 5 }], amp: { a: 0.012, d: 0.2, s: 0.6, r: 0.28 }, filter: { base: 1300, env: 1400, q: 0.7, a: 0.02, d: 0.3 } },
    softLead:  { gain: 0.15, reverb: 0.36, osc: [{ type: 'triangle', gain: 0.7 }, { type: 'sine', gain: 0.35, octave: -1 }], amp: { a: 0.02, d: 0.25, s: 0.55, r: 0.35 }, filter: { base: 1100, env: 1200, q: 0.8, a: 0.03, d: 0.35 } },
    brightLead: { gain: 0.13, reverb: 0.3, osc: [{ type: 'sawtooth', gain: 0.55 }, { type: 'square', gain: 0.2, detune: 8 }], amp: { a: 0.006, d: 0.22, s: 0.5, r: 0.26 }, filter: { base: 1200, env: 3000, q: 2, a: 0.008, d: 0.28 } },

    upright:   { gain: 0.26, reverb: 0.14, osc: [{ type: 'triangle', gain: 0.9 }, { type: 'sine', gain: 0.5, octave: -1 }], amp: { a: 0.006, d: 0.4, s: 0.14, r: 0.24 }, filter: { base: 260, env: 700, q: 1.1, a: 0.008, d: 0.32 } },
    fingerBass: { gain: 0.24, reverb: 0.12, osc: [{ type: 'sawtooth', gain: 0.5 }, { type: 'sine', gain: 0.7, octave: -1 }], amp: { a: 0.005, d: 0.34, s: 0.3, r: 0.22 }, filter: { base: 340, env: 900, q: 1.6, a: 0.006, d: 0.3 } },
    synthBass: { gain: 0.22, reverb: 0.1, osc: [{ type: 'sawtooth', gain: 0.6 }, { type: 'square', gain: 0.3, octave: -1 }], amp: { a: 0.004, d: 0.24, s: 0.35, r: 0.16 }, filter: { base: 260, env: 1500, q: 3, a: 0.005, d: 0.22 } },
    sub808:    { gain: 0.34, reverb: 0.08, osc: [{ type: 'sine', gain: 1 }], amp: { a: 0.006, d: 1.4, s: 0.5, r: 0.5 }, filter: { base: 180, env: 260, q: 0.7, a: 0.01, d: 0.8 }, pitchDrop: 7 },
    subSine:   { gain: 0.24, reverb: 0.3, osc: [{ type: 'sine', gain: 1 }], amp: { a: 0.4, d: 0.8, s: 0.8, r: 1.2 }, filter: { base: 240, env: 200, q: 0.6, a: 0.4, d: 1 } }
  };

  let ctx = null;
  let noiseBuffer = null;
  let master = null;
  let dryBus = null;
  let wetBus = null;
  /* Set once the user has asked for sound at all. Until then a suspended
     context is correct and must be left alone — waking it unprompted is what
     autoplay policies exist to stop. */
  let wantsSound = false;
  const buses = {};
  const muted = { melody: false, counter: false, chords: false, bass: false, drums: false };

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const midiToFreq = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

  /* Safari suspends for two reasons and names them differently: 'suspended'
     before the first gesture, and the non-standard 'interrupted' after a phone
     call, Siri, or another app taking the audio session. Checking only the
     first leaves the app permanently silent after a call. */
  function wake() {
    if (!ctx || ctx.state === 'running') return;
    // Rejected outside a gesture, which is fine — the next tap will get it.
    const p = ctx.resume();
    if (p && p.catch) p.catch(() => {});
  }

  function ensure() {
    wantsSound = true;
    if (ctx) {
      wake();
      return ctx;
    }
    const Ctor = global.AudioContext || global.webkitAudioContext;
    /* iOS constructs every context suspended, gesture or not, so the resume
       below is not optional — without it the clock never starts, nothing is
       ever scheduled, and the very first tap on Play is silent while the
       transport happily reports that it is playing. */
    ctx = new Ctor({ latencyHint: 'interactive' });
    ctx.onstatechange = () => { if (ctx.state !== 'running' && wantsSound) wake(); };

    /* Route through the media channel rather than the ringer, so the hardware
       mute switch does not silence the whole app with no explanation. */
    try {
      if (global.navigator && global.navigator.audioSession) {
        global.navigator.audioSession.type = 'playback';
      }
    } catch (e) { /* not supported — nothing to fall back to */ }

    master = ctx.createGain();
    master.gain.value = 0.9;

    const shaper = ctx.createWaveShaper();
    shaper.curve = softClipCurve();
    shaper.oversample = '2x';

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.knee.value = 24;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.18;

    master.connect(shaper).connect(compressor).connect(ctx.destination);

    dryBus = ctx.createGain();
    dryBus.connect(master);

    const convolver = ctx.createConvolver();
    convolver.buffer = makeImpulse(2.4, 2.6);
    wetBus = ctx.createGain();
    const wetLevel = ctx.createGain();
    wetLevel.gain.value = 0.9;
    wetBus.connect(convolver).connect(wetLevel).connect(master);

    TRACKS.forEach((track) => {
      const out = ctx.createGain();
      const send = ctx.createGain();
      out.connect(dryBus);
      send.connect(wetBus);
      buses[track] = { out, send };
      applyMute(track);
    });

    noiseBuffer = makeNoise(2);
    wake();
    return ctx;
  }

  /* Coming back to the tab is the other moment the context needs waking — iOS
     will not do it for you, and by then there is no gesture left to hang it on,
     so this is best-effort and the next tap is the real backstop. */
  if (global.document) {
    global.document.addEventListener('visibilitychange', () => {
      if (!global.document.hidden) wake();
    });
  }

  function softClipCurve() {
    const n = 2048;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * 1.6) / Math.tanh(1.6);
    }
    return curve;
  }

  function makeImpulse(seconds, decay) {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }
    return buffer;
  }

  function makeNoise(seconds) {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  /* Ramped, not switched. A gain that jumps to zero cuts every voice mid-cycle
     and the discontinuity is an audible click — on a sustained pad it is a
     thump. 12ms is under a frame and far too short to hear as a fade, which is
     what a mute should sound like: nothing. */
  function applyMute(track) {
    const bus = buses[track];
    if (!bus) return;
    const level = muted[track] ? 0 : 1;
    if (!ctx) { bus.out.gain.value = level; bus.send.gain.value = level; return; }
    const at = ctx.currentTime;
    [bus.out.gain, bus.send.gain].forEach((gain) => {
      gain.cancelScheduledValues(at);
      gain.setValueAtTime(gain.value, at);
      gain.linearRampToValueAtTime(level, at + 0.012);
    });
  }

  function setMute(track, value) {
    muted[track] = !!value;
    if (ctx) applyMute(track);
  }

  function isMuted(track) {
    return !!muted[track];
  }

  /* ------------------------------------------------------------------ voice */

  function playNote(track, patchName, midi, when, duration, velocity) {
    ensure();
    const patch = PATCHES[patchName] || PATCHES.pluck;
    const bus = buses[track] || buses.melody;
    const level = clamp(velocity === undefined ? 0.8 : velocity, 0.05, 1);
    const freq = midiToFreq(midi);
    const env = patch.amp;
    const hold = Math.max(0.05, duration);
    const peak = patch.gain * level;

    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, when);

    let tail = amp;
    if (patch.filter) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = patch.filter.q || 1;
      const base = Math.min(patch.filter.base + freq * 0.6, 16000);
      const top = Math.min(base + patch.filter.env, 17500);
      filter.frequency.setValueAtTime(base, when);
      filter.frequency.linearRampToValueAtTime(top, when + patch.filter.a);
      filter.frequency.exponentialRampToValueAtTime(
        Math.max(120, base * 0.75), when + patch.filter.a + patch.filter.d
      );
      amp.connect(filter);
      tail = filter;
    }

    const wet = ctx.createGain();
    wet.gain.value = patch.reverb === undefined ? 0.2 : patch.reverb;
    tail.connect(bus.out);
    tail.connect(wet).connect(bus.send);

    const carriers = [];
    patch.osc.forEach((spec) => {
      const osc = ctx.createOscillator();
      osc.type = spec.type;
      const oscFreq = freq * Math.pow(2, spec.octave || 0);
      osc.frequency.setValueAtTime(oscFreq, when);
      if (patch.pitchDrop) {
        osc.frequency.setValueAtTime(oscFreq * Math.pow(2, patch.pitchDrop / 12), when);
        osc.frequency.exponentialRampToValueAtTime(oscFreq, when + 0.09);
      }
      if (spec.detune) osc.detune.setValueAtTime(spec.detune, when);
      const mix = ctx.createGain();
      mix.gain.value = spec.gain;
      osc.connect(mix).connect(amp);
      carriers.push(osc);
    });

    let modulator = null;
    if (patch.fm) {
      modulator = ctx.createOscillator();
      modulator.type = 'sine';
      modulator.frequency.setValueAtTime(freq * patch.fm.ratio, when);
      const index = ctx.createGain();
      index.gain.setValueAtTime(patch.fm.index, when);
      index.gain.exponentialRampToValueAtTime(1, when + patch.fm.decay);
      modulator.connect(index);
      carriers.forEach((osc) => index.connect(osc.frequency));
    }

    // Amplitude envelope.
    const attackEnd = when + env.a;
    const decayEnd = attackEnd + env.d;
    const sustain = Math.max(0.0001, peak * env.s);
    amp.gain.linearRampToValueAtTime(peak, attackEnd);
    amp.gain.exponentialRampToValueAtTime(sustain, decayEnd);
    const release = Math.max(decayEnd, when + hold);
    amp.gain.setValueAtTime(sustain, release);
    amp.gain.exponentialRampToValueAtTime(0.0001, release + env.r);

    const stopAt = release + env.r + 0.05;
    carriers.forEach((osc) => { osc.start(when); osc.stop(stopAt); });
    if (modulator) { modulator.start(when); modulator.stop(stopAt); }
    /* A busy arrangement builds seven to nine nodes per note, a hundred-odd a
       second, and leaves them hanging off a permanent bus. Desktop collects
       them eventually; a phone has a hard per-tab ceiling and reloads the page
       when it is crossed. Cutting the last node loose lets the whole chain go. */
    reap(carriers[0], [amp, wet]);
  }

  /* Disconnect a voice's chain once its first source has finished. */
  function reap(source, nodes) {
    if (!source) return;
    source.onended = () => {
      nodes.forEach((n) => { try { n.disconnect(); } catch (e) { /* already gone */ } });
    };
  }

  /* ------------------------------------------------------------------ drums */

  function noiseSource(when, stopAt) {
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    source.start(when, Math.random() * 1.5);
    source.stop(stopAt);
    return source;
  }

  function burst(when, options) {
    const { type, frequency, q, decay, gain, target } = options;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q || 1;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, when);
    amp.gain.exponentialRampToValueAtTime(0.0001, when + decay);
    const source = noiseSource(when, when + decay + 0.02);
    source.connect(filter).connect(amp);
    amp.connect(target.out);
    const wet = ctx.createGain();
    wet.gain.value = options.reverb === undefined ? 0.12 : options.reverb;
    amp.connect(wet).connect(target.send);
    reap(source, [filter, amp, wet]);
  }

  function tone(when, options) {
    const { type, from, to, glide, decay, gain, target } = options;
    const osc = ctx.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(from, when);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, when + (glide || 0.08));
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, when);
    amp.gain.linearRampToValueAtTime(gain, when + 0.003);
    amp.gain.exponentialRampToValueAtTime(0.0001, when + decay);
    osc.connect(amp);
    amp.connect(target.out);
    const wet = ctx.createGain();
    wet.gain.value = options.reverb === undefined ? 0.1 : options.reverb;
    amp.connect(wet).connect(target.send);
    osc.start(when);
    osc.stop(when + decay + 0.05);
    reap(osc, [amp, wet]);
  }

  /* `when` is an absolute context time, the same as playNote — the scheduler
     always passes a real one. A preview has no time to hand over and used to
     pass 0, which is in the past the moment the context has been running for a
     second: the whole envelope was written behind the playhead and every drum
     preview was silent. Absent or past means now. */
  /* Kits.

     A pattern says what is hit; a kit says what it sounds like when it is, and
     that is at least as much of what makes a beat belong to a genre. The same
     sixteen steps on an 808 and on a jazz kit with brushes are not the same
     beat, and until now every genre in the app played the same kick.

     Multipliers rather than whole sound definitions, so a kit is a character
     applied to one instrument set rather than a fork of it — five kits times
     thirteen voices written out longhand would be sixty-five sounds to keep in
     step with each other, and they would drift. */
  const KITS = {
    acoustic: {},
    /* Filtered, soft and a little slack: the sound of a record rather than of
       a room. Long-ish kick, dark hat, snare with the crack taken off. */
    dusty:    { kickTo: 0.86, kickDecay: 1.25, click: 0.5, snareNoise: 0.78,
                snareBody: 1.15, snareDecay: 1.2, hatFreq: 0.72, hatDecay: 1.3, tone: 0.9 },
    /* Brushes have no attack to speak of. The snare is nearly all noise and no
       body, and it starts rather than cracks. */
    brushes:  { kickDecay: 0.8, kickTo: 1.1, click: 0.25, snareNoise: 1.15,
                snareBody: 0.3, snareDecay: 1.9, snareFreq: 0.72, hatFreq: 0.88, hatDecay: 1.4 },
    /* A drum machine: short, tight, clicky, no room. */
    machine:  { kickFrom: 1.15, kickTo: 0.92, kickGlide: 0.55, kickDecay: 0.78,
                click: 1.6, snareNoise: 1.1, snareBody: 0.72, snareDecay: 0.72,
                snareFreq: 1.2, hatFreq: 1.12, hatDecay: 0.62 },
    /* The 808: a kick that is a bass note, not a thump. It glides slowly to a
       low sine and rings on, which is why it needs the click taken down —
       otherwise the attack fights the sub it is supposed to introduce. */
    eight08:  { kickFrom: 0.72, kickTo: 0.62, kickGlide: 3.2, kickDecay: 2.6,
                click: 0.7, snareNoise: 0.95, snareBody: 0.6, snareDecay: 0.85,
                snareFreq: 1.25, hatFreq: 1.2, hatDecay: 0.7 }
  };

  let kit = KITS.acoustic;
  let kitName = 'acoustic';

  function setKit(name) {
    kitName = KITS[name] ? name : 'acoustic';
    kit = KITS[kitName];
  }

  function currentKit() {
    return kitName;
  }

  const K = (name, fallback) => (kit[name] === undefined ? fallback : kit[name]);

  function playDrum(instrument, when, velocity) {
    ensure();
    const target = buses.drums;
    const level = clamp(velocity === undefined ? 0.9 : velocity, 0.05, 1);
    if (!(when > ctx.currentTime)) when = ctx.currentTime + 0.005;

    /* Velocity has only ever been a gain, which is not how anything struck
       behaves: hit a drum harder and it gets BRIGHTER and rings longer as well
       as louder. Without this a ghost note is the same sound turned down,
       which is the single clearest tell that a kit is synthesised — and the
       new dynamics model made it much more audible, because it put thirty
       velocity levels where there used to be two. */
    const open = 0.72 + 0.45 * level;   // filters travel with the hit
    const ring = 0.8 + 0.28 * level;    // and so does the tail

    switch (instrument) {
      case 'kick':
        tone(when, {
          type: 'sine',
          from: 150 * K('kickFrom', 1), to: 45 * K('kickTo', 1),
          glide: 0.07 * K('kickGlide', 1), decay: 0.36 * K('kickDecay', 1) * ring,
          gain: 0.75 * level, target, reverb: 0.03
        });
        burst(when, { type: 'highpass', frequency: 1400, decay: 0.02, gain: 0.14 * level * K('click', 1), target, reverb: 0.02 });
        break;
      case 'snare':
        burst(when, {
          type: 'bandpass', frequency: 1750 * K('snareFreq', 1) * open, q: 0.9,
          decay: 0.17 * K('snareDecay', 1) * ring, gain: 0.4 * level * K('snareNoise', 1), target, reverb: 0.2
        });
        tone(when, {
          type: 'triangle', from: 190, decay: 0.09 * ring,
          gain: 0.22 * level * K('snareBody', 1), target, reverb: 0.12
        });
        break;
      case 'hat':
        burst(when, {
          type: 'highpass', frequency: 8200 * K('hatFreq', 1) * open,
          decay: 0.035 * K('hatDecay', 1) * ring, gain: 0.24 * level, target, reverb: 0.08
        });
        break;
      case 'openHat':
        burst(when, {
          type: 'highpass', frequency: 7600 * K('hatFreq', 1) * open,
          decay: 0.3 * K('hatDecay', 1) * ring, gain: 0.2 * level, target, reverb: 0.16
        });
        break;
      case 'clap':
        [0, 0.011, 0.022].forEach((offset, i) => {
          burst(when + offset, { type: 'bandpass', frequency: 1150 * open, q: 1.4, decay: 0.06, gain: 0.24 * level * (1 - i * 0.15), target, reverb: 0.22 });
        });
        burst(when + 0.03, { type: 'bandpass', frequency: 1000, q: 1.1, decay: 0.16 * ring, gain: 0.16 * level, target, reverb: 0.3 });
        break;
      case 'rim':
        burst(when, { type: 'bandpass', frequency: 2400 * open, q: 3, decay: 0.035, gain: 0.24 * level, target, reverb: 0.16 });
        tone(when, { type: 'triangle', from: 1700, decay: 0.025, gain: 0.14 * level * K('snareBody', 1), target, reverb: 0.1 });
        break;
      case 'ride':
        burst(when, { type: 'highpass', frequency: 5200 * open, decay: 0.42 * ring, gain: 0.1 * level, target, reverb: 0.24 });
        tone(when, { type: 'square', from: 3400, decay: 0.1, gain: 0.02 * level, target, reverb: 0.2 });
        break;
      case 'crash':
        burst(when, { type: 'highpass', frequency: 3200 * open, decay: 1.1 * ring, gain: 0.16 * level, target, reverb: 0.4 });
        break;

      /* Toms are a pitched membrane: a sine falling about a fifth, with just
         enough noise on the front to be a stick rather than a synth blip.
         Three of them, because a fill that does not descend is not a fill. */
      case 'tomLow':
      case 'tomMid':
      case 'tomHigh': {
        const top = { tomLow: 155, tomMid: 215, tomHigh: 290 }[instrument];
        tone(when, {
          type: 'sine', from: top, to: top * 0.66, glide: 0.13,
          decay: (instrument === 'tomLow' ? 0.42 : 0.32) * K('kickDecay', 1) * ring,
          gain: 0.5 * level, target, reverb: 0.16
        });
        burst(when, { type: 'bandpass', frequency: top * 5 * open, q: 1.2, decay: 0.035, gain: 0.12 * level * K('click', 1), target, reverb: 0.1 });
        break;
      }
      /* Hand percussion: a short band of noise high up, with no body at all.
         The shaker is drier and the tambourine rings, which is the whole
         difference between them. */
      case 'shaker':
        burst(when, { type: 'bandpass', frequency: 6800 * open, q: 0.8, decay: 0.045 * ring, gain: 0.13 * level, target, reverb: 0.1 });
        break;
      case 'tamb':
        burst(when, { type: 'bandpass', frequency: 7400 * open, q: 0.6, decay: 0.16 * ring, gain: 0.14 * level, target, reverb: 0.22 });
        burst(when + 0.008, { type: 'highpass', frequency: 9200, decay: 0.1 * ring, gain: 0.07 * level, target, reverb: 0.2 });
        break;
      default:
        burst(when, { type: 'highpass', frequency: 6000, decay: 0.05, gain: 0.18 * level, target });
    }
  }

  /* -------------------------------------------------------------- scheduler */

  let events = [];
  let timer = null;
  let cursor = 0;
  let loopStart = 0;
  let stepDuration = 0.125;
  let currentSong = null;
  let looping = true;
  /* How long one pass through the transport is, in steps. The loop's own
     length when you are playing the loop, and the whole arrangement's when you
     are playing that — everything that wraps, ends or reports a position
     measures against this rather than against the song, which only ever knew
     about the loop. */
  let spanSteps = 0;
  let sections = null;
  let onStop = null;
  let onLoop = null;
  let onSection = null;
  /* Which of the song's two sections the bare loop is playing, and which one
     it has been asked to play from the top of the next pass. Null when the
     form is playing, because then the form decides. */
  let sounding = null;
  let pending = null;

  /* Which of a song's sections to lay out. A song from before there were two
     has none, and is its own loop; so is a song asked for no section in
     particular, whose top level is the chorus. */
  function loopOf(song, id) {
    if (!id || !song.sections) return song;
    return song.sections.find((s) => s.id === id) || song;
  }

  /* Flatten one section into one time-ordered event list. The patches are
     the song's; the notes are the section's. */
  function buildEvents(song, loop) {
    const source = loop || song;
    const patches = song.genre.patches || {};
    const list = [];
    source.melody.forEach((n) => {
      list.push({ step: n.start, track: 'melody', patch: patches.lead || 'sineLead', midi: n.midi, dur: n.dur, velocity: n.velocity });
    });
    (source.counter || []).forEach((n) => {
      list.push({ step: n.start, track: 'counter', patch: patches.counter || 'nylon', midi: n.midi, dur: n.dur, velocity: n.velocity });
    });
    (source.chordTrack || []).forEach((c) => {
      list.push({ step: c.start, track: 'chords', patch: patches.chord || 'epiano', midi: c.midi, dur: c.dur, velocity: c.velocity });
    });
    source.bass.forEach((b) => {
      list.push({ step: b.start, track: 'bass', patch: patches.bass || 'fingerBass', midi: b.midi, dur: b.dur, velocity: b.velocity });
    });
    source.drums.forEach((d) => {
      list.push({
        step: d.step, track: 'drums', drum: d.instrument, velocity: d.velocity,
        /* Seconds off the grid, per hit. The grid stays where it is — this is
           one voice moving against the others, which is what a feel is. */
        nudge: d.nudge || 0,
        /* Both carried so the arrangement can place them: a fill belongs at
           the end of a section, and a ghost is what goes first when a section
           wants less. */
        fill: !!d.fill, ghost: !!d.ghost
      });
    });
    return list.sort((a, b) => a.step - b.step);
  }

  /* The arrangement, laid out flat.

     A section that drops the drums is a section with no drum events in it —
     not a section played with the drum bus turned down. The difference matters
     at the seam: a bus ducked on the bar line cuts the tail of whatever was
     still ringing from the section before, and the scheduler commits notes up
     to a lookahead window early, so "mute it when the loop wraps" mutes it
     slightly before the wrap you can hear. Scheduling only the notes that
     belong is exact by construction and costs nothing — a verse-chorus form
     over a four-bar loop is thirteen passes of a hundred-odd events.

     Each section of the form is passes of one of the song's two sections —
     the verse's own chords and tune for a verse, the chorus's for a chorus —
     so the events it is built from are that section's, not the song's.

     The section id rides along on each event so the transport can say what is
     playing without recomputing it from the clock. */
  function buildArrangement(song, plan) {
    const built = {};
    const eventsOf = (id) => built[id] || (built[id] = buildEvents(song, loopOf(song, id)));
    const list = [];
    const spans = [];
    let at = 0;
    plan.sections.forEach((section, index) => {
      const on = {};
      section.tracks.forEach((id) => { on[id] = true; });
      const base = eventsOf(section.plays);
      const loopSteps = loopOf(song, section.plays).totalSteps;
      spans.push({
        id: section.id, name: section.name, start: at, steps: section.loops * loopSteps,
        /* Which song section this is passes of, and how long one pass is: the
           fold the Play screen draws one pass of the right music with. */
        plays: section.plays || null, loopSteps
      });

      /* How hard this section is played. The form already knows — it is the
         number the written guidance has always quoted — and until now it was
         only ever prose. An intro at 0.2 and a last chorus at 1 should not be
         the same performance of the same loop at the same volume. */
      const push = 0.72 + 0.28 * (section.intensity === undefined ? 1 : section.intensity);
      const quiet = (section.intensity || 1) < 0.4;

      for (let pass = 0; pass < section.loops; pass++) {
        const offset = at + pass * loopSteps;
        const lastPass = pass === section.loops - 1;
        base.forEach((e) => {
          if (!on[e.track]) return;
          /* A fill belongs at the end of a SECTION, not at the end of every
             pass of the loop inside one. A verse that is two loops long got
             filled half way through it, which announces a change that is not
             coming. */
          if (e.fill && !lastPass) return;
          /* And a crash belongs at the top of a SECTION. The loop's own crash
             marks the top of the loop, which is right when the loop is the
             whole song and wrong once it is being played thirteen times —
             thirteen crashes is not an arrangement, it is a warning. */
          if (e.drum === 'crash' && pass !== 0) return;
          /* Ghosts are the first thing a player drops when the room wants
             less, and an intro is the room wanting less. */
          if (e.ghost && quiet) return;
          const copy = {};
          for (const k in e) copy[k] = e[k];
          copy.step = e.step + offset;
          if (e.track === 'drums') copy.velocity = Math.min(1, e.velocity * push);
          list.push(copy);
        });
      }

      /* A crash on the downbeat of a section that has drums and is louder
         than the one before it. This is the one thing every drummer does at a
         section change and the arrangement could not previously express it,
         because the loop has no idea it is being repeated. */
      const previous = index > 0 ? plan.sections[index - 1] : null;
      const lifts = previous && (section.intensity || 0) > (previous.intensity || 0) + 0.12;
      /* Unless the beat already brought its own to this exact downbeat, in
         which case two crashes on one beat is a flam nobody asked for. */
      const already = list.some((e) => e.drum === 'crash' && e.step === at);
      if (lifts && on.drums && !already) {
        list.push({ step: at, track: 'drums', drum: 'crash', velocity: 0.62 + 0.3 * (section.intensity || 0), nudge: 0 });
      }

      at += section.loops * loopSteps;
    });
    list.sort((a, b) => a.step - b.step);
    return { events: list, totalSteps: at, spans };
  }

  /* Swing pushes the offbeats later. Which subdivision counts as an offbeat
     depends on whether the genre swings its eighths or its sixteenths. */
  function swingOffset(song, step) {
    if (!song.swing) return 0;
    if (song.swingUnit === 16) return step % 2 === 1 ? song.swing * stepDuration * 0.5 : 0;
    return step % 4 === 2 ? song.swing * stepDuration * 0.66 : 0;
  }

  /* Where a step falls, and where an event falls — which are not the same
     thing. The step is the grid, shared by every part and moved as a whole by
     swing. The event may sit a few milliseconds off it, which is one voice
     leaning against the others rather than the grid bending. */
  function timeOf(step) {
    return loopStart + step * stepDuration + swingOffset(currentSong, step);
  }

  function timeOfEvent(event) {
    return timeOf(event.step) + (event.nudge || 0);
  }

  function tick() {
    if (!currentSong) return;
    const horizon = ctx.currentTime + SCHEDULE_AHEAD;
    const totalSteps = spanSteps;

    while (cursor < events.length && timeOfEvent(events[cursor]) < horizon) {
      const event = events[cursor];
      const when = timeOfEvent(event);
      if (when >= ctx.currentTime - 0.02) {
        if (event.drum) {
          playDrum(event.drum, when, event.velocity);
        } else {
          const seconds = Math.max(0.06, event.dur * stepDuration * 0.92);
          playNote(event.track, event.patch, event.midi, when, seconds, event.velocity);
        }
      }
      cursor++;
    }

    if (cursor >= events.length) {
      const loopEnd = loopStart + totalSteps * stepDuration;
      if (looping) {
        if (loopEnd < horizon) {
          loopStart = loopEnd;
          cursor = 0;
          if (pending) swapSection();
          if (onLoop) onLoop();
        }
      } else if (ctx.currentTime > loopEnd + 0.6) {
        stop();
      }
    }
  }

  /* The switch a section change asked for, taken at the top of the pass. Both
     sections are written to the same length, so the wrap the new one starts
     on is the wrap the old one would have had. */
  function swapSection() {
    const loop = loopOf(currentSong, pending);
    sounding = pending;
    pending = null;
    events = buildEvents(currentSong, loop);
    spanSteps = loop.totalSteps;
    if (onSection) onSection(sounding);
  }

  /* Ask for a different section while the loop runs. It is taken at the top
     of the next pass rather than now: a sampler changes pattern at the end of
     the pattern, and cutting to bar one of the chorus from beat three of the
     verse is not a thing anyone asks for. Returns whether there is a switch
     to wait for — nothing is queued when the transport is stopped, when the
     form is playing (the form decides its own sections), or when the section
     asked for is already the one sounding, which also cancels a switch still
     waiting. */
  function setSection(id) {
    if (!timer || !currentSong || sections) return false;
    if (!currentSong.sections || !currentSong.sections.some((s) => s.id === id)) return false;
    if (id === sounding) { pending = null; return false; }
    pending = id;
    return true;
  }

  function start(song, options) {
    ensure();
    stop(true);
    const opts = options || {};
    currentSong = song;
    /* The kit belongs to the song, so the transport sets it — and leaves it
       set, so that a pad tapped after the music stops answers in the same
       voice it was just playing in. */
    if (song.genre) setKit(song.genre.kit);
    looping = opts.loop !== false;
    onStop = opts.onStop || null;
    onLoop = opts.onLoop || null;
    onSection = opts.onSection || null;
    pending = null;
    if (opts.arrangement) {
      const laid = buildArrangement(song, opts.arrangement);
      events = laid.events;
      spanSteps = laid.totalSteps;
      sections = laid.spans;
      sounding = null;
    } else {
      /* Which of the song's sections to loop. Asked for none, the song's own
         top level — the chorus, or for a song from before there were two,
         the loop. */
      const loop = loopOf(song, opts.section);
      events = buildEvents(song, loop);
      spanSteps = loop.totalSteps;
      sections = null;
      sounding = loop === song ? null : loop.id;
    }
    stepDuration = 60 / song.bpm / 4;
    loopStart = ctx.currentTime + 0.14;
    cursor = 0;
    timer = global.setInterval(tick, LOOKAHEAD_MS);
    tick();
    return loopStart;
  }

  /* Clearing the interval only stops *future* notes. Up to a lookahead window
     of them is already committed to the graph, with release tails of over a
     second running into a 2.4s reverb — so Stop used to be followed by several
     seconds of decay, and a restart (which the tempo slider used to do on every
     input event) layered the abandoned run underneath the new one. Ducking the
     dry buses kills the committed notes without touching the reverb, so the
     tail rings out naturally instead of being chopped. */
  function silence() {
    if (!ctx) return;
    const at = ctx.currentTime;
    TRACKS.forEach((track) => {
      const bus = buses[track];
      if (!bus) return;
      bus.out.gain.cancelScheduledValues(at);
      bus.out.gain.setValueAtTime(bus.out.gain.value, at);
      bus.out.gain.linearRampToValueAtTime(0, at + 0.04);
      bus.send.gain.cancelScheduledValues(at);
      bus.send.gain.setValueAtTime(bus.send.gain.value, at);
      bus.send.gain.linearRampToValueAtTime(0, at + 0.04);
    });
    // Back to whatever the mutes say, once the committed notes have gone.
    global.setTimeout(() => { TRACKS.forEach(applyMute); }, 90);
  }

  function stop(silent) {
    const wasPlaying = !!timer;
    if (timer) { global.clearInterval(timer); timer = null; }
    currentSong = null;
    events = [];
    cursor = 0;
    sections = null;
    sounding = null;
    pending = null;
    if (wasPlaying) silence();
    if (!silent && onStop) onStop();
    if (!silent) onStop = null;
  }

  function isPlaying() {
    return !!timer;
  }

  /* Where the playhead is now, in sixteenth-note steps.

     `currentTime` is when a sample is handed to the output, not when it reaches
     your ears. Wired that gap is a few milliseconds; over AirPods it is 150 to
     300, and an app whose whole promise is "the pads light in time" cannot
     afford to run a fifth of a second ahead of what you hear. */
  function outputDelay() {
    if (!ctx) return 0;
    return ctx.outputLatency || ctx.baseLatency || 0;
  }

  function position() {
    if (!currentSong || !ctx) return 0;
    const elapsed = ctx.currentTime - outputDelay() - loopStart;
    if (elapsed < 0) return 0;
    return Math.min(spanSteps, elapsed / stepDuration);
  }

  /* How long the thing being played is, and where its sections fall — null
     when the transport is on the bare loop. The caller asks rather than
     assuming, because the same play button now drives two different lengths. */
  function span() {
    return spanSteps;
  }

  function sectionAt(step) {
    if (!sections) return null;
    for (let i = sections.length - 1; i >= 0; i--) {
      if (step >= sections[i].start) return sections[i];
    }
    return sections[0];
  }

  /* Which of the song's sections is sounding at a step, and where that pass
     of it began — the fold the Play screen needs to draw one pass of the
     right music while the transport runs through many. On the bare loop it
     is the section the transport was started on, or last switched to at a
     wrap; null when the song has no sections. */
  function passAt(step) {
    if (!currentSong) return null;
    if (!sections) return { section: sounding, start: 0, steps: spanSteps };
    const span = sectionAt(step);
    const pass = Math.floor(Math.max(0, step - span.start) / span.loopSteps);
    return { section: span.plays, start: span.start + pass * span.loopSteps, steps: span.loopSteps, span };
  }

  function currentSection() {
    if (!currentSong) return null;
    return sections ? passAt(position()).section : sounding;
  }

  function pendingSection() {
    return pending;
  }

  function setLoop(value) {
    looping = !!value;
  }

  /* Audition a single chord or note outside of playback. */
  function preview(midis, patchName, seconds, track) {
    ensure();
    const when = ctx.currentTime + 0.03;
    const list = Array.isArray(midis) ? midis : [midis];
    list.forEach((midi, i) => {
      playNote(track || 'chords', patchName || 'epiano', midi, when + i * 0.012, seconds || 1, 0.7);
    });
  }

  // Deliberately not called `Audio` — that name is already taken in a browser.
  global.Engine = {
    ensure, start, stop, isPlaying, position, span, sectionAt,
    passAt, setSection, currentSection, pendingSection,
    setLoop, setMute, isMuted, setKit, currentKit,
    /* Pure, and exported because the claim the arrangement makes — this
       section plays these parts and no others — is a property of the laid-out
       events rather than of anything you can observe from outside while it
       runs. Callers get the layout without the transport having to be live. */
    arrange: buildArrangement,
    playNote, playDrum, preview, PATCHES, TRACKS
  };
})(window);
