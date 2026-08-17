/* Exercises every function of Downbeat at an iPhone viewport and screenshots
   each state. Usage: node drive.mjs <outDir> */
import { launch, BASE as DEFAULT_URL } from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.argv[2] || 'shots/drive';
const BASE = process.argv[3] || DEFAULT_URL;
const W = Number(process.argv[4] || 393);
const H = Number(process.argv[5] || 852);
fs.mkdirSync(OUT, { recursive: true });

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

const browser = await launch({
  args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
});
const ctx = await browser.newContext({
  viewport: { width: W, height: H }, deviceScaleFactor: 2,
  isMobile: true, hasTouch: true, userAgent: UA, colorScheme: 'dark',
});
const page = await ctx.newPage();

const errors = [];
const fails = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}\n${(e.stack || '').split('\n').slice(1, 3).join('\n')}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

let n = 0;
const shot = async (name) => {
  n++;
  await page.screenshot({ path: path.join(OUT, `${String(n).padStart(2, '0')}-${name}.png`) });
};
const check = async (label, fn) => {
  const before = errors.length;
  try { await fn(); } catch (e) { fails.push(`${label}: ${e.message.split('\n')[0]}`); }
  if (errors.length > before) fails.push(`${label}: threw -> ${errors[errors.length - 1].split('\n')[0]}`);
};
const tap = async (sel) => { await page.locator(sel).first().tap(); await page.waitForTimeout(320); };
const assertSquare = async (where) => {
  const off = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY,
    app: Math.round(document.querySelector('.app').getBoundingClientRect().left) }));
  if (off.x || off.y || off.app !== 0) fails.push(`${where}: app is offset (scroll ${off.x},${off.y}; left ${off.app})`);
};

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

/* ---------------------------------------------------------- onboarding */
await shot('intro-1');
await check('intro next', async () => { await tap('#introNext'); await shot('intro-2'); });
await check('intro next 2', async () => { await tap('#introNext'); await shot('intro-3'); });
await check('intro start', async () => { await tap('#introNext'); await page.waitForTimeout(400); });
await shot('play-melody');

/* ---------------------------------------------------------------- parts */
for (const part of ['counter', 'chords', 'bass', 'drums']) {
  await check(`part ${part}`, async () => {
    await tap(`#parts button[data-value="${part}"]`);
    await shot(`part-${part}`);
  });
}
await check('part melody', () => tap('#parts button[data-value="melody"]'));
await check('lane bar width resets after drums', async () => {
  await tap('#parts button[data-value="drums"]');
  await tap('#parts button[data-value="melody"]');
  const min = await page.evaluate(() => document.querySelector('#lane').style.getPropertyValue('--bar-min'));
  if (min !== '96px') throw new Error(`pitched lane kept the drum bar width (${min})`);
});

/* --------------------------------------------------------- octave shift

   Two claims, and the second is the one worth checking: a note off the ends
   of the twelve pads still names the pad it lands on, and the pad it names is
   the one that plays it after the shift the chip is asking for. That is an
   arithmetic property of the mapping, so it is asserted over every note in
   the audible range rather than over whatever this song happened to write. */
await check('every note lands on a pad that plays it', async () => {
  const bad = await page.evaluate(() => {
    const wrong = [];
    let onGrid = 0;
    let shifted = 0;
    window.Genres.order.forEach((g) => {
      const song = window.Compose.compose({ genre: g, keyPc: 0 });
      ['melody', 'bass'].forEach((track) => {
        ['ep133', 'fm1'].forEach((dev) => {
          const map = window.Devices.build(song, track, dev).mapping;
          if (!map.idFor) return;
          for (let m = 24; m <= 108; m++) {
            const info = map.idFor(m);
            if (!info) continue;
            const plays = dev === 'ep133'
              ? map.padNotes[info.index]
              : 53 + info.idx + map.oct * 12;
            if (plays + info.oct * 12 !== m) {
              wrong.push(`${g}/${track}/${dev} midi ${m}: pad plays ${plays}, shift ${info.oct}`);
            }
            /* And a note already under your fingers is never marked. Two
               octaves of the same pitch class sit on one EP grid, and
               flagging the upper one would be crying wolf. */
            const home = dev === 'ep133'
              ? map.padNotes.indexOf(m) >= 0
              : (m - 53 - map.oct * 12) >= 0 && (m - 53 - map.oct * 12) <= 26;
            if (home !== (info.oct === 0)) {
              wrong.push(`${g}/${track}/${dev} midi ${m}: on grid ${home}, shift ${info.oct}`);
            }
            if (info.oct) shifted++; else onGrid++;
          }
        });
      });
    });
    return { wrong: wrong.slice(0, 5), total: wrong.length, onGrid, shifted };
  });
  if (bad.total) throw new Error(`${bad.total} bad mappings, e.g. ${bad.wrong[0]}`);
  if (!bad.shifted || !bad.onGrid) throw new Error('the sweep never saw both states');
});

await check('a shifted chip lights its pad and the key that reaches it', async () => {
  /* Hunt for a song that actually needs a shift rather than asserting on one
     that might not: the mapping picks the octave that fits the most notes, so
     plenty of parts never leave the grid at all. */
  let dir = null;
  for (let i = 0; i < 30 && !dir; i++) {
    for (const part of ['melody', 'bass', 'chords']) {
      await tap(`#parts button[data-value="${part}"]`);
      dir = await page.evaluate(() => document.querySelector('.seq-chip[data-oct]')?.dataset.oct || null);
      if (dir) break;
    }
    if (dir) break;
    await tap('.tab[data-tab="song"]');
    await tap('#generateButton');
    await page.waitForTimeout(500);
    await tap('.tab[data-tab="play"]');
  }
  if (!dir) throw new Error('no song in 30 tries needed a shift');

  const state = await page.evaluate(() => {
    const chip = document.querySelector('.seq-chip[data-oct]');
    chip.focus();
    return new Promise((done) => setTimeout(() => {
      const glow = document.querySelector('.pad-glow[data-oct], .wkey-glow[data-oct], .bkey-glow[data-oct]');
      done({
        dir: chip.dataset.oct,
        pad: chip.dataset.light || '',
        arrow: (chip.querySelector('.chip-oct') || {}).textContent || '',
        said: chip.textContent,
        glowDir: glow ? glow.dataset.oct : null,
        fill: glow ? getComputedStyle(glow).fill : '',
        call: [...document.querySelectorAll('.dev-key.is-call')].map((e) => e.dataset.el)
      });
    }, 260));
  });
  if (!state.pad) throw new Error('a shifted chip has no pad to light');
  if (state.glowDir !== state.dir) throw new Error(`chip says ${state.dir}, pad says ${state.glowDir}`);
  if (!/lit-(up|dn)/.test(state.fill)) throw new Error(`pad is not lit in a shift colour (${state.fill})`);
  if (!state.arrow) throw new Error('a shifted chip has no arrow');
  const want = state.dir === 'up' ? ['key-plus', 'oct-up'] : ['key-minus', 'oct-down'];
  if (!state.call.some((k) => want.includes(k))) {
    throw new Error(`shift ${state.dir} lit no key (${state.call.join(',') || 'none'})`);
  }
  if (state.call.length !== 1) throw new Error(`${state.call.length} shift keys lit for one chip`);
  await shot(`shift-${state.dir}`);
});

await check('the shift call clears when nothing is asking', async () => {
  await page.evaluate(() => document.querySelector('.seq-chip[data-oct]')?.blur());
  await page.waitForTimeout(300);
  const lit = await page.evaluate(() => document.querySelectorAll('.dev-key.is-call').length);
  if (lit) throw new Error(`${lit} shift keys still lit with nothing previewing`);
});

