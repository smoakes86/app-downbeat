/* Layout check for Downbeat: every tab at every iPhone size.
   Usage: node shot.mjs <outDir> [baseUrl] */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.argv[2] || 'shots/current';
const BASE = process.argv[3] || 'http://127.0.0.1:8765/index.html';
fs.mkdirSync(OUT, { recursive: true });

const PROFILES = [
  { name: 'iphone-se', width: 375, height: 667 },
  { name: 'iphone-15', width: 393, height: 852 },
  { name: 'iphone-15-pro-max', width: 430, height: 932 },
  { name: 'iphone-15-landscape', width: 852, height: 393 },
  { name: 'ipad', width: 820, height: 1180 },
];
const TABS = ['play', 'song', 'arrange', 'library'];

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

const errors = [];
const problems = [];

for (const p of PROFILES) {
  const ctx = await browser.newContext({
    viewport: { width: p.width, height: p.height },
    // 1x on purpose: these are read back by eye, and a 3x frame of a 932pt
    // phone is 2796px tall and gets cropped rather than scaled.
    deviceScaleFactor: 1,
    isMobile: true, hasTouch: true, userAgent: UA,
    colorScheme: 'dark', reducedMotion: 'reduce',
  });
  const page = await ctx.newPage();
  // Chromium reports no safe-area insets. Force what an iPhone 15 actually
  // has, so the chrome is measured against the notch and the home indicator
  // rather than against a rectangle no phone ships.
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const land = window.innerWidth > window.innerHeight;
      const set = (k, v) => document.documentElement.style.setProperty(k, v);
      set('--safe-t', land ? '0px' : '59px');
      set('--safe-b', land ? '21px' : '34px');
      set('--safe-l', land ? '59px' : '0px');
      set('--safe-r', land ? '59px' : '0px');
    });
  });
  page.on('pageerror', (e) => errors.push(`[${p.name}] pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${p.name}] console: ${m.text()}`); });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  const skip = page.locator('#introSkip');
  if (await skip.count() && await skip.first().isVisible()) { await skip.first().tap(); await page.waitForTimeout(500); }

  for (const tab of TABS) {
    await page.locator(`.tab[data-tab="${tab}"]`).tap();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, `${p.name}-${tab}.png`) });

    const report = await page.evaluate(() => {
      const de = document.documentElement;
      const inScroller = (el) => {
        for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
          const ox = getComputedStyle(n).overflowX;
          if (ox === 'auto' || ox === 'scroll' || ox === 'hidden') return true;
        }
        return false;
      };
      const name = (el) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${
        (el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || '')
          .toString().split(' ').filter(Boolean)[0] || ''}`;
      const over = [];
      const small = [];
      const active = document.querySelector('.screen.is-active');
      document.querySelectorAll('.app *').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return;
        if (!inScroller(el) && (r.right > de.clientWidth + 1 || r.left < -1)) {
          over.push(`${name(el)} L${Math.round(r.left)} R${Math.round(r.right)}`);
        }
      });
      // Tap targets, measured including any pseudo-element that extends them.
      (active ? active.querySelectorAll('button, a, select, [role="switch"], summary') : [])
        .forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return;
          const before = getComputedStyle(el, '::before');
          let h = r.height, w = r.width;
          if (before.content !== 'none' && before.position === 'absolute') {
            const t = parseFloat(before.top) || 0, b = parseFloat(before.bottom) || 0;
            const l = parseFloat(before.left) || 0, rr = parseFloat(before.right) || 0;
            if (t < 0 || b < 0) h += Math.abs(Math.min(t, 0)) + Math.abs(Math.min(b, 0));
            if (l < 0 || rr < 0) w += Math.abs(Math.min(l, 0)) + Math.abs(Math.min(rr, 0));
          }
          if (h < 43.5 || w < 30) small.push(`${name(el)} ${Math.round(w)}x${Math.round(h)}`);
        });
      // Nothing in the FIXED chrome may sit inside an inset. Controls inside a
      // scroller are excluded: they legitimately sit outside the viewport when
      // scrolled away, and a clipped box is not an intrusion.
      const css = (k) => parseFloat(getComputedStyle(de).getPropertyValue(k)) || 0;
      const insets = { t: css('--safe-t'), b: css('--safe-b'), l: css('--safe-l'), r: css('--safe-r') };
      const intruders = [];
      document.querySelectorAll('.nav .nav-btn, .tabbar .tab, .dock-play, .dock .icon-toggle, .cta-bar .btn').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) return;
        if (r.top < insets.t - 0.5 || r.bottom > de.clientHeight - insets.b + 0.5 ||
            r.left < insets.l - 0.5 || r.right > de.clientWidth - insets.r + 0.5) {
          intruders.push(`${name(el)} in the safe area`);
        }
      });
      return {
        scrollW: de.scrollWidth, clientW: de.clientWidth,
        offset: window.scrollX,
        intruders: [...new Set(intruders)].slice(0, 6),
        over: [...new Set(over)].slice(0, 12),
        small: [...new Set(small)].slice(0, 12),
      };
    });

    const tag = `${p.name}/${tab}`;
    if (report.scrollW > report.clientW) problems.push(`${tag}: document scrolls horizontally (${report.scrollW} > ${report.clientW})`);
    if (report.offset) problems.push(`${tag}: page offset by ${report.offset}px`);
    report.over.forEach((o) => problems.push(`${tag}: overflows — ${o}`));
    (report.intruders || []).forEach((o) => problems.push(`${tag}: ${o}`));
    report.small.forEach((s) => problems.push(`${tag}: small target — ${s}`));
  }
  await ctx.close();
}
await browser.close();

console.log(`shots -> ${OUT}`);
if (problems.length) { console.log(`\n--- LAYOUT PROBLEMS (${problems.length}) ---`); problems.forEach((x) => console.log('  ' + x)); }
else console.log('\nNo layout problems at any size, on any tab.');
if (errors.length) { console.log('\n--- JS ERRORS ---'); [...new Set(errors)].forEach((e) => console.log('  ' + e)); }
