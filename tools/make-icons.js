/* Generates the app icons from one SVG, by rendering it in the Chromium that
   Playwright already installs. Kept in the repo so the PNGs can be remade
   rather than being binaries nobody can reproduce.

   Run from the repo root:  node tools/make-icons.js

   iOS will not take an SVG for a home-screen icon, which is the only reason
   there are any binaries here at all. The maskable sizes keep the mark well
   inside the safe zone so Android's circle mask cannot clip it. */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const OUT = path.join(__dirname, '..', 'icons');
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

/* The mark: the downbeat itself — a filled first beat with three lighter ones
   after it, on the app's own near-black. `pad` insets the drawing so the same
   art works maskable. */
function svg(size, pad) {
  const s = size;
  const inset = s * pad;
  const w = s - inset * 2;
  const barW = w * 0.17;
  const gap = (w - barW * 4) / 3;
  const tallest = w * 0.62;
  const dotR = barW * 0.3;
  const dotGap = w * 0.11;

  // Centre the whole group — bars plus the dot under the one — in the safe box.
  const groupH = tallest + dotGap + dotR * 2;
  const baseY = (s - groupH) / 2 + tallest;

  const bars = [1, 0.5, 0.66, 0.38].map((h, i) => {
    const x = inset + i * (barW + gap);
    const height = tallest * h;
    const fill = i === 0 ? '#5b8cff' : 'rgba(91,140,255,0.32)';
    return `<rect x="${x}" y="${baseY - height}" width="${barW}" height="${height}" rx="${barW * 0.34}" fill="${fill}"/>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
    <rect width="${s}" height="${s}" fill="#0b0c0e"/>
    ${bars}
    <circle cx="${inset + barW / 2}" cy="${baseY + dotGap + dotR}" r="${dotR}" fill="#5b8cff"/>
  </svg>`;
}

const TARGETS = [
  // apple-touch-icon must be opaque and un-masked; iOS rounds it itself.
  { file: 'icon-180.png', size: 180, pad: 0.16 },
  { file: 'icon-192.png', size: 192, pad: 0.16 },
  { file: 'icon-512.png', size: 512, pad: 0.16 },
  // Maskable: art inside the 80% safe zone.
  { file: 'icon-maskable-512.png', size: 512, pad: 0.26 }
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  for (const t of TARGETS) {
    const page = await browser.newPage({ viewport: { width: t.size, height: t.size }, deviceScaleFactor: 1 });
    await page.setContent(
      `<style>html,body{margin:0;padding:0;background:#0b0c0e}svg{display:block}</style>${svg(t.size, t.pad)}`
    );
    await page.screenshot({ path: path.join(OUT, t.file), omitBackground: false });
    await page.close();
    console.log(`  ${t.file}  ${t.size}x${t.size}`);
  }
  await browser.close();
})();
