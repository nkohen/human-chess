/**
 * Visual/layout smoke harness for the human-chess web app (docs/visual-testing.md has the full
 * write-up: what this checks mechanically, what still needs a human eye, and why headless
 * Chromium can't be the final word on mobile).
 *
 * Modelled on ~/dev/NumberGoUp/scripts/screenshots.mjs: spawn the app's own Vite dev server,
 * drive headless Chromium through every screen, write PNGs to ./screenshots/ (gitignored).
 * Unlike NumberGoUp (a canvas game with a `window.__app` debug hook), human-chess is ordinary
 * DOM/React, so this harness also runs mechanical layout checks against the real DOM instead of
 * relying purely on eyeballing screenshots.
 *
 * Usage:
 *   node scripts/screenshots.mjs                        # every route, every viewport
 *   node scripts/screenshots.mjs chessitout memory       # just these routes, every viewport
 *   node scripts/screenshots.mjs --viewport mobile        # every route, one viewport
 *   node scripts/screenshots.mjs review --viewport short  # one route, one viewport
 *
 * One-time setup: this repo already carries Playwright 1.62.0 as a root devDependency with its
 * Chromium build cached, so `npx pnpm@10 install` is enough — do NOT run `playwright install`.
 *
 * Network: nothing here may reach the real lichess.org or api.chess.com (the user's IP was
 * rate-limited before by exactly this mistake). Every request to either host is intercepted;
 * only two chess.com Published-Data endpoints for a fake user ("smoketestuser") are answered,
 * from a fixture defined below, and everything else to those hosts is aborted.
 */
import { chromium, devices } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'screenshots');
// Dedicated port, overridable so parallel runs (one per worktree) do not collide on it.
const PORT = Number(process.env.SCREENSHOTS_PORT ?? 5199);
const BASE = `http://localhost:${PORT}`;
const WEB_DIR = path.join(ROOT, 'apps', 'web');
const VITE_BIN = path.join(WEB_DIR, 'node_modules', '.bin', 'vite');

// ---------- routes (mirrors apps/web/src/App.tsx's route list, plus the home page) ----------

/** `hasBoardOnLoad`: the screen mounts `@human-chess/board`'s `Board` (so `cg-board` exists)
 * before any user action — verified by reading each subproject's top-level component. Screens
 * not listed here are a setup/import `Page` (or, for `puzzles`, a `Workbench` whose board slot
 * is a placeholder div until a puzzle loads) with no `cg-board` on first paint. */
const ROUTES = [
  // home is pure navigation (a CardGrid of <a> links, no <button> at all) — it has no "primary
  // action" by the design doc's own definition (docs/design/2026-09-17-ui.md rule 2 is about
  // screens with a question/action to complete), so the primary-control position checks (c)/(d)
  // don't apply to it; every other route has at least one real button.
  { name: 'home', hash: '', noPrimaryControl: true },
  { name: 'endgames', hash: 'endgames', hasBoardOnLoad: true },
  // Guess the eval now opens on a settings Page (mode + time limit, 2026-09-17) rather than
  // straight onto a board, so it's a `extra` route like memory/opening-game: first paint is
  // checked as a Page, then `driveGuessTheEvalStart` starts a solo round to reach the board
  // screen and check that too.
  { name: 'guess-the-eval', hash: 'guess-the-eval', extra: 'guess-the-eval-start' },
  { name: 'visualization', hash: 'visualization', hasBoardOnLoad: true },
  { name: 'hand-and-brain', hash: 'hand-and-brain', hasBoardOnLoad: true },
  { name: 'openings', hash: 'openings', hasBoardOnLoad: true },
  { name: 'memory', hash: 'memory', extra: 'import' },
  // The memory trainer's review screen ("How you did") is only reachable after a whole attempt;
  // this route seeds a diverged-attempt snapshot into localStorage and reloads to render it, so
  // the review line, fork arrows and caption get the same layout/console checks as every board
  // screen. Same hash as `memory`; the first-paint capture is the import Page again (harmless).
  { name: 'memory-review', hash: 'memory', extra: 'memory-review' },
  { name: 'opening-game', hash: 'opening-game', extra: 'touch-move' },
  { name: 'bot-rating', hash: 'bot-rating' },
  // Puzzles fetches its first puzzle from lichess on mount, which this harness must always
  // block (the hard no-real-network rule) — so the only state reachable here is "loading/error,
  // no puzzle yet", and Puzzles.tsx (see its primaryContent) deliberately has no `primary` prop
  // in that state: the board itself is the interaction once a puzzle loads, and "Next puzzle"
  // is a secondary/footer action until solved. A real primary CTA only appears once solved,
  // which needs a real puzzle and so can't be reached under the no-network rule.
  { name: 'puzzles', hash: 'puzzles', placeholder: '.puzzles-board-placeholder', noPrimaryControl: true },
  { name: 'chessitout', hash: 'chessitout', hasBoardOnLoad: true },
  { name: 'review', hash: 'review', extra: 'import' },
  // Lesson Builder opens on its library Page (a list of saved lessons plus New/Import actions),
  // not a board and not a single-CTA flow — like the home page, there is no one primary control
  // to keep above the fold, so noPrimaryControl. The `lesson-edit` extra then creates a lesson and
  // adds a step to reach the editor (a Workbench board screen), which is the dense screen an
  // author actually spends their time in and where layout must hold.
  { name: 'lesson-builder', hash: 'lesson-builder', noPrimaryControl: true, extra: 'lesson-edit' },
];

