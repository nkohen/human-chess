# Reuse survey: open-source chess projects human-chess can draw from

Date: 2026-09-15. Produced by three researcher subagents (lichess ecosystem; engines and
analysis plumbing; trainer projects and open data), then license files re-fetched directly
by the coordinator from `raw.githubusercontent.com` on the same day. Nothing here has entered
the codebase; this is the input to the stack decision and to `memory/reuse-library.md`.

Verification key used throughout:
- **file** — license text read directly from the repo's LICENSE/COPYING file by the coordinator.
- **page** — GitHub license badge or README statement only.
- **search** — search snippet only, never fetched.

## 1. What is actually reusable, by layer

### 1.1 Rules (move generation, legality, FEN/PGN)

| Project | License | Language / consumption | Notes |
|---|---|---|---|
| scalachess — github.com/lichess-org/scalachess | **MIT** (file) | Scala 3, JitPack/sbt | Lichess's server-authoritative rules. All lichess variants. JVM only. **The earlier class-practice doc (card L2) called this AGPL; that was wrong.** |
| chessops — github.com/niklasf/chessops | **GPL-3.0** (file: LICENSE.txt) | TypeScript, npm `chessops` | Independent TS reimplementation with semantics matched to scalachess and chessground. Standard chess plus the 7 lichess variants. What lila's browser code uses. |
| python-chess — github.com/niklasf/python-chess | **GPL-3.0+** (file) | Python, pip `chess` | Rules, PGN, Polyglot books, Syzygy/Gaviota probing, UCI engine driver. Same author as chessops. |
| dartchess — github.com/lichess-org/dartchess | **GPL-3.0** (file) | Dart | Only if a Flutter client is ever wanted. |
| chess.js — github.com/jhlywa/chess.js | **BSD-2-Clause** (file) | TS, npm | Permissive alternative to chessops. Not lichess-derived; CLAUDE.md says rules come from the lichess-derived library, so this is only relevant if the user relaxes that. |
| Fairy-Stockfish ffish.js / pyffish | **GPL-3.0** (file: Copying.txt) | wasm binding / pip | Variant rules for 100+ variants; a linked-in binding, so GPL applies to the linking program. Out of scope unless exotic variants are wanted. |

Key fact: "the lichess rules library" is really two independently maintained engines,
scalachess (Scala, MIT) and chessops (TypeScript, GPL). They share semantics, not code. The
stack choice picks which one, and the choice must be recorded.

### 1.2 Board UI and game display

| Project | License | Consumption | Notes |
|---|---|---|---|
| chessground — github.com/lichess-org/chessground | **GPL-3.0** (file) | npm `@lichess-org/chessground` | Lichess's board. Zero rules logic; pair with chessops. |
| pgn-viewer — github.com/lichess-org/pgn-viewer | **GPL-3.0** (file) | npm `@lichess-org/pgn-viewer` | Embeddable PGN browser with variations and comments. Game reviewer, openings trainer. |
| cm-chessboard — github.com/shaack/cm-chessboard | **MIT** code (file); default Staunty pieces are **CC BY-NC-SA 4.0** (page) | ES6, no deps | Permissive board alternative. The non-commercial piece art must be swapped for any commercial use. |
| chess-console — github.com/shaack/chess-console | **MIT** code, CC BY 4.0 sound (file) | ES6 | Playable-game GUI framework on cm-chessboard. |
| lila `ui/` | AGPL-3.0 (file: lila COPYING.md) | not published to npm | Vendor-only. Treat lila as a reference implementation to read, never a dependency. |

### 1.3 Engines and analysis

