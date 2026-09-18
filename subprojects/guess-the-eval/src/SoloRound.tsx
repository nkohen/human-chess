// Solo (PvE) guess-the-eval: a round of ROUNDS positions, each generated from a randomly picked
// "recipe" (packages/positions' recipes.ts) so rounds vary in material and game phase rather
// than always looking like a quiet early middlegame. Per position: guess White's eval on a
// centipawn slider (optionally against a per-position clock, item 1 of the 2026-09-17 PvP/timer
// slice), lock in, then see the real engine evaluation, the top line, and where the guess and
// the answer land on a coloured band scale; scored GeoGuessr-style (scoring.ts's `points`) into
// a running total, with a summary screen and "Play again" after the last position. An optional
// "Analyse this position" button after the reveal opens AnalysisBoard for free play from that
// position (item 3, same slice). Every number shown comes from an Analysis returned by the
// engine, never invented (A1); every engine failure is shown as text, never swallowed.
// Design record: memory/subprojects/guess-the-eval.md. Minimal slice: memory/minimal-slices.md row 2.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Board, MoveLine } from '@human-chess/board';
import { EngineError, formatPawns, formatScore, whitePerspective, type Analysis, type Score, type UciEngine } from '@human-chess/engine';
import { generateRecipePosition, pickRecipe, type RecipePosition } from '@human-chess/positions';
import { inCheck, positionFromFen, turn, uciSquares, type SquareName } from '@human-chess/rules';
import { Button, Field, Page, Status, Toolbar, Workbench } from '@human-chess/ui';
import { AnalysisBoard } from './AnalysisBoard';
import { Countdown } from './Countdown';
import { EvalScale } from './EvalScale';
import { idleBoard } from './idleBoard';
import { ROUNDS } from './rounds';
import { band, describeBand, grade, MAX_POINTS, points, SLIDER_MAX_CP, SLIDER_MIN_CP } from './scoring';
import { useCountdown } from './useCountdown';
import './guess-the-eval.css';

/** Stable so the board does not re-run its update (and would not need to) on every slider tick. */
const EMPTY_DESTS = new Map<SquareName, SquareName[]>();

export interface SoloRoundProps {
  /** A ready (initialised) engine, or undefined while it loads; or an Error when it could not load. */
  engine: UciEngine | Error | undefined;
  /** Seconds per position, or undefined for no clock (the PvE default). */
  timeLimitSec: number | undefined;
  /** Back to the mode/settings screen. */
  onExit: () => void;
}

type Phase = 'generating' | 'guessing' | 'evaluating' | 'revealed' | 'analysing' | 'summary';

interface RoundResult {
  truth: Score;
  guessCp: number;
  points: number;
  /** True when this guess was locked in automatically because the clock ran out, rather than by
   * the player pressing "Lock in" — shown in the reveal, never silently treated the same. */
  timedOut: boolean;
  /** The recipe description shown in the summary list, alongside the reveal (never before it —
   * it can hint at the answer, see describeRecipe). */
  recipeDescription: string;
}

const ANALYSE_DEPTH = 14;