const VIEWPORTS = [
  { name: 'desktop', context: { viewport: { width: 1280, height: 800 } } },
  { name: 'short', context: { viewport: { width: 1280, height: 650 } } },
  { name: 'mobile', context: { ...devices['iPhone 13'] } },
];

// ---------- fake chess.com fixture (never the real api.chess.com) ----------

const FIXTURE_USER = 'smoketestuser';
const now = new Date();
const yyyy = String(now.getUTCFullYear());
const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
const ARCHIVE_URL = `https://api.chess.com/pub/player/${FIXTURE_USER}/games/${yyyy}/${mm}`;
const ARCHIVES_URL = `https://api.chess.com/pub/player/${FIXTURE_USER}/games/archives`;
const endTimeSeconds = Math.floor(Date.now() / 1000) - 3 * 60; // ended a few minutes ago

const ARCHIVES_FIXTURE = { archives: [ARCHIVE_URL] };
const MONTHLY_FIXTURE = {
  games: [
    {
      url: 'https://www.chess.com/game/live/1',
      pgn:
        '[Event "Live Chess"]\n[White "smoketestuser"]\n[Black "opponent99"]\n[Result "1-0"]\n\n' +
        '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0',
      end_time: endTimeSeconds,
      rules: 'chess',
      time_class: 'blitz',
      rated: true,
      white: { username: FIXTURE_USER, rating: 1500, result: 'win' },
      black: { username: 'opponent99', rating: 1500, result: 'resigned' },
    },
  ],
};

// ---------- memory-trainer review-screen fixture (seeded into localStorage, no network) ----------
// The review screen only exists after a whole attempt, which is too many board moves to drive
// live; instead we seed the persisted snapshot directly (the same shape parseTrainerSnapshot
// rebuilds on reload) and let the app render it. Mirrors STATE_KEY in
// subprojects/memory-trainer/src/storage.ts.
const MEMORY_STATE_KEY = 'human-chess.memory-trainer.state.v1';
const MEMORY_REVIEW_GAME = {
  source: 'pgn',
  username: undefined,
  pgn: '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6',
  headers: {},
  startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  ucis: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6'],
  sans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6'],
  white: 'smoketestuser',
  black: 'opponent99',
  result: undefined,
  playedAs: 'white',
  url: undefined,
  playedAt: undefined,
};
// A reconstruction that matched three plies then recalled 2… Nf6 instead of 2… Nc6: one flagged
// mistake, and replayIndex 3 parks the board at that fork so the arrows + caption are on screen.
const MEMORY_REVIEW_SNAPSHOT = {
  screen: { kind: 'review', game: MEMORY_REVIEW_GAME, ucis: ['e2e4', 'e7e5', 'g1f3', 'g8f6'], claimedComplete: false },
  flipped: false,
  replayIndex: 3,
};

