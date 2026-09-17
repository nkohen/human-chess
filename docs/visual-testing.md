# Visual testing (layout smoke harness)

human-chess is ordinary DOM/React (unlike NumberGoUp, whose whole UI is one `<canvas>`), so it
does have normal component/unit tests — but none of them catch a control running off the right
edge of a phone screen, a primary button pushed below the fold, or a segmented control that
wraps onto three lines. This harness screenshots every screen at a desktop, a "short" desktop,
and a phone viewport, runs a handful of mechanical layout checks against the real DOM, and
writes a table + `screenshots/summary.json`. **Run it before publishing any change that touches
`packages/ui`, a subproject's own CSS, or `packages/board`.**

Modelled on `~/dev/NumberGoUp/scripts/screenshots.mjs` (spawn the dev server, drive headless
Chromium, write PNGs to a gitignored `screenshots/`), extended with mechanical pass/fail checks
since this app's layout is inspectable DOM rather than pixels on a canvas.

## One-time setup

Playwright is already a root devDependency (`playwright: 1.62.0`, matching the version
NumberGoUp uses so the same cached Chromium build is reused) — `npx pnpm@10 install` is enough.
**Do not run `npx playwright install`**; the Chromium build is already cached under
`~/Library/Caches/ms-playwright`, and the script will tell you if it's somehow missing.

## Run it

```bash
npx pnpm@10 screenshots                                   # every route, every viewport
node scripts/screenshots.mjs chessitout memory            # just these routes, every viewport
node scripts/screenshots.mjs --viewport mobile             # every route, one viewport
node scripts/screenshots.mjs review --viewport short       # one route, one viewport
```

Viewports: `desktop` (1280×800), `short` (1280×650, the same width but short enough to catch a
board screen that scrolls when it shouldn't), `mobile` (Playwright's `devices['iPhone 13']`).
Routes are every entry in `apps/web/src/App.tsx`'s route list plus `home`; two of them also
capture a second state (`memory-loaded-*`, `review-loaded-*`, after driving a chess.com
import) and `opening-game` captures `opening-game-touchmove-*` after a move. Every captured
state, not just the first paint, goes through the same checks and owns the console errors
raised since the previous capture.

The script spawns the app's own Vite dev server on a dedicated port (5199, or `SCREENSHOTS_PORT`
when set, so parallel runs from several worktrees do not collide; `--strictPort`) and
only proceeds once *that child* has announced the port and answered; if the port is already
taken the child exits and the run fails right there instead of measuring a stranger's server.
The server is killed in a `finally` and on SIGINT/SIGTERM, so it never leaves an orphaned
process even if a check throws or the run is interrupted. It prints a table, writes
`screenshots/summary.json`, and **exits 1 if anything failed** — wire it into CI the same way
you would `vitest run`.

## What it checks mechanically

Per route × viewport:

- **(a) No unexplained console/page errors.** Any `console.error` or uncaught page error fails
  the run, except ones caused by a request this harness deliberately aborted (see Network,
  below). An excuse needs both halves: the message has the shape of a network failure
  (`Failed to load resource`, `net::ERR_*`, `Failed to fetch`) *and* the page has actually had a
  request aborted by the guard. A render error that merely mentions a chess site still fails.
- **(b) No horizontal overflow**, of `document.documentElement` and of `.hc-app-shell__main`,
  at every viewport including mobile.
