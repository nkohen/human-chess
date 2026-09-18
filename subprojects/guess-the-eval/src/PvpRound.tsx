// Pass-and-play PvP guess-the-eval (2026-09-17 slice): both players see the same five positions
// (packages/positions' recipes.ts, same generation as SoloRound). Per position: player 1 guesses
// on the slider, a hand-over screen hides that slider from player 2 before their own guess, then
// the reveal shows both guesses and the real engine evaluation on one eval scale with per-player
// points and a running score. There is no rooms/multiplayer layer in this app yet
// (packages/rooms is reserved for one) — this is strictly one device, passed by hand, not two
// screens talking to each other.
//
// PvP is always timed (interview: memory/subprojects/guess-the-eval.md). The interview's
// GeoGuessr rule — "once one player locks in, the other gets a short countdown" — needs
// simultaneous play, which pass-and-play on one device can't do (there's no second screen to
// start counting down on while player 1 is still answering). The stand-in, recorded as a
// decision: player 2's limit is min(shared limit, player 1's real elapsed time + a 10s cushion)
// — see timing.ts's pvpSecondPlayerLimitMs. Analysis is only offered on the results screen (the
// interview: "any position at the end of the match, not mid-match"), reusing AnalysisBoard.
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
import { MAX_POINTS, points, SLIDER_MAX_CP, SLIDER_MIN_CP } from './scoring';
import { pvpSecondPlayerLimitMs, type TimeLimitSec } from './timing';
import { useCountdown } from './useCountdown';
import './guess-the-eval.css';

/** Stable so the board does not re-run its update on every slider tick. */
const EMPTY_DESTS = new Map<SquareName, SquareName[]>();
const ANALYSE_DEPTH = 14;

export interface PvpRoundProps {
  engine: UciEngine | Error | undefined;
  player1: string;
  player2: string;
  /** The shared per-position limit both players' clocks are based on (item 2 of the 2026-09-17
   * slice: PvP is always timed). */
  limitSec: TimeLimitSec;
  /** Back to the mode/settings screen. */
  onExit: () => void;
}

type Phase = 'generating' | 'handover' | 'guessing' | 'evaluating' | 'reveal' | 'results';

interface PvpRoundResult {
  fen: string;
  lastMove: [SquareName, SquareName] | undefined;
  truth: Score;
  guess1Cp: number;
  guess2Cp: number;
  points1: number;
  points2: number;
  timedOut1: boolean;
  timedOut2: boolean;
  recipeDescription: string;
}

