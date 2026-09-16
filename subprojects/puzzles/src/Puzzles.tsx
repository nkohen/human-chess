// Solve lichess tactics puzzles fetched live from the lichess puzzle API. Every position and
// every "right"/"wrong" judgement traces to the puzzle JSON lichess sent — nothing here
// invents a line or a verdict (A1). No player rating is tracked, per the puzzles interview
// (memory/subprojects/puzzles.md): only a session tally.
import { useCallback, useEffect, useState } from 'react';
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

  const applyPuzzle = (p: ParsedPuzzle): void => {
    setPuzzle(p);
    setSolveState(startSolve(p.startFen, p.solution));
  };

  const loadNext = useCallback(() => {
    setLoading(true);
    setError(undefined);
    fetchNextPuzzle()
      .then(applyPuzzle)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  const loadById = (): void => {
    const id = idInput.trim();
    if (!id) return;
    setLoading(true);
    setError(undefined);
    fetchPuzzleById(id)
      .then(applyPuzzle)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  };

  // Load a first puzzle on mount, same as guess-the-eval auto-generating its first position.
  useEffect(() => {
    loadNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onMove = (from: SquareName, to: SquareName): void => {
    if (!solveState) return;
    // No promotion picker in this UI; auto-queen, the same convention as hand-and-brain and
    // memory-trainer. attemptMove compares the full UCI string, so an underpromotion solution
    // (rare in practice) simply reads as 'wrong' here rather than being silently accepted.
    const uci = isPromotionMove(solveState.pos, from, to) ? `${from}${to}q` : `${from}${to}`;
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
              turnColor={finished ? puzzle.solverColor : turn(solveState.pos)}
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
            <div style={styles.themes}>
              {puzzle.themes.map(theme => (
                <span key={theme} style={styles.theme}>{theme}</span>
              ))}
            </div>
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
