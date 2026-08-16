/* axe-core over every screen and every modal, in both appearances. */
import { chromium } from 'playwright';
import fs from 'node:fs';

const AXE = fs.readFileSync('node_modules/axe-core/axe.min.js', 'utf8');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const all = [];

for (const scheme of ['dark', 'light']) {
  const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, colorScheme: scheme });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('ERR', e.message));
  await page.goto('http://127.0.0.1:8765/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.addScriptTag({ content: AXE });

  const run = async (label) => {
    const r = await page.evaluate(async () => {
      const res = await window.axe.run(document, {
        resultTypes: ['violations'],
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] },
      });
      return res.violations.map((v) => ({
        id: v.id, impact: v.impact, help: v.help,
        nodes: v.nodes.slice(0, 3).map((n) => n.target.join(' ') + ' :: ' + (n.failureSummary || '').split('\n')[1],
        ),
      }));
    });
    r.forEach((v) => all.push({ where: `${scheme}/${label}`, ...v }));
  };

  const tap = async (sel) => { const l = page.locator(sel).first(); if (await l.count() && await l.isVisible()) { await l.tap(); await page.waitForTimeout(400); } };

  await run('onboarding');
  await tap('#introSkip');
  for (const tab of ['play', 'song', 'arrange', 'library']) {
    await tap(`.tab[data-tab="${tab}"]`);
    await run(tab);
  }
  await tap('.tab[data-tab="play"]');
  await tap('#setupButton'); await run('setup sheet'); await tap('.sheet .nav-btn');
  await tap('#shareButton'); await run('share sheet'); await tap('.action-cancel button');
  await tap('.tab[data-tab="library"]');
  await tap('#currentActions button:nth-child(1)');
  await tap('#libraryList .sketch-row'); await run('sketch sheet');
  await page.locator('.action-group button', { hasText: 'Rename' }).first().tap();
  await page.waitForTimeout(500); await run('rename alert');
  await page.locator('.alert-actions button:not(.is-default)').first().tap();
  await page.waitForTimeout(400);
  await ctx.close();
}
await b.close();

const byId = new Map();
all.forEach((v) => {
  const k = v.id + '|' + v.nodes[0];
  if (!byId.has(k)) byId.set(k, { ...v, wheres: new Set() });
  byId.get(k).wheres.add(v.where);
});
const list = [...byId.values()].sort((a, b2) => (a.impact === 'critical' ? -1 : 1));
console.log(`axe violations: ${list.length} distinct`);
list.forEach((v) => {
  console.log(`\n[${v.impact}] ${v.id} — ${v.help}`);
  console.log(`  seen in: ${[...v.wheres].join(', ')}`);
  v.nodes.forEach((n) => console.log('  ' + n));
});
if (!list.length) console.log('\nNo WCAG 2.1 A/AA or best-practice violations on any screen, in either appearance.');
