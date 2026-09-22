# Memory trainer — interview notes

Source: user interview, 2026-09-16. One question per turn. Append as answers arrive.

## What is memorized
Your own real game, immediately after you finish it. You reconstruct as much of it as you can
from move one. When no longer confident, you click that you are done.

## Game source
- Priority: **smooth import of the most recent game from a lichess or chess.com account**, no
  copy-paste. The user cites openingtree.com as doing this for both sites. Lichess: public
  games export API without OAuth. Chess.com: its public games archive API (not yet surveyed;
  verify terms and rate limits before relying on it).
- Old games can also be run, lower priority.
- Cross-cutting: game import from both sites is shared with the game reviewer and the openings
  tools; it belongs in the shared layer.

## After "done"
Your reconstruction mistakes are discussed: situationally, what was happening at that point
and why. This discussion must be grounded in engine and board-state facts (A1/V3), with any
free text produced from those facts, never invented (chess-coach pattern).

## Purpose
Pattern recognition, and helping the user build a narrative that explains what is happening
and why. The user's framing: better mental models for why things happen is the fundamental
reframing that takes a beginner to intermediate and on to advanced intermediate.

## Reconstruction mechanics
- You enter **both sides'** moves.
- No immediate feedback on a wrong move. The app accepts it silently and continues from your
  version of the position. Mismatches are revealed only after you click the **"I have no
  idea"** button (this is the "done" button).
- Implication: after a wrong move the reconstructed game diverges from the real one, so the
  comparison has to align your sequence against the real game and find the first divergence
  and any later re-convergence, rather than a per-ply equality check.

## Discussion after "I have no idea"
1. A quick non-interactive replay from the start up to the last correct position.
2. Discuss the first divergence.
3. If the reconstruction rejoined the real game later, go on to the first divergence after that
   rejoin, and so on.

What the discussion is about: the **potential reasoning behind moves**, both the moves that
actually happened and the divergent moves when they are better or equal and would have made as
much or more sense. It is **not** about suggesting best moves. Grounding: "better or equal" is
an engine comparison of the real move against the remembered move (A1); the reasoning text is
built from engine and board facts (V3).

## Relationship to game reviewer
The user pictures this tool as a precursor to, and a potential partial seeder of, a game
review. Shared machinery to expect: game import, per-move engine comparison, "what was
happening here" fact extraction. Decompose that into the shared layer before both exist (A2).

## Discussion form, by whose move it was
- **Your own move**: you are asked to recall your reasoning (free text). The app analyses the
  validity and potential flaws of that reasoning.
- **Opponent's move**: you can only guess the motivation. You give your guess; the app analyses
  it, proposes possible alternative motivations with minimal analysis and potential flaws
  included, and asks you to **choose the option you find most plausible**. The choice is there
  to make the task salient.
- Grounding note: "analyse the validity of the user's reasoning" means checking the user's
  claims against board state and engine output (V3), e.g. "I thought the knight was hanging" is
  checked against attackers/defenders on that square. The LLM narrates; it does not judge on
  its own.

## Feedback pass (2026-09-17)
- Every screen fits the viewport height (488ecf3): board sized from the measured slot, move list
  and divergence write-ups scroll in their own boxes.
- The user reported a perfectly entered game judged wrong at move one. No fetch bug was found
  (newest game by the sites' own ordering; colour detection case-insensitive; comparison by
  chessops position key), so the fix was visibility (ec9734d): a game-identity line above the
  board (site, players, your colour, date, "view game" link) from ImportedGame's new url/playedAt
  fields (57edd60), result withheld until the attempt ends. Also fixed: the live move list paired
  moves by array parity, mislabelling a Black-to-move PGN; it now uses rules' annotateLine.
- "That's the whole game" ends an attempt with a length claim; classifyCompleteAttempt in
  compare.ts judges it from compareReconstruction's segments only (perfect / matched but shorter /
  longer than the game / diverged). Review text counts plies and says so.
- Still unknown from the user: which site they imported from and whether they played Black when
  the wrong-game judgement happened; if it recurs, the identity line now says what was fetched.
