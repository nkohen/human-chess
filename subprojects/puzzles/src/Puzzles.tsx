// Solve lichess tactics puzzles fetched live from the lichess puzzle API. Every position and
// every "right"/"wrong" judgement traces to the puzzle JSON lichess sent — nothing here
// invents a line or a verdict (A1). No player rating is tracked, per the puzzles interview
// (memory/subprojects/puzzles.md): only a session tally.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Board } from '@human-chess/board';
import { inCheck, legalDests, roleToChar, turn, type Role, type SquareName } from '@human-chess/rules';
import { Button, Field, navigateWithHandoff, Status, Toolbar, usePersistedState, Workbench, type StatusKind } from '@human-chess/ui';
import { fetchNextPuzzle, fetchPuzzleById, type ParsedPuzzle } from './puzzle';
import { attemptMove, currentFen, startSolve, type SolveStatus } from './solve';
import { INITIAL_SNAPSHOT, parsePuzzlesSnapshot, serializePuzzlesSnapshot, STATE_KEY, type PuzzlesSnapshot } from './storage';
import './puzzles.css';

const STATUS_TEXT: Record<SolveStatus, string> = {
  thinking: 'Thinking…',
  correct: 'Correct!',
  wrong: 'Wrong — try again.',
  solved: 'Solved!',
  'failed-solved': 'Solved, after a mistake.',
};

// Presentational only (icon/colour) — the text above is the only actual verdict (A1); this just
// picks which Status glyph/colour carries it.
const STATUS_KIND: Record<SolveStatus, StatusKind> = {
  thinking: 'info',
  correct: 'success',
  wrong: 'error',
  solved: 'success',
  'failed-solved': 'success',
};

const label = (color: string): string => color[0]!.toUpperCase() + color.slice(1);