let blockedCount = 0;
let servedCount = 0;

/** Registers the network policy on one context: fulfill the two fixture endpoints, let requests
 * to this harness's own Vite through, and abort everything else. An allowlist, not a deny-list:
 * the app talks to more than one lichess host (explorer.lichess.ovh today, a tablebase host
 * later), and the hard rule is that nothing from a smoke run ever reaches a real site. */
async function installNetworkGuard(context) {
  await context.route('**/*', route => {
    const url = route.request().url();
    if (url === ARCHIVES_URL) {
      servedCount++;
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify(ARCHIVES_FIXTURE),
      });
      return;
    }
    if (url === ARCHIVE_URL) {
      servedCount++;
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify(MONTHLY_FIXTURE),
      });
      return;
    }
    let host = '';
    try {
      host = new URL(url).host;
    } catch {
      // not a URL playwright would ever hand back with a bad href; fall through and continue()
    }
    if (host === `localhost:${PORT}` || host === `127.0.0.1:${PORT}`) {
      route.continue();
      return;
    }
    blockedCount++;
    route.abort();
  });
}

// ---------- measurement / checks ----------

/** Runs entirely inside the page: finds the "primary control" and returns every raw number the
 * Node-side checks need. Nothing here decides pass/fail — that stays in Node so the thresholds
 * are visible in one place.
 *
 * "Primary control" means the whole `.hc-workbench__primary` region, not a button inside it.
 * layouts.tsx's Workbench doc comment defines `primary` as "the question and its buttons, or
 * the main action" — several real screens (visualization-trainer's quiz, openings-builder's
 * create-opening form, endgames-intro's lesson-intro dialog) legitimately put more than one
 * field or a paragraph of text before the actual `<button>`, so measuring the button's own
 * position penalizes exactly the screens that are following the design doc, not breaking it.
 * Measuring the region's top/bottom instead is what "primary near the top" / "primary in
 * viewport" actually mean here. A screen with no `primary` prop at this moment (mid-play with no
 * pending decision, e.g. endgames-intro between lessons, puzzles before a puzzle has loaded) has
 * no `.hc-workbench__primary` in the DOM at all — same as `route.noPrimaryControl` screens like
 * `home`, which have no Workbench in the first place. */
function measureLayout() {
  function isVisible(el) {
    if (!el) return false;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }
  function findPrimary() {
    const scope = document.querySelector('.hc-workbench__primary');
    return isVisible(scope) ? scope : null;
  }
  const main = document.querySelector('.hc-app-shell__main');
  const primary = findPrimary();
  const primaryRect = primary ? primary.getBoundingClientRect() : null;
  // The first interactive control inside the primary region: on a phone the region may be a
  // whole quiz (visualization-trainer) that legitimately runs past the fold, but the thing the
  // user acts on first must be reachable without scrolling.
  const firstControl = primary ? [...primary.querySelectorAll('button, input, select, textarea')].find(isVisible) ?? null : null;
  const firstControlRect = firstControl ? firstControl.getBoundingClientRect() : null;
  // A checkbox/radio keeps its native size (the label around it is the tap target, see
  // base.css's mobile block), so it is exempt here as it is there.
  const tapTargets = [...document.querySelectorAll('button, input:not([type=checkbox]):not([type=radio]), select')]
    .filter(isVisible)
    .map(el => ({ tag: el.tagName.toLowerCase(), height: el.getBoundingClientRect().height }));
  return {
    docScrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    mainScrollWidth: main ? main.scrollWidth : null,
    mainClientWidth: main ? main.clientWidth : null,
    mainScrollHeight: main ? main.scrollHeight : null,
    mainClientHeight: main ? main.clientHeight : null,
    hasPrimary: primary !== null,
    primaryRect: primaryRect ? { top: primaryRect.top, bottom: primaryRect.bottom } : null,
    firstControlRect: firstControlRect ? { top: firstControlRect.top, bottom: firstControlRect.bottom } : null,
    tapTargets,
    hasWorkbench: document.querySelector('.hc-workbench') !== null,
  };
}

