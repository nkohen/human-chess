/**
 * Reload-survival smoke for the human-chess web app (the rule: every screen survives a page
 * reload where it was — docs/design/2026-09-18-reload-survival.md). A live-browser complement
 * to the per-subproject jsdom tests: it drives real Chromium through the real app.
 *
 * For every route: load, wait for the screen to settle, capture the board (every piece and its
 * square), the heading and the `human-chess.*` localStorage keys, reload, wait again, and
 * require all three unchanged with no console error. Then two targeted flows that a generic
 * pass cannot see: a timed guess-the-eval solo round keeps its position and its clock keeps
 * counting down (never up) across a reload, and the opening training game keeps its board
 * after 1.e4 and the engine's reply.
 *
 * Usage:
 *   node scripts/reload-smoke.mjs                                   # against its own Vite dev server
 *   RELOAD_SMOKE_PORT=5217 node scripts/reload-smoke.mjs            # another port (parallel worktrees)
 *   LIVE_BASE=https://nkohen.github.io/human-chess/ node scripts/reload-smoke.mjs   # against a deployed build
 *
 * Network: nothing here may reach the real lichess.org or api.chess.com (the user's IP was
 * rate-limited before by exactly this mistake). Only requests to the app's own origin — the
 * Vite port, or LIVE_BASE's host — go through; everything else is aborted at the network layer,
 * the same allowlist policy as scripts/screenshots.mjs. The wasm engine runs locally in the page.
 */
import { chromium } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Dedicated port, distinct from the screenshot harness's 5199 so both can run at once.
const PORT = Number(process.env.RELOAD_SMOKE_PORT ?? 5198);
const LIVE = process.env.LIVE_BASE;
const BASE = LIVE ?? `http://localhost:${PORT}`;
const ALLOWED = LIVE ? new URL(LIVE).host : `localhost:${PORT}`;
const WEB_DIR = path.join(ROOT, 'apps', 'web');
const VITE_BIN = path.join(WEB_DIR, 'node_modules', '.bin', 'vite');

const ROUTES = ['', 'endgames', 'guess-the-eval', 'visualization', 'hand-and-brain', 'openings', 'memory', 'opening-game', 'bot-rating', 'puzzles', 'chessitout', 'review', 'lesson-builder'];

function isNetworkFailureText(t) { return /^Failed to load resource|net::ERR_|Failed to fetch|NetworkError/i.test(t); }

async function guard(context) {
  await context.route('**/*', route => {
    let host = '';
    try { host = new URL(route.request().url()).host; } catch {}
    if (host === ALLOWED || host === `127.0.0.1:${PORT}`) return route.continue();
    route.abort();
  });
}
function capture(page, sink) {
  let aborted = 0;
  page.on('requestfailed', r => { let h=''; try{h=new URL(r.url()).host;}catch{} if (h !== ALLOWED) aborted++; });
  page.on('console', m => { if (m.type() !== 'error') return; const t = m.text(); if (isNetworkFailureText(t) && aborted > 0) return; sink.push('console: ' + t); });
  page.on('pageerror', e => { const t = e instanceof Error ? e.message : String(e); if (isNetworkFailureText(t) && aborted > 0) return; sink.push('pageerror: ' + t); });
}
async function ready(page) {
  await page.waitForSelector('.hc-app-shell__main', { timeout: 20_000 });
  await page.waitForLoadState('networkidle');
  for (let i = 0; i < 4; i++) {
    await page.waitForSelector('.hc-status--busy', { state: 'detached', timeout: 30_000 });
    await sleep(300);
    if ((await page.$('.hc-status--busy')) === null) break;
  }
}
async function snap(page) {
  return page.evaluate(() => {
    const pieces = [...document.querySelectorAll('cg-board piece')].map(p => p.className + '@' + p.style.transform).sort().join('|');
    const heading = document.querySelector('.hc-app-shell__main h1, .hc-app-shell__main h2')?.textContent?.trim() ?? '';
    const keys = Object.keys(localStorage).filter(k => k.startsWith('human-chess.')).sort();
    const store = Object.fromEntries(keys.map(k => [k, localStorage.getItem(k)]));
    return { pieces, heading, keys, store, url: location.href };
  });
}

