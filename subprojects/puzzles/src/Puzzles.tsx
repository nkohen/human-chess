// Solve lichess tactics puzzles fetched live from the lichess puzzle API. Every position and
// every "right"/"wrong" judgement traces to the puzzle JSON lichess sent — nothing here
// invents a line or a verdict (A1). No player rating is tracked, per the puzzles interview
// (memory/subprojects/puzzles.md): only a session tally.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Board } from '@human-chess/board';
import { inCheck, isPromotionMove, legalDests, turn, type SquareName } from '@human-chess/rules';
import { fetchNextPuzzle, fetchPuzzleById, type ParsedPuzzle } from './puzzle';
import { attemptMove, currentFen, startSolve, type SolveState, type SolveStatus } from './solve';

// No CSS file exists yet for this subproject (apps/web owns subproject stylesheets elsewhere
// in the repo, and this agent does not edit apps/web); kept inline and minimal, same pattern
// as subprojects/hand-and-brain/src/HandAndBrain.tsx.
const styles = {
  root: { display: 'grid', gridTemplateColumns: 'minmax(0, 24rem) 16rem', gap: '1rem', padding: '1rem' },
  play: { maxWidth: '24rem' },
  toMove: { margin: '0.5rem 0 0', fontWeight: 'bold' as const },
  status: { minHeight: '1.5em', fontWeight: 'bold' as const },
  meta: { color: '#666', fontSize: '0.9em' },
  themes: { display: 'flex', gap: '0.4rem', flexWrap: 'wrap' as const, margin: '0.25rem 0' },
  theme: { border: '1px solid #8886', borderRadius: '999px', padding: '0.1rem 0.6rem', fontSize: '0.85em' },
  actions: { display: 'flex', gap: '0.5rem', marginTop: '0.5rem', alignItems: 'center' },
  error: { color: '#b00020' },
  tally: { fontFamily: 'monospace' },
};

const STATUS_TEXT: Record<SolveStatus, string> = {
  thinking: 'Thinking…',
  correct: 'Correct!',
  wrong: 'Wrong — try again.',
  solved: 'Solved!',
  'failed-solved': 'Solved, after a mistake.',
};

const label = (color: string): string => color[0]!.toUpperCase() + color.slice(1);

interface Tally {
  solvedFirstTry: number;
  solvedAfterMistake: number;
  total: number;
}

const EMPTY_TALLY: Tally = { solvedFirstTry: 0, solvedAfterMistake: 0, total: 0 };

export function Puzzles(): React.JSX.Element {
  const [puzzle, setPuzzle] = useState<ParsedPuzzle | undefined>(undefined);
  const [solveState, setSolveState] = useState<SolveState | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [idInput, setIdInput] = useState('');
  const [tally, setTally] = useState<Tally>(EMPTY_TALLY);

  // Guards every in-flight fetch against a later one superseding it (a fast second click, or
  // React StrictMode's double effect invocation in dev): only the request whose id is still
  // current when it resolves is allowed to apply its puzzle or its error.
  const requestId = useRef(0);

  const applyPuzzle = (p: ParsedPuzzle): void => {
    setPuzzle(p);
    setSolveState(startSolve(p.startFen, p.solution));
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

  // Load a first puzzle on mount, same as guess-the-eval auto-generating its first position.
  // loadNext is itself request-id guarded (see above), so StrictMode's mount/unmount/remount in
  // dev fires this twice but only the second, current request ever applies a puzzle or an error.
  useEffect(() => {
    loadNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onMove = (from: SquareName, to: SquareName): void => {
    if (!solveState) return;
    // No promotion picker in this UI. Default to auto-queen, the same convention as
    // hand-and-brain and memory-trainer — except when the puzzle's own solution move for this
    // exact from/to square pair is an underpromotion: the puzzle line is the only accepted
    // answer here (attemptMove compares the full UCI string), so auto-queening in that one case
    // would make the correct move permanently unplayable from this UI rather than merely reading
    // as 'wrong' on a first attempt. Any other from/to (including a genuinely wrong guess) still
    // auto-queens and, if it doesn't match the solution string, correctly reads as 'wrong'.
    const promoting = isPromotionMove(solveState.pos, from, to);
    let promotion = 'q';
    if (promoting) {
      const expected = solveState.solution[solveState.index];
      if (expected && expected.length === 5 && expected.startsWith(`${from}${to}`)) {
        promotion = expected[4]!;
      }
    }
    const uci = promoting ? `${from}${to}${promotion}` : `${from}${to}`;
    let next: SolveState;
    try {
      next = attemptMove(solveState, uci);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return;
    }
    setSolveState(next);
    if (next.status === 'solved' || next.status === 'failed-solved') {
      setTally(t => ({
        solvedFirstTry: t.solvedFirstTry + (next.status === 'solved' ? 1 : 0),
        solvedAfterMistake: t.solvedAfterMistake + (next.status === 'failed-solved' ? 1 : 0),
        total: t.total + 1,
      }));
    }
  };

  const finished = solveState?.status === 'solved' || solveState?.status === 'failed-solved';
  const dests = solveState && !finished ? legalDests(solveState.pos) : new Map<SquareName, SquareName[]>();

  return (
    <div style={styles.root}>
      <main style={styles.play}>
        <h3>Puzzles</h3>

        {puzzle && solveState && (
          <>
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
            />
            <p style={styles.toMove}>{label(puzzle.solverColor)} to move</p>
            <p style={styles.status} aria-live="polite">{STATUS_TEXT[solveState.status]}</p>
            <p style={styles.meta}>
              lichess puzzle rating: {puzzle.rating}
            </p>
            {finished && (
              // Themes name the motif and would give the solution away, so they appear only once solved.
              <div style={styles.themes}>
                {puzzle.themes.map(theme => (
                  <span key={theme} style={styles.theme}>{theme}</span>
                ))}
              </div>
            )}
          </>
        )}

        {loading && <p>Loading a puzzle…</p>}
        {error && <p style={styles.error} role="alert">{error}</p>}

        <div style={styles.actions}>
          <button onClick={loadNext} disabled={loading}>Next puzzle</button>
          <input
            aria-label="Load puzzle by id"
            placeholder="Puzzle id"
            value={idInput}
            onChange={e => setIdInput(e.target.value)}
            disabled={loading}
          />
          <button onClick={loadById} disabled={loading || !idInput.trim()}>Load puzzle by id</button>
        </div>
      </main>

      <aside style={styles.tally}>
        <h4>This session</h4>
        <p>Solved first try: {tally.solvedFirstTry}</p>
        <p>Solved after a mistake: {tally.solvedAfterMistake}</p>
        <p>Total: {tally.total}</p>
      </aside>
    </div>
  );
}