| Project | License | Consumption | Notes |
|---|---|---|---|
| Stockfish — github.com/official-stockfish/Stockfish | **GPL-3.0** (file: Copying.txt) | native binary over UCI | Separate process over stdin/stdout: no linking, no derivative work. Stockfish 19 released 2026-09-05 (search). |
| stockfish-web — github.com/lichess-org/stockfish-web | **GPL-3.0** (file) | npm `@lichess-org/stockfish-web` | Lichess's current browser build; also runs under Node via `tools/wasm-cli.ts` (page). Successor to stockfish.wasm. |
| stockfish.wasm — github.com/lichess-org/stockfish.wasm | GPL-3.0 (page; **no license file found on master**) | npm `stockfish.wasm` | Maintenance mode. Prefer stockfish-web. |
| stockfish.js — github.com/lichess-org/stockfish.js and github.com/nmrugg/stockfish.js | **GPL-3.0** (file, both) | JS/wasm bundles | nmrugg's build ships single-threaded variants that need no COOP/COEP headers. |
| external-engine — github.com/lichess-org/external-engine | **GPL-3.0** (file) | reference | How lichess lets a local engine analyse on lichess.org. Design reference only. |
| lc0 — github.com/LeelaChessZero/lc0 | **GPL-3.0** (file: COPYING) + GPL §7 permission for NVIDIA libraries, stated in README (file) | binary over UCI + `.pb.gz` weights | GPU strongly recommended. Network weights are distributed separately; their terms not audited. |
| Maia (maia-chess) — github.com/CSSLab/maia-chess | **GPL-3.0** (file); README says "GPL" for the software, weights not separately addressed | lc0 weights, 9 nets at 1100–1900 step 100 (README) | Human-like move prediction per rating. Directly relevant to the bot-rating test. Runs through lc0. |
| maia2 — github.com/CSSLab/maia2 | **MIT** (file) | Python model, rating as input | Continuous rating parameter instead of buckets. |
| maia3 — github.com/CSSLab/maia3 | **AGPL-3.0** (file) | newest generation | AGPL: network-service trigger applies if modified and hosted. |
| Fairy-Stockfish | **GPL-3.0** (file) | binary over UCI | Variants only. |
| Syzygy generator — github.com/syzygy1/tb | GPLv2 code (page); **no license file found**; data files stated copyright-free (page) | data | Data files are what matter. |
| Fathom — github.com/jdart1/Fathom | **MIT** (file) | C probing library | Embeddable tablebase probing. |
| lila-tablebase — github.com/lichess-org/lila-tablebase | **AGPL-3.0** (file: COPYING) | Rust HTTP service | Run unmodified, or call lichess's public tablebase endpoint. Endgames intro. |
| lila-openingexplorer — github.com/lichess-org/lila-openingexplorer | **AGPL-3.0** (file) | Rust HTTP service, NDJSON | Self-hostable given PGN imports, or use the public API. Openings builder, heuristic finder. |
| fishnet — github.com/lichess-org/fishnet | **GPL-3.0** (file: LICENSE.txt) | Rust binary | Wired to lichess's own job queue. Reference only. |
| fishtest — github.com/official-stockfish/fishtest | **no license file found** | methodology | SPRT/GSPRT sequential testing is the methodology to borrow for bot-rating calibration; the code is Stockfish-patch-specific. |

Stockfish strength options, read from `src/engine.cpp` and `src/search.h` on master (file):
`Skill Level` spin 0–20 default 20; `UCI_LimitStrength` check default false; `UCI_Elo` spin
1320–3190 default 1320. Skill maps Elo linearly onto the skill scale. The engine's Elo scale is
calibrated to engine rating lists, not to human lichess/FIDE ratings; no source in this survey
gives a measured human-rating calibration. That is exactly the V2 played-out verification the
bot-rating subproject will need.

UCI wrappers: python-chess `chess.engine` (Python, GPL); `@echecs/uci` (TS, **MIT** file,
2025, adoption unknown); `node-uci` (**MIT** file, 2016, unmaintained). No maintained JVM UCI
wrapper was found; a Scala/JVM stack would write its own thin process wrapper.

In-browser Stockfish needs, from the hosting server: `Cross-Origin-Opener-Policy: same-origin`
and `Cross-Origin-Embedder-Policy: require-corp` for multithreaded builds (SharedArrayBuffer),
`application/wasm` MIME type, a Worker, and the NNUE file served/cached separately.
Single-threaded builds avoid the headers at a speed cost.

### 1.4 Lichess API and data

| Item | License | Notes |
|---|---|---|
| Lichess public API — lichess.org/api | n/a | Read endpoints (game export, users, puzzles, opening explorer, tablebase) work without OAuth. Rate limits are unpublished: one request at a time, back off 60 s on HTTP 429 (api-tips page; the API docs page itself is JS-rendered and was not read). |
| berserk — github.com/lichess-org/berserk | **GPL-3.0** (file) | Official Python client. |
| database.lichess.org games and puzzles | **CC0** (file: page text, "use them for research, commercial purpose, publication, anything you like") | Broadcast games are **CC BY-SA 4.0** (same page). Puzzle CSV columns: PuzzleId, FEN, Moves, Rating, RatingDeviation, Popularity, NbPlays, Themes, GameUrl, OpeningTags, DailyDate. FEN is the position before the opponent's first move; Moves starts with that move. |
| lichess-org/database repo (tooling) | **AGPL-3.0** (file) | The export tooling, not the data. |
| chess-openings — github.com/lichess-org/chess-openings | **CC0** (file: README, "As a collection of facts, this data set is in the public domain") | ECO code, name, PGN, plus uci/epd in `dist/`. Drop-in. |
| Lichess Elite Database — database.nikonoel.fr | **not verified** | Third-party curated re-export of lichess games. Confirm terms before bundling. |
| Polyglot `.bin` books | format unlicensed; each book's provenance matters | python-chess reads them natively. |

### 1.5 Trainer and tool projects (mostly design references)

