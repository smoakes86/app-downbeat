/* Cross-reference the stylesheets against the DOM the app actually builds.
   Drives it through every state, collects every class that ever exists, and
   compares that against every class the CSS names. */
import { launch, BASE as DEFAULT_URL } from './browser.mjs';

const b = await launch();
const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, colorScheme: 'dark' });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto(DEFAULT_URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

await page.evaluate(() => {
  window.__seen = new Set();
  window.__collect = () => document.querySelectorAll('*').forEach((el) => {
    const cn = el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className;
    String(cn || '').split(/\s+/).filter(Boolean).forEach((c) => window.__seen.add(c));
  });
  window.__collect();
});
const collect = () => page.evaluate(() => window.__collect());

const tap = async (sel) => { const l = page.locator(sel).first(); if (await l.count()) { await l.tap(); await page.waitForTimeout(300); await collect(); } };

// Onboarding, all three pages.
await tap('#introNext'); await tap('#introNext'); await tap('#introNext');
// Every part on both devices, on both screens that show them.
for (const dev of ['ep133', 'fm1']) {
  await tap(`#devices button[data-value="${dev}"]`);
  for (const part of ['counter', 'chords', 'bass', 'drums', 'melody']) await tap(`#parts button[data-value="${part}"]`);
}
/* States that depend on the song rather than on a control: a note off the ends
   of the pads, and a note the scale grid has no pad for at all. One song in
   several has neither, and a class that exists only in a state this crawl
   never reaches reads here as a dead rule somebody should delete. */
await tap('#devices button[data-value="ep133"]');
let sawShift = false;
let sawOff = false;
for (let i = 0; i < 20 && !(sawShift && sawOff); i++) {
  for (const part of ['melody', 'bass', 'chords']) {
    await tap(`#parts button[data-value="${part}"]`);
    const got = await page.evaluate(() => {
      const chip = document.querySelector('.seq-chip[data-oct]');
      if (chip) chip.focus();
      return { shift: !!chip, off: !!document.querySelector('.seq-chip.is-off') };
    });
    await page.waitForTimeout(260);
    await collect();
    sawShift = sawShift || got.shift;
    sawOff = sawOff || got.off;
  }
  if (sawShift && sawOff) break;
  await tap('.tab[data-tab="song"]');
  await tap('#generateButton');
  await page.waitForTimeout(400);
  await tap('.tab[data-tab="play"]');
}
if (!sawShift || !sawOff) console.log(`note: crawl never reached ${sawShift ? '' : 'a shifted chip '}${sawOff ? '' : 'an off-scale chip'}`);
// Playing, soloing, looping.
await tap('#playButton'); await page.waitForTimeout(2800); await collect();
await tap('#soloButton'); await tap('#loopButton'); await collect();
await tap('#playButton');
// Set-up sheet.
await tap('#setupButton'); await collect(); await tap('.sheet .nav-btn');
// Share action sheet.
await tap('#shareButton'); await collect(); await tap('.action-cancel button');
// Every other tab, plus a section audition.
await tap('.tab[data-tab="song"]'); await tap('.genre-card[data-genre="ambient"]');
await tap('.tab[data-tab="arrange"]'); await tap('#arrangeMap .map-sec');
await tap('.tab[data-tab="library"]');
await tap('#currentActions button:nth-child(1)');
await tap('#libraryList .sketch-row'); await collect();
await page.locator('.action-group button', { hasText: 'Rename' }).first().tap();
await page.waitForTimeout(500); await collect();
await page.locator('.alert-actions button:not(.is-default)').first().tap();
await page.waitForTimeout(400);
// Swipe a row open.
{
  const box = await page.locator('#libraryList .swipe-body').first().boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width - 30, box.y + box.height / 2);
    await page.mouse.down();
    for (let x = 15; x <= 130; x += 20) { await page.mouse.move(box.x + box.width - 30 - x, box.y + box.height / 2); await page.waitForTimeout(20); }
    await page.mouse.up(); await page.waitForTimeout(400); await collect();
  }
}
// Light appearance.
await tap('#themeButton'); await collect();

