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
//
// Reload survival (docs/design/2026-09-18-reload-survival.md): every field of user-facing
// progress lives in one snapshot object (snapshot.ts's SoloSnapshot), seeded synchronously in the
// usePersistedState initialiser — never in an effect, so a restored 'revealed'/'analysing' phase
// paints on the very first render, not a flash of 'generating'. `error` and `generation` stay
// plain state: transient/loading, not progress (the rule's own words). The clock persists its
// absolute `endAt`; useCountdown honours a restored one that has already passed as an expired
// clock, not a fresh one (see useCountdown.ts).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Board, MoveLine } from '@human-chess/board';
import { EngineError, formatPawns, formatScore, whitePerspective, type UciEngine } from '@human-chess/engine';
import { generateRecipePosition, pickRecipe } from '@human-chess/positions';
import { inCheck, positionFromFen, turn, uciSquares, type SquareName } from '@human-chess/rules';
import { Button, clearPersisted, Field, Page, Status, Toolbar, usePersistedState, Workbench } from '@human-chess/ui';
import { AnalysisBoard } from './AnalysisBoard';
import { Countdown } from './Countdown';
import { EvalScale } from './EvalScale';
import { idleBoard } from './idleBoard';
import { ROUNDS } from './rounds';
import { band, describeBand, grade, MAX_POINTS, points, SLIDER_MAX_CP, SLIDER_MIN_CP } from './scoring';
import { freshSoloSnapshot, GTE_ANALYSIS_BOARD_KEY, GTE_SOLO_KEY, parseSoloSnapshot } from './snapshot';
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

const ANALYSE_DEPTH = 14;

export function SoloRound({ engine, timeLimitSec, onExit }: SoloRoundProps): React.JSX.Element {
  const readyEngine = engine instanceof Error ? undefined : engine;
  const [snap, setSnap] = usePersistedState(GTE_SOLO_KEY, freshSoloSnapshot, { parse: parseSoloSnapshot });
  const { position, phase, guessCp, roundIndex, results, endAt, analysis } = snap;
  const [error, setError] = useState<string | undefined>(undefined);
  const [generation, setGeneration] = useState(0);

  const limitMs = timeLimitSec === undefined ? undefined : timeLimitSec * 1000;

  // Resets everything needed to generate a fresh position for the *current* round (or a retry of
  // it after an engine failure); round bookkeeping (roundIndex, results) is left alone so a retry
  // does not cost the player their progress.
  const startGeneration = useCallback(() => {
    setGeneration(g => g + 1);
    setError(undefined);
    setSnap(s => ({ ...s, position: undefined, analysis: undefined, guessCp: 0, timedOut: false, endAt: undefined, phase: 'generating' }));
  }, [setSnap]);

  const advance = useCallback(() => {
    if (roundIndex + 1 >= ROUNDS) {
      setSnap(s => ({ ...s, phase: 'summary' }));
      return;
    }
    setSnap(s => ({ ...s, roundIndex: s.roundIndex + 1 }));
    startGeneration();
  }, [roundIndex, startGeneration, setSnap]);

  const playAgain = useCallback(() => {
    setSnap(s => ({ ...s, roundIndex: 0, results: [] }));
    startGeneration();
  }, [startGeneration, setSnap]);

  useEffect(() => {
    if (!readyEngine || phase !== 'generating') return;
    let cancelled = false;
    const controller = new AbortController();
    const recipe = pickRecipe();
    generateRecipePosition(readyEngine, recipe, { signal: controller.signal })
      .then(pos => {
        if (cancelled) return;
        setSnap(s => ({ ...s, position: pos, phase: 'guessing', endAt: limitMs !== undefined ? Date.now() + limitMs : undefined }));
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

  // Guarded on `s.phase === 'guessing'` so a second call for the same guess — React StrictMode's
  // deliberate double-invoke of an effect/handler, or a countdown that reports the same already-
  // fired deadline twice — is a no-op rather than re-locking-in (and, for PvP's equivalent,
  // silently overwriting an already-recorded guess).
  const lockIn = useCallback(() => {
    if (!readyEngine || !position) return;
    setSnap(s => (s.phase === 'guessing' ? { ...s, phase: 'evaluating' } : s));
  }, [readyEngine, position, setSnap]);

  const onTimeExpired = useCallback(() => {
    setSnap(s => (s.phase === 'guessing' ? { ...s, timedOut: true, phase: 'evaluating' } : s));
  }, [setSnap]);

  const { remainingMs } = useCountdown(limitMs, phase === 'guessing', onTimeExpired, endAt);

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
          // Leave `phase` at 'evaluating': the top-level `error` guard above already covers this
          // screen, and its "Try again" button resets everything via startGeneration. Bouncing
          // `phase` back to 'guessing' here used to re-arm useCountdown against the same
          // already-expired `endAt` on every render, firing onTimeExpired again and looping
          // straight back into another failed analyse() call. A reload while this error is
          // showing honestly re-analyses (phase is still 'evaluating', `error` itself is
          // transient state that does not survive the reload) rather than silently resolving.
          setError(`The engine failed: ${a.engine} returned no evaluation line for this position`);
          return;
        }
        const sideToMove = turn(positionFromFen(position.fen));
        const truth = whitePerspective(line.score, sideToMove);
        setSnap(s => ({
          ...s,
          analysis: a,
          phase: 'revealed',
          results: [...s.results, { truth, guessCp: s.guessCp, points: points(s.guessCp, truth), timedOut: s.timedOut, recipeDescription: position.description }],
        }));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // Same reasoning as the `!line` branch above: leave `phase` at 'evaluating' rather than
        // bouncing back to 'guessing', so an already-expired countdown never re-arms itself.
        setError(`The engine failed: ${err instanceof Error ? err.message : String(err)}`);
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
    return <AnalysisBoard engine={readyEngine} initialFen={position.fen} title="Guess the eval — analysis" onBack={() => setSnap(s => ({ ...s, phase: 'revealed' }))} />;
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
      <Button
        variant="secondary"
        onClick={() => {
          // A fresh "Analyse this position" click always starts from the untouched, just-revealed
          // position (AnalysisBoard's own `initialFen` doc comment) — even when the fen happens to
          // match what a previous visit to this same round left behind, which AnalysisBoard's own
          // render-time reset (seedFen !== initialFen) would not otherwise catch. A plain reload
          // mid-analysis never runs this handler, so it still restores the in-progress history.
          clearPersisted(GTE_ANALYSIS_BOARD_KEY);
          setSnap(s => ({ ...s, phase: 'analysing' }));
        }}
      >
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
          onChange={e => setSnap(s => ({ ...s, guessCp: Number(e.target.value) }))}
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