/** Node-side thresholds, kept in one place so the printed table and summary.json agree with
 * each other. Returns `{ measurements, failures }`; `failures` is a list of human-readable
 * strings (empty when everything passed). Every check in here is a hard failure per the brief;
 * screenshots are taken regardless of what this returns. */
function evaluateChecks(m, viewportName, route) {
  const failures = [];
  const overflowDoc = m.docScrollWidth <= m.innerWidth;
  if (!overflowDoc) failures.push(`horizontal overflow: document.scrollWidth ${m.docScrollWidth} > innerWidth ${m.innerWidth}`);
  const overflowMain = m.mainScrollWidth === null || m.mainScrollWidth <= m.mainClientWidth;
  if (!overflowMain) failures.push(`horizontal overflow: .hc-app-shell__main scrollWidth ${m.mainScrollWidth} > clientWidth ${m.mainClientWidth}`);

  let verticalOk;
  let primaryTopOk;
  let primaryBottomOk;
  let tapTargetsOk = true;

  // The "never scrolls, primary near the top" invariant is the board-screen (Workbench)
  // contract (docs/design/2026-09-17-ui.md rule 7 and the Direction section); a setup/import
  // `Page` is explicitly allowed to scroll and to put its primary button after however many
  // fields it has (layouts.tsx's Page doc comment). So this pair of checks only applies when a
  // `.hc-workbench` is actually on screen — a `Page`-only screen (e.g. an import form, or
  // opening-game's pre-Start setup) is exempt from both halves, not just given a free pass on
  // one.
  if ((viewportName === 'desktop' || viewportName === 'short') && m.hasWorkbench) {
    if (m.mainScrollHeight !== null) {
      verticalOk = m.mainScrollHeight <= m.mainClientHeight + 1;
      if (!verticalOk) failures.push(`vertical overflow: .hc-app-shell__main scrollHeight ${m.mainScrollHeight} > clientHeight ${m.mainClientHeight} + 1`);
    }
    if (!m.hasPrimary) {
      primaryTopOk = route?.noPrimaryControl ? true : false;
      if (!primaryTopOk) failures.push('no visible primary control found');
    } else {
      primaryTopOk = m.primaryRect.top < m.innerHeight / 3;
      if (!primaryTopOk) failures.push(`primary control not in top third: top ${m.primaryRect.top.toFixed(0)} >= ${(m.innerHeight / 3).toFixed(0)}`);
    }
  }

  if (viewportName === 'mobile') {
    // Same Workbench-only scoping as above: a `Page` screen (memory/review/opening-game before
    // their board actually starts) has no `primary` slot at all — nothing to check here, not a
    // failure to report — so this half runs only once a `.hc-workbench` is actually on screen.
    // The tap-target check right below is unrelated to `primary` and applies to every mobile
    // screen, Page or Workbench alike.
    if (m.hasWorkbench) {
      if (!m.hasPrimary) {
        primaryBottomOk = route?.noPrimaryControl ? true : false;
        if (!primaryBottomOk) failures.push('no visible primary control found');
      } else {
        // The region must start on screen, and its first control (or, for a region with no
        // control, the region itself) must end on screen: a tall quiz may continue below the
        // fold, but the first thing to act on may not.
        const firstBottom = m.firstControlRect ? m.firstControlRect.bottom : m.primaryRect.bottom;
        primaryBottomOk = m.primaryRect.top < m.innerHeight && firstBottom <= m.innerHeight;
        if (!primaryBottomOk) failures.push(`primary control below the fold: top ${m.primaryRect.top.toFixed(0)}, first control bottom ${firstBottom.toFixed(0)} > innerHeight ${m.innerHeight}`);
      }
    }
    const short = m.tapTargets.filter(t => t.height < 40);
    tapTargetsOk = short.length === 0;
    if (!tapTargetsOk) {
      failures.push(`${short.length} tap target(s) under 40px: ${short.map(t => `${t.tag}@${t.height.toFixed(0)}px`).join(', ')}`);
    }
  }

  return { failures, overflowDoc, overflowMain, verticalOk, primaryTopOk, primaryBottomOk, tapTargetsOk };
}

