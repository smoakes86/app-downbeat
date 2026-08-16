/* Cross-reference the stylesheets against the DOM the app actually builds.
   Drives it through every state, collects every class that ever exists, and
   compares that against every class the CSS names. */
import { chromium } from 'playwright';

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, colorScheme: 'dark' });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto('http://127.0.0.1:8765/index.html', { waitUntil: 'networkidle' });
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
// Light appearance and the empty library.
await tap('#themeButton'); await collect();

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

  // Classes the CSS names that never appeared in any state.
  const dead = [...named].filter((c) => !seen.has(c)).sort();
  // Selectors whose every class is unknown — the rule as a whole is dead.
  const deadRules = rules.filter((r) => {
    const cs = (r.sel.match(/\.[A-Za-z_][-\w]*/g) || []).map((c) => c.slice(1));
    return cs.length && cs.every((c) => !seen.has(c));
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
console.log(`\n--- DOM classes with no rule (${result.unstyled.length}) ---`);
console.log('  ' + (result.unstyled.join(', ') || 'none'));
await b.close();