- **(c) On `desktop` and `short` only, when a `.hc-workbench` is on screen:** the workbench
  doesn't scroll vertically (`docs/design/2026-09-17-ui.md`'s "the page never scrolls on a board
  screen" rule), and the primary control sits in the top third of the viewport. "Primary
  control" means the whole `.hc-workbench__primary` region — not a button several fields deep
  inside it — because the design doc defines `primary` as "the question and its buttons," and
  several real screens (visualization-trainer's quiz, openings-builder's create-opening form,
  endgames-intro's lesson-intro paragraph) legitimately put more than one field or a paragraph
  of text before the actual button. A `Page` screen (a setup/import form) is exempt from this
  entirely — `Page` is explicitly allowed to scroll.
- **(d) On `mobile` only:** the primary region starts within the viewport and its first
  interactive control ends within it (a tall quiz may continue below the fold, but the first
  thing to act on is reachable without scrolling), and every visible `button`/`input`/`select` (checkboxes and radios excepted: their wrapping label is the target) is at least 40px tall (a real touch
  target, not just a mouse-sized hit area with a bigger label).

A route can be flagged `noPrimaryControl` (currently `home`, pure navigation with no button at
all, and `puzzles`, whose only reachable state under the no-real-network rule below has no
primary CTA — see that section) to exempt it from (c)/(d)'s primary-position checks without
weakening them for every other screen.

Every screenshot is still taken even when a check fails, so a failing run gives you both the
table and the pictures. summary.json carries the same table as structured data.

## What still needs a human eye

The mechanical checks catch overflow, scrolling, positioning, and tap-target size — not whether
something *looks* right. Open the screenshots for any screen you touched and check:

- **All board screens (endgames, guess-the-eval, visualization, hand-and-brain, openings,
  opening-game, bot-rating, puzzles, chessitout):** board fully visible, not cramped against the
  aside column; the primary block reads as one coherent question, not a jumble of fields;
  status/error text doesn't collide with anything.
- **memory / review (before and after `-loaded`):** the import form's segmented control
  ("From your games" / chess.com username field) fits without wrapping oddly; after import, the
  move list / review table doesn't overflow its own scrolling area.
- **opening-game (`-touchmove-*`):** the highlighted last-move squares (e2 and e4) actually look
  highlighted, not just structurally present in the DOM.
- **chessitout:** the segmented control ("Mined by the engine" / "From your games") stays on one
  line at every width; the board's own coordinate labels (files along the bottom) sit fully
  inside the viewport on mobile, not clipped at the right edge.
- **home:** the card grid reflows sensibly at each width; no card's title/blurb overflows its
  own box.
- **puzzles:** since this harness can never reach a solved state (see below), only the
  loading/error layout is checked automatically — glance at it to confirm the error message
  reads sensibly rather than as a raw stack trace.

## Fake fixtures, never real network

Nothing this harness runs may reach the real `lichess.org` or `api.chess.com` — a previous real
probe against them got the user's IP rate-limited (`memory/no-live-lichess-probing.md`). Every
request through the browser context is intercepted (`context.route('**/*', …)`):

- Two chess.com Published-Data endpoints — `GET /pub/player/smoketestuser/games/archives` and
  the one monthly archive it points at — are answered from an in-script fixture (one short,
  finished game for a fake user, `smoketestuser`) so the `memory`/`review` import flow has
  something real to parse and render.
- Requests to the harness's own Vite (`localhost:5199`, which also serves the bundled fonts and
  the wasm engine) pass through untouched.
- **Every other request is aborted**, whatever the host. This is an allowlist, not a list of
  chess sites: the app already talks to more than one lichess host (`explorer.lichess.ovh` for
  the opening explorer), and the rule is that nothing from a smoke run reaches a real site. That
  includes `puzzles`' own puzzle-fetch on mount, which is why that route can only ever be
  exercised in its loading/error state here (see `noPrimaryControl` above): a real primary "keep
  solving" CTA only exists once a puzzle has actually loaded, which needs the real lichess API.
  Service workers are blocked on every context too (they would bypass the route handler).

The script prints a `fixture response(s) served` / `outside request(s) blocked` count each run —
if the "blocked" count is ever 0 across a full run, something changed in a way that stopped
exercising this path and is worth a second look, and if it's mysteriously large, something may
be retrying against the real host instead of accepting the fixture.

## The one thing headless can't catch

Headless Chromium uses a fixed viewport, so it **cannot reproduce iOS Safari's dynamic address
bar** (the bar that shows and hides as you scroll and changes the visible viewport height
underneath a fixed-height layout like `Workbench`'s "never scrolls" board screen). After any
change to `Workbench`'s sizing or to `useFitSquare`, do a quick manual check on a real phone:

```bash
npx pnpm@10 --filter @human-chess/web exec vite --host
```

then open the printed LAN URL on a phone on the same network and confirm the board and the
primary control stay reachable as Safari's address bar shows and hides, not just in the fixed
390×844 snapshot this harness captures.
