/* Edge cases: the smallest phone, the longest song, every genre, every part. */
import { launch, BASE as DEFAULT_URL } from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const OUT = 'shots/edge';
fs.mkdirSync(OUT, { recursive: true });
const BASE = DEFAULT_URL;

const browser = await launch();
const problems = [];
const errors = [];

async function open(width, height, colorScheme = 'dark') {
  const ctx = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: 1,
    isMobile: true, hasTouch: true, colorScheme,
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[${width}x${height}] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${width}x${height}] console: ${m.text()}`); });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const skip = page.locator('#introSkip');
  if (await skip.count() && await skip.first().isVisible()) { await skip.first().tap(); await page.waitForTimeout(400); }
  return { ctx, page };
}

const overflow = (page, tag) => page.evaluate(() => {
  const de = document.documentElement;
  const inScroller = (el) => {
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      const ox = getComputedStyle(n).overflowX;
      if (ox === 'auto' || ox === 'scroll' || ox === 'hidden') return true;
    }
    return false;
  };
  const bad = [];
  document.querySelectorAll('.app *').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return;
    if (!inScroller(el) && (r.right > de.clientWidth + 1 || r.left < -1)) {
      bad.push(`${el.tagName.toLowerCase()}.${(el.className.baseVal ?? el.className).toString().split(' ')[0]} R${Math.round(r.right)}/${de.clientWidth}`);
    }
  });
  return [...new Set(bad)].slice(0, 6);
}).then((bad) => bad.forEach((b) => problems.push(`${tag}: ${b}`)));

/* ---- 1. Every genre, every part, both devices: does anything throw? ---- */
{
  const { ctx, page } = await open(393, 852);
  const genres = await page.locator('.genre-card').evaluateAll((n) => n.map((c) => c.dataset.genre));
  await page.locator('.tab[data-tab="song"]').tap();
  await page.waitForTimeout(300);
  for (const g of genres) {
    await page.locator(`.genre-card[data-genre="${g}"]`).tap();
    await page.waitForTimeout(360);
    await page.locator('.tab[data-tab="play"]').tap();
    await page.waitForTimeout(200);
    for (const part of ['melody', 'chords', 'bass', 'drums']) {
      await page.locator(`#parts button[data-value="${part}"]`).tap();
      await page.waitForTimeout(130);
    }
    for (const dev of ['fm1', 'ep133']) {
      await page.locator(`#devices button[data-value="${dev}"]`).tap();
      await page.waitForTimeout(220);
    }
    await overflow(page, `genre ${g}`);
    await page.locator('.tab[data-tab="arrange"]').tap();
    await page.waitForTimeout(250);
    await overflow(page, `arrange ${g}`);
    await page.locator('.tab[data-tab="song"]').tap();
    await page.waitForTimeout(200);
  }
  console.log(`swept ${genres.length} genres x 4 parts x 2 devices`);
  await ctx.close();
}

/* ---- 2. Longest song: 12 bars, busiest genre, second melody on ---- */
{
  const { ctx, page } = await open(393, 852);
  await page.locator('.tab[data-tab="song"]').tap();
  await page.waitForTimeout(300);
  await page.locator('.genre-card[data-genre="jazz"]').tap();
  await page.waitForTimeout(400);
  await page.selectOption('#barsSelect', '12');
  await page.waitForTimeout(500);
  await page.locator('#counterToggle').tap();
  await page.waitForTimeout(500);
  const on = await page.locator('#counterToggle').getAttribute('aria-checked');
  if (on !== 'true') { await page.locator('#counterToggle').tap(); await page.waitForTimeout(500); }
  await page.locator('.tab[data-tab="play"]').tap();
  await page.waitForTimeout(400);
  for (const part of ['melody', 'counter', 'chords', 'bass', 'drums']) {
    await page.locator(`#parts button[data-value="${part}"]`).tap();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, `12bar-${part}.png`) });
    await overflow(page, `12-bar ${part}`);
    const lane = await page.evaluate(() => {
      const l = document.querySelector('#lane');
      const s = document.querySelector('#laneScroll');
      return { laneW: Math.round(l.getBoundingClientRect().width), scrollW: s.scrollWidth, clientW: s.clientWidth,
        notes: l.querySelectorAll('.lane-note, .drum-cell.on').length };
    });
    if (lane.notes === 0) problems.push(`12-bar ${part}: lane drew nothing`);
    if (lane.scrollW <= lane.clientW) problems.push(`12-bar ${part}: lane did not widen (${lane.scrollW} <= ${lane.clientW})`);
  }
  await ctx.close();
}

/* ---- 3. 320px: the narrowest phone anyone still uses ---- */
{
  const { ctx, page } = await open(320, 568);
  for (const tab of ['play', 'song', 'arrange', 'library']) {
    await page.locator(`.tab[data-tab="${tab}"]`).tap();
    await page.waitForTimeout(450);
    await page.screenshot({ path: path.join(OUT, `320-${tab}.png`) });
    await overflow(page, `320px ${tab}`);
  }
  await ctx.close();
}

/* ---- 4. Light appearance, every tab ---- */
{
  const { ctx, page } = await open(393, 852, 'light');
  for (const tab of ['play', 'song', 'arrange', 'library']) {
    await page.locator(`.tab[data-tab="${tab}"]`).tap();
    await page.waitForTimeout(450);
    await page.screenshot({ path: path.join(OUT, `light-${tab}.png`) });
    await overflow(page, `light ${tab}`);
  }
  await ctx.close();
}

/* ---- 5. A very long title, via rename ---- */
{
  const { ctx, page } = await open(393, 852);
  await page.locator('.tab[data-tab="library"]').tap();
  await page.waitForTimeout(300);
  await page.locator('#currentActions button:nth-child(1)').tap();
  await page.waitForTimeout(500);
  await page.locator('#libraryList .sketch-row').first().tap();
  await page.waitForTimeout(500);
  await page.locator('.action-group button', { hasText: 'Rename' }).first().tap();
  await page.waitForTimeout(600);
  await page.locator('.alert-field input').fill('An extremely long sketch name that nobody would sensibly type but which must not break the layout <b>or run as markup</b>');
  await page.locator('.alert-actions button.is-default').tap();
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, 'long-title.png') });
  await overflow(page, 'long title');
  const html = await page.locator('#libraryList .row-title').first().innerHTML();
  if (/<b>/.test(html)) problems.push('long title: markup in a sketch name was rendered as HTML');
  await page.locator('#libraryList .sketch-row').first().tap();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, 'long-title-sheet.png') });
  await overflow(page, 'long title sheet');
  const sheetHtml = await page.locator('.action-title').first().innerHTML();
  if (/<b>An extremely/.test(sheetHtml) === false && /&lt;b&gt;/.test(sheetHtml) === false) {
    problems.push('long title sheet: could not confirm the title was escaped');
  }
  await ctx.close();
}

await browser.close();
console.log(`\nshots -> ${OUT}`);
if (problems.length) { console.log(`\n--- PROBLEMS (${problems.length}) ---`); [...new Set(problems)].forEach((p) => console.log('  ' + p)); }
else console.log('\nNo problems across genres, lengths, widths or appearances.');
if (errors.length) { console.log(`\n--- JS ERRORS ---`); [...new Set(errors)].slice(0, 20).forEach((e) => console.log('  ' + e)); }