export function SoloRound({ engine, timeLimitSec, onExit }: SoloRoundProps): React.JSX.Element {
  const readyEngine = engine instanceof Error ? undefined : engine;
  const [position, setPosition] = useState<RecipePosition | undefined>(undefined);
  const [phase, setPhase] = useState<Phase>('generating');
  const [error, setError] = useState<string | undefined>(undefined);
  const [guessCp, setGuessCp] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | undefined>(undefined);
  const [roundIndex, setRoundIndex] = useState(0);
  const [results, setResults] = useState<RoundResult[]>([]);
  const [generation, setGeneration] = useState(0);

  // Resets everything needed to generate a fresh position for the *current* round (or a retry of
  // it after an engine failure); round bookkeeping (roundIndex, results) is left alone so a retry
  // does not cost the player their progress.
  const startGeneration = useCallback(() => {
    setGeneration(g => g + 1);
    setPosition(undefined);
    setAnalysis(undefined);
    setError(undefined);
    setGuessCp(0);
    setTimedOut(false);
    setPhase('generating');
  }, []);

  const advance = useCallback(() => {
    if (roundIndex + 1 >= ROUNDS) {
      setPhase('summary');
      return;
    }
    setRoundIndex(r => r + 1);
    startGeneration();
  }, [roundIndex, startGeneration]);

  const playAgain = useCallback(() => {
    setRoundIndex(0);
    setResults([]);
    startGeneration();
  }, [startGeneration]);

  useEffect(() => {
    if (!readyEngine || phase !== 'generating') return;
    let cancelled = false;
    const controller = new AbortController();
    const recipe = pickRecipe();
    generateRecipePosition(readyEngine, recipe, { signal: controller.signal })
      .then(pos => {
        if (cancelled) return;
        setPosition(pos);
        setPhase('guessing');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // An EngineError comes from the engine itself (a real UCI/transport failure); anything
        // else (including a mining-loop exhaustion in packages/positions) is a generation
        // failure, not an engine failure — label them differently so the player isn't told the
        // engine failed when it didn't (A1).
        const message = err instanceof Error ? err.message : String(err);
        const prefix = err instanceof EngineError ? 'The engine failed' : 'Could not generate a position';
        setError(`${prefix}: ${message}`);
      });
    return () => {
      cancelled = true;
      controller.abort();
      readyEngine.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readyEngine, phase, generation]);

  const lockIn = useCallback(() => {
    if (!readyEngine || !position) return;
    setPhase('evaluating');
  }, [readyEngine, position]);

  const onTimeExpired = useCallback(() => {
    setTimedOut(true);
    lockIn();
  }, [lockIn]);

  const limitMs = timeLimitSec === undefined ? undefined : timeLimitSec * 1000;
  const { remainingMs } = useCountdown(limitMs, phase === 'guessing', onTimeExpired);

  // The actual engine call for a locked-in guess, as an effect (not inline in `lockIn`) so that
  // leaving this phase early — the component unmounting, or a future revision that lets the
  // player back out — has a cleanup that stops the superseded search rather than leaving it to
  // finish unobserved.
  useEffect(() => {
    if (!readyEngine || !position || phase !== 'evaluating') return;
    let cancelled = false;
    readyEngine
      .analyse(position.fen, [], { depth: ANALYSE_DEPTH })
      .then(a => {
        if (cancelled) return;
        const line = a.lines[0];
        if (!line) {
          setError(`The engine failed: ${a.engine} returned no evaluation line for this position`);
          setPhase('guessing');
          return;
        }
        setAnalysis(a);
        setPhase('revealed');
        const sideToMove = turn(positionFromFen(position.fen));
        const truth = whitePerspective(line.score, sideToMove);
        setResults(rs => [...rs, { truth, guessCp, points: points(guessCp, truth), timedOut, recipeDescription: position.description }]);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(`The engine failed: ${err instanceof Error ? err.message : String(err)}`);
        setPhase('guessing');
      });
    return () => {
      cancelled = true;
      readyEngine.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readyEngine, position, phase]);

  const pos = useMemo(() => (position ? positionFromFen(position.fen) : undefined), [position]);
  const line = analysis?.lines[0];
  const truth = line && pos ? whitePerspective(line.score, turn(pos)) : undefined;
  const gradeResult = truth ? grade(guessCp, truth) : undefined;

  const settingsFooter = (
    <Toolbar>
      <Button variant="quiet" size="sm" onClick={onExit}>
        Change settings
      </Button>
    </Toolbar>
  );

  if (engine instanceof Error) {
    return (
      <Workbench title="Guess the eval" board={idleBoard} primary={<Status kind="error">The engine could not be loaded: {engine.message}</Status>} footer={settingsFooter}>
        {null}
      </Workbench>
    );
  }
  if (!engine) {
    return (
      <Workbench title="Guess the eval" board={idleBoard} primary={<Status kind="busy">Loading the engine…</Status>} footer={settingsFooter}>
        {null}
      </Workbench>
    );
  }
  if (error) {
    return (
      <Workbench
        title="Guess the eval"
        board={idleBoard}
        primary={
          <>
            <Status kind="error">{error}</Status>
            <Button variant="primary" onClick={startGeneration}>
              Try again
            </Button>
          </>
        }
        footer={settingsFooter}
      >
        {null}
      </Workbench>
    );
  }
  if (phase === 'summary') {
    const total = results.reduce((sum, r) => sum + r.points, 0);
    const maxTotal = ROUNDS * MAX_POINTS;
    return (
      <Page
        title="Guess the eval"
        actions={
          <>
            <Button variant="quiet" onClick={onExit}>
              Change settings
            </Button>
            <Button variant="primary" onClick={playAgain}>
              Play again
            </Button>
          </>
        }
      >
        <div className="gte-bar-row gte-summary-total-row">
          <div className="gte-bar">
            <div className="gte-bar-fill" style={{ width: `${Math.min(100, (total / maxTotal) * 100)}%` }} />
          </div>
          <span className="gte-bar-value">
            {total} / {maxTotal}
          </span>
        </div>
        <ol className="gte-summary-list">
          {results.map((r, i) => (
            <li key={i} className="gte-summary-row" title={r.recipeDescription}>
              <div className="gte-bar-row">
                <div className="gte-bar">
                  <div className="gte-bar-fill" style={{ width: `${Math.min(100, (r.points / MAX_POINTS) * 100)}%` }} />
                </div>
                <span className="gte-bar-value">{r.points}</span>
              </div>
              <div className="gte-bar-row">
                <EvalScale guessCp={r.guessCp} truth={r.truth} compact />
                <span className="gte-summary-row-values">
                  {formatScore(r.truth)} · guess {formatPawns(r.guessCp)}
                  {r.timedOut ? ' · time ran out' : ''}
                </span>
              </div>
            </li>
          ))}
        </ol>
      </Page>
    );
  }
  if (!position || !pos) {
    return (
      <Workbench title="Guess the eval" board={idleBoard} primary={<Status kind="busy">Generating a position…</Status>} footer={settingsFooter}>
        {null}
      </Workbench>
    );
  }

  const roundResult = results[results.length - 1];
  const runningTotal = results.reduce((sum, r) => sum + r.points, 0);
  // position.moves is the real self-play move list mined to reach position.fen (A1); its last
  // entry is the move that produced this position, so this is a real previous move, not one
  // invented for display.
  const lastMinedMove = position.moves[position.moves.length - 1];
  const lastMove: [SquareName, SquareName] | undefined = lastMinedMove ? uciSquares(lastMinedMove) : undefined;

  if (phase === 'analysing') {
    return <AnalysisBoard engine={readyEngine} initialFen={position.fen} title="Guess the eval — analysis" onBack={() => setPhase('revealed')} />;
  }

  const roundBoard = (sizePx: number): React.JSX.Element => (
    <Board
      fen={position.fen}
      orientation="white"
      turnColor={turn(pos)}
      dests={EMPTY_DESTS}
      movableColor={undefined}
      lastMove={lastMove}
      check={inCheck(pos)}
      onMove={() => undefined}
      size={`${sizePx}px`}
    />
  );

  const revealed = phase === 'revealed' && truth && gradeResult && line && roundResult;

  const primary = revealed ? (
    <>
      <Button variant="primary" onClick={advance}>
        {roundIndex + 1 >= ROUNDS ? 'See results' : 'Next position'}
      </Button>
      <Button variant="secondary" onClick={() => setPhase('analysing')}>
        Analyse this position
      </Button>
      <EvalScale guessCp={guessCp} truth={truth} />
    </>
  ) : (
    <>
      <Field label="Your guess, White's perspective" htmlFor="gte-slider" hint={formatPawns(guessCp)}>
        <input
          id="gte-slider"
          type="range"
          min={SLIDER_MIN_CP}
          max={SLIDER_MAX_CP}
          step={10}
          value={guessCp}
          disabled={phase === 'evaluating'}
          onChange={e => setGuessCp(Number(e.target.value))}
        />
      </Field>
      {limitMs !== undefined && phase === 'guessing' && <Countdown remainingMs={remainingMs} limitMs={limitMs} />}
      <Button variant="primary" onClick={lockIn} disabled={phase === 'evaluating'}>
        {phase === 'evaluating' ? 'Evaluating…' : 'Lock in'}
      </Button>
    </>
  );

  return (
    <Workbench title="Guess the eval" board={roundBoard} primary={primary} footer={settingsFooter}>
      <p className="gte-round">
        Position {roundIndex + 1} of {ROUNDS}
      </p>
      <p className="gte-turn">{turn(pos) === 'white' ? 'White to move' : 'Black to move'}</p>
      {!revealed && <p className="gte-source">Position source: engine self-play.</p>}
      {revealed && truth && gradeResult && line && roundResult && (
        <>
          <p className="gte-source">Position source: {position.description}.</p>
          <p>
            Engine evaluation, White's perspective: <strong>{formatScore(truth)}</strong>{' '}
            <span className="gte-provenance">
              ({analysis?.engine}, depth {line.depth})
            </span>
          </p>
          <p>{describeBand(band(truth))}.</p>
          <p>
            Your guess of {formatPawns(guessCp)} was {gradeResult.sameBand ? 'in the same band.' : 'in a different band.'}
            {roundResult.timedOut ? ' Time ran out — this guess was locked in automatically.' : ''}
          </p>
          <p className="gte-score">
            Points this position: {roundResult.points} · Running total: {runningTotal}
          </p>
          <div className="gte-topline">
            Top line: <MoveLine startFen={position.fen} ucis={line.pv} />
          </div>
        </>
      )}
    </Workbench>
  );
}
