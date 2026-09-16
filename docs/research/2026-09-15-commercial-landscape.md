# Landscape: non-open-source chess tools, by human-chess subproject

Date: 2026-09-15. Two researcher subagents surveyed product pages, help centers, and reviews.
This is a product landscape, not a code survey; nothing here is reusable code. Purpose: know
what exists and which mechanics each subproject should be aware of before it is designed.

Verification key: **fetched** = the cited page was read. **search** = search snippets only.
Prices are approximate and mostly from third-party round-ups; treat every figure as unverified.

## By subproject

### Openings builder and trainer
- **Chessable / MoveTrainer** (support.chessable.com, fetched). Custom SRS with 8 fixed levels:
  4h, 1d, 3d, 1w, 2w, 1mo, 3mo, 6mo. Correct advances a level; wrong resets to level 1.
  Scheduled per move, not per line. **Does not handle transpositions**: every line is an
  independent entry (search). Free core, paid courses and PRO tier.
- **Chess Position Trainer** (chesspositiontrainer.com, fetched). Stores a *position* database
  with candidate moves per position, so transpositions are detected automatically. Has a review
  scheduler, a blindfold mode, and engine-assisted min-max over leaf evals. Paid desktop.
- **Chessbook** (formerly chessmadra; site is JS-rendered, search only). Advertises
  transposition handling, repertoire gap-finding, coverage tracking, and reviewing your recent
  lichess or chess.com games against your repertoire to flag deviations. Freemium.
- **Bookup / Chess Openings Wizard** (search). Tests lines by playing mock games against you and
  repeating positions you got wrong; labels moves as trusted at super-GM level or not. Paid.
- **Noctie** (search). Opening practice against the most common *human* replies at your level,
  not engine-best replies.
- Takeaway: the design split is line-based (Chessable) versus position-graph (Chess Position
  Trainer, Chessbook). Only the position-graph model handles transpositions. No product names
  SM-2 or Leitner; all describe custom schedules.

### Chessitout-style mid-game trainer
- **chessitout.com** (fetched): Analyze the position, vote White or Black wins, then play it out
  from your chosen side against the engine. No scoring system visible. Parked per user.

### Endgames-focused introduction for new players
- **ChessKid curriculum** (chesskid.com curriculum page, fetched): Basics, then opening phases,
  tactics, endgame play, positional chess. Not endgame-first. Separate ChessKid articles argue
  king-and-pawn endgames should be taught very early (search).
- **Chess Steps Method / Stappenmethode** (search): six steps from rules to about 1900. Every
  lesson follows a fixed template: introduction, basic exercises, games, extra exercises, tests,
  free play. Rules-first, not endgame-first. Paid workbooks.
- **Aimchess** (search): tracks endgame conversion rate as one of six competencies.
- Takeaway: no surveyed product sequences its main curriculum endgames-first. This subproject
  is a genuine divergence; record it as a deliberate choice when designed.

### Openings heuristic finder
- **Aimchess** (search): batch-analyses a player's games with Stockfish, scores six
  competencies (openings, tactics, middlegame, endgame, time, accuracy), benchmarks against the
  same rating band, surfaces recurring leaks such as opening drop-off points. Freemium.
- **Chess personality quizzes** (chess.com, chessiverse.com; search): archetype to suggested
  openings. Chess.com's is a 20-question quiz; Chessiverse claims game-data-based.
- **Bookup** (search): trusts moves by elite-game statistics.
- Takeaway: nothing found that mines *rules of thumb* from opening data. The heuristic finder
  looks original; the closest neighbours are aggregate-weakness reports.

### Memory trainer
- **Memory Chess** (thememorychess.com, search): show a position, rebuild it from memory, get an
  accuracy score. Free, no account.
- **Chess Memory Trainer** (mobile, search): three tiers: highlighted squares with natural
  positions, no highlights with natural positions, no highlights with up to 25 random pieces.
  Four games: position recall, live-game recall, notation memorisation, play a notation
  sequence in your head then set up the final position. Paid.
- **Noctie** (search): SRS puzzle decks generated from the user's own mistakes.
- **Chess Tempo** (search): premium "repeat until correct" mistake sets.

### Visualization (blindfold) trainer
- **DarkSquares** (darksquares.net, fetched): seven-stage ladder: square colours, coordinates,
  piece-movement tracking, position memory, blindfold puzzles from notation, "limited
  visibility" play with graduated obscuration (faded pieces, disks, hidden), full blindfold
  games. Claims 8 to 12 weeks at 15 minutes a day.
- **Chess.com Vision** (support.chess.com, fetched): three modes (coordinates, moves, combined);
  a square or move is flashed and the user clicks it against the clock; coordinate overlay can
  be turned off.
- **Chess Vision Trainer** (search): spoken exercises answered by voice.
- **Chess Position Trainer** (fetched): blindfold mode as one feature.
- Takeaway: the DarkSquares ladder is the most complete public progression found.

### Bot-rating test ("what rating of bot can you beat")
- **Chess.com bots** (support.chess.com, fetched): Komodo-based personalities in four bands:
  Beginner 250–850, Intermediate 1000–1400, Advanced 1500–2100, Master 2200–2450. Adaptive bots
  vary strength mid-game. No calibration method published. Games unrated.
- **Chessiverse** (chessiverse.com bot-ratings blog, fetched): 1000+ bots from 100 to 3300,
  trained on human games per band. **The only documented calibration**: internal bot-vs-bot
  ladder, four anchor bots played as real lichess accounts against humans to get verified
  lichess blitz ratings, then the ladder rescaled onto that axis. Freemium.