// ---------- console / page-error capture ----------

/** True only for the message shapes a request abort produces: Chromium's own "Failed to load
 * resource" line (which never repeats the URL), a `net::ERR_*` code, or fetch's
 * "Failed to fetch" TypeError. Anything else that merely mentions a chess site — say, a React
 * render error in the lichess login panel — is a real error and stays one. */
function isNetworkFailureText(text) {
  return /^Failed to load resource|net::ERR_|Failed to fetch|NetworkError/i.test(text);
}

function attachErrorCapture(page, sink) {
  let abortedRequests = 0;
  page.on('requestfailed', request => {
    let host = '';
    try {
      host = new URL(request.url()).host;
    } catch {
      // not a URL Playwright would ever hand back with a bad href
    }
    // Only requests installNetworkGuard aborted count; a failed request to our own Vite is a
    // real problem, and the console line it produces must not be excused below.
    if (host !== `localhost:${PORT}` && host !== `127.0.0.1:${PORT}`) abortedRequests++;
  });
  page.on('console', msg => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    // A network-failure message is excused only once this page has actually had a request
    // aborted by the guard; the same text on a page that never touched an outside host fails.
    if (isNetworkFailureText(text) && abortedRequests > 0) return;
    sink.push(`console: ${text}`);
  });
  page.on('pageerror', err => {
    const text = err instanceof Error ? err.message : String(err);
    if (isNetworkFailureText(text) && abortedRequests > 0) return;
    sink.push(`pageerror: ${text}`);
  });
}

// ---------- ready-state waiting (no fixed sleeps above 250ms) ----------

async function waitForScreenReady(page, route) {
  await page.waitForSelector('.hc-app-shell__main', { timeout: 20_000 });
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.waitForLoadState('networkidle');
  if (route.hasBoardOnLoad) {
    await page.waitForSelector('cg-board', { timeout: 20_000 });
  } else if (route.placeholder) {
    await page.waitForSelector(route.placeholder, { timeout: 20_000 });
  } else {
    await page.waitForSelector('.hc-page, .hc-workbench', { timeout: 20_000 });
  }
  // Some screens show a transient `.hc-status--busy` (a local Stockfish worker warming up, a
  // position being generated, ...) before their real primary control replaces it — wait that
  // out too, otherwise a measurement can land mid-generation (guess-the-eval: "generating a
  // position" runs a real, variable-length engine search, no network involved, so this is a
  // genuine ready-state gap, not flakiness to paper over with a fixed sleep). `state:
  // 'detached'` resolves immediately when the selector never matches at all, so this is a no-op
  // for routes that never go busy. One busy state can hand over to the next through a render
  // with neither on screen (engine loaded -> effect fires -> "generating"), so after each
  // detach we look again a beat later, a bounded number of times.
  await waitForNotBusy(page);
}

async function waitForNotBusy(page) {
  for (let round = 0; round < 4; round++) {
    await page.waitForSelector('.hc-status--busy', { state: 'detached', timeout: 20_000 });
    await sleep(250);
    if ((await page.$('.hc-status--busy')) === null) return;
  }
  throw new Error('screen kept returning to a busy state');
}

async function waitForEnabledButton(page, text, timeoutMs = 20_000) {
  await page.waitForFunction(
    label => {
      const btn = [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === label);
      return !!btn && !btn.disabled;
    },
    text,
    { timeout: timeoutMs },
  );
}

// ---------- the fetch-a-game extra state (memory, review) ----------