export function PvpRound({ engine, player1, player2, limitSec, onExit }: PvpRoundProps): React.JSX.Element {
  const readyEngine = engine instanceof Error ? undefined : engine;
  const [position, setPosition] = useState<RecipePosition | undefined>(undefined);
  const [phase, setPhase] = useState<Phase>('generating');
  const [error, setError] = useState<string | undefined>(undefined);
  const [generation, setGeneration] = useState(0);
  const [roundIndex, setRoundIndex] = useState(0);
  const [results, setResults] = useState<PvpRoundResult[]>([]);
  const [analysingIndex, setAnalysingIndex] = useState<number | undefined>(undefined);

  const [turnPlayer, setTurnPlayer] = useState<1 | 2>(1);
  const [sliderCp, setSliderCp] = useState(0);
  const [guess1Cp, setGuess1Cp] = useState(0);
  const [guess1UsedMs, setGuess1UsedMs] = useState(0);
  const [timedOut1, setTimedOut1] = useState(false);
  const [timedOut2, setTimedOut2] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | undefined>(undefined);

  const activeName = turnPlayer === 1 ? player1 : player2;

  const startGeneration = useCallback(() => {
    setGeneration(g => g + 1);
    setPosition(undefined);
    setAnalysis(undefined);
    setError(undefined);
    setTurnPlayer(1);
    setSliderCp(0);
    setGuess1Cp(0);
    setGuess1UsedMs(0);
    setTimedOut1(false);
    setTimedOut2(false);
    setPhase('generating');
  }, []);

  const advance = useCallback(() => {
    if (roundIndex + 1 >= ROUNDS) {
      setPhase('results');
      return;
    }
    setRoundIndex(r => r + 1);
    startGeneration();
  }, [roundIndex, startGeneration]);

  const playAgain = useCallback(() => {
    setRoundIndex(0);
    setResults([]);
    setAnalysingIndex(undefined);
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
        setPhase('handover');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
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

  const lockInActive = useCallback(
    (usedMs: number, timedOut: boolean) => {
      if (turnPlayer === 1) {
        setGuess1Cp(sliderCp);
        setGuess1UsedMs(usedMs);
        setTimedOut1(timedOut);
        setSliderCp(0);
        setTurnPlayer(2);
        setPhase('handover');
      } else {
        setTimedOut2(timedOut);
        setPhase('evaluating');
      }
    },
    [turnPlayer, sliderCp],
  );

  const activeLimitMs = turnPlayer === 1 ? limitSec * 1000 : pvpSecondPlayerLimitMs(limitSec, guess1UsedMs);
  const onTimeExpired = useCallback(() => lockInActive(activeLimitMs, true), [lockInActive, activeLimitMs]);
  const { remainingMs, elapsedNowMs } = useCountdown(activeLimitMs, phase === 'guessing', onTimeExpired);

  useEffect(() => {
    if (!readyEngine || !position || phase !== 'evaluating') return;
    let cancelled = false;
    // Player 2's guess is read here, at the moment evaluation starts, the same way SoloRound
    // reads its one guess inside its own evaluate effect — `sliderCp` is whatever player 2 last
    // set it to (lockInActive leaves it untouched for player 2, only resetting it after player 1).
    const guess2AtEvaluate = sliderCp;
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
        const sideToMove = turn(positionFromFen(position.fen));
        const truth = whitePerspective(line.score, sideToMove);
        const lastMinedMove = position.moves[position.moves.length - 1];
        setResults(rs => [
          ...rs,
          {
            fen: position.fen,
            lastMove: lastMinedMove ? uciSquares(lastMinedMove) : undefined,
            truth,
            guess1Cp,
            guess2Cp: guess2AtEvaluate,
            points1: points(guess1Cp, truth),
            points2: points(guess2AtEvaluate, truth),
            timedOut1,
            timedOut2,
            recipeDescription: position.description,
          },
        ]);
        setPhase('reveal');
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

  const settingsFooter = (
    <Toolbar>
      <Button variant="quiet" size="sm" onClick={onExit}>
        Change settings
      </Button>
    </Toolbar>
  );

  if (engine instanceof Error) {
    return (
      <Workbench title="Guess the eval — PvP" board={idleBoard} primary={<Status kind="error">The engine could not be loaded: {engine.message}</Status>} footer={settingsFooter}>
        {null}
      </Workbench>
    );
  }
  if (!engine) {
    return (
      <Workbench title="Guess the eval — PvP" board={idleBoard} primary={<Status kind="busy">Loading the engine…</Status>} footer={settingsFooter}>
        {null}
      </Workbench>
    );
  }
  if (error) {
    return (
      <Workbench
        title="Guess the eval — PvP"
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

  if (phase === 'results') {
    const total1 = results.reduce((sum, r) => sum + r.points1, 0);
    const total2 = results.reduce((sum, r) => sum + r.points2, 0);
    const maxTotal = ROUNDS * MAX_POINTS;
    const winnerText = total1 === total2 ? "It's a tie." : `${total1 > total2 ? player1 : player2} wins, ${Math.max(total1, total2)} to ${Math.min(total1, total2)}.`;

    if (analysingIndex !== undefined) {
      const target = results[analysingIndex];
      if (target) {
        return (
          <AnalysisBoard
            engine={readyEngine}
            initialFen={target.fen}
            title={`Guess the eval — analysis (position ${analysingIndex + 1})`}
            onBack={() => setAnalysingIndex(undefined)}
          />
        );
      }
    }

    return (
      <Page
        title="Guess the eval — PvP results"
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
        <p className="gte-pvp-winner">{winnerText}</p>
        <div className="gte-pvp-scores">
          <div className="gte-bar-row">
            <div className="gte-bar">
              <div className="gte-bar-fill" style={{ width: `${Math.min(100, (total1 / maxTotal) * 100)}%` }} />
            </div>
            <span className="gte-bar-value">
              {player1}: {total1}
            </span>
          </div>
          <div className="gte-bar-row">
            <div className="gte-bar">
              <div className="gte-bar-fill gte-bar-fill--p2" style={{ width: `${Math.min(100, (total2 / maxTotal) * 100)}%` }} />
            </div>
            <span className="gte-bar-value">
              {player2}: {total2}
            </span>
          </div>
        </div>
        <ol className="gte-summary-list">
          {results.map((r, i) => (
            <li key={i} className="gte-summary-row" title={r.recipeDescription}>
              <div className="gte-pvp-row-header">
                <span>Position {i + 1}</span>
                <Button variant="secondary" size="sm" onClick={() => setAnalysingIndex(i)}>
                  Analyse
                </Button>
              </div>
              <div className="gte-pvp-scores">
                <div className="gte-bar-row">
                  <div className="gte-bar">
                    <div className="gte-bar-fill" style={{ width: `${Math.min(100, (r.points1 / MAX_POINTS) * 100)}%` }} />
                  </div>
                  <span className="gte-bar-value">
                    {player1}: {r.points1}
                    {r.timedOut1 ? ' (timed out)' : ''}
                  </span>
                </div>
                <div className="gte-bar-row">
                  <div className="gte-bar">
                    <div className="gte-bar-fill gte-bar-fill--p2" style={{ width: `${Math.min(100, (r.points2 / MAX_POINTS) * 100)}%` }} />
                  </div>
                  <span className="gte-bar-value">
                    {player2}: {r.points2}
                    {r.timedOut2 ? ' (timed out)' : ''}
                  </span>
                </div>
              </div>
              <div className="gte-bar-row">
                <EvalScale
                  guessCp={r.guess1Cp}
                  truth={r.truth}
                  guessLabel={player1}
                  secondGuess={{ cp: r.guess2Cp, label: player2 }}
                  compact
                />
                <span className="gte-summary-row-values">{formatScore(r.truth)}</span>
              </div>
            </li>
          ))}
        </ol>
      </Page>
    );
  }

  if (!position || !pos) {
    return (
      <Workbench title="Guess the eval — PvP" board={idleBoard} primary={<Status kind="busy">Generating a position…</Status>} footer={settingsFooter}>
        {null}
      </Workbench>
    );
  }

  if (phase === 'handover') {
    return (
      <Workbench
        title="Guess the eval — PvP"
        board={idleBoard}
        primary={
          <>
            <p className="gte-handover-message">Pass the device to {activeName}.</p>
            <Button variant="primary" onClick={() => setPhase('guessing')}>
              {activeName}, I'm ready
            </Button>
          </>
        }
        footer={settingsFooter}
      >
        <p className="gte-round">
          Position {roundIndex + 1} of {ROUNDS}
        </p>
      </Workbench>
    );
  }

  const lastMinedMove = position.moves[position.moves.length - 1];
  const lastMove: [SquareName, SquareName] | undefined = lastMinedMove ? uciSquares(lastMinedMove) : undefined;

  if (phase === 'reveal') {
    const result = results[results.length - 1];
    if (!result || !analysis) {
      return (
        <Workbench title="Guess the eval — PvP" board={idleBoard} primary={<Status kind="busy">Evaluating…</Status>} footer={settingsFooter}>
          {null}
        </Workbench>
      );
    }
    const line = analysis.lines[0];
    const revealBoard = (sizePx: number): React.JSX.Element => (
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
    const runningTotal1 = results.reduce((sum, r) => sum + r.points1, 0);
    const runningTotal2 = results.reduce((sum, r) => sum + r.points2, 0);
    return (
      <Workbench
        title="Guess the eval — PvP"
        board={revealBoard}
        primary={
          <>
            <Button variant="primary" onClick={advance}>
              {roundIndex + 1 >= ROUNDS ? 'See results' : 'Next position'}
            </Button>
            <EvalScale guessCp={result.guess1Cp} truth={result.truth} guessLabel={player1} secondGuess={{ cp: result.guess2Cp, label: player2 }} />
          </>
        }
        footer={settingsFooter}
      >
        <p className="gte-round">
          Position {roundIndex + 1} of {ROUNDS}
        </p>
        <p className="gte-source">Position source: {position.description}.</p>
        <p>
          Engine evaluation, White's perspective: <strong>{formatScore(result.truth)}</strong>{' '}
          {line && (
            <span className="gte-provenance">
              ({analysis.engine}, depth {line.depth})
            </span>
          )}
        </p>
        <p>
          {player1}: guess {formatPawns(result.guess1Cp)} → {result.points1} points{result.timedOut1 ? ' (time ran out)' : ''}
          <br />
          {player2}: guess {formatPawns(result.guess2Cp)} → {result.points2} points{result.timedOut2 ? ' (time ran out)' : ''}
        </p>
        <p className="gte-score">
          Running total — {player1}: {runningTotal1} · {player2}: {runningTotal2}
        </p>
        {line && (
          <div className="gte-topline">
            Top line: <MoveLine startFen={position.fen} ucis={line.pv} />
          </div>
        )}
      </Workbench>
    );
  }

  // 'guessing' or 'evaluating': the active player's slider (or, mid-evaluation, its disabled
  // last state) over the shared position, exactly one countdown running at a time.
  const guessBoard = (sizePx: number): React.JSX.Element => (
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

  return (
    <Workbench
      title="Guess the eval — PvP"
      board={guessBoard}
      primary={
        <>
          <Field label={`${activeName}'s guess, White's perspective`} htmlFor="gte-pvp-slider" hint={formatPawns(sliderCp)}>
            <input
              id="gte-pvp-slider"
              type="range"
              min={SLIDER_MIN_CP}
              max={SLIDER_MAX_CP}
              step={10}
              value={sliderCp}
              disabled={phase === 'evaluating'}
              onChange={e => setSliderCp(Number(e.target.value))}
            />
          </Field>
          {phase === 'guessing' && <Countdown remainingMs={remainingMs} limitMs={activeLimitMs} />}
          <Button variant="primary" onClick={() => lockInActive(elapsedNowMs(), false)} disabled={phase === 'evaluating'}>
            {phase === 'evaluating' ? 'Evaluating…' : `Lock in ${activeName}'s guess`}
          </Button>
        </>
      }
      footer={settingsFooter}
    >
      <p className="gte-round">
        Position {roundIndex + 1} of {ROUNDS}
      </p>
      <p className="gte-turn">{turn(pos) === 'white' ? 'White to move' : 'Black to move'}</p>
      <p className="gte-source">Position source: engine self-play.</p>
    </Workbench>
  );
}
