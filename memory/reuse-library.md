# Reuse library ledger

Every piece of outside code or data that enters human-chess is recorded here BEFORE it lands,
with its license and what that license obligates, and the user is told (CLAUDE.md, L2/L3).
Status column: `candidate` (surveyed, not adopted), `adopted` (user said yes, code present),
`rejected`. First adoptions 2026-09-16 (chessops, chessground, nmrugg stockfish). Project license: AGPL-3.0-or-later (user, 2026-09-15). Stack decided
2026-09-15: TypeScript, with Rust-to-wasm for compute-heavy parts. Every surveyed candidate
below is AGPL-compatible except: cm-chessboard's default NC piece art, chessdriller and any
other item with no license file, and unverified items.

Full survey with sources: docs/research/2026-09-15-reuse-survey.md.

## Obligation summary

- **MIT / BSD / Apache-2.0 / CC0**: attribution (and NOTICE handling for Apache). No effect on
  human-chess's license.
- **GPL-3.0**: linking or bundling into one program makes the whole program GPL-3.0 when
  distributed. Running a GPL engine as a separate process over UCI does not. Compatible with
  human-chess being GPL-3.0 or AGPL-3.0.
- **AGPL-3.0**: as GPL, plus running a modified copy as a network service obliges source
  release to its users. Running an unmodified copy, or calling lichess's public endpoints,
  does not modify anything.

## Ledger (verified from license files on 2026-09-15 unless marked)