async function driveChesscomImport(page) {
  await page.waitForSelector('#hc-import-username', { timeout: 20_000 });
  const segment = page.locator('.hc-segmented__option', { hasText: /chess\.com/i });
  await segment.click();
  await page.fill('#hc-import-username', FIXTURE_USER);
  const fetchButton = page.locator('button.hc-primary');
  await fetchButton.click();
  await page.waitForSelector('cg-board', { timeout: 20_000 });
}

/** Seeds the review-screen snapshot into localStorage and reloads so the memory trainer renders
 * its "How you did" review directly — the diverged move flagged in the line, the fork arrows, and
 * the grounded caption. No network: the snapshot carries its own game. */
async function driveMemoryReview(page) {
  await page.evaluate(
    ({ key, snapshot }) => localStorage.setItem(key, JSON.stringify(snapshot)),
    { key: MEMORY_STATE_KEY, snapshot: MEMORY_REVIEW_SNAPSHOT },
  );
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('cg-board', { timeout: 20_000 });
}

// ---------- the touch-move / mouse-move extra state (opening-game) ----------

async function computeSquareCenters(page) {
  const rect = await page.locator('cg-board').first().evaluate(el => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });
  const square = rect.width / 8;
  const fileIndex = { e: 4 }; // only e-file is needed (e2-e4)
  const centerFor = (file, rank) => {
    const rankFromTop = 8 - rank; // white orientation: rank 8 at the top row
    return {
      x: rect.left + (fileIndex[file] + 0.5) * square,
      y: rect.top + (rankFromTop + 0.5) * square,
    };
  };
  return { e2: centerFor('e', 2), e4: centerFor('e', 4) };
}

async function driveOpeningGameSetup(page) {
  await page.waitForSelector('.hc-page', { timeout: 20_000 });
  await page.locator('.hc-segmented__option', { hasText: /^white$/i }).click();
  await waitForEnabledButton(page, 'Start');
  await page.locator('button', { hasText: /^Start$/ }).click();
  await page.waitForSelector('cg-board', { timeout: 20_000 });
}

// ---------- the guess-the-eval settings-then-round extra state ----------

/** Starts a solo round (the settings screen's defaults: Solo mode, no time limit) so there is a
 * board screen to check in addition to the settings Page checked at first paint. */
async function driveGuessTheEvalStart(page) {
  await page.waitForSelector('.hc-page', { timeout: 20_000 });
  await waitForEnabledButton(page, 'Start round');
  await page.locator('button', { hasText: /^Start round$/ }).click();
  await page.waitForSelector('cg-board', { timeout: 20_000 });
}

// ---------- the lesson-builder editor extra state ----------

/** From the library, create a lesson and add a step so the editor (a Workbench board screen with
 * the steps list and the full step panel — orientation, mode, challenge fieldset) is on screen.
 * This is the densest screen in the subproject and the one an author lives in. */
async function driveLessonBuilderEdit(page) {
  await page.locator('button', { hasText: /^New lesson$/ }).click();
  await page.waitForSelector('.hc-workbench', { timeout: 20_000 });
  await page.locator('button', { hasText: /^Add step$/ }).click();
  await page.waitForSelector('cg-board', { timeout: 20_000 });
}

async function performTouchMove(page, viewportName) {
  const { e2, e4 } = await computeSquareCenters(page);
  if (viewportName === 'mobile') {
    await page.touchscreen.tap(e2.x, e2.y);
    await sleep(100);
    await page.touchscreen.tap(e4.x, e4.y);
  } else {
    await page.mouse.click(e2.x, e2.y);
    await sleep(100);
    await page.mouse.click(e4.x, e4.y);
  }
  await page.waitForSelector('square.last-move', { timeout: 5_000 });
  const count = await page.locator('square.last-move').count();
  if (count < 2) {
    throw new Error(`expected 2 "square.last-move" elements after e2-e4, found ${count}`);
  }
}

// ---------- server lifecycle ----------

/** Resolves once OUR Vite answers: the child must still be alive, must have printed its
 * "Local: http://localhost:<port>/" line (so a foreign server already on the port, which
 * --strictPort makes our child exit over, can never be measured by mistake), and must answer
 * a fetch. Rejects the moment the child exits. */
