# Lesson Builder

Requested by the user 2026-09-18. Origin: the user wanted a GUI to build the endgames "curated
beginner's first experience" (a sequence of boards + descriptions) without editing code, then
generalised it to a standalone subproject for authoring lessons of any kind. This reopens the
previously-declined "study authoring" item (see [subprojects-overview](../subprojects-overview.md));
the user's direct request is the new information that reopened it.

## Scope decided with the user (AskUserQuestion, 2026-09-18) — the fullest option on each:
- **Step behaviour:** annotated boards AND interactive move-challenges (a step can require the
  learner to play a correct move before continuing).
- **Output/usage:** lessons save in the browser (survive reload) and play in a built-in preview;
  plus a JSON export/import so a lesson can later be committed into the repo and shipped. The
  deployed site is static, so browser-authored lessons stay in that browser until exported.
- **Annotations:** each step can carry arrows and highlighted squares (chessground's four brushes).

## Architecture
- **Schema/validation:** [packages/lessons](../shared-layer.md) — `Lesson`/`LessonStep`/`LessonShape`/
  `LessonChallenge`, validators, `serializeLesson`/`parseLessonFile`, `composeFen`/`isLegalMoveFrom`/
  `sanOfMove`. Positions are FEN strings rebuilt via `@human-chess/rules`; challenge answers are
  validated as legal moves (playUci), never free-form — A1/V3.
- **Board:** `@human-chess/board` `Board` gained `shapes` + `onShapesChange` (+ `BoardShape`/
  `BoardBrush`). Editor mode seeds editable user shapes and reports drawn ones; player mode renders
  read-only autoShapes. `BoardEditor` (placement palette) + a side-to-move toggle + `composeFen`
  set up a step's position. Board is still the only chessground importer.
- **Subproject:** subprojects/lesson-builder — three views (library, editor, player). Route
  `#/lesson-builder`. Takes an `engine` prop (from apps/web, like Chessitout/openings) used only by
  a play-out step; no network.
- **Play-out step (added 2026-09-18, commit 1563a4e):** a step's learner task can be "play it out
  vs engine" instead of a one-move challenge (mutually exclusive). Learner plays the orientation
  side at an author-set difficulty (full strength or a UCI Elo). Player uses `@human-chess/play`'s
  `useEngineGame` + `maximalResistance`/`limitedStrength`; result/describeEnd come from the engine,
  never fabricated (A1/V3). Moves persist as a UCI list and resume mid-game on reload; Next is never
  gated by a play-out. Schema (`LessonPlayOut`/`LessonStrength`, `parsePlayOut`) lives in
  packages/lessons and stays rules-only — elo range clamping is deferred to @human-chess/play, and
  the `isRecord`/`isFiniteNumber` guards are kept local (importing them from @human-chess/ui would
  drag React+CSS into the schema package — caught in review).
- **Reload survival:** `human-chess.lesson-builder.lessons.v1` (the `Lesson[]` library, parsed with
  `parseLessonList`) and `human-chess.lesson-builder.view.v1` (view + selected lesson id + step
  index), both via `usePersistedState`, seeded in the initialiser and validated on read.

## Shipping an authored lesson to the live site (the "later" half of the export choice)
A lesson exported from the builder is `{version, lesson}` JSON. To make it appear for everyone it
must be committed into the repo and deployed (static site) — a maintainer step, not live editing.
No wiring for a shipped lessons collection exists yet; add it when the user wants a specific
authored lesson to go live (a `lessons.json` fed into a player route is the natural shape).

## Built
2026-09-18: foundation (packages/lessons, board shapes API, subproject scaffold + route) as commit
c6a990b; full editor/player UI built by a worker and gated before merge.
