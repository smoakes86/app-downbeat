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
