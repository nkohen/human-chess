# Bot-rating test — interview notes

Source: user interview, 2026-09-16. One question per turn. References: Stockfish UCI_Elo
1320–3190 and Skill Level 0–20 (engine plus injected error); Maia nets 1100–1900 (human-like);
Chessiverse's documented calibration via anchor bots on lichess; Elometer's confidence
interval. See docs/research/2026-09-15-commercial-landscape.md.

## Goals (mixed, all three wanted)
1. **Collect data for the player**: games to review, games that feed their opening tree.
2. **Practice to the point of challenge**: play bots that push them.
3. **Show which suboptimal opening lines get punished** by an opponent of a high enough
   level, i.e. at what rating a given line stops working.

## Level setting
The user is open to trying different types of bot level setting: engine-plus-error
(UCI_Elo / Skill Level), human-trained (Maia by rating bucket, maia2 continuous), or mixes.
Calibration claims about any bot's rating must be backed by played-out results (V2, recorded
as NEXT in adopted-practices), not by the UCI label alone.

## Starting position
All of: move one; a chosen opening or position; lines from the player's own repertoire. Plus a
**"play from this position" entry point inside the game reviewer** that transitions into the
bot test, to understand a real position from the player's own game by playing it out.

## Level progression
A mix (player-chosen, ladder, adaptive), but the guiding goal is a bot that **challenges the
player without challenging them too much**. The adaptive estimate is the default behaviour
that serves that goal; player choice and ladder are modes on top.

## Output
Mainly **the games themselves** (into the reviewer and the opening tree). Nice to have: a
**"you can beat X rating from this position"** statement. Per A1 and V2 that statement must
come from played-out results against calibrated bots and should carry its uncertainty (few
games means a wide range), not a bare number.

## Ratings and provenance
- Bot games **do not count toward any in-app rating**.
- All collected game data is **tagged by provenance** (bot game, which bot and level, starting
  position source, in-app vs imported) so it can be filtered out wherever it should not count.
  Cross-cutting: provenance tagging applies to every game the app stores; shared layer.

## Status
Interview closed 2026-09-16; the user may add more later.

**User feedback on the first slice (2026-09-16), built the same day:** an interactive board to set
up the start position instead of typing FEN/PGN. Now a "Set up on a board" checkbox shows the
shared `BoardEditor` (packages/board: chessground free mode, spare-piece palette, drag off to
delete) with side-to-move and castling controls; the FEN field stays the source of truth via
`composeFen`/`castlingRightsFor` in packages/rules. No en-passant control yet.

## Open questions (not yet asked)
- Time control.

**Built 2026-09-17 (cross-tool hand-offs, docs/audits/2026-09-17-interview-vs-slices.md §2):**
reads `?fen=...&color=...&blindfold=1` off its own route (`packages/ui/src/handoff.ts`'s
`readHandoffParams(window.location.hash)`) on mount — the game reviewer's "Play from this
position against the engine" and puzzles' "Practice this against the engine" both send `fen`/
`color`; a `Status` line ("Position handed over from another human-chess tool") shows while the
FEN field still holds exactly the handed-off value and disappears the moment the user edits it
(a derived boolean, not separate state). The game never auto-starts — Start is still a deliberate
click. Also built: a **blindfold mode** (`?blindfold=1`, plus a visible "Blindfold (pieces
hidden)" checkbox in settings and again during play so it can be toggled off) — CSS-only, hiding
chessground's own `piece` elements under a `.brt-blindfold` wrapper
(`.brt-blindfold .cg-wrap piece { visibility: hidden }`), no `@human-chess/board` change. Nothing
links to `blindfold=1` yet; it exists for the visualization trainer to use later (row 55 of the
audit doc names that hand-off explicitly), which is why this task was told not to touch
`subprojects/visualization-trainer`. Not built: any hand-off *out* of bot-rating-test (e.g. into
the reviewer) — out of scope for this pass.
