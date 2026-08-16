/* Everything the app does, from a keyboard only. */
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--autoplay-policy=no-user-gesture-required','--mute-audio'] });
const ctx = await b.newContext({ viewport:{width:393,height:852}, colorScheme:'dark' });
const p = await ctx.newPage();
const fails = [];
p.on('pageerror', e=>fails.push('pageerror: '+e.message));
await p.goto('http://127.0.0.1:8765/index.html', {waitUntil:'networkidle'});
await p.waitForTimeout(900);

const active = () => p.evaluate(() => {
  const a = document.activeElement;
  if (!a || a === document.body) return 'BODY';
  return `${a.tagName.toLowerCase()}${a.id?'#'+a.id:''}.${(a.className||'').toString().split(' ')[0]||''}` +
    `[${(a.textContent||'').trim().slice(0,18)}]`;
});
const check = (cond, msg) => { if (!cond) fails.push(msg); };

// Onboarding: focus must land inside it, Tab must stay inside it, Esc closes.
check((await active()).includes('introNext'), 'onboarding did not take focus');
for (let i=0;i<12;i++) await p.keyboard.press('Tab');
check(!(await active()).includes('BODY'), 'Tab escaped the onboarding to <body>');
await p.keyboard.press('Escape'); await p.waitForTimeout(500);
check(await p.locator('#intro').isHidden(), 'Escape did not close the onboarding');

// Tab bar: arrows must reach all four screens.
await p.locator('.tab[data-tab="play"]').focus();
const seen = [];
for (let i=0;i<4;i++) {
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(350);
  seen.push(await p.evaluate(()=>document.querySelector('.screen.is-active').dataset.screen));
}
check(new Set(seen).size === 4, `arrow keys reached ${new Set(seen).size} of 4 tabs: ${seen.join(',')}`);

// Genre rail: arrows must change the genre.
await p.locator('.tab[data-tab="song"]').focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(400);
const before = await p.locator('#songMeta').textContent();
await p.locator('#genreRail [aria-checked=true]').focus();
await p.keyboard.press('ArrowRight'); await p.waitForTimeout(600);
check((await p.locator('#songMeta').textContent()) !== before, 'arrow keys did not change the genre');
check((await active()).includes('genre-card'), 'focus left the genre rail on arrow');

// Part switcher: arrows must change the part, and focus must survive it.
await p.locator('.tab[data-tab="play"]').focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(400);
await p.locator('#parts [aria-checked=true]').focus();
await p.keyboard.press('ArrowRight'); await p.waitForTimeout(400);
check((await p.evaluate(()=>document.querySelector('#app').dataset.part)) !== 'melody', 'arrow did not change the part');

// A field that regenerates must not throw focus away.
await p.locator('.tab[data-tab="song"]').focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(400);
await p.locator('#counterToggle').focus();
await p.keyboard.press('Enter'); await p.waitForTimeout(700);
check((await active()).includes('counterToggle'), `regenerating threw focus away (now ${await active()})`);

// Space belongs to the focused button.
await p.locator('#tapTempoButton').focus();
const live0 = await p.evaluate(()=>document.body.classList.contains('is-live'));
await p.keyboard.press(' '); await p.waitForTimeout(400);
check((await p.evaluate(()=>document.body.classList.contains('is-live'))) === live0,
  'Space on a focused button toggled playback instead of pressing it');

// ...and to the transport when nothing is focused.
await p.evaluate(()=>document.activeElement.blur());
await p.keyboard.press(' '); await p.waitForTimeout(300);
// A one-bar count-in runs before playback, so wait past it.
check(await p.locator('#countIn').isVisible(), 'Space did not start the count-in');
await p.waitForTimeout(3000);
check(await p.evaluate(()=>document.body.classList.contains('is-live')), 'Space did not start playback');
await p.keyboard.press(' '); await p.waitForTimeout(400);
check(!(await p.evaluate(()=>document.body.classList.contains('is-live'))), 'Space did not stop playback');

// Focus is visible on a list row.
await p.locator('.tab[data-tab="library"]').focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(400);
await p.locator('#currentActions button').first().focus();
const ring = await p.evaluate(()=>getComputedStyle(document.activeElement).boxShadow);
check(ring && ring !== 'none', 'a focused list row draws no ring');
check(/inset/.test(ring), `a focused list row's ring is not inset, so the list clips it: ${ring}`);

await b.close();
console.log(fails.length ? `\n--- KEYBOARD FAILURES (${fails.length}) ---\n  ` + fails.join('\n  ')
  : '\nEvery function reachable and operable from a keyboard.');
