# Reload survival: every screen resumes where it was

User direction 2026-09-18: a page reload must land the user exactly where they were, in every
tool. Motivation: the app is now used from a phone (https://nkohen.github.io/human-chess/),
and iOS Safari reloads a background tab whenever the user returns to it. The hash route already
survives; the state inside a tool did not. Survey of what each tool held only in memory:
the coordinator's 2026-09-18 state survey, summarised per tool below.

## The rule

Every piece of user-facing progress lives in `usePersistedState` (packages/ui, `persisted.ts`)
or in one of the tool's existing guarded-localStorage helpers. "User-facing progress" is: the
phase or screen the user is on, the thing being worked on (game, puzzle, lesson, opening,
position), the moves played, the cursor (selected ply, tree path, expanded nodes), scores and
tallies, and the settings chosen for the current round. Not persisted: transient loading/error
flags, engine work that is cheap to recompute, and measurements.

## Mechanics

- **Keys**: `human-chess.<tool>.<name>.v1`; bump the version when the shape changes. One
  snapshot object per screen is preferred over many small keys, so a partial write can never
  leave the screen inconsistent. Keep existing keys as they are.
- **Seed in the initialiser, not an effect.** Several components reset state during render when
  a sentinel changes (BuilderView, DrillView, GamesTreeView, MoveTree, AnalysisBoard) and three
  are remounted by `key={hash}` (VisualizationTrainer, BotRatingTest, GameReviewer). A restore
  done in an effect is wiped on the first render. `usePersistedState` reads synchronously.
- **Validate everything** with the `parse` callback: reject any shape that is not current.
  Positions are stored as start FEN plus UCI move list and rebuilt through `@human-chess/rules`
  or the package's own replay helper (`resumeGame` in packages/play, `startSolve` + replay in
  puzzles, `startReconstruction` + replay in memory-trainer, `startGame` + `move`/`call` in
  hand-and-brain). A replay that throws rejects the whole snapshot and the screen starts fresh.
  Never half-restore.
- **Engine games**: `useEngineGame` takes `initialMoves` (read once at mount) and `restart`
  accepts `moves`; the engine effect then continues by itself (thinks if it is the opponent's
  turn, waits otherwise). Opponents are rebuilt from their number (`limitedStrength(elo)`).
- **Hand-offs**: a receiving screen uses `consumeHandoffParams()` (packages/ui) in its state
  initialiser. A fresh hand-off wins over the persisted snapshot and is removed from the URL, so
  the next reload restores the snapshot instead of replaying the hand-off.
- **Random choices** are made once and stored (lesson colour roll, random start positions,
  memorize position picks, recipe picks, random colour). A reload never re-rolls.
- **Expensive or non-reproducible engine output is stored** (chessitout mined position,
  guess-the-eval recipe positions, the game-reviewer's whole review). Cheap output is
  recomputed (MultiPV panel, opening-training-game verdict, endgames starting eval).
- **Fetched content is stored, never re-fetched on reload** (memory-trainer's game, the current
  puzzle). "Latest game" and "next puzzle" would return something else.
- **Clocks** persist an absolute `endAt`/`startAt` (`Date.now()`); on reload a clock that
  expired while the tab was away is treated as expired, honestly, not restarted.
- **Finished states stay visible**: a finished game or a summary screen is part of where the
  user was. The snapshot is replaced when the user starts the next game/round, not cleared at
  the end.
- **Tests**: each tool gets a unit test for its snapshot parse (round trip, rejection of stale
  shapes) and a jsdom render test (`// @vitest-environment jsdom`, Testing Library) that seeds
  localStorage, mounts the screen with a stub engine or none, and asserts the restored state.
  Nothing may contact lichess.org or api.chess.com.

## Per tool (from the survey)

| Tool | Snapshot |
|---|---|
| openings-builder | selectedId, mode, severalIds, new-opening draft; BuilderView path (ucis from the opening root); DrillView trail/status/expected; GamesTreeView path; MoveTree expanded/showAll sets |
| bot-rating-test | elo, colorChoice, fenText, boardMode, blindfold, active {elo, playerColor, startFen}, ucis, resigned, whether the finished game was already recorded |
| opening-training-game | movesN, colorChoice, elo (setup); settings {movesN, playerColor, elo}, ucis |
| hand-and-brain | ucis, calledRole |
| chessitout | phase, position (mined or curated id), positionSource, vote, playerColor, viewFrom, elo, tally, judged flag, ucis; finalAnalysis recomputed |
| endgames-intro | lesson id, mode, curated id, showIntro, the rolled startColor, ucis |
| guess-the-eval | screen, mode; Solo: position, phase, guessCp, timedOut, roundIndex, results, endAt; PvP: the same plus turnPlayer, guess1Cp, guess1UsedMs, timedOut1/2; AnalysisBoard seedFen + history |
| visualization-trainer | Lines: startPosition, exercise (ready ucis), answers, revealed, tally, round, sessionDone; Memorize: studySeconds, source, sessionFens, results, phase (already carries endAt/startAt) |
| game-reviewer | screen (the ImportedGame), review result, selectedPly, flipped |
| memory-trainer | screen: the ImportedGame, reconstruction ucis, claimedComplete; flipped, replayIndex |
| puzzles | puzzle (ParsedPuzzle JSON), solve progress (index, everFailed, status, lastMove), idInput, tally |