- **Noctie** (search): learned model trained to play like a human at a chosen level, 600 to
  2700+; a free rating-test onboarding game estimates your rating first. Subscription only.
- **ChessBase Fritz "Easy Game"** (help.chessbase.com, fetched): blends deliberately weak moves
  into strong play at named levels; Fritz 18 adapts to your strength. One-time purchase.
- **Elometer** (search): fixed tactical battery, outputs a rating estimate **with a 95%
  confidence interval** (example 1506, range 1271–1740). Free.
- **Chess.com Elo estimate** (search, forum-documented only): inferred after Game Review,
  needs at least one known rating in the PGN as an anchor.
- Takeaway: two bot philosophies, strong engine plus injected mistakes (Chess.com, Fritz,
  Stockfish UCI_Elo) versus models trained on human games (Chessiverse, Noctie, Maia). Only
  Chessiverse documents human calibration. Any rating this subproject shows should carry an
  interval, not a bare number (A1).

### Group plays chess
- **Chess.com Vote Chess** (support.chess.com, fetched): join a side any time, one vote each,
  plurality wins when the window closes, ties to the most recent vote, votes final, optional
  reveal of others' votes before or after voting. Windows run hours to days. Free.
- **Kasparov versus the World** (Wikipedia, search): daily cycle of 12h move, 12h analyst
  recommendations, 18h discussion and vote, 6h validation. Staged deliberation then plurality.
- **Hand and Brain** (search): brain names only a piece type, hand must move a piece of that
  type. Role split instead of a vote.
- **Twitch chat plays** (search): Democracy mode tallies chat-typed moves over a short window
  and plays the plurality legal move; Anarchy mode executes every input. Chat types the move as
  text.
- Takeaway: four mechanics: rolling plurality, staged cycle, role split, live chat tally.

### N-move opening game ("who is better after N moves")
- **ChessVal** (search): 10 positions, true eval clipped to [-10, +10], score per position is
  100 minus the absolute error of a numeric guess. Free.
- **GoudaChess Chess Arcade "Guess the Eval"** (goudachess.com, fetched): Easy mode is binary
  (which side is better), Hard mode is a slider guess of the engine score. Also bundles Guess
  the Elo, Find the Brilliants, Blunder Hunter. Free.
- **GuessTheElo.com** (search): multiple choice among four ratings; Classic fixed rounds,
  Endless with three lives.
- Takeaway: ready-made two-tier scoring, binary side then continuous distance. No product
  frames it as "after exactly N moves of an opening"; that framing is original.

### Game reviewer with plain-language explanations
- **Chess.com Game Review** (support.chess.com, fetched): an Expected Points model turns eval
  plus rating into win probability; moves classified by expected points lost: Best 0, Excellent
  to 0.02, Good to 0.05, Inaccuracy to 0.10, Mistake to 0.20, Blunder above. Brilliant, Great,
  Miss, Book are rule-based overlays. Accuracy derives from the expected-points trajectory.
  Coach text is generated from the classification and position features; the pipeline is not
  published. One free review a day; unlimited on paid tiers.
- **DecodeChess** (decodechess.com FAQ, fetched): proprietary mapping of Stockfish output to
  "human concepts" (threats, plans, piece function) and deduction chains; flags 5 to 10 notable
  positions per game; a game map of advantage swings. Freemium.
- **Dr. Wolf** (search): spoken rationale during play and a post-game replay of your own
  mistakes. Freemium.
- **ChessBase Assisted Analysis** (help.chessbase.com, fetched): colours every legal
  destination square on a five-level scale and previews the punishing reply on hover. Shows
  consequence before commit, no text.
- **Aimchess** (search): aggregate weaknesses over many games rather than one game.
- **Noctie** (search): colour-coded per-move feedback from Excellent to Blunder.
- Takeaway: the expected-points classification is the industry-standard move taxonomy. For the
  plain-language layer, the open-source chess-coach pattern (engine line plus board-computed
  facts, LLM narrates only) is the way to meet V3; none of the commercial products publish how
  they generate text.

### Cross-cutting
- **Cloud engines**: Chessify rents engine compute by the second at high monthly prices
  (search). Human-chess's self-hosted Stockfish is the free substitute.
- **Board scanning**: Chessvision.ai and Chessify turn a photo or PDF diagram into a FEN
  (search). Relevant to any "import a position" entry point.
- **Pricing pattern**: almost everything is freemium with the useful part paywalled, which is
  the gap the project's premise names.

## Products covered

Chessable, Chess.com (Game Review, Coach, bots, Puzzle Rush, Puzzle Battle, Vision, Vote Chess,
personality quiz, Elo estimate), ChessKid, Chess Tempo, Aimchess, Chessbook, Chess Position
Trainer, Bookup / Chess Openings Wizard, Chessify, Magnus Trainer, Dr. Wolf, Noctie,
Chessiverse, DecodeChess, ChessBase / Fritz, Chessvision.ai, DarkSquares, Chess Vision Trainer,
Chess-Blind, Memory Chess, Chess Memory Trainer, Chess Steps Method, GoudaChess Chess Arcade,
ChessVal, GuessTheElo.com, Elometer, chessitout.com, Kasparov versus the World, Hand and
Brain, Twitch chat-plays-chess formats.

## Not read
Chessbook's site (JS shell), the vendors' own pricing pages for Chessify, Chessvision.ai,
Aimchess and ChessBase, GothamChess's Guess the Elo series, Elometer's own site, Chess.com's
Elo-estimate documentation (forum threads only), and lichess's own "guess the evaluation"
training category (open source, out of scope here).
