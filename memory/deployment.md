# Deployment: GitHub Pages under nkohen.github.io/human-chess/

Prepared and first published 2026-09-18 (user request: "put this project up on my website like
~/dev/taskmaster is", to iterate from a phone). Source is public at
https://github.com/nkohen/human-chess (git remote `origin`, branch master); publish with
`HC_SOURCE_URL=https://github.com/nkohen/human-chess npx pnpm@10 deploy` after pushing master.
The user authorised pushing to both repos on 2026-09-18.

## How it works

- The website is the GitHub Pages repo `~/dev/nkohen.github.io` (Jekyll; remote
  `git@github.com:nkohen/nkohen.github.io.git`). Each app lives in a subfolder as a static Vite
  build (`taskmaster/`, `clarinet-doctordle/`), copied in by a deploy script in the app's own
  repo. human-chess follows the same pattern: `scripts/deploy-web.sh`, run as
  `HC_SOURCE_URL=<public repo url> npx pnpm@10 deploy`.
- The script refuses a dirty tree or (once a remote exists) an unpushed HEAD, runs `check`, builds
  with `VITE_SOURCE_URL` and `VITE_SOURCE_REV` (short HEAD, linked as `<url>/tree/<rev>` in the
  colophon so the source offer names the deployed revision), replaces
  `<website>/human-chess/` wholesale with `rsync -a --delete` (recursive `rm` is blocked by the
  guard), refuses if the website repo has staged changes, stages only that subfolder, no-ops when
  unchanged, commits "Update human-chess (date)" scoped to the subfolder
  and pushes. `HC_WEBSITE_REPO` overrides the website checkout path.
- Live URL once published: https://nkohen.github.io/human-chess/ (Pages rebuild takes ~1 min).

## What the build needed (all in apps/web, 2026-09-18)

- `vite.config.ts`: `base: './'` so hashed assets resolve relative to index.html in a subfolder.
- `src/engine.ts`: `ENGINE_SCRIPT_URL` is `new URL('engine/…', document.baseURI)`, not
  `/engine/…`, so the Stockfish worker script and wasm load from `/human-chess/engine/`.
- Hash routing keeps `location.pathname` at `/human-chess/`, so no 404 fallback is needed; the
  lichess OAuth redirect URI is `origin + pathname` and works unchanged (client_id `human-chess`,
  PKCE, no registration).
- The engine is the single-threaded wasm build: no COOP/COEP headers, which GitHub Pages cannot
  set anyway. A multi-threaded engine would need another host.
- Verified 2026-09-18 by serving `apps/web/dist` under `/human-chess/` locally with Playwright:
  home and `#/openings` render at desktop and iPhone widths, header shows "engine: Stockfish 19
  Lite WASM", both engine files fetched from the subpath, no console errors, no overflow.

## Licensing obligation on publishing

human-chess is AGPL-3.0-or-later and the shipped Stockfish wasm is GPL-3.0
(memory/reuse-library.md). Serving the site to the public triggers the source offer (AGPL §13 and
GPL §6), so the deploy script refuses to run without `HC_SOURCE_URL`, and the home page's
colophon (`.app-colophon` in App.tsx, styled in `apps/web/src/app.css`) links that URL plus
chessops, chessground and stockfish.js. The public repo github.com/nkohen/human-chess was created by the user on 2026-09-18.

Reviewed 2026-09-18 by the code-reviewer (revision check, commit scoping and stockfish.js version added on
its findings). The bearer token from a lichess login is readable by the other apps on the same
origin (all the user's own); keep that in mind if a third-party build is ever placed there.
