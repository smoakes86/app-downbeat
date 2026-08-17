import { launch, BASE as DEFAULT_URL } from './browser.mjs';
const b = await launch();

const lin = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const lum = ([r, g, b2]) => 0.2126 * lin(r / 255) + 0.7152 * lin(g / 255) + 0.0722 * lin(b2 / 255);
const ratio = (a, b2) => { const [x, y] = [lum(a), lum(b2)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

for (const scheme of ['dark', 'light']) {
  const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, colorScheme: scheme, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  await p.goto(DEFAULT_URL, { waitUntil: 'networkidle' });
  await p.waitForTimeout(800);
  if (await p.locator('#introSkip').isVisible()) { await p.locator('#introSkip').click(); await p.waitForTimeout(400); }

  /* A control that is only ever sampled in its default state is only half
     checked. Switch two parts off so the mix row has an on chip and an off
     chip on screen at the same time. */
  await p.evaluate(() => {
    document.querySelector('.mix-chip[data-part=chords]')?.click();
    document.querySelector('.mix-chip[data-part=drums]')?.click();
  });
  await p.waitForTimeout(400);

  // Every text node in the app, with its computed colour composited onto the
  // nearest painted background.
  const samples = await p.evaluate(() => {
    const parse = (c) => (c.match(/[\d.]+/g) || []).map(Number);
    const over = (fg, bg) => {
      const a = fg.length > 3 ? fg[3] : 1;
      return [0, 1, 2].map((i) => Math.round(fg[i] * a + bg[i] * (1 - a)));
    };
    const bgOf = (el) => {
      // The selected segment sits on the .seg-thumb, an absolutely positioned
      // sibling — walking up the tree finds the track behind it instead.
      const seg = el.closest('.seg-ctl');
      if (seg && (el.getAttribute('aria-checked') === 'true' || el.getAttribute('aria-selected') === 'true')) {
        const thumb = seg.querySelector('.seg-thumb');
        if (thumb) { const c = parse(getComputedStyle(thumb).backgroundColor); if (c.length >= 3) return [c[0], c[1], c[2]]; }
      }
      for (let n = el; n; n = n.parentElement) {
        const c = parse(getComputedStyle(n).backgroundColor);
        if (c.length >= 3 && (c.length < 4 || c[3] > 0.9)) return [c[0], c[1], c[2]];
      }
      return [0, 0, 0];
    };
    const out = [];
    document.querySelectorAll('.app *').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const text = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!text) return;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || Number(cs.opacity) < 0.5) return;
      const bg = bgOf(el);
      out.push({
        what: `${el.tagName.toLowerCase()}.${(el.className.baseVal ?? el.className).toString().split(' ')[0]}`,
        sample: el.textContent.trim().slice(0, 22),
        fg: over(parse(cs.color), bg), bg,
        size: parseFloat(cs.fontSize), weight: Number(cs.fontWeight) || 400,
      });
    });
    return out;
  });

  const fails = [];
  const seen = new Set();
  // eslint-disable-next-line no-unused-vars
  for (const s of samples) {
    const key = s.what + '|' + s.fg.join(',') + '|' + s.bg.join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    const large = s.size >= 24 || (s.size >= 18.66 && s.weight >= 700);
    const need = large ? 3 : 4.5;
    const got = ratio(s.fg, s.bg);
    if (got < need) fails.push(`${scheme}: ${s.what} "${s.sample}" ${got.toFixed(2)}:1 (needs ${need}) ${s.size}px/${s.weight}`);
  }
  console.log(`\n=== ${scheme}: ${samples.length} text nodes, ${fails.length} below AA ===`);
  fails.forEach((f) => console.log('  ' + f));

  // Every track colour, on the one control that paints text on it.
  for (const part of ['melody', 'counter', 'chords', 'bass', 'drums']) {
    await p.locator(`#parts button[data-value="${part}"]`).click();
    await p.waitForTimeout(320);
    const s2 = await p.evaluate((id) => {
      const parse = (c) => (c.match(/[\d.]+/g) || []).map(Number);
      const btn = document.querySelector(`#parts button[data-value="${id}"]`);
      const thumb = document.querySelector('#parts .seg-thumb');
      const dock = document.querySelector('#dockPart');
      const dockBg = parse(getComputedStyle(document.querySelector('.dock')).backgroundColor);
      return {
        chip: [parse(getComputedStyle(btn).color).slice(0, 3), parse(getComputedStyle(thumb).backgroundColor).slice(0, 3)],
        dock: [parse(getComputedStyle(dock).color).slice(0, 3), dockBg.slice(0, 3)],
      };
    }, part);
    const c1 = ratio(s2.chip[0], s2.chip[1]);
    const c2 = ratio(s2.dock[0], s2.dock[1]);
    if (c1 < 4.5) console.log(`  ${scheme}: ${part} segment label ${c1.toFixed(2)}:1`);
    if (c2 < 4.5) console.log(`  ${scheme}: ${part} transport label ${c2.toFixed(2)}:1`);

    /* The section the arrangement is inside wears the part colour, and it is
       painted over a translucent fill — so the pair has to be measured for all
       five parts, not just for the one the app happens to open on. The class
       is set here rather than waited for: this is a question about two colours,
       not about the transport. */
    const s3 = await p.evaluate(() => {
      const parse = (c) => (c.match(/[\d.]+/g) || []).map(Number);
      const over = (fg, bg) => { const a = fg.length > 3 ? fg[3] : 1; return [0, 1, 2].map((i) => Math.round(fg[i] * a + bg[i] * (1 - a))); };
      const solid = (el) => {
        for (let n = el; n; n = n.parentElement) {
          const c = parse(getComputedStyle(n).backgroundColor);
          if (c.length >= 3 && (c.length < 4 || c[3] > 0.9)) return [c[0], c[1], c[2]];
        }
        return [0, 0, 0];
      };
      const out = {};
      const sec = document.querySelector('#arrangeMap .map-sec');
      const row = document.querySelector('#arrangeSteps .section-row');
      [['sec', sec, '.map-sec-name'], ['row', row, '.row-title']].forEach(([key, host, inner]) => {
        if (!host) return;
        /* The class change is animated, and getComputedStyle read straight
           after it returns where the transition STARTED — the old colour,
           which is exactly the wrong end. Suppressing the transition is the
           difference between measuring the state and measuring the way in. */
        const was = host.style.transition;
        host.style.transition = 'none';
        host.classList.add('now');
        void host.offsetWidth;
        const label = host.querySelector(inner);
        const bg = over(parse(getComputedStyle(host).backgroundColor), solid(host.parentElement));
        out[key] = [parse(getComputedStyle(label).color).slice(0, 3), bg];
        host.classList.remove('now');
        host.style.transition = was;
      });
      return out;
    });
    ['sec', 'row'].forEach((key) => {
      if (!s3[key]) return;
      const r = ratio(s3[key][0], s3[key][1]);
      if (r < 4.5) console.log(`  ${scheme}: ${part} playing-${key} label ${r.toFixed(2)}:1`);
    });
  }
  await ctx.close();
}
await b.close();