/* -------------------------------------------------------------- device */
await check('device fm1', async () => {
  await tap('#devices button[data-value="fm1"]');
  await page.waitForTimeout(500);
  await shot('device-fm1');
});
await check('fm1 drums', async () => {
  await tap('#parts button[data-value="drums"]');
  await shot('device-fm1-drums');
});
await check('device ep133', async () => {
  await tap('#parts button[data-value="melody"]');
  await tap('#devices button[data-value="ep133"]');
  await page.waitForTimeout(400);
});

/* --------------------------------------------------------------- setup */
await check('setup sheet', async () => {
  await tap('#setupButton');
  await page.waitForTimeout(450);
  await shot('sheet-setup');
  await page.locator('.sheet .nav-btn').first().tap();
  await page.waitForTimeout(450);
});

/* ---------------------------------------------------------- run + pads */
await check('tap run chip', async () => {
  const chip = page.locator('#run .seq-chip').first();
  await chip.scrollIntoViewIfNeeded();
  await chip.tap();
  await page.waitForTimeout(250);
});
await check('tap a pad', async () => {
  const pad = page.locator('#faceStage .dev-pad').first();
  await pad.scrollIntoViewIfNeeded();
  await pad.tap();
  await page.waitForTimeout(250);
  await shot('pad-pressed');
});

/* ------------------------------------------------------------ transport */
await check('play', async () => {
  await tap('#playButton');
  await page.waitForTimeout(500);
  await shot('count-in');
  await page.waitForTimeout(2600);
  await shot('playing');
});
await check('playing state', async () => {
  const live = await page.evaluate(() => document.body.classList.contains('is-live'));
  if (!live) throw new Error('body.is-live not set after play');
  const pos = await page.locator('#dockPos').textContent();
  if (!/Bar \d+ of \d+/.test(pos)) throw new Error(`dock position reads "${pos}"`);
});
await check('playhead moves', async () => {
  const read = () => page.evaluate(() => {
    const h = document.querySelector('.lane-head');
    return h ? { head: h.style.getPropertyValue('--head'), left: h.getBoundingClientRect().left } : null;
  });
  const a = await read();
  await page.waitForTimeout(700);
  const b = await read();
  if (!a || !b) throw new Error('no playhead element');
  if (a.head === b.head) throw new Error(`--head frozen at ${a.head}`);
  if (Math.abs(a.left - b.left) < 1) throw new Error(`--head changes (${a.head}->${b.head}) but the element does not move`);
});
await check('the playhead sits over the grid it marks', async () => {
  for (const part of ['melody', 'drums']) {
    await page.locator(`#parts button[data-value="${part}"]`).tap();
    await page.waitForTimeout(420);
    const m = await page.evaluate(() => {
      const head = document.querySelector('.lane-head');
      const lane = document.querySelector('#lane').getBoundingClientRect();
      const cells = document.querySelector('.drum-cells');
      const start = cells ? cells.firstElementChild.getBoundingClientRect().left - lane.left : 0;
      const end = cells ? cells.lastElementChild.getBoundingClientRect().right - lane.left : lane.width;
      return { at: head.getBoundingClientRect().left - lane.left,
        frac: Number(head.style.getPropertyValue('--head')) || 0, start, end };
    });
    const want = m.start + m.frac * (m.end - m.start);
    if (Math.abs(m.at - want) > 3) {
      throw new Error(`${part}: playhead at ${Math.round(m.at)}px, grid says ${Math.round(want)}px`);
    }
  }
  await page.locator('#parts button[data-value="melody"]').tap();
  await page.waitForTimeout(300);
});

await check('pads and lane light during playback', async () => {
  // Sampled over two seconds: a chip is only lit while its note sounds, so a
  // single sample can legitimately land in a rest.
  let chips = 0; let notes = 0;
  for (let i = 0; i < 24; i++) {
    const n = await page.evaluate(() => ({
      chips: document.querySelectorAll('#run .seq-chip.now, #run .seq-chord.now').length,
      notes: document.querySelectorAll('#lane .lane-note.now, #lane .drum-cell.now').length,
    }));
    chips = Math.max(chips, n.chips);
    notes = Math.max(notes, n.notes);
    if (chips && notes) break;
    await page.waitForTimeout(85);
  }
  if (!chips) throw new Error('no run chip lit in two seconds of playback');
  if (!notes) throw new Error('no lane note lit in two seconds of playback');
});
await check('theme-color follows the appearance', async () => {
  const c = await page.evaluate(() => {
    const m = document.querySelector('meta[name="theme-color"][data-managed]');
    return m ? m.content : null;
  });
  if (!c) throw new Error('no managed theme-color meta');
});
await check('solo', async () => {
  await tap('#soloButton');
  await shot('solo-on');
  const muted = await page.evaluate(() => ['melody','counter','chords','bass','drums'].filter((t) => window.Engine.isMuted(t)));
  if (muted.length !== 4) throw new Error(`solo muted ${muted.length} tracks, expected 4`);
});
await check('solo survives a regenerate', async () => {
  await tap('.tab[data-tab="song"]');
  await tap('#generateButton');
  await page.waitForTimeout(600);
  const muted = await page.evaluate(() => ['melody','counter','chords','bass','drums'].filter((t) => window.Engine.isMuted(t)));
  const pressed = await page.locator('#soloButton').getAttribute('aria-pressed');
  if (pressed === 'true' && muted.length !== 4) throw new Error(`solo still on but only ${muted.length} tracks muted`);
  await tap('.tab[data-tab="play"]');
});
await check('solo off', async () => {
  await tap('#soloButton');
  const muted = await page.evaluate(() => ['melody','counter','chords','bass','drums'].filter((t) => window.Engine.isMuted(t)));
  if (muted.length !== 0) throw new Error(`${muted.length} tracks still muted after solo off`);
});

/* ------------------------------------------------------------- the mix

   The point of the feature is that ANY combination is reachable, so the check
   is not "a mute mutes" — it is every one of the 2^n combinations of the parts
   this song actually has, each asserted against the engine. */
const mutedNow = () => page.evaluate(() =>
  ['melody','counter','chords','bass','drums'].filter((t) => window.Engine.isMuted(t)).sort());

await check('every combination of parts', async () => {
  const live = await page.evaluate(() => [...document.querySelectorAll('.mix-chip')]
    .filter((c) => !c.dataset.empty).map((c) => c.dataset.part));
  if (live.length < 4) throw new Error(`only ${live.length} parts available to mix`);

  for (let mask = 0; mask < (1 << live.length); mask++) {
    const want = live.filter((_, i) => mask & (1 << i)).sort();
    /* Drive it the way a thumb would rather than by calling in: set each chip
       to the state this combination needs, one tap at a time. */
    for (const id of live) {
      const on = await page.locator(`.mix-chip[data-part="${id}"]`).getAttribute('aria-checked');
      if ((on === 'false') !== want.includes(id)) await tap(`.mix-chip[data-part="${id}"]`);
    }
    const got = await mutedNow();
    if (got.join() !== want.join()) throw new Error(`combination ${mask}: wanted [${want}] off, engine has [${got}]`);
  }
  await shot('mix-all-off');
});

await check('every part on', async () => {
  await tap('#mixReset');
  const got = await mutedNow();
  if (got.length) throw new Error(`[${got}] still off after "Every part on"`);
  const off = await page.locator('.mix-chip[aria-checked="false"]:not([data-empty])').count();
  if (off) throw new Error(`${off} chips still read as off`);
  await shot('mix-reset');
});