// States the sweep would otherwise never enter.
await tap('.tab[data-tab="song"]');
await tap('.genre-card[data-genre="ambient"]');           // a genre with no kit
await tap('.tab[data-tab="play"]');
await tap('#parts button[data-value="drums"]'); await collect();   // .seq-empty
await tap('.tab[data-tab="song"]');
await page.selectOption('#energySelect', 'driving'); await page.waitForTimeout(500);
await tap('.genre-card[data-genre="funk"]');              // ghost notes, hard accents
await tap('.tab[data-tab="play"]');
await tap('#parts button[data-value="drums"]'); await collect();   // .accent, .ghost
await tap('#parts button[data-value="melody"]');
await page.locator('#run .seq-chip').first().focus();     // .is-linked
await page.waitForTimeout(250); await collect();
await page.locator('.screen.is-active').evaluate((el) => { el.scrollTop = 200; });
await page.waitForTimeout(350); await collect();          // .is-scrolled

// A voicing wider than the pads can reach, which is what .chord-off reports.
await tap('.tab[data-tab="song"]');
await tap('.genre-card[data-genre="jazz"]');
await tap('.tab[data-tab="play"]');
await tap('#devices button[data-value="ep133"]');
for (let i = 0; i < 8; i++) {
  await tap('#parts button[data-value="chords"]');
  await collect();
  if (await page.locator('.chord-off').count()) break;
  await tap('.tab[data-tab="song"]');
  await tap('#generateButton');
  await tap('.tab[data-tab="play"]');
}

const result = await page.evaluate(async () => {
  const seen = window.__seen;
  const named = new Set();
  const rules = [];
  const walk = (node, file) => {
    for (const r of node.cssRules || []) {
      if (r.selectorText) {
        rules.push({ sel: r.selectorText, file });
        (r.selectorText.match(/\.[A-Za-z_][-\w]*/g) || []).forEach((c) => named.add(c.slice(1)));
      }
      if (r.cssRules) walk(r, file);
    }
  };
  Array.from(document.styleSheets).forEach((s) => { if (s.href) walk(s, s.href.split('/').pop()); });

  /* Transient states a sweep cannot hold still: both are set for the duration
     of a pointer drag and cleared on release. */
  const TRANSIENT = new Set(['is-dragging']);
  const dead = [...named].filter((c) => !seen.has(c) && !TRANSIENT.has(c)).sort();
  // Selectors whose every class is unknown — the rule as a whole is dead.
  const deadRules = rules.filter((r) => {
    const cs = (r.sel.match(/\.[A-Za-z_][-\w]*/g) || []).map((c) => c.slice(1));
    return cs.length && cs.every((c) => !seen.has(c) && !TRANSIENT.has(c));
  }).map((r) => `${r.file}: ${r.sel}`);
  // Classes in the DOM that no rule mentions.
  const unstyled = [...seen].filter((c) => !named.has(c)).sort();
  return { seen: seen.size, named: named.size, dead, deadRules: [...new Set(deadRules)], unstyled };
});

console.log(`DOM classes seen: ${result.seen}   CSS classes named: ${result.named}`);
console.log(`\n--- CSS classes that never appear (${result.dead.length}) ---`);
console.log('  ' + (result.dead.join(', ') || 'none'));
console.log(`\n--- rules whose selector can never match (${result.deadRules.length}) ---`);
result.deadRules.forEach((r) => console.log('  ' + r));
/* Structural groups from src/devices.js — <g> wrappers whose children carry
   the rules — plus the two lane hooks that need no rule of their own. Listed
   for completeness rather than as a problem. */
console.log(`\n--- DOM classes with no rule of their own (${result.unstyled.length}) ---`);
console.log('  ' + (result.unstyled.join(', ') || 'none'));
await b.close();
