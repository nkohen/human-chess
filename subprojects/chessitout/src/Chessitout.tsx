// Chessitout, solo loop only (the user's own variant is not designed here; see
// memory/subprojects/chessitout-variant.md and memory/subprojects-overview.md's Chessitout
// note): mine an imbalanced position, vote who stands better without seeing the eval, play it
// out as the side you voted for, then see the result and how your vote reads against the real
// mining-time engine eval. Every number shown comes from a real Analysis or a real chessops
// board-state read (A1, V3); nothing here invents a position, a move, or a verdict.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Board } from '@human-chess/board';
import { formatScore, whitePerspective, type Analysis, type UciEngine } from '@human-chess/engine';
import { generateImbalancedPosition, MAX_ABS_EVAL_CP, MIN_ABS_EVAL_CP, type ImbalancedPosition } from '@human-chess/positions';
import {
  currentFen, describeEnd, isInCheck, isPlayersTurn, lastMove, limitedStrength, playerDests, sideToMove,
} from '@human-chess/play';
import { useEngineGame } from '@human-chess/play/react';
import { inCheck, pieceCounts, positionFromFen, turn, uciSquares, START_FEN, type Color, type SquareName } from '@human-chess/rules';
import { describeMaterialDifference } from './material';
import { judgeVote, type Vote } from './vote';
import './chessitout.css';

export interface ChessitoutProps {
  /** A ready (initialised) engine, or undefined while it loads; or an Error when it could not load. */
  engine: UciEngine | Error | undefined;
}

type Phase = 'mining' | 'voting' | 'playing' | 'result';

const FINAL_ANALYSE_DEPTH = 20;
const DEFAULT_ELO = 1800;
const ELO_OPTIONS = [1320, 1500, 1800, 2100, 2400, 2700, 3000];