await check('solo overrides the mix and then gives it back', async () => {
  await tap('.mix-chip[data-part="chords"]');
  await tap('#soloButton');
  const under = await mutedNow();
  if (under.includes('melody')) throw new Error('solo silenced the part it is soloing');
  if (under.length !== 4) throw new Error(`solo muted ${under.length} tracks, expected 4`);
  await tap('#soloButton');
  const back = await mutedNow();
  if (back.join() !== 'chords') throw new Error(`mix came back as [${back}], expected chords alone`);
});

await check('the mix survives a regenerate', async () => {
  await tap('.tab[data-tab="song"]');
  await tap('#generateButton');
  await page.waitForTimeout(600);
  const kept = await mutedNow();
  if (!kept.includes('chords')) throw new Error(`chords came back on after a regenerate: [${kept}]`);
  await tap('.tab[data-tab="play"]');
  await tap('#mixReset');
});

await check('a part with nothing in it says so', async () => {
  const empty = await page.locator('.mix-chip[data-empty="true"]').count();
  if (empty) {
    await tap('.mix-chip[data-empty="true"]');
    const muted = await mutedNow();
    if (muted.length) throw new Error(`tapping an empty part muted [${muted}]`);
  }
});

await check('shift-digit toggles a part', async () => {
  await page.keyboard.press('Shift+Digit3');
  await page.waitForTimeout(200);
  const got = await mutedNow();
  if (got.join() !== 'chords') throw new Error(`Shift+3 gave [${got}], expected chords`);
  await page.keyboard.press('Shift+Digit3');
  await page.waitForTimeout(200);
  const back = await mutedNow();
  if (back.length) throw new Error(`Shift+3 again left [${back}] off`);
});
await check('loop off', async () => { await tap('#loopButton'); await tap('#loopButton'); });
await check('stop', async () => {
  await tap('#playButton');
  const live = await page.evaluate(() => document.body.classList.contains('is-live'));
  if (live) throw new Error('still live after stop');
});

/* ----------------------------------------------------------- song tab */
await check('song tab', async () => {
  await tap('.tab[data-tab="song"]');
  await shot('song');
});
await check('genre change', async () => {
  await page.locator('.genre-card[data-genre="jazz"]').tap();
  await page.waitForTimeout(500);
  await shot('song-jazz');
  const meta = await page.locator('#songMeta').textContent();
  if (!/Jazz/.test(meta)) throw new Error(`genre did not take: "${meta}"`);
});
await check('key select', async () => {
  await page.selectOption('#keySelect', '7');
  await page.waitForTimeout(450);
  const meta = await page.locator('#songMeta').textContent();
  if (!/ G /.test(meta)) throw new Error(`key did not take: "${meta}"`);
});
await check('feel select', () => page.selectOption('#energySelect', 'driving').then(() => page.waitForTimeout(400)));
await check('length select', async () => {
  await page.selectOption('#barsSelect', '8');
  await page.waitForTimeout(450);
  const meta = await page.locator('#songMeta').textContent();
  if (!/8 bars/.test(meta)) throw new Error(`length did not take: "${meta}"`);
});
await check('scale select', async () => {
  const values = await page.locator('#scaleSelect option').evaluateAll((os) => os.map((o) => o.value));
  if (values.length > 1) { await page.selectOption('#scaleSelect', values[1]); await page.waitForTimeout(400); }
});
await check('second melody toggles', async () => {
  const before = await page.locator('#counterToggle').getAttribute('aria-checked');
  await page.locator('#counterToggle').tap();
  await page.waitForTimeout(600);
  await shot('song-counter-toggled');
  const after = await page.locator('#counterToggle').getAttribute('aria-checked');
  if (after === before) throw new Error(`switch did not flip (stayed ${before})`);
  // and the Counter part must agree with it
  const off = await page.locator('#parts button[data-value="counter"]').getAttribute('data-off');
  const expectOff = after === 'false';
  if (!!off !== expectOff) throw new Error(`part switcher disagrees: counter data-off=${off}, switch=${after}`);
  if (after === 'false') { await page.locator('#counterToggle').tap(); await page.waitForTimeout(600); }
});
await check('count-in select', () => page.selectOption('#countInSelect', '0'));
await check('tempo slider', async () => {
  await page.locator('#tempoRange').scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  const box = await page.locator('#tempoRange').boundingBox();
  await page.mouse.click(box.x + box.width * 0.8, box.y + box.height / 2);
  await page.waitForTimeout(600);
  await shot('song-tempo');
  const active = await page.locator('.screen.is-active').getAttribute('data-screen');
  if (active !== 'song') throw new Error(`slider drag left the Song screen (now ${active})`);
  const shown = await page.locator('#tempoValue').textContent();
  const meta = await page.locator('#songMeta').textContent();
  if (!meta.includes(shown)) throw new Error(`tempo ${shown} not in meta "${meta}"`);
});
await check('tap tempo', async () => {
  for (let i = 0; i < 4; i++) { await page.locator('#tapTempoButton').tap(); await page.waitForTimeout(430); }
  await page.waitForTimeout(500);
  const meta = await page.locator('#songMeta').textContent();
  const bpm = Number((meta.match(/(\d+) BPM/) || [])[1]);
  // ~430ms between taps is about 140 BPM; allow a wide band for timer jitter.
  if (!(bpm > 110 && bpm < 175)) throw new Error(`tap tempo produced ${bpm} BPM`);
});
await check('tempo reset', async () => {
  const reset = page.locator('#tempoReset');
  if (await reset.isVisible()) { await reset.tap(); await page.waitForTimeout(450); }
});
await check('new melody', () => tap('#rewriteList button:nth-child(1)'));
await check('new chords', () => tap('#rewriteList button:nth-child(2)'));
await check('generate', async () => {
  await tap('.tab[data-tab="song"]');
  await tap('#generateButton');
  await page.waitForTimeout(500);
  await shot('after-generate');
});

/* ------------------------------------------------------------- undo */
await check('undo', async () => {
  const undo = page.locator('#undoButton');
  if (await undo.isVisible()) { await undo.tap(); await page.waitForTimeout(450); }
  else throw new Error('undo button never appeared');
});

/* ----------------------------------------------------------- arrange */
await check('arrange tab', async () => {
  await tap('.tab[data-tab="arrange"]');
  await shot('arrange');
});
await check('arrange section', async () => {
  await page.locator('#arrangeMap .map-sec').nth(1).tap();
  await page.waitForTimeout(400);
  await shot('arrange-section');
  const pressed = await page.locator('#arrangeMap .map-sec').nth(1).getAttribute('aria-pressed');
  if (pressed !== 'true') throw new Error('section did not engage');
});
await check('arrange reset', async () => {
  await tap('#arrangeReset');
  await page.waitForTimeout(300);
});

/* ---------------------------------------------------------------- beats

   A genre with one beat writes one song, however many times you press
   generate — which is what house, bossa and ambient did. This is the guard
   against a library quietly collapsing back to a single pattern. */