async function waitForServer(server, getOutput, timeoutMs = 30_000) {
  const start = Date.now();
  let exited = null;
  server.once('exit', code => (exited = code ?? 'signal'));
  while (Date.now() - start < timeoutMs) {
    if (exited !== null) throw new Error(`Vite exited (code ${exited}) before serving; is port ${PORT} taken?`);
    if (new RegExp(`localhost:${PORT}/`).test(getOutput())) {
      try {
        const res = await fetch(BASE);
        if (res.ok) return;
      } catch {
        // announced but not accepting yet
      }
    }
    await sleep(200);
  }
  throw new Error(`Vite dev server never answered on ${BASE}`);
}

// ---------- CLI ----------

function parseArgs(argv) {
  const routeNames = [];
  let viewportFilter = 'all';
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--viewport') {
      viewportFilter = argv[++i];
    } else {
      routeNames.push(arg);
    }
  }
  return { routeNames, viewportFilter };
}

// ---------- main ----------

async function main() {
  const { routeNames, viewportFilter } = parseArgs(process.argv.slice(2));
  const routes = routeNames.length > 0 ? ROUTES.filter(r => routeNames.includes(r.name)) : ROUTES;
  if (routeNames.length > 0 && routes.length !== routeNames.length) {
    const known = new Set(ROUTES.map(r => r.name));
    const unknown = routeNames.filter(n => !known.has(n));
    throw new Error(`unknown route(s): ${unknown.join(', ')} — known routes: ${[...known].join(', ')}`);
  }
  const viewports = viewportFilter === 'all' ? VIEWPORTS : VIEWPORTS.filter(v => v.name === viewportFilter);
  if (viewports.length === 0) {
    throw new Error(`unknown --viewport "${viewportFilter}" — expected desktop, short, mobile, or all`);
  }

  mkdirSync(OUT, { recursive: true });

  console.log('copying the wasm engine into apps/web/public/engine...');
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'copy-engine.mjs')], { stdio: 'inherit' });

  if (!existsSync(VITE_BIN)) {
    throw new Error(`vite binary not found at ${VITE_BIN} — run "npx pnpm@10 install" first`);
  }

  const executablePath = chromium.executablePath();
  if (!existsSync(executablePath)) {
    console.error(`✗ Chromium not found at ${executablePath}`);
    console.error('  Run the one-time browser install:  npx playwright install chromium');
    process.exitCode = 1;
    return;
  }

  console.log(`starting Vite on ${BASE}...`);
  const server = spawn(VITE_BIN, ['--port', String(PORT), '--strictPort'], {
    cwd: WEB_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverOutput = '';
  server.stdout?.on('data', d => (serverOutput += d));
  server.stderr?.on('data', d => (serverOutput += d));

  const results = [];
  const allFailures = [];
  let browser;

  // `finally` does not run when Node dies from a signal; kill the child ourselves.
  const onSignal = signal => {
    server.kill();
    if (browser) browser.close().catch(() => undefined);
    process.exit(signal === 'SIGINT' ? 130 : 143);
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);

  try {
    await waitForServer(server, () => serverOutput);
    browser = await chromium.launch();

    for (const viewport of viewports) {
      for (const route of routes) {
        // Service workers bypass context.route(); none is registered today, block them anyway.
        const context = await browser.newContext({ ...viewport.context, serviceWorkers: 'block' });
        await installNetworkGuard(context);
        const page = await context.newPage();
        const errors = [];
        attachErrorCapture(page, errors);

        // Measures, checks and shoots the state the page is in right now. Every captured state
        // (first paint, after an import, after a touch move) goes through the same checks and
        // owns the console/page errors raised since the previous capture.
        let errorsSeen = 0;
        const capture = async state => {
          const label = state ? `${route.name}-${state}` : route.name;
          const measurements = await page.evaluate(measureLayout);
          const evaluated = evaluateChecks(measurements, viewport.name, route);
          const rowFailures = evaluated.failures.concat(errors.slice(errorsSeen));
          errorsSeen = errors.length;

          const file = path.join(OUT, `${label}-${viewport.name}.png`);
          await page.screenshot({ path: file });
          console.log(`✔ ${path.relative(ROOT, file)}${rowFailures.length ? `  [${rowFailures.length} failure(s)]` : ''}`);

          results.push({ route: label, viewport: viewport.name, measurements, ...evaluated, failures: rowFailures, screenshot: path.relative(ROOT, file) });
          rowFailures.forEach(f => allFailures.push(`${label}/${viewport.name}: ${f}`));
        };

        try {
          await page.goto(`${BASE}/#/${route.hash}`, { waitUntil: 'domcontentloaded' });
          await waitForScreenReady(page, route);
          await capture('');

          if (route.extra === 'import') {
            await driveChesscomImport(page);
            await waitForNotBusy(page);
            await capture('loaded');
          }

          if (route.extra === 'memory-review') {
            await driveMemoryReview(page);
            await waitForNotBusy(page);
            await capture('loaded');
          }

          if (route.extra === 'touch-move') {
            await driveOpeningGameSetup(page);
            await performTouchMove(page, viewport.name);
            await capture('touchmove');
          }

          if (route.extra === 'guess-the-eval-start') {
            await driveGuessTheEvalStart(page);
            await waitForNotBusy(page);
            await capture('started');
          }

          if (route.extra === 'lesson-edit') {
            await driveLessonBuilderEdit(page);
            await capture('edit');
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`✗ ${route.name}/${viewport.name}: ${message}`);
          allFailures.push(`${route.name}/${viewport.name}: harness error: ${message}`);
          results.push({ route: route.name, viewport: viewport.name, failures: [`harness error: ${message}`], harnessError: message });
          // Still try to capture whatever is on screen, so a broken check doesn't lose the shot.
          try {
            await page.screenshot({ path: path.join(OUT, `${route.name}-${viewport.name}.png`) });
          } catch {
            // page may already be unusable; nothing more to do
          }
        } finally {
          await context.close();
        }
      }
    }

    console.log(`\nnetwork: ${servedCount} fixture response(s) served, ${blockedCount} outside request(s) blocked\n`);
    printTable(results);

    writeFileSync(
      path.join(OUT, 'summary.json'),
      JSON.stringify({ generatedAt: new Date().toISOString(), servedCount, blockedCount, results, failures: allFailures }, null, 2),
    );
    console.log(`\nwrote ${path.relative(ROOT, path.join(OUT, 'summary.json'))}`);

    if (allFailures.length > 0) {
      console.error(`\n${allFailures.length} failure(s):`);
      allFailures.forEach(f => console.error(`  - ${f}`));
      process.exitCode = 1;
    } else {
      console.log('\nall checks passed.');
    }
  } catch (err) {
    // A failure outside any single route (Vite never came up, Chromium failed to launch) still
    // ends the run with exit 1 and, below, the server's own output — usually the real reason.
    console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    server.kill();
    if (process.exitCode) {
      // surfaced only on failure, so a clean run stays quiet about server chatter
      if (serverOutput.trim()) console.error(`\n--- vite output ---\n${serverOutput}`);
    }
  }
}

function printTable(results) {
  const rows = results.map(r => ({
    route: r.route,
    viewport: r.viewport,
    'h-overflow': r.harnessError ? '-' : r.overflowDoc && r.overflowMain ? 'ok' : 'FAIL',
    'v-overflow': r.harnessError ? '-' : r.verticalOk === undefined ? 'n/a' : r.verticalOk ? 'ok' : 'FAIL',
    'primary-top': r.harnessError ? '-' : r.measurements?.primaryRect ? r.measurements.primaryRect.top.toFixed(0) : 'n/a',
    'primary-bottom': r.harnessError ? '-' : r.measurements?.primaryRect ? r.measurements.primaryRect.bottom.toFixed(0) : 'n/a',
    errors: r.failures.length,
  }));
  console.table(rows);
}

await main();