export function Chessitout({ engine }: ChessitoutProps): React.JSX.Element {
  const readyEngine = engine instanceof Error ? undefined : engine;

  const [generation, setGeneration] = useState(0);
  const [phase, setPhase] = useState<Phase>('mining');
  const [position, setPosition] = useState<ImbalancedPosition | undefined>(undefined);
  const [miningError, setMiningError] = useState<string | undefined>(undefined);
  const [miningProgress, setMiningProgress] = useState<{ attempt: number; maxAttempts: number } | undefined>(undefined);
  const [vote, setVote] = useState<Vote | undefined>(undefined);
  const [playerColor, setPlayerColor] = useState<Color | undefined>(undefined);
  // Which side the board is seen from while deciding who stands better; a flip is a viewing aid
  // only and is reset for every new position (user, 2026-09-16).
  const [viewFrom, setViewFrom] = useState<Color>('white');
  const [elo, setElo] = useState(DEFAULT_ELO);
  const [tally, setTally] = useState({ right: 0, wrong: 0 });
  const [finalAnalysis, setFinalAnalysis] = useState<Analysis | undefined>(undefined);
  const [finalAnalysisError, setFinalAnalysisError] = useState<string | undefined>(undefined);
  const judgedGeneration = useRef<number | undefined>(undefined);

  const opponent = useMemo(() => limitedStrength(elo), [elo]);
  const { game, engineState, onPlayerMove, restart, fen, finished } = useEngineGame({
    startFen: position?.fen ?? START_FEN,
    playerColor: playerColor ?? 'white',
    engine: readyEngine,
    opponent,
  });

  const next = useCallback(() => {
    setGeneration(g => g + 1);
    setPhase('mining');
    setPosition(undefined);
    setViewFrom('white');
    setMiningError(undefined);
    setMiningProgress(undefined);
    setVote(undefined);
    setPlayerColor(undefined);
    setFinalAnalysis(undefined);
    setFinalAnalysisError(undefined);
  }, []);

  // Mine a fresh imbalanced position whenever a new attempt starts. Mining now searches deeper
  // (up to depth 18, up to MAX_ATTEMPTS) and can take a while, so progress is reported via
  // onProgress; an abandoned attempt (unmount, or `next`/a new generation firing this effect's
  // cleanup) both flips `cancelled` and aborts the signal, so the engine stops the abandoned
  // search rather than running it to completion for nothing.
  useEffect(() => {
    if (!readyEngine || phase !== 'mining') return;
    let cancelled = false;
    const controller = new AbortController();
    setMiningProgress(undefined);
    generateImbalancedPosition(readyEngine, {
      signal: controller.signal,
      onProgress: (attempt, maxAttempts) => {
        if (cancelled) return;
        setMiningProgress({ attempt, maxAttempts });
      },
    })
      .then(pos => {
        if (cancelled) return;
        setPosition(pos);
        setPhase('voting');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setMiningError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
      controller.abort();
      // The signal is only checked between engine calls; stop() cuts short the search that is
      // in flight so the next engine job (here or in another subproject) is not queued behind
      // an abandoned depth-18 confirm (reviewer, 2026-09-17; same shape as GuessTheEval).
      readyEngine.stop();
    };
  }, [readyEngine, phase, generation]);

  // Both handlers below call restart(...) synchronously, in the same event-handler batch as the
  // setPhase('playing')/setPlayerColor calls, rather than in a separate effect keyed on `phase`.
  // An effect would run one render after phase becomes 'playing', so that render would still
  // show the previous, already-finished attempt (game.end set) — and the `finished` effect below
  // would see that stale `finished` and jump straight back to 'result', skipping the new game
  // entirely on a second and later attempt. Calling restart here means the very render where
  // phase first becomes 'playing' already has the fresh game.
  const onVote = useCallback(
    (v: Vote) => {
      if (!position) return;
      setVote(v);
      setPlayerColor(v);
      setPhase('playing');
      restart({ startFen: position.fen, playerColor: v });
    },
    [position, restart],
  );

  // The only way out of 'playing' is the game itself ending (this effect) or the player clicking
  // "Stop and evaluate" (onStop, below) — there is no ply cap any more. Both are guarded so
  // stopping cannot fire twice or after the game has already ended: this effect only fires phase
  // 'playing' -> 'result' once, on the render where `finished` first becomes true, and onStop
  // only acts while phase is still 'playing' and the game is not `finished`.
  useEffect(() => {
    if (phase === 'playing' && finished) setPhase('result');
  }, [phase, finished]);

  const onStop = useCallback(() => {
    if (phase !== 'playing' || finished) return;
    setPhase('result');
  }, [phase, finished]);

  // Once the attempt is over, get the "now" reading of the final position, always from a real
  // engine call (A1) — used as the result headline when the player stopped play with the "Stop
  // and evaluate" button (not a game end), and always shown alongside the mining-time eval for
  // the vote judgment. Skipped
  // when the game itself ended (checkmate/stalemate/etc.): the engine has no move to search for
  // in a position with no legal moves, so it returns no pv line and this would otherwise hang at
  // "evaluating…" forever; describeEnd(game) already says how the game ended in that case.
  useEffect(() => {
    if (phase !== 'result' || !readyEngine || finalAnalysis || finalAnalysisError || game.end) return;
    let cancelled = false;
    readyEngine
      .analyse(currentFen(game), [], { depth: FINAL_ANALYSE_DEPTH })
      .then(a => {
        if (cancelled) return;
        // No pv line is a failure, not a silent no-op (A1) — same convention as
        // subprojects/opening-training-game/src/OpeningTrainingGame.tsx's verdict effect.
        if (!a.lines[0]) {
          setFinalAnalysisError(`${a.engine} returned no evaluation line for this position`);
          return;
        }
        setFinalAnalysis(a);
      })
      .catch((err: unknown) => {
        if (!cancelled) setFinalAnalysisError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
      readyEngine.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, readyEngine, finalAnalysis, finalAnalysisError, generation, game.end]);

  // Judge the vote against the mining-time eval exactly once per attempt (never against the
  // "now" eval, which reflects the moves played rather than the read of the starting position).
  useEffect(() => {
    if (phase !== 'result' || !position || !vote) return;
    if (judgedGeneration.current === generation) return;
    judgedGeneration.current = generation;
    const outcome = judgeVote(vote, position.eval.score);
    setTally(t => (outcome === 'right' ? { ...t, right: t.right + 1 } : { ...t, wrong: t.wrong + 1 }));
  }, [phase, position, vote, generation]);

  if (engine instanceof Error) {
    return (
      <div className="chessitout">
        <p className="ci-status">The engine could not be loaded: {engine.message}</p>
      </div>
    );
  }
  if (!engine) {
    return (
      <div className="chessitout">
        <p className="ci-status">Loading the engine…</p>
      </div>
    );
  }

  if (phase === 'mining') {
    return (
      <div className="chessitout">
        <h2>Chessitout</h2>
        {miningError ? (
          <>
            <p className="ci-status">The engine failed while mining a position: {miningError}</p>
            <button onClick={next}>Try again</button>
          </>
        ) : (
          <>
            <p className="ci-status">
              {miningProgress
                ? `Mining a position… (attempt ${miningProgress.attempt} of ${miningProgress.maxAttempts})`
                : 'Mining a position…'}
            </p>
            <p className="ci-mining-note">
              Looking for a middlegame where one side is {MIN_ABS_EVAL_CP / 100} to {MAX_ABS_EVAL_CP / 100} pawns better according to the engine.
            </p>
          </>
        )}
      </div>
    );
  }

  if (!position) {
    // Should not happen once phase leaves 'mining', but keeps the render exhaustive and typed.
    return (
      <div className="chessitout">
        <p className="ci-status">Mining a position…</p>
      </div>
    );
  }

  if (phase === 'voting') {
    const pos = positionFromFen(position.fen);
    // position.moves is the real self-play move list mined to reach this position (A1); the
    // last entry is the move that produced position.fen, so this is a real previous move, not
    // an invented one.
    const lastMined = position.moves[position.moves.length - 1];
    const miningLastMove: [SquareName, SquareName] | undefined = lastMined ? uciSquares(lastMined) : undefined;
    return (
      <div className="chessitout">
        <h2>Chessitout</h2>
        <Board
          fen={position.fen}
          orientation={viewFrom}
          turnColor={turn(pos)}
          dests={new Map()}
          movableColor={undefined}
          lastMove={miningLastMove}
          check={inCheck(pos)}
          onMove={() => undefined}
        />
        <div className="ci-view">
          <button className="ci-flip" onClick={() => setViewFrom(c => (c === 'white' ? 'black' : 'white'))}>
            Flip board (seen from {viewFrom === 'white' ? "White's" : "Black's"} side)
          </button>
        </div>
        <p className="ci-turn">{turn(pos) === 'white' ? 'White to move' : 'Black to move'}</p>
        <p className="ci-material">{describeMaterialDifference(pieceCounts(pos))}</p>
        <p className="ci-prompt">Who stands better?</p>
        <div className="ci-vote-buttons">
          <button onClick={() => onVote('white')}>White is better</button>
          <button onClick={() => onVote('black')}>Black is better</button>
        </div>
      </div>
    );
  }

  // phase is 'playing' or 'result' here; playerColor is set on both paths that reach them.
  const moveLines: string[] = [];
  for (let i = 0; i < game.moves.length; i += 2) {
    const white = game.moves[i];
    const black = game.moves[i + 1];
    moveLines.push(black ? `${i / 2 + 1}. ${white!.san}   ${black.san}` : `${i / 2 + 1}. ${white!.san}`);
  }

  const finalPos = phase === 'result' ? positionFromFen(currentFen(game)) : undefined;
  const nowLine = finalAnalysis?.lines[0];
  const nowScore = nowLine && finalPos ? whitePerspective(nowLine.score, turn(finalPos)) : undefined;

  const headline = ((): string | undefined => {
    if (phase !== 'result') return undefined;
    if (game.end) return describeEnd(game);
    // Not a game end, so play only reaches 'result' here because the player clicked "Stop and
    // evaluate" (there is no ply cap any more).
    const fullMoves = Math.ceil(game.moves.length / 2);
    const stoppedText = `You stopped play after ${fullMoves} move${fullMoves === 1 ? '' : 's'}.`;
    if (nowScore) return `${stoppedText} Engine evaluation, White's perspective: ${formatScore(nowScore)}.`;
    if (finalAnalysisError) return `${stoppedText} Could not evaluate the final position: ${finalAnalysisError}`;
    return `${stoppedText} Evaluating the final position…`;
  })();

  const voteOutcome = position && vote ? judgeVote(vote, position.eval.score) : undefined;
  const voteLabel = vote === 'white' ? 'White' : 'Black';
  // The "now" analysis is never run once game.end is set (see the effect above); say so plainly
  // instead of hanging at "evaluating…" forever.
  const nowText = game.end
    ? 'no evaluation: the game is over.'
    : nowScore
      ? `${formatScore(nowScore)} (${finalAnalysis!.engine}, depth ${nowLine!.depth}).`
      : finalAnalysisError
        ? `unavailable — ${finalAnalysisError}`
        : 'evaluating…';

  return (
    <div className="chessitout">
      <h2>Chessitout</h2>
      <div className="ci-elo">
        <label htmlFor="ci-elo-select">Opponent strength (Elo):</label>
        <select
          id="ci-elo-select"
          value={elo}
          disabled={game.moves.length > 0}
          onChange={e => setElo(Number(e.target.value))}
        >
          {ELO_OPTIONS.map(v => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
      </div>
      <Board
        fen={fen}
        orientation={playerColor ?? 'white'}
        turnColor={sideToMove(game)}
        dests={playerDests(game)}
        movableColor={phase === 'playing' && isPlayersTurn(game) ? game.playerColor : undefined}
        lastMove={lastMove(game)}
        check={isInCheck(game)}
        onMove={onPlayerMove}
      />
      <p className="ci-status" aria-live="polite">
        {phase === 'playing' &&
          (engineState.kind === 'failed'
            ? `The engine failed: ${engineState.message}`
            : engineState.kind === 'thinking'
              ? 'Engine is thinking…'
              : `You are playing ${playerColor}. Your move.`)}
      </p>
      {phase === 'playing' && (
        <button className="ci-stop" onClick={onStop} disabled={engineState.kind === 'thinking'}>
          Stop and evaluate
        </button>
      )}
      <ol className="ci-moves">
        {moveLines.length === 0 ? <li>No moves yet.</li> : moveLines.map((line, i) => <li key={i}>{line}</li>)}
      </ol>

      {phase === 'result' && (
        <div className="ci-result">
          <p>{headline}</p>
          <p>
            Your vote: {voteLabel} — {voteOutcome === 'right' ? 'right.' : 'wrong.'}
            <br />
            Engine at mining time: {formatScore(position.eval.score)}{' '}
            <span className="ci-provenance">({position.eval.engine}, depth {position.eval.depth})</span>.
            <br />
            Engine now: {nowText}
          </p>
          <p className="ci-tally">
            Votes: {tally.right} right, {tally.wrong} wrong (of {tally.right + tally.wrong}).
          </p>
          <button onClick={next}>Next position</button>
        </div>
      )}
    </div>
  );
}
