#!/usr/bin/env node
/*
 * NUMBER9 React user-app driver.
 *
 * Headless browser harness for the Vite dev server. Playwright's *bundled*
 * Chromium is not installed in this container, so we drive the SYSTEM browser
 * via executablePath. playwright-core lives in the REPO ROOT node_modules
 * (the Angular app depends on it), not in NUMBER9 — we resolve it from a few
 * candidate locations.
 *
 * Usage (run from the NUMBER9/ directory; dev server must already be up):
 *   node .claude/skills/run-number9-user/driver.mjs smoke
 *       → loads /, /#/login, /#/register; screenshots each; fails on
 *         console errors or a missing hero. Exit 0 = healthy.
 *   node .claude/skills/run-number9-user/driver.mjs shot <url> [outfile]
 *       → single screenshot of any URL.
 *
 * Env:
 *   BASE_URL   default http://localhost:5175
 *   CHROME     override the browser executable (default: autodetect)
 */
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(__dirname, 'shots');
const BASE_URL = process.env.BASE_URL || 'http://localhost:5175';

// --- resolve playwright-core from wherever it actually lives ----------------
function loadChromium() {
  const candidates = [
    join(__dirname, '../../../node_modules'),        // NUMBER9/node_modules
    join(__dirname, '../../../../node_modules'),      // repo-root node_modules
  ];
  for (const base of candidates) {
    const pkg = join(base, 'playwright-core', 'package.json');
    if (existsSync(pkg)) {
      const req = createRequire(join(base, 'x.js'));
      return req('playwright-core').chromium;
    }
  }
  throw new Error('playwright-core not found in NUMBER9 or repo-root node_modules');
}

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  for (const p of ['/usr/bin/chromium', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable']) {
    if (existsSync(p)) return p;
  }
  throw new Error('no system chromium/chrome found; set CHROME=/path/to/binary');
}

async function newPage(chromium) {
  const browser = await chromium.launch({
    executablePath: findChrome(),
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  return { browser, page, errors };
}

async function shot(page, name) {
  const file = join(SHOTS, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  📸 ${file}`);
  return file;
}

async function cmdSmoke() {
  const chromium = loadChromium();
  const { browser, page, errors } = await newPage(chromium);
  let failed = false;
  try {
    // 1. Landing page — HashRouter app, so routes are /#/...
    console.log(`→ nav ${BASE_URL}/`);
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle', timeout: 30000 });
    // Hero CTA proves React mounted and i18n resolved, not just the shell.
    await page.waitForSelector('a[href="#/register"], a[href*="register"]', { timeout: 15000 });
    const title = await page.title();
    console.log(`  title: ${title}`);
    await shot(page, 'landing');

    // 2. Login route
    console.log(`→ nav ${BASE_URL}/#/login`);
    await page.goto(`${BASE_URL}/#/login`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForSelector('input', { timeout: 15000 });
    await shot(page, 'login');

    // 3. Register route (lazy-loaded chunk — give it room)
    console.log(`→ nav ${BASE_URL}/#/register`);
    await page.goto(`${BASE_URL}/#/register`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForSelector('input', { timeout: 20000 });
    await shot(page, 'register');
  } catch (e) {
    console.error(`✗ flow failed: ${e.message}`);
    failed = true;
    try { await shot(page, 'failure'); } catch {}
  } finally {
    await browser.close();
  }

  if (errors.length) {
    console.error(`\n✗ ${errors.length} console error(s):`);
    for (const e of errors.slice(0, 20)) console.error(`   ${e}`);
    failed = true;
  } else {
    console.log('\n✓ no console errors');
  }
  process.exit(failed ? 1 : 0);
}

async function cmdShot(url, out) {
  const chromium = loadChromium();
  const { browser, page, errors } = await newPage(chromium);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await shot(page, out || 'shot');
  await browser.close();
  if (errors.length) { console.error(`${errors.length} console error(s)`); process.exit(1); }
}

const [cmd, a, b] = process.argv.slice(2);
if (cmd === 'smoke') await cmdSmoke();
else if (cmd === 'shot' && a) await cmdShot(a, b);
else { console.error('usage: driver.mjs smoke | shot <url> [outfile]'); process.exit(2); }