async function main() {
  if (!LIVE) {
    console.log('copying the wasm engine into apps/web/public/engine...');
    execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'copy-engine.mjs')], { stdio: 'inherit' });
  }
  console.log(`reload smoke against ${BASE}`);
  const server = LIVE ? { kill() {} } : spawn(VITE_BIN, ['--port', String(PORT), '--strictPort'], { cwd: WEB_DIR, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = LIVE ? 'localhost:0/' : ''; if (!LIVE) { server.stdout.on('data', d => out += d); server.stderr.on('data', d => out += d); }
  const failures = [];
  let browser;
  try {
    const start = Date.now();
    while (!/localhost:\d+\//.test(out)) { if (Date.now() - start > 30000) throw new Error('vite did not start: ' + out); await sleep(200); }
    browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await guard(context);
    const page = await context.newPage();
    const errors = [];
    capture(page, errors);

    for (const r of ROUTES) {
      const name = r || 'home';
      const errBefore = errors.length;
      await page.goto(`${BASE}/#/${r}`);
      await ready(page);
      const a = await snap(page);
      await page.reload();
      await ready(page);
      const b = await snap(page);
      const probs = [];
      if (a.pieces !== b.pieces) probs.push(`board differs after reload (${a.pieces.length} vs ${b.pieces.length} chars)`);
      if (a.heading !== b.heading) probs.push(`heading "${a.heading}" -> "${b.heading}"`);
      if (a.keys.join() !== b.keys.join()) probs.push(`storage keys changed: ${a.keys} -> ${b.keys}`);
      if (a.url !== b.url) probs.push(`url ${a.url} -> ${b.url}`);
      const newErrs = errors.slice(errBefore);
      if (newErrs.length) probs.push(...newErrs);
      console.log(`${probs.length ? '✗' : '✓'} ${name}: board=${a.pieces ? 'yes' : 'no'} keys=${a.keys.length} heading="${a.heading}"`);
      for (const p of probs) { console.log('    ' + p); failures.push(`${name}: ${p}`); }
    }

    // Targeted: guess-the-eval solo round survives with its position and a running clock.
    {
      const errBefore = errors.length;
      await page.goto(`${BASE}/#/guess-the-eval`);
      await ready(page);
      await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Start round' && !b.disabled), null, { timeout: 30_000 });
      await page.getByRole('radio', { name: /^60s$/ }).or(page.locator('button', { hasText: /^60s$/ })).first().click();
      await page.locator('button', { hasText: /^Start round$/ }).click();
      await page.waitForSelector('cg-board piece', { timeout: 60_000 });
      await ready(page);
      const a = await snap(page);
      const textA = await page.evaluate(() => document.querySelector('.hc-app-shell__main').innerText);
      await sleep(1500);
      await page.reload();
      await ready(page);
      await page.waitForSelector('cg-board piece', { timeout: 30_000 });
      const b = await snap(page);
      const textB = await page.evaluate(() => document.querySelector('.hc-app-shell__main').innerText);
      const probs = [];
      if (!a.pieces) probs.push('no pieces before reload');
      if (a.pieces !== b.pieces) probs.push('solo round position changed across reload');
      const clock = t => (t.match(/\b(\d+)s left\b/) || []).slice(1).map(Number);
      const ca = clock(textA), cb = clock(textB);
      if (ca.length !== 1 || cb.length !== 1) probs.push(`clock not found (before: ${JSON.stringify(ca)}, after: ${JSON.stringify(cb)})`);
      else if (cb[0] > ca[0]) probs.push(`clock went up after reload: ${ca} -> ${cb}`);
      probs.push(...errors.slice(errBefore));
      console.log(`${probs.length ? '✗' : '✓'} guess-the-eval solo round: clock ${ca} -> ${cb}`);
      for (const p of probs) { console.log('    ' + p); failures.push(`gte-solo: ${p}`); }
    }

    // Targeted: opening-game play e2e4, wait for the engine reply, reload, board identical.
    {
      const errBefore = errors.length;
      await page.goto(`${BASE}/#/opening-game`);
      await ready(page);
      const startBtn = page.locator('button', { hasText: /^(Start|Start game|Play)$/ });
      if (await startBtn.count()) { await startBtn.first().click(); }
      await page.waitForSelector('cg-board piece', { timeout: 60_000 });
      await ready(page);
      const sq = await page.evaluate(() => {
        const b = document.querySelector('cg-board').getBoundingClientRect(); const s = b.width / 8;
        const c = (f, r) => ({ x: b.left + (f + 0.5) * s, y: b.top + (8 - r - 0.5) * s });
        return { e2: c(4, 1), e4: c(4, 3) };
      });
      await page.mouse.click(sq.e2.x, sq.e2.y); await sleep(100); await page.mouse.click(sq.e4.x, sq.e4.y);
      await page.waitForSelector('square.last-move', { timeout: 5000 });
      // wait for the engine's reply: piece count of black pieces moved => last-move squares change
      const firstLast = await page.evaluate(() => [...document.querySelectorAll('square.last-move')].map(s => s.style.transform).join());
      await page.waitForFunction(prev => [...document.querySelectorAll('square.last-move')].map(s => s.style.transform).join() !== prev, firstLast, { timeout: 60_000 });
      await ready(page);
      const a = await snap(page);
      await page.reload();
      await ready(page);
      await page.waitForSelector('cg-board piece', { timeout: 30_000 });
      const b = await snap(page);
      const probs = [];
      if (a.pieces !== b.pieces) probs.push('opening-game board changed across reload');
      if (!/last-move/.test(await page.content())) probs.push('no last-move highlight after reload');
      probs.push(...errors.slice(errBefore));
      console.log(`${probs.length ? '✗' : '✓'} opening-game after 1.e4 + reply`);
      for (const p of probs) { console.log('    ' + p); failures.push(`opening-game: ${p}`); }
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.kill();
  }
  console.log(failures.length ? `\n${failures.length} failure(s)` : '\nall reload checks passed');
  process.exit(failures.length ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(2); });
