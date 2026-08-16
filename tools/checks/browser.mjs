/* One place that knows how to start a browser and where the app is served.

   The executable path is a fallback rather than a requirement: Playwright
   finds its own Chromium when it has downloaded one, and this only steps in
   for environments that ship a browser and set PLAYWRIGHT_BROWSERS_PATH
   instead. */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

export const BASE = process.env.DOWNBEAT_URL || 'http://127.0.0.1:8765/index.html';

const candidates = [
  process.env.CHROMIUM_PATH,
  path.join(process.env.PLAYWRIGHT_BROWSERS_PATH || '', 'chromium/chrome-linux/chrome'),
  ...fs.existsSync(process.env.PLAYWRIGHT_BROWSERS_PATH || '')
    ? fs.readdirSync(process.env.PLAYWRIGHT_BROWSERS_PATH)
      .filter((d) => d.startsWith('chromium-'))
      .map((d) => path.join(process.env.PLAYWRIGHT_BROWSERS_PATH, d, 'chrome-linux/chrome'))
    : [],
].filter((p) => p && fs.existsSync(p));

export const launch = (options) => chromium.launch(
  Object.assign(candidates.length ? { executablePath: candidates[0] } : {}, options));

/* An iPhone reports safe-area insets and Chromium does not, so the chrome
   would otherwise be measured against a rectangle no phone ships. */
export const forceInsets = (page) => page.addInitScript(() => {
  document.addEventListener('DOMContentLoaded', () => {
    const land = window.innerWidth > window.innerHeight;
    const set = (k, v) => document.documentElement.style.setProperty(k, v);
    set('--safe-t', land ? '0px' : '59px');
    set('--safe-b', land ? '21px' : '34px');
    set('--safe-l', land ? '59px' : '0px');
    set('--safe-r', land ? '59px' : '0px');
  });
});