| Project | License | Stack | Reuse shape |
|---|---|---|---|
| chessdriller — github.com/gtim/chessdriller | **no license file found**; package.json has no license field | Svelte, Prisma; depends on chess.js and chessground (package.json, file) | Design to mirror only, until the author states a license. Repertoire stored as lichess studies. |
| openingtree — github.com/openingtree/openingtree | **GPL-3.0** (file) | React | Opening tree with win% across sources. Module or reference for the heuristic finder. |
| en-croissant — github.com/franciscoBSalgueiro/en-croissant | **GPL-3.0** (file) | Tauri (Rust) + JS | Desktop GUI with engine analysis, DB import, repertoire SRS. Design reference; rules library not confirmed. |
| Listudy — github.com/niklasf/listudy | **AGPL-3.0** (file) | Go + JS | Leitner-system drilling over PGN. Design to mirror; AGPL if hosted modified. |
| blind.tactics — github.com/mujx/blind.tactics | **AGPL-3.0** (file) | Rust + Node | Blindfold exercise taxonomy. Design to mirror. |
| tabia — github.com/daxaur/tabia | **MIT** (file); vendors GPL Stockfish wasm | static ES modules | Local-first repertoire drill. Note the mixed-license artifact. |
| chess-coach — github.com/qam4/chess-coach | **Apache-2.0** (file) | Python | Engine PV plus board-computed position facts feed an LLM that only narrates. **This is the V3 grounding pattern for the game reviewer.** |
| nguyenthinhhung/chess | not checked | Stockfish + Gemini | Same grounding pattern, independently. Reference only. |
| dechantoine/explainable-chess-engine | not visible | PyTorch | Explanations come from a learned model's own search. Does not meet A1/V3. Anti-pattern. |
| boardgame.io — github.com/boardgameio/boardgame.io | **MIT** (file) | TS | Generic turn-based state and multiplayer transport. Group chess candidate; no chess awareness. |
| Chessmata — github.com/jonradoff/chessmata | **MIT** (file) | React + Go | Very young. MCP-tool exposure pattern is the interesting bit. |
| lichess-bot — github.com/lichess-bot-devs/lichess-bot | **AGPL-3.0** (file) | Python | Bridges a UCI engine to the lichess Bot API. Reference for the bot-rating test if bots ever play on lichess. |
| chessmadra / Chessbook | not verifiable; product went commercial | | Design reference only. |

Spaced repetition: only Listudy names its algorithm (Leitner). No surveyed trainer was
confirmed to use SM-2 or FSRS.

## 2. Chessitout: needs the user's confirmation

The only "Chessitout" found is chessitout.com, announced by its developer on the lichess forum.
Its loop is Analyze → Vote on who is better → optionally play the position out against an
engine or player. No public repository was found. That mechanic is closer to the "who is
better after N moves" opening game than to a mid-game drill. The subproject list calls it "a
Chessitout variant for training mid-games"; what the variant keeps and changes is unknown.

## 3. Gaps the survey could not close

- No existing open-source "play an engine at human rating N" service; the bot-rating test
  will compose Stockfish `UCI_Elo` / Skill Level and Maia nets itself, and calibrate them.
- No maintained JVM UCI wrapper.
- lichess API rate limits are unpublished.
- Licenses still unverified: chessdriller (none present), fishtest (none present), syzygy1/tb
  (none present), Lichess Elite Database terms, Maia network weights as distinct from code,
  lc0 network weights, chess-console-stockfish, nguyenthinhhung/chess.
- The relationship between lichess-org/stockfish.js and stockfish-web was not resolved.

## 4. What this means for the stack decision (facts, then one recommendation)

Facts:
- The directly consumable lichess code is TypeScript: chessops, chessground, pgn-viewer,
  stockfish-web. All GPL-3.0. Lila's own Scala server code is AGPL and not separable.
- scalachess is MIT but JVM-only, and there is no JVM engine wrapper or board to go with it.
- Python has the richest data and engine plumbing (python-chess, berserk, chess-coach), all
  GPL or Apache.
- The two services worth self-hosting (opening explorer, tablebase) are Rust and AGPL; both
  also have public lichess endpoints.
- Any stack that links chessops or chessground makes the combined program GPL-3.0. That is
  compatible with releasing human-chess as GPL-3.0 or AGPL-3.0. Only a permissive human-chess
  license is ruled out, and only if those libraries are used.

Recommendation (coordinator's, for the user to accept or reject): TypeScript end to end.
chessops for rules, chessground for the board, pgn-viewer for game display, stockfish-web in
the browser, and a Stockfish binary over UCI on the server for batch analysis and bots. Python
with python-chess only as an offline data-mining sidecar if needed. Consequence: human-chess
would be GPL-3.0 or AGPL-3.0. This is the path with the most reusable code and the fewest
bridges; it is not the "Scala like lila" path, because lila's Scala is the one part of the
stack nothing reusable comes from.

## 5. Corrections to the 2026-09-15 class-practice document

- Card L2 states lila, chessground and scalachess are AGPLv3. Verified from the license files:
  lila is AGPL-3.0, chessground is GPL-3.0, scalachess is MIT.