export function Puzzles(): React.JSX.Element {
  // The whole screen — the fetched puzzle (never re-fetched on reload: "next" would hand back a
  // different one), solve progress, the puzzle-id field, and the session tally — survives a
  // reload as one snapshot (docs/design/2026-09-18-reload-survival.md). `parse` replays the
  // stored solve index through solve.ts's `replaySolve` to rebuild the live position; a replay
  // that throws rejects the snapshot.
  const [snapshot, setSnapshot] = usePersistedState<PuzzlesSnapshot>(STATE_KEY, INITIAL_SNAPSHOT, {
    parse: parsePuzzlesSnapshot,
    serialize: serializePuzzlesSnapshot,
  });
  const { puzzle, solve: solveState, idInput, tally } = snapshot;
  const setIdInput = (value: string): void => setSnapshot(s => ({ ...s, idInput: value }));

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  // Guards every in-flight fetch against a later one superseding it (a fast second click, or
  // React StrictMode's double effect invocation in dev): only the request whose id is still
  // current when it resolves is allowed to apply its puzzle or its error.
  const requestId = useRef(0);

  const applyPuzzle = (p: ParsedPuzzle): void => {
    setSnapshot(s => ({ ...s, puzzle: p, solve: startSolve(p.startFen, p.solution) }));
  };

  const loadNext = useCallback(() => {
    const id = ++requestId.current;
    setLoading(true);
    setError(undefined);
    fetchNextPuzzle()
      .then(p => {
        if (requestId.current === id) applyPuzzle(p);
      })
      .catch((err: unknown) => {
        if (requestId.current === id) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (requestId.current === id) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadById = (): void => {
    const id = idInput.trim();
    if (!id) return;
    const requestNo = ++requestId.current;
    setLoading(true);
    setError(undefined);
    fetchPuzzleById(id)
      .then(p => {
        if (requestId.current === requestNo) applyPuzzle(p);
      })
      .catch((err: unknown) => {
        if (requestId.current === requestNo) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (requestId.current === requestNo) setLoading(false);
      });
  };

  // Load a first puzzle on mount, same as guess-the-eval auto-generating its first position — but
  // only when no puzzle survived a reload (hadRestoredPuzzleRef, seeded once from the snapshot
  // read on mount): otherwise the restored puzzle would be discarded for an unrelated new one.
  // loadNext is itself request-id guarded (see above), so StrictMode's mount/unmount/remount in
  // dev fires this twice but only the second, current request ever applies a puzzle or an error.
  const hadRestoredPuzzleRef = useRef(puzzle !== undefined);
  useEffect(() => {
    if (hadRestoredPuzzleRef.current) return;
    loadNext();
  }, [loadNext]);

  const onMove = (from: SquareName, to: SquareName, promotion?: Role): void => {
    if (!solveState) return;
    // The board's own picker now supplies the promotion (including an underpromotion, when
    // that's the puzzle's solution — see solve.ts). attemptMove still compares the full UCI
    // string, so whichever piece the solver picked either matches the solution or reads 'wrong'.
    const uci = promotion ? `${from}${to}${roleToChar(promotion)}` : `${from}${to}`;
    try {
      const next = attemptMove(solveState, uci);
      const solvedNow = next.status === 'solved' || next.status === 'failed-solved';
      setSnapshot(s => ({
        ...s,
        solve: next,
        tally: solvedNow
          ? {
              solvedFirstTry: s.tally.solvedFirstTry + (next.status === 'solved' ? 1 : 0),
              solvedAfterMistake: s.tally.solvedAfterMistake + (next.status === 'failed-solved' ? 1 : 0),
              total: s.tally.total + 1,
            }
          : s.tally,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const finished = solveState?.status === 'solved' || solveState?.status === 'failed-solved';
  const dests = solveState && !finished ? legalDests(solveState.pos) : new Map<SquareName, SquareName[]>();

  // The live prompt/feedback line: who's to move and the puzzle's rating, plus (while still
  // solving) the thinking/correct/wrong verdict. Once finished, that verdict moves into
  // `primary` alongside the "Next puzzle" call to action instead of staying here.
  const statusContent = (
    <>
      {puzzle && (
        <p className="puzzles-meta">
          {label(puzzle.solverColor)} to move — lichess puzzle rating: {puzzle.rating}
        </p>
      )}
      {solveState && !finished && <Status kind={STATUS_KIND[solveState.status]}>{STATUS_TEXT[solveState.status]}</Status>}
      {loading && <Status kind="busy">Loading a puzzle…</Status>}
      {error && <Status kind="error">{error}</Status>}
    </>
  );

  // Once solved, the verdict + themes (naming the motif would give the solution away, so they
  // only appear now) + the one forward action — Next puzzle — become the primary block.
  // Hoisted so TypeScript narrows it for the "Review the source game" link below.
  const gameUrl = puzzle?.gameUrl;
  const primaryContent =
    finished && solveState && puzzle ? (
      <div className="puzzles-solved" role="dialog">
        <Status kind={STATUS_KIND[solveState.status]}>{STATUS_TEXT[solveState.status]}</Status>
        <div className="puzzles-themes">
          {puzzle.themes.map(theme => (
            <span key={theme} className="puzzles-theme">
              {theme}
            </span>
          ))}
        </div>
        <Button variant="primary" onClick={loadNext} disabled={loading}>
          Next puzzle
        </Button>
        {/* Cross-references to the other tools (memory/subprojects/puzzles.md "What is
            different from lichess puzzles"), once the puzzle is settled either way — solved or
            revealed by failing. All three carry the puzzle's own starting position (before the
            first solution move) and the solver's own side; "opening tags" from that same memory
            note are not shown because the live puzzle API this subproject uses (puzzle.ts) has
            no such field — only lichess's bulk CSV dump carries OpeningTags, and this reads the
            live /api/puzzle/{next,daily,id} endpoints instead (first guess, recorded here). */}
        <Toolbar className="puzzles-continue">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigateWithHandoff('#/bot-rating', { fen: puzzle.startFen, color: puzzle.solverColor })}
          >
            Practice this against the engine
          </Button>
          {gameUrl !== undefined && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigateWithHandoff('#/review', { gameUrl })}
            >
              Review the source game
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigateWithHandoff('#/visualization', { fen: puzzle.startFen })}
          >
            Memorize this position
          </Button>
        </Toolbar>
      </div>
    ) : undefined;

  // The footer holds only the secondary "skip" action; the puzzle-id lookup is a small form in
  // the panel body, where its field and button have room (in the footer toolbar they wrapped
  // onto three lines).
  const footerContent = !finished ? (
    <Toolbar>
      <Button variant="quiet" onClick={loadNext} disabled={loading}>
        Next puzzle
      </Button>
    </Toolbar>
  ) : undefined;

  return (
    <Workbench
      title="Puzzles"
      status={statusContent}
      primary={primaryContent}
      footer={footerContent}
      board={sizePx =>
        puzzle && solveState ? (
          <Board
            fen={currentFen(solveState)}
            orientation={puzzle.solverColor}
            // Always the real side to move: chessground marks the king of `turnColor` when in
            // check, so after a mating solution the mated king is the one highlighted.
            turnColor={turn(solveState.pos)}
            dests={dests}
            movableColor={finished ? undefined : puzzle.solverColor}
            lastMove={solveState.lastMove}
            check={inCheck(solveState.pos)}
            onMove={onMove}
            size={`${sizePx}px`}
          />
        ) : (
          <div className="puzzles-board-placeholder" style={{ width: sizePx, height: sizePx }} />
        )
      }
    >
      <h3 className="puzzles-section-title">This session</h3>
      <p>Solved first try: {tally.solvedFirstTry}</p>
      <p>Solved after a mistake: {tally.solvedAfterMistake}</p>
      <p>Total: {tally.total}</p>
      <h3 className="puzzles-section-title">A specific puzzle</h3>
      <div className="puzzles-id-row">
        <Field label="Puzzle id" htmlFor="puzzles-id-input" className="puzzles-id-field">
          <input
            id="puzzles-id-input"
            placeholder="Puzzle id"
            value={idInput}
            onChange={e => setIdInput(e.target.value)}
            disabled={loading}
          />
        </Field>
        <Button onClick={loadById} disabled={loading || !idInput.trim()}>
          Load puzzle by id
        </Button>
      </div>
    </Workbench>
  );
}
