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
await check('landscape', async () => {
  await page.setViewportSize({ width: H, height: W });
  await page.waitForTimeout(600);
  await tap('.tab[data-tab="play"]');
  await page.waitForTimeout(400);
  await shot('landscape-play');
  await page.setViewportSize({ width: W, height: H });
  await page.waitForTimeout(400);
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