await check('every genre has more than one beat in it', async () => {
  const out = await page.evaluate(() => {
    const thin = [];
    const junk = [];
    const voices = window.Genres.DRUM_VOICES.map((v) => v.id);
    window.Genres.order.forEach((g) => {
      const seen = new Set();
      for (let i = 0; i < 10; i++) {
        const s = window.Compose.compose({ genre: g });
        seen.add(s.drums.map((d) => `${d.step}:${d.instrument}`).join(','));
        /* The beat carries its own name alongside its voices, so a key that
           is not a voice must never be stamped out as a pattern. */
        s.drums.forEach((d) => { if (voices.indexOf(d.instrument) < 0) junk.push(`${g}: ${d.instrument}`); });
      }
      /* Ambient is deliberately silent — its whole form is what enters and
         leaves, and it has no drum part to vary. */
      if (g !== 'ambient' && seen.size < 2) thin.push(`${g} (${seen.size} of 10)`);
    });
    return { thin, junk: junk.slice(0, 3) };
  });
  if (out.junk.length) throw new Error(`non-voice keys played: ${out.junk.join(', ')}`);
  if (out.thin.length) throw new Error(`one beat only: ${out.thin.join(', ')}`);
});

await check('every pattern is whole bars, and every genre has a long one', async () => {
  const out = await page.evaluate(() => {
    const voices = window.Genres.DRUM_VOICES.map((v) => v.id);
    const ragged = [];
    const short = [];
    window.Genres.order.forEach((g) => {
      let longest = 0;
      window.Genres.GENRES[g].drums.forEach((beat) => {
        voices.filter((id) => beat[id]).forEach((id) => {
          const L = beat[id].length;
          /* A pattern that is not a whole number of bars drifts against the
             bar line a little further every time it comes round. */
          if (L % 16) ragged.push(`${g}/${beat.name}/${id} is ${L} steps`);
          longest = Math.max(longest, L);
        });
      });
      if (g !== 'ambient' && longest <= 16) short.push(g);
    });
    return { ragged: ragged.slice(0, 3), short };
  });
  if (out.ragged.length) throw new Error(out.ragged.join('; '));
  if (out.short.length) throw new Error(`no beat longer than a bar in: ${out.short.join(', ')}`);
});

await check('a long pattern that cannot divide the loop folds back to one bar', async () => {
  const out = await page.evaluate(() => {
    /* Force the awkward case rather than waiting for it: a five-bar loop
       against a two-bar figure. The figure must not land in a different place
       every time round — better a plainer beat than a chopped one. */
    const beat = { name: 'probe', kick: 'x...............' + '....x...........' };
    const genre = window.Genres.GENRES.pop;
    const five = window.Compose.buildDrums({ genre, totalBars: 5, energy: 'flow', beat,
      rng: window.Compose.makeRng(7) });
    const four = window.Compose.buildDrums({ genre, totalBars: 4, energy: 'flow', beat,
      rng: window.Compose.makeRng(7) });
    /* Fills excluded: the last bar legitimately differs from the others, and
       this is a question about the pattern rather than about the performance. */
    const barsOf = (evts, n) => {
      const out = [];
      for (let i = 0; i < n; i++) {
        out.push(evts.filter((e) => !e.fill && e.step >= i * 16 && e.step < (i + 1) * 16)
          .map((e) => e.step - i * 16).join(','));
      }
      return out;
    };
    return { five: barsOf(five, 5), four: barsOf(four, 4) };
  });
  // 5 bars: does not divide, so every bar is bar one of the figure.
  if (new Set(out.five).size !== 1) throw new Error(`five bars gave ${JSON.stringify(out.five)}`);
  // 4 bars: divides, so the figure alternates.
  if (new Set(out.four).size !== 2) throw new Error(`four bars gave ${JSON.stringify(out.four)}`);
});

await check('the beat is named, and the name is the one that played', async () => {
  const out = await page.evaluate(() => {
    const bad = [];
    window.Genres.order.forEach((g) => {
      const s = window.Compose.compose({ genre: g });
      if (!s.beatName) { bad.push(`${g}: no name`); return; }
      const voices = window.Genres.DRUM_VOICES.map((v) => v.id).filter((id) => s.beat[id]);
      /* A fill reaches for voices the beat never names — that is most of the
         point of the toms — so this is a question about the beat alone. */
      const played = [...new Set(s.drums.filter((d) => !d.fill)
        .map((d) => d.instrument === 'openHat' && !s.beat.openHat ? 'hat' : d.instrument))];
      played.forEach((id) => {
        if (voices.indexOf(id) < 0) bad.push(`${g}/${s.beatName}: played ${id}, not in the beat`);
      });
    });
    return bad.slice(0, 4);
  });
  if (out.length) throw new Error(out.join('; '));
});

/* Three claims about how a beat is played, rather than about how many
   different numbers appear in it. Averaged over twelve songs a genre, so one
   unlucky draw can neither flatter nor damn the model. */
await check('the beat is played, not stamped', async () => {
  const out = await page.evaluate(() => {
    const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
    const bad = [];
    window.Genres.order.forEach((g) => {
      if (g === 'ambient') return;
      const onBeat = [], offBeat = [], hatOn = [], hatOff = [], early = [], late = [];
      for (let i = 0; i < 12; i++) {
        const s = window.Compose.compose({ genre: g, bars: 4 });
        const mid = s.totalSteps / 2;
        s.drums.forEach((d) => {
          const inBar = d.step % 16;
          /* A fill has its own shape by design and says nothing about how the
             beat under it is played. */
          if (d.fill) return;
          // A ghost is quiet wherever it falls, so it says nothing about accent.
          if (!d.ghost && (d.instrument === 'snare' || d.instrument === 'clap')) {
            (inBar % 4 === 0 ? onBeat : offBeat).push(d.velocity);
          }
          if (d.instrument === 'hat' || d.instrument === 'ride') {
            (inBar % 4 === 0 ? hatOn : hatOff).push(d.velocity);
          }
          (d.step < mid ? early : late).push(d.velocity);
        });
      }
      if (onBeat.length && offBeat.length && avg(onBeat) <= avg(offBeat)) {
        bad.push(`${g}: the backbeat is not the loudest snare`);
      }
      if (hatOn.length && hatOff.length && avg(hatOn) <= avg(hatOff)) {
        bad.push(`${g}: the hats are flat across the beat`);
      }
      if (avg(late) <= avg(early)) bad.push(`${g}: the loop does not lift`);
    });
    return bad.slice(0, 4);
  });
  if (out.length) throw new Error(out.join('; '));
});

/* Feel is one voice leaning against the others, so it is measured per voice
   against what the genre asked for — and everything the kit plays has to lean
   the same way, including the fill and the rolls, which is where this went
   wrong first time. */
await check('every voice sits where its genre asks', async () => {
  const out = await page.evaluate(() => {
    const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    const bad = [];
    window.Genres.order.forEach((g) => {
      if (g === 'ambient') return;
      const want = window.Genres.FEEL[g] || {};
      const got = {};
      for (let i = 0; i < 10; i++) {
        window.Compose.compose({ genre: g, bars: 4 }).drums.forEach((d) => {
          (got[d.instrument] = got[d.instrument] || []).push((d.nudge || 0) * 1000);
        });
      }
      Object.keys(got).forEach((v) => {
        if (got[v].length < 12) return;
        const mean = avg(got[v]);
        const target = want[v] || 0;
        /* The jitter is ±2.5ms and averages out over dozens of hits; more
           than a millisecond adrift means something is bypassing the feel. */
        if (Math.abs(mean - target) > 1.3) {
          bad.push(`${g}/${v}: asked ${target}ms, plays ${mean.toFixed(1)}ms`);
        }
      });
    });
    return bad.slice(0, 4);
  });
  if (out.length) throw new Error(out.join('; '));
});