| Piece | License | Obligation if used | Status |
|---|---|---|---|
| chessops (npm `chessops` 0.15.1, GPL-3.0-or-later) | GPL-3.0+ | linked into the app; fine under AGPL-3.0 (§13) | **adopted 2026-09-16** in packages/rules |
| chessground (npm `chessground` 9.2.1, GPL-3.0-or-later; not scoped) | GPL-3.0+ | linked into the app; fine under AGPL-3.0 | **adopted 2026-09-16** in packages/board (with its cburnett piece set and brown board CSS) |
| pgn-viewer (`@lichess-org/pgn-viewer`) | GPL-3.0 | app becomes GPL-3.0 | candidate |
| stockfish-web (npm `lila-stockfish-web` 0.0.11) | GPL-3.0 per LICENSE file; package.json says AGPL-3.0-or-later (inconsistent) | bundled wasm | candidate, not chosen: needs separate NNUE downloads |
| stockfish.js (npm `stockfish` 19.0.0, nmrugg / Chess.com; GPL-3.0 per Copying.txt in the package) | GPL-3.0 | the unmodified loader + wasm are copied into apps/web/public/engine and shipped with the site: distributing the site must offer source (upstream repo + version) | **adopted 2026-09-16** in packages/engine (Worker transport) and apps/web |
| scalachess | MIT | attribution | rejected 2026-09-15: stack is TypeScript, not JVM |
| shakmaty (Rust crate, GPL-3.0+ per COPYING and Cargo.toml) and shakmaty-syzygy (GPL-3.0+ per Cargo.toml) | GPL-3.0+ | a Rust/wasm module linking it is GPL | candidate, only for a Rust compute module |
| python-chess (pip `chess`) | GPL-3.0+ | any Python program importing it is GPL | candidate, data sidecar |
| berserk | GPL-3.0 | same as above | candidate |
| Stockfish binary | GPL-3.0 | none when run as separate UCI process; if redistributed, ship source/offer | used unmodified by tests when present (ProcessTransport); server engine later |
| lc0 binary | GPL-3.0 + NVIDIA §7 permission | as Stockfish; weights terms unaudited | candidate |
| Maia nets (maia-chess) | GPL-3.0 (code); weights not separately stated | unclear for weights: ask before bundling | candidate, bot-rating test |
| maia2 | MIT | attribution | candidate |
| maia3 | AGPL-3.0 | source release if modified and hosted | candidate |
| Fathom | MIT | attribution | candidate, tablebase probing |
| lila-tablebase | AGPL-3.0 | run unmodified or use public endpoint | candidate |
| lila-openingexplorer | AGPL-3.0 | run unmodified or use public endpoint | candidate |
| lichess game and puzzle dumps, incl. the per-user game export API (`/api/games/user/{username}`, same underlying data) | CC0 | none | **adopted 2026-09-16** in packages/import (`fetchLatestLichessGame`; note: lichess answers non-browser User-Agents such as curl's or HeadlessChrome's with an HTML 404, so test it with a real browser UA); puzzle dumps still candidate; the puzzle API (`/api/puzzle/next`, `/api/puzzle/{id}`, same CC0 data) **adopted 2026-09-16** in subprojects/puzzles |
| lichess opening explorer API (`explorer.lichess.ovh/lichess`, `/masters`) | CC0 data | none | **needs a lichess login (verified 2026-09-16)**: anonymous requests get `401 Authorization Required`; the OpenAPI spec (lichess-org/api, tags/openingexplorer) declares `security: OAuth2: []`, i.e. any bearer token, no scope. User said build OAuth (2026-09-16): PKCE, no client registration (any client_id), authorize `https://lichess.org/oauth` (S256 only), token `POST https://lichess.org/api/token` form-encoded and CORS-open, revoke `DELETE /api/token`, tokens ~1 year, no refresh tokens. Rate policy: one request at a time; after a 429 wait a full minute (no Retry-After documented); games export 20 games/s anonymous, 30 with a token. Implemented in packages/lichess with Web Crypto, not the example app's @bity/oauth2-auth-code-pkce (that example dir self-declares MIT inside an AGPL repo; not reused) |
| lichess broadcast games | CC BY-SA 4.0 | attribution, share-alike on the data | candidate, data |
| chess.com Published-Data API (`api.chess.com/pub/...`, read-only, no login/key) | no explicit data license; read-only public data fetched on the user's behalf at runtime, nothing redistributed; attribution only required for republishing the daily puzzle, which we do not use | none for our use | **adopted 2026-09-17** in `packages/chesscom` (`chesscomArchives`, `chesscomMonthlyGames`) and `packages/import` (`fetchLatestChesscomGame`); verified from chess.com's docs and a single live request: CORS-open (`access-control-allow-origin: *`), one request at a time, 429 with no documented cooldown length (Retry-After honoured, else 60 s, capped at 10 min, same as lichess); OpeningTree (GPL-3.0, github.com/openingtree/openingtree) is the reference that browser-direct calls to api.chess.com are established practice — no code copied from it |
| chess-openings (ECO TSV) | CC0 | none | candidate, data |
| chess-coach (qam4) | Apache-2.0 | attribution + NOTICE | candidate, game-reviewer grounding pattern |
| boardgame.io | MIT | attribution | candidate, group chess |
| cm-chessboard | MIT code; Staunty pieces CC BY-NC-SA 4.0 | swap piece art for commercial use | candidate |
| chess.js | BSD-2-Clause | attribution | candidate only if the lichess-rules rule is relaxed |
| openingtree | GPL-3.0 | compatible with AGPL-3.0; keep notices, attribute | **candidate, user-directed 2026-09-16**: reuse its played-games opening tree and lichess/chess.com importer for the openings builder; specific files to be listed before landing |
| en-croissant | GPL-3.0 | app becomes GPL-3.0 if code is copied | design reference |
| Listudy, blind.tactics, lichess-bot | AGPL-3.0 | source release if modified and hosted | design references |
| lila (server) | AGPL-3.0 | not separable; reference only | reference |
| chessdriller | no license file | cannot be reused until the author licenses it | design reference only |
| fishtest, syzygy1/tb code | no license file found | methodology / data files only | reference |
| Lichess Elite Database | unverified | confirm with curator | unverified |

## Non-chess tooling (2026-09-16)

React 19, react-dom, Vite 8, @vitejs/plugin-react (MIT); TypeScript 5.9 (Apache-2.0); vitest 5
(MIT); pnpm. Attribution only; none changes the project's license.
