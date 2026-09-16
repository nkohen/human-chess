# human-chess

Chess learning, analysis and training tools plus mini-games, bundled as subprojects: an
endgames-first introduction for beginners, an openings builder and trainer, a memory trainer,
a game reviewer, and more. Rules come from [chessops](https://github.com/niklasf/chessops), the
board from [chessground](https://github.com/lichess-org/chessground), analysis from
[Stockfish](https://stockfishchess.org) (in the browser via
[stockfish.js](https://github.com/nmrugg/stockfish.js)). Nothing shown to a user is ever an
invented evaluation, move or result.

License: AGPL-3.0-or-later (see LICENSE). Bundled third-party code keeps its own license: the
Stockfish wasm build and loader under `apps/web/public/engine` are GPL-3.0 from stockfish.js
19.0.0, unmodified.

```
npx pnpm@10 install
npx pnpm@10 check   # typecheck + tests
npx pnpm@10 dev     # http://localhost:5173
```

Layout and conventions: CLAUDE.md. Design records per subproject: memory/subprojects/.