await check('no two hits share a nudge', async () => {
  const out = await page.evaluate(() => {
    const s = window.Compose.compose({ genre: 'pop', bars: 4 });
    const hats = s.drums.filter((d) => d.instrument === 'hat');
    const distinct = new Set(hats.map((d) => (d.nudge || 0).toFixed(7))).size;
    return { distinct, total: hats.length };
  });
  if (out.distinct < out.total * 0.9) {
    throw new Error(`${out.distinct} distinct nudges over ${out.total} hats — the wobble is missing`);
  }
});

await check('no two hits in a loop are identical', async () => {
  const out = await page.evaluate(() => {
    const thin = [];
    window.Genres.order.forEach((g) => {
      if (g === 'ambient') return;
      const s = window.Compose.compose({ genre: g, bars: 4 });
      const levels = new Set(s.drums.map((d) => d.velocity.toFixed(4)));
      /* Two levels was the old model — an accent and everything else. */
      if (levels.size < s.drums.length * 0.5) thin.push(`${g}: ${levels.size} levels over ${s.drums.length} hits`);
    });
    return thin;
  });
  if (out.length) throw new Error(out.join('; '));
});

/* A voice a pattern can name but the kit cannot play is a silent hit: it
   occupies a pad on the faceplate, prints a chip in the run and makes no
   sound. Every voice is struck in every kit and the graph is watched for a
   source appearing. */
await check('every voice sounds, in every kit', async () => {
  const out = await page.evaluate(() => {
    const voices = window.Genres.DRUM_VOICES.map((v) => v.id);
    const named = [];
    window.Genres.order.forEach((g) => {
      window.Genres.GENRES[g].drums.forEach((beat) => {
        Object.keys(beat).forEach((k) => {
          if (k !== 'name' && voices.indexOf(k) < 0) named.push(`${g}/${beat.name}: "${k}"`);
        });
      });
      if (!window.Genres.GENRES[g].kit) named.push(`${g}: no kit`);
    });

    window.Engine.ensure();
    let made = 0;
    const realOsc = AudioContext.prototype.createOscillator;
    const realBuf = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createOscillator = function () { made++; return realOsc.call(this); };
    AudioContext.prototype.createBufferSource = function () { made++; return realBuf.call(this); };
    const silent = [];
    ['acoustic', 'dusty', 'brushes', 'machine', 'eight08'].forEach((k) => {
      window.Engine.setKit(k);
      voices.forEach((v) => {
        const before = made;
        window.Engine.playDrum(v, undefined, 0.9);
        if (made === before) silent.push(`${k}/${v}`);
      });
    });
    AudioContext.prototype.createOscillator = realOsc;
    AudioContext.prototype.createBufferSource = realBuf;
    return { named: named.slice(0, 3), silent: silent.slice(0, 5) };
  });
  if (out.named.length) throw new Error(`patterns name non-voices: ${out.named.join(', ')}`);
  if (out.silent.length) throw new Error(`silent voices: ${out.silent.join(', ')}`);
});

await check('a hard hit is brighter than a soft one, not only louder', async () => {
  const out = await page.evaluate(() => {
    window.Engine.ensure();
    window.Engine.setKit('acoustic');
    const seen = [];
    const real = AudioContext.prototype.createBiquadFilter;
    AudioContext.prototype.createBiquadFilter = function () {
      const node = real.call(this);
      seen.push(node);
      return node;
    };
    const freqAt = (level) => {
      seen.length = 0;
      window.Engine.playDrum('hat', undefined, level);
      return seen.length ? seen[0].frequency.value : 0;
    };
    const soft = freqAt(0.2);
    const hard = freqAt(1);
    AudioContext.prototype.createBiquadFilter = real;
    return { soft, hard };
  });
  if (!(out.hard > out.soft * 1.15)) {
    throw new Error(`velocity does not open the filter (${out.soft.toFixed(0)}Hz soft, ${out.hard.toFixed(0)}Hz hard)`);
  }
});

/* Same recipe, same beat — or a share link stops being note for note. */
await check('the beat is reproducible from the seed', async () => {
  const same = await page.evaluate(() => {
    const opts = { genre: 'house', harmonySeed: 12345, melodySeed: 999, drumSeed: 4242 };
    const sig = (s) => s.beatName + '|' + s.drums.map((d) => `${d.step}:${d.instrument}:${d.velocity.toFixed(3)}`).join(',');
    return sig(window.Compose.compose(opts)) === sig(window.Compose.compose(opts));
  });
  if (!same) throw new Error('the same seed gave two different beats');
});

/* Three seeds, three things you can reroll one at a time. Before this the
   beat was derived from the harmony seed, so new chords silently meant a new
   beat and new melody could never give you one. */
await check('the beat, the chords and the melody reroll independently', async () => {
  const bad = await page.evaluate(() => {
    const wrong = [];
    const drums = (s) => s.beatName + '|' + s.drums.map((d) => `${d.step}:${d.instrument}`).join(',');
    const mel = (s) => s.melody.map((n) => `${n.start}:${n.midi}`).join(',');
    const harm = (s) => s.spans.map((x) => x.chord.symbol).join(',');
    const base = { genre: 'pop', bars: 4, harmonySeed: 111, melodySeed: 222, drumSeed: 333 };
    const a = window.Compose.compose(base);
    const beat = window.Compose.compose(Object.assign({}, base, { drumSeed: 999 }));
    const melody = window.Compose.compose(Object.assign({}, base, { melodySeed: 999 }));
    const chords = window.Compose.compose(Object.assign({}, base, { harmonySeed: 999 }));
    if (drums(a) === drums(beat)) wrong.push('a new drum seed gave the same beat');
    if (mel(a) !== mel(beat)) wrong.push('a new drum seed moved the melody');
    if (harm(a) !== harm(beat)) wrong.push('a new drum seed moved the chords');
    if (drums(a) !== drums(melody)) wrong.push('a new melody seed moved the beat');
    if (drums(a) !== drums(chords)) wrong.push('a new harmony seed moved the beat');
    return wrong;
  });
  if (bad.length) throw new Error(bad.join('; '));
});

/* Every sketch anyone has already saved or shared was written before the beat
   had a seed of its own. Those recipes carry no `d`, and they have to come
   back the way they went in. */
await check('a recipe from before the drum seed still reproduces', async () => {
  const out = await page.evaluate(() => {
    const song = window.Compose.compose({ genre: 'lofi', bars: 4, harmonySeed: 8675309, melodySeed: 42 });
    const recipe = window.Library.recipeOf(song);
    if (recipe.d === undefined) return { carried: false };
    const older = Object.assign({}, recipe);
    delete older.d;
    const opts = window.Library.optionsOf(older);
    return { carried: true, derived: opts.drumSeed, want: (Number(recipe.h) ^ 0xc2b2ae35) >>> 0 };
  });
  if (!out.carried) throw new Error('the recipe does not carry the drum seed');
  if (out.derived !== out.want) {
    throw new Error(`a recipe with no drum seed derives ${out.derived}, the old expression gave ${out.want}`);
  }
});

await check('New beat keeps the song', async () => {
  await tap('.tab[data-tab="song"]');
  const before = await page.evaluate(() => {
    const el = document.querySelector('#songTitle');
    return { title: el.textContent, meta: document.querySelector('#songMeta').textContent };
  });
  const row = page.locator('#rewriteList .row', { hasText: 'New beat' }).first();
  if (!await row.count()) throw new Error('there is no New beat control');
  await row.tap();
  await page.waitForTimeout(600);
  const after = await page.evaluate(() => ({
    title: document.querySelector('#songTitle').textContent,
    meta: document.querySelector('#songMeta').textContent
  }));
  if (after.title !== before.title) throw new Error(`the title changed: "${before.title}" -> "${after.title}"`);
  if (after.meta !== before.meta) throw new Error(`the song changed: "${before.meta}" -> "${after.meta}"`);
  await tap('.tab[data-tab="play"]');
});