- User report 2026-09-17: fetched right after finishing a game, got the *previous* one — a real
  site (a finished game can take a minute or two to be published) and our own client (chess.com's
  archives list and current-month archive are cached 60 s, `SHORT_TTL_MS` in
  `packages/chesscom/src/endpoints.ts`) both lag. Fix: the identity line now says how recent the
  game is — `relativeTime` (new `subprojects/memory-trainer/src/relativeTime.ts`, unit-tested)
  gives "ended 3 minutes ago" (chess.com, whose `playedAt` is the game's END) or "started 3
  minutes ago" (lichess/PGN, whose `playedAt` is the game's START, from PGN UTCDate/UTCTime),
  plus the clock time in parentheses; refreshed once a minute while mounted. The reconstruct
  screen also gets a one-line note (site-fetched games only) explaining the lag (the 60 s cache
  clause is shown for chess.com only — the lichess import has no TTL cache) and a
  "Fetch again" button that discards the reconstruction and re-runs the exact same fetch —
  `fetchLatestGameFrom` was pulled out of `packages/import/src/react.tsx` so ImportScreen's own
  button and this one share the one fetch path rather than duplicating it.
- User report 2026-09-22: fetching the latest lichess game was consistently slow. Cause: lichess's
  bulk export `/api/games/user` opens a filtered archive cursor even for `max=1`. Fix (commit
  2cb1ef9, in `@human-chess/import`): `fetchLatestLichessGameFast` tries lichess's per-user
  point lookup `/api/user/{username}/current-game` first, returning it only when it's a finished,
  standard-variant game with moves (`isFinishedResult` on the PGN Result + a `Variant` check to
  match the bulk path's `perfType` filter), else falls back to the old bulk export; a
  `LichessRateLimited` is rethrown, not retried. `FETCHERS.lichess` in react.tsx points at it, so
  every single-latest lichess fetch (memory trainer, game reviewer, …) gets it; chess.com has no
  equivalent endpoint and keeps the archive fetcher. Plus an opt-in `prefetch` prop on
  ImportScreen (the memory trainer passes it) that starts the fetch on mount for the remembered
  username so lichess's latency overlaps the learner reading the screen — fires once, never in
  PGN mode, no-op without a remembered username (so the screenshot/reload harnesses never hit the
  network). Endpoint semantics were NOT live-probed (no-live-lichess-probing); the finished/
  variant guard + fallback make an unexpected shape safe rather than wrong.

## Status
Interview closed 2026-09-16; the user may add more later.

## Open questions (not yet asked)
- What counts as a divergence when the remembered move is equal in eval: still discussed, as
  the user says, but is it flagged differently from a worse move?
- Any handling for very long games or a limit on how far reconstruction goes?
- User report 2026-09-22: the review ("How you did") screen is now a game-review-style result
  (commit b0d8f1a). It renders the real game as a move line (`ReviewLine`, local, via rules'
  `annotateLine` — kept out of the shared `MoveLine`, which doesn't drive an external board or
  flag plies), flags the ply where recall diverged (amber/attention, since the move shown there
  is the CORRECT one — red is reserved for the move the learner wrongly recalled), and steps the
  board through the WHOLE real game so it remerges to the correct board after a mistake (was:
  replayed only the matched prefix). At each fork it draws two `BoardShape` arrows — green =
  real/correct move, red = recalled move — with a grounded caption; a clickable mistake list
  jumps to each fork. Mistakes anchor at the first ply of each diverged segment (position going
  in equals the real game's, so the recalled move is legal from the real board — both arrows
  valid). No engine/eval: it's a memory-recall diff over compareReconstruction's segments (A1/V3).
  The code-reviewer also caught a latent V3 bug the dynamic check flag exposed — the review board
  AND the game-reviewer's board hardcoded `turnColor="white"` while passing `check={inCheck(...)}`,
  so a Black-in-check position glowed the white king; both now pass the shown position's real turn
  (both boards non-interactive, so safe). New `memory-review` screenshots harness route seeds a
  diverged-attempt snapshot into localStorage (no network) so the screen gets layout/console checks.
