/* Parse every stylesheet the page loads and report rules the engine dropped. */
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await (await b.newContext()).newPage();
await p.goto('http://127.0.0.1:8765/index.html', { waitUntil: 'networkidle' });
const out = await p.evaluate(async () => {
  const files = Array.from(document.styleSheets).filter((s) => s.href);
  const report = [];
  for (const sheet of files) {
    const text = await (await fetch(sheet.href)).text();
    // Count top-level rule bodies in the source vs what the engine kept.
    const count = (node) => {
      let n = 0;
      for (const r of node.cssRules || []) {
        n += 1;
        if (r.cssRules) n += count(r);
      }
      return n;
    };
    const selectorsInSource = (text.match(/^[^\n{}]*\{/gm) || []).length;
    report.push({ file: sheet.href.split('/').pop(), kept: count(sheet), sourceBlocks: selectorsInSource });
  }
  return report;
});
out.forEach((r) => console.log(`${r.file.padEnd(18)} kept ${String(r.kept).padStart(4)} rules  (source has ~${r.sourceBlocks} blocks)`));
await b.close();