/* The kit listening to the band, rather than four layers that happen to start
   at the same moment. */
await check('the kit marks the chord changes and locks to the bass', async () => {
  const out = await page.evaluate(() => {
    const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
    const bad = [];
    let locked = 0;
    let kicks = 0;
    window.Genres.order.forEach((g) => {
      if (g === 'ambient') return;
      const onChange = [], offChange = [];
      let holes = 0, marked = 0;
      for (let i = 0; i < 12; i++) {
        const s = window.Compose.compose({ genre: g, bars: 4 });
        const changes = new Set(s.spans.map((x) => x.start));
        s.drums.forEach((d) => {
          if (d.fill) return;
          (changes.has(d.step) ? onChange : offChange).push(d.velocity);
          if (d.instrument === 'kick') { kicks++; if (d.locked) locked++; }
        });
        /* A chord change on a bar line must have a kick under it: either the
           pattern already had one, or the kit put one into the hole. */
        /* Only where the beat has a kick to put there: filling a hole is one
           thing, inventing a drum part for a genre that has none is another. */
        if (s.beat.kick) {
          s.spans.forEach((span) => {
            if (span.start % 16) return;
            holes++;
            if (s.drums.some((d) => d.instrument === 'kick' && d.step === span.start)) marked++;
          });
        }
      }
      if (marked < holes) bad.push(`${g}: ${holes - marked} bar-line changes with no kick under them`);
      if (onChange.length && offChange.length && avg(onChange) <= avg(offChange)) {
        bad.push(`${g}: chord changes are played no harder than anything else`);
      }
    });
    if (!locked) bad.push('no kick anywhere lands with the bass');
    return { bad: bad.slice(0, 4), locked, kicks };
  });
  if (out.bad.length) throw new Error(out.bad.join('; '));
  if (out.locked < out.kicks * 0.2) {
    throw new Error(`only ${out.locked} of ${out.kicks} kicks lock to the bass`);
  }
});

/* ---------------------------------------------------------------- fills */

await check('a genre has more than one fill in it', async () => {
  const out = await page.evaluate(() => {
    const thin = [];
    window.Genres.order.forEach((g) => {
      const wanted = (window.Genres.FILLS[g] || []).length;
      if (wanted < 2) return;
      const shapes = new Set();
      let filled = 0;
      /* Seeded rather than sampled. A fill is a weighted draw, so an
         unseeded run of this is a dice game the check can lose through no
         fault of the code — and a check that fails one time in fifty is
         worse than no check, because it teaches you to re-run it. */
      for (let i = 0; i < 60; i++) {
        const s = window.Compose.compose({ genre: g, bars: 4, harmonySeed: i * 7919 + 13, melodySeed: i * 104729 + 7 });
        const f = s.drums.filter((d) => d.fill);
        /* Signed by where the hits fall as well as by which voices play them:
           lo-fi's two fills are both snare-only and differ in their rhythm,
           which is the whole distinction between a flam and a run. */
        if (f.length) {
          filled++;
          shapes.add(f.map((d) => `${d.instrument}@${(d.step % 16).toFixed(1)}`).sort().join(' '));
        } else if (!s.drums.some((d) => d.step >= s.totalSteps - 4)) { filled++; shapes.add('drop'); }
      }
      if (!filled) thin.push(`${g}: never fills`);
      else if (shapes.size < 2) thin.push(`${g}: one shape only (${[...shapes]})`);
    });
    return thin;
  });
  if (out.length) throw new Error(out.join('; '));
});

await check('a fill lands at the end of a section, not inside one', async () => {
  const out = await page.evaluate(() => {
    const bad = [];
    window.Genres.order.forEach((g) => {
      if (g === 'ambient') return;
      const song = window.Compose.compose({ genre: g, bars: 4 });
      const plan = window.Arrange.plan(song);
      const laid = window.Engine.arrange(song, plan);
      plan.sections.forEach((sec) => {
        const from = sec.start * 16;
        const passes = new Set(laid.events
          .filter((e) => e.fill && e.step >= from && e.step < from + sec.bars * 16)
          .map((e) => Math.floor((e.step - from) / song.totalSteps)));
        passes.forEach((pass) => {
          if (pass !== sec.loops - 1) bad.push(`${g}/${sec.name}: fill in pass ${pass + 1} of ${sec.loops}`);
        });
      });
    });
    return bad.slice(0, 3);
  });
  if (out.length) throw new Error(out.join('; '));
});

await check('a louder section is played louder', async () => {
  const out = await page.evaluate(() => {
    const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
    const bad = [];
    ['rock', 'pop', 'house', 'funk'].forEach((g) => {
      const song = window.Compose.compose({ genre: g, bars: 4 });
      const plan = window.Arrange.plan(song);
      const laid = window.Engine.arrange(song, plan);
      const rows = plan.sections.map((sec) => {
        const from = sec.start * 16;
        return {
          name: sec.name, intensity: sec.intensity,
          vel: avg(laid.events.filter((e) => e.track === 'drums' && !e.fill
            && e.step >= from && e.step < from + sec.bars * 16).map((e) => e.velocity))
        };
      }).filter((r) => r.vel > 0).sort((a, b) => a.intensity - b.intensity);
      for (let i = 1; i < rows.length; i++) {
        if (rows[i].vel < rows[i - 1].vel - 0.02) {
          bad.push(`${g}: ${rows[i].name} (${rows[i].intensity}) quieter than ${rows[i - 1].name}`);
        }
      }
    });
    return bad.slice(0, 3);
  });
  if (out.length) throw new Error(out.join('; '));
});

await check('a crash marks a section, not every bar', async () => {
  const out = await page.evaluate(() => {
    const bad = [];
    window.Genres.order.forEach((g) => {
      const song = window.Compose.compose({ genre: g, bars: 4 });
      const plan = window.Arrange.plan(song);
      const laid = window.Engine.arrange(song, plan);
      const crashes = laid.events.filter((e) => e.drum === 'crash');
      const starts = new Set(plan.sections.map((s) => s.start * 16));
      crashes.forEach((c) => {
        if (!starts.has(c.step)) bad.push(`${g}: crash at step ${c.step}, not a section start`);
      });
      /* And the loop's own crash must not simply repeat: one per bar over
         fifty bars is a car alarm, which is what it was. */
      if (crashes.length > plan.sections.length) bad.push(`${g}: ${crashes.length} crashes for ${plan.sections.length} sections`);
    });
    return bad.slice(0, 3);
  });
  if (out.length) throw new Error(out.join('; '));
});

/* ------------------------------------------------ playing the arrangement

   The claim is that each section plays its own parts and no others, which is
   a property of the laid-out events rather than anything observable from
   outside while it runs — so it is asserted on the layout, over every genre,
   rather than by listening to one song and hoping. */
await check('the arrangement lays out as the form describes', async () => {
  const bad = await page.evaluate(() => {
    const wrong = [];
    let sections = 0;
    window.Genres.order.forEach((g) => {
      const song = window.Compose.compose({ genre: g, keyPc: 0 });
      const plan = window.Arrange.plan(song);
      const laid = window.Engine.arrange(song, plan);
      if (laid.totalSteps !== plan.totalBars * 16) {
        wrong.push(`${g}: ${laid.totalSteps} steps for ${plan.totalBars} bars`);
      }
      let last = -1;
      laid.events.forEach((e) => {
        if (e.step < last) wrong.push(`${g}: events out of order at ${e.step}`);
        last = e.step;
      });
      plan.sections.forEach((section, i) => {
        sections++;
        const from = section.start * 16;
        const to = from + section.bars * 16;
        const got = [...new Set(laid.events.filter((e) => e.step >= from && e.step < to).map((e) => e.track))];
        const extra = got.filter((t) => section.tracks.indexOf(t) < 0);
        const missing = section.tracks.filter((t) => got.indexOf(t) < 0);
        if (extra.length) wrong.push(`${g}/${section.name}: plays ${extra}, which the form drops`);
        if (missing.length) wrong.push(`${g}/${section.name}: silent ${missing}, which the form plays`);
        if (laid.spans[i].start !== from) wrong.push(`${g}/${section.name}: span at ${laid.spans[i].start}, form says ${from}`);
        /* Every repeat, not only the first: an off-by-one in the pass loop
           would leave the second half of every doubled section empty. */
        if (section.loops > 1) {
          /* Fills and crashes excluded: both belong to the section rather
             than to the pass, so the last pass carries a fill the first does
             not and the first carries the crash. */
          const plain = (a, b2) => laid.events.filter((e) => !e.fill && e.drum !== 'crash'
            && e.step >= a && e.step < b2).length;
          const first = plain(from, from + song.totalSteps);
          const lastPass = plain(to - song.totalSteps, to);
          if (first !== lastPass) wrong.push(`${g}/${section.name}: ${first} events in pass 1, ${lastPass} in the last`);
        }
      });
    });
    return { wrong: wrong.slice(0, 4), total: wrong.length, sections };
  });
  if (bad.total) throw new Error(`${bad.total} problems, e.g. ${bad.wrong[0]}`);
  if (bad.sections < 40) throw new Error(`only ${bad.sections} sections swept`);
});

/* The loop's own length, measured rather than assumed: the song may be four
   bars or twelve by the time the driver gets here, so every "is this the form
   or the loop" assertion below compares against this. */
let loopSpan = 0;
await check('measure the loop', async () => {
  await tap('#playButton');
  await page.waitForTimeout(700);
  loopSpan = await page.evaluate(() => window.Engine.span());
  await tap('#playButton');
  await page.waitForTimeout(400);
  if (!loopSpan) throw new Error('the loop reported no length');
});

await check('play the arrangement', async () => {
  await tap('.tab[data-tab="arrange"]');
  await tap('#arrangeButton');
  await page.waitForTimeout(2600);
  const live = await page.evaluate(() => ({
    playing: window.Engine.isPlaying(),
    span: window.Engine.span(),
    section: (window.Engine.sectionAt(window.Engine.position()) || {}).name,
    marked: document.querySelectorAll('#arrangeMap .map-sec.now').length,
    rows: document.querySelectorAll('#arrangeSteps .section-row.now').length,
    pos: document.querySelector('#dockPos').textContent,
    part: document.querySelector('#dockPart').textContent,
    cta: document.querySelector('#arrangeButtonText').textContent
  }));
  if (!live.playing) throw new Error('the arrangement did not start');
  if (live.span <= loopSpan) throw new Error(`span is ${live.span} steps — the loop alone is ${loopSpan}`);
  if (live.span % loopSpan) throw new Error(`span ${live.span} is not a whole number of ${loopSpan}-step loops`);
  if (live.marked !== 1) throw new Error(`${live.marked} sections marked as playing`);
  if (live.rows !== 1) throw new Error(`${live.rows} rows marked as playing`);
  if (!live.section || live.part.indexOf(live.section) !== 0) {
    throw new Error(`transport says "${live.part}", engine is in "${live.section}"`);
  }
  if (!/of \d+ ·/.test(live.pos)) throw new Error(`transport reads "${live.pos}"`);
  if (live.cta !== 'Stop the arrangement') throw new Error(`the button still reads "${live.cta}"`);
  await shot('arrange-playing');
});

await check('the arrangement moves on to the next section', async () => {
  const first = await page.evaluate(() => (window.Engine.sectionAt(window.Engine.position()) || {}).id);
  /* The first section of every form is one pass of the loop, so a section
     change is a few seconds away at any tempo this app writes. */
  const moved = await page.evaluate((from) => new Promise((done) => {
    const started = Date.now();
    const poll = setInterval(() => {
      const at = (window.Engine.sectionAt(window.Engine.position()) || {}).id;
      if (at !== from) { clearInterval(poll); done(at); }
      else if (Date.now() - started > 25000) { clearInterval(poll); done(null); }
    }, 120);
  }), first);
  if (!moved) throw new Error(`still in ${first} after 25s`);
  /* The engine crosses the boundary on the audio clock and the map is
     repainted on the next animation frame, so reading the DOM in the same
     tick as the detection is a race the check loses at the seam. */
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  const marked = await page.evaluate(() => {
    const el = document.querySelector('#arrangeMap .map-sec.now');
    return el ? el.dataset.section : null;
  });
  if (marked !== moved) throw new Error(`engine is in ${moved}, the map marks ${marked}`);
});

await check('the Play screen still follows the loop, not the form', async () => {
  await tap('.tab[data-tab="play"]');
  await page.waitForTimeout(900);
  /* The faceplate, the lane and the bar dots all draw one pass of the loop.
     Folding the position is what keeps them lighting past bar five of a
     fifty-two bar form. */
  const seen = await page.evaluate(() => new Promise((done) => {
    let lit = 0;
    let dots = 0;
    let frames = 0;
    const tick = () => {
      frames++;
      lit += document.querySelectorAll('.seq-chip.now, .seq-chord.now').length ? 1 : 0;
      dots = Math.max(dots, document.querySelectorAll('#dockBars .on').length);
      if (frames < 90) requestAnimationFrame(tick);
      else done({ lit, dots, head: Number(document.querySelector('.lane-head')?.style.getPropertyValue('--head') || -1) });
    };
    requestAnimationFrame(tick);
  }));
  if (!seen.lit) throw new Error('nothing in the run lit during arrangement playback');
  if (seen.dots !== 1) throw new Error(`${seen.dots} bar dots lit`);
  if (!(seen.head >= 0 && seen.head <= 1)) throw new Error(`lane head is at ${seen.head}, outside the loop`);
});

await check('stopping from the transport stops the arrangement', async () => {
  await tap('#playButton');
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => ({
    playing: window.Engine.isPlaying(),
    marked: document.querySelectorAll('.map-sec.now, .section-row.now').length,
    pos: document.querySelector('#dockPos').textContent
  }));
  if (after.playing) throw new Error('still playing');
  if (after.marked) throw new Error(`${after.marked} sections still marked as playing`);
  if (!/bars/.test(after.pos)) throw new Error(`transport reads "${after.pos}"`);
});

await check('it stays armed, and auditioning a section disarms it', async () => {
  await tap('#playButton');
  await page.waitForTimeout(600);
  const armed = await page.evaluate(() => window.Engine.span());
  await tap('#playButton');
  await page.waitForTimeout(400);
  if (armed <= loopSpan) throw new Error(`the transport went back to the loop (${armed} steps)`);

  await tap('.tab[data-tab="arrange"]');
  await page.locator('#arrangeMap .map-sec').first().tap();
  await page.waitForTimeout(400);
  await tap('#playButton');
  await page.waitForTimeout(600);
  const loop = await page.evaluate(() => window.Engine.span());
  await tap('#playButton');
  await page.waitForTimeout(300);
  if (loop !== loopSpan) throw new Error(`auditioning left the form armed (${loop} steps, loop is ${loopSpan})`);
  await tap('#arrangeReset');
});

/* ----------------------------------------------------------- library */
await check('library tab', async () => {
  await tap('.tab[data-tab="library"]');
  await shot('library-empty');
});
await check('save', async () => {
  await tap('#currentActions button:nth-child(1)');
  await page.waitForTimeout(500);
  await shot('library-saved');
  const count = await page.locator('#libraryList .swipe').count();
  if (count < 1) throw new Error('nothing appeared in the library');
  const sub = await page.locator('#libraryList .row-sub').first().textContent();
  if (/Invalid|NaN|undefined/.test(sub)) throw new Error(`library subtitle reads "${sub}"`);
  if (!/just now|ago|yesterday/.test(sub)) throw new Error(`library subtitle has no timestamp: "${sub}"`);
});
await check('copy link', () => tap('#currentActions button:nth-child(2)'));
await check('copy text', () => tap('#currentActions button:nth-child(3)'));
await check('sketch actions', async () => {
  await page.locator('#libraryList .sketch-row').first().tap();
  await page.waitForTimeout(500);
  await shot('sheet-sketch');
});
await check('rename', async () => {
  await page.locator('.action-group button', { hasText: 'Rename' }).first().tap();
  await page.waitForTimeout(600);
  await shot('alert-rename');
  await page.locator('.alert-field input').fill('Renamed sketch');
  await page.locator('.alert-actions button.is-default').tap();
  await page.waitForTimeout(500);
  const title = await page.locator('#libraryList .row-title').first().textContent();
  if (title !== 'Renamed sketch') throw new Error(`rename did not stick: "${title}"`);
});
await check('load sketch', async () => {
  await page.locator('#libraryList .sketch-row').first().tap();
  await page.waitForTimeout(500);
  await page.locator('.action-group button', { hasText: 'Load this sketch' }).first().tap();
  await page.waitForTimeout(700);
  const active = await page.locator('.screen.is-active').getAttribute('data-screen');
  if (active !== 'play') throw new Error(`load did not switch to play (on ${active})`);
});
await check('swipe to delete', async () => {
  await tap('.tab[data-tab="library"]');
  const row = page.locator('#libraryList .swipe-body').first();
  const box = await row.boundingBox();
  await page.mouse.move(box.x + box.width - 30, box.y + box.height / 2);
  await page.mouse.down();
  for (let x = 30; x <= 120; x += 15) {
    await page.mouse.move(box.x + box.width - 30 - x, box.y + box.height / 2);
    await page.waitForTimeout(30);
  }
  await page.mouse.up();
  await page.waitForTimeout(400);
  await shot('library-swiped');
});
await check('delete confirm', async () => {
  await page.locator('.swipe-actions button').first().tap();
  await page.waitForTimeout(600);
  await shot('alert-delete');
  await page.locator('.alert-actions button.is-danger').tap();
  await page.waitForTimeout(500);
  const count = await page.locator('#libraryList .swipe').count();
  if (count !== 0) throw new Error('sketch was not deleted');
});

await assertSquare('after library actions');

/* --------------------------------------------------------------- share */
await check('share sheet', async () => {
  await tap('#shareButton');
  await page.waitForTimeout(500);
  await shot('sheet-share');
  await page.locator('.action-cancel button').tap();
  await page.waitForTimeout(450);
});

/* -------------------------------------------------------------- theme */
await check('light theme', async () => {
  await tap('#themeButton');
  await page.waitForTimeout(400);
  await tap('.tab[data-tab="play"]');
  await shot('light-play');
  await tap('.tab[data-tab="song"]');
  await shot('light-song');
  await tap('.tab[data-tab="library"]');
  await shot('light-library');
  await tap('#themeButton');
});

/* ---------------------------------------------------------- how it works */
await check('how it works', async () => {
  await tap('.tab[data-tab="library"]');
  await tap('#aboutList button:nth-child(1)');
  await page.waitForTimeout(600);
  await shot('intro-again');
  await tap('#introSkip');
});

await assertSquare('after theme + intro');

/* ----------------------------------------------------------- landscape */
await check('a phone on its side asks to be turned back', async () => {
  const tabBefore = await page.evaluate(() => document.querySelector('.screen.is-active').dataset.screen);
  await page.setViewportSize({ width: H, height: W });
  await page.waitForTimeout(600);
  await shot('landscape-notice');
  const state = await page.evaluate(() => {
    const shown = (sel) => {
      const el = document.querySelector(sel);
      const r = el && el.getBoundingClientRect();
      return !!el && getComputedStyle(el).display !== 'none' && r.width > 0;
    };
    return { notice: shown('.rotate'), app: shown('.app') };
  });
  if (!state.notice) throw new Error('no portrait notice in landscape');
  if (state.app) throw new Error('the app is still laid out behind the notice');

  // And turning back returns you to exactly where you were.
  await page.setViewportSize({ width: W, height: H });
  await page.waitForTimeout(700);
  const back = await page.evaluate(() => ({
    app: getComputedStyle(document.querySelector('.app')).display !== 'none',
    tab: document.querySelector('.screen.is-active').dataset.screen,
    plate: !!document.querySelector('#faceStage svg'),
    width: document.querySelector('#faceStage svg')
      ? parseInt(document.querySelector('#faceStage svg').style.width, 10) : 0,
  }));
  if (!back.app) throw new Error('the app did not come back on turning upright');
  if (back.tab !== tabBefore) throw new Error(`came back on ${back.tab}, was on ${tabBefore}`);
  if (!back.plate || back.width < 120) throw new Error(`faceplate did not refit (${back.width}px)`);
});

/* ------------------------------------------------------- shared link */
await check('shared link boot', async () => {
  const link = await page.evaluate(() => window.Library.linkFor({
    v: 1, g: 'lofi', k: 5, s: '', e: 'soft', b: 8, t: 84, c: 0, h: 12345, m: 67890, n: 'Shared test'
  }));
  // A same-document hash change is not a load; force a real one.
  await page.goto('about:blank');
  await page.goto(link, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1100);
  const meta = await page.locator('#songMeta').textContent();
  const title = await page.locator('#songTitle').textContent();
  if (!/Lo-?fi/i.test(meta)) throw new Error(`shared link did not load: "${meta}"`);
  if (!/84 BPM/.test(meta)) throw new Error(`shared tempo lost: "${meta}"`);
  if (title.trim() !== 'Shared test') throw new Error(`shared title lost: "${title}"`);
  await shot('shared-link');
});

await check('draft survives a reload', async () => {
  const before = await page.locator('#songMeta').textContent();
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1100);
  const after = await page.locator('#songMeta').textContent();
  if (before !== after) throw new Error(`draft not restored: "${before}" -> "${after}"`);
});

await browser.close();

console.log(`\n${'='.repeat(60)}\nSHOTS -> ${OUT} (${n} frames)`);
if (fails.length) { console.log(`\n--- FAILURES (${fails.length}) ---`); fails.forEach((f) => console.log('  ✗ ' + f)); }
else console.log('\nAll checks passed.');
if (errors.length) {
  console.log(`\n--- JS ERRORS (${errors.length}) ---`);
  [...new Set(errors)].slice(0, 20).forEach((e) => console.log('  ' + e));
}
