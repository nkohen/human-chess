// Chessitout, solo loop only (the user's own variant is not designed here; see
// memory/subprojects/chessitout-variant.md and memory/subprojects-overview.md's Chessitout
// note): mine an imbalanced position, vote who stands better without seeing the eval, play it
// out as the side you voted for, then see the result and how your vote reads against the real
// mining-time engine eval. Every number shown comes from a real Analysis or a real chessops
// board-state read (A1, V3); nothing here invents a position, a move, or a verdict.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Board } from '@human-chess/board';
import { formatScore, whitePerspective, type Analysis, type UciEngine } from '@human-chess/engine';
import { generateImbalancedPosition, type ImbalancedPosition } from '@human-chess/positions';
import {
  currentFen, describeEnd, isInCheck, isPlayersTurn, lastMove, limitedStrength, playerDests, sideToMove,
} from '@human-chess/play';
import { useEngineGame } from '@human-chess/play/react';
import { inCheck, pieceCounts, positionFromFen, turn, type Color } from '@human-chess/rules';
import { describeMaterialDifference } from './material';
import { judgeVote, type Vote } from './vote';
import './chessitout.css';

export interface ChessitoutProps {
  /** A ready (initialised) engine, or undefined while it loads; or an Error when it could not load. */
  engine: UciEngine | Error | undefined;
}

type Phase = 'mining' | 'voting' | 'choose-side' | 'playing' | 'result';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const MAX_PLIES = 40;
const FINAL_ANALYSE_DEPTH = 16;
const DEFAULT_ELO = 1800;
const ELO_OPTIONS = [1320, 1500, 1800, 2100, 2400, 2700, 3000];

export function Chessitout({ engine }: ChessitoutProps): React.JSX.Element {
  const readyEngine = engine instanceof Error ? undefined : engine;

  const [generation, setGeneration] = useState(0);
  const [phase, setPhase] = useState<Phase>('mining');
  const [position, setPosition] = useState<ImbalancedPosition | undefined>(undefined);
  const [miningError, setMiningError] = useState<string | undefined>(undefined);
  const [vote, setVote] = useState<Vote | undefined>(undefined);
  const [playerColor, setPlayerColor] = useState<Color | undefined>(undefined);
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
    maxPlies: MAX_PLIES,
  });

  const next = useCallback(() => {
    setGeneration(g => g + 1);
    setPhase('mining');
    setPosition(undefined);
    setMiningError(undefined);
    setVote(undefined);
    setPlayerColor(undefined);
    setFinalAnalysis(undefined);
    setFinalAnalysisError(undefined);
  }, []);

  // Mine a fresh imbalanced position whenever a new attempt starts.
  useEffect(() => {
    if (!readyEngine || phase !== 'mining') return;
    let cancelled = false;
    generateImbalancedPosition(readyEngine)
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
    };
  }, [readyEngine, phase, generation]);

  const onVote = useCallback((v: Vote) => {
    setVote(v);
    setPhase(v === 'equal' ? 'choose-side' : 'playing');
    if (v !== 'equal') setPlayerColor(v);
  }, []);

  const onChooseSide = useCallback((color: Color) => {
    setPlayerColor(color);
    setPhase('playing');
  }, []);

  // The game hook's own state is only seeded from its options at mount; start the real attempt
  // explicitly once a position and a player colour are both chosen.
  useEffect(() => {
    if (phase === 'playing' && position && playerColor) {
      restart({ startFen: position.fen, playerColor });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, generation]);

  useEffect(() => {
    if (phase === 'playing' && finished) setPhase('result');
  }, [phase, finished]);

  // Once the attempt is over, get the "now" reading of the final position, always from a real
  // engine call (A1) — used as the result headline when the 40-ply cap (not a game end) is what
  // stopped play, and always shown alongside the mining-time eval for the vote judgment.
  useEffect(() => {
    if (phase !== 'result' || !readyEngine || finalAnalysis || finalAnalysisError) return;
    let cancelled = false;
    readyEngine
      .analyse(currentFen(game), [], { depth: FINAL_ANALYSE_DEPTH })
      .then(a => {
        if (!cancelled) setFinalAnalysis(a);
      })
      .catch((err: unknown) => {
        if (!cancelled) setFinalAnalysisError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, readyEngine, finalAnalysis, finalAnalysisError, generation]);

  // Judge the vote against the mining-time eval exactly once per attempt (never against the
  // "now" eval, which reflects the moves played rather than the read of the starting position).
  useEffect(() => {
    if (phase !== 'result' || !position || !vote) return;
    if (judgedGeneration.current === generation) return;
    judgedGeneration.current = generation;
    const outcome = judgeVote(vote, position.eval.score.value);
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
          <p className="ci-status">Mining a position…</p>
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

  if (phase === 'voting' || phase === 'choose-side') {
    const pos = positionFromFen(position.fen);
    return (
      <div className="chessitout">
        <h2>Chessitout</h2>
        <Board
          fen={position.fen}
          orientation="white"
          turnColor={turn(pos)}
          dests={new Map()}
          movableColor={undefined}
          check={inCheck(pos)}
          onMove={() => undefined}
        />
        <p className="ci-material">{describeMaterialDifference(pieceCounts(pos))}</p>
        {phase === 'voting' ? (
          <>
            <p className="ci-prompt">Who stands better?</p>
            <div className="ci-vote-buttons">
              <button onClick={() => onVote('white')}>White is better</button>
              <button onClick={() => onVote('black')}>Black is better</button>
              <button onClick={() => onVote('equal')}>Equal</button>
            </div>
          </>
        ) : (
          <>
            <p className="ci-prompt">You called it equal. Which side do you want to play?</p>
            <div className="ci-vote-buttons">
              <button onClick={() => onChooseSide('white')}>Play White</button>
              <button onClick={() => onChooseSide('black')}>Play Black</button>
            </div>
          </>
        )}
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
    if (nowScore) return `Play stopped at the ${MAX_PLIES}-ply cap. Engine evaluation, White's perspective: ${formatScore(nowScore)}.`;
    if (finalAnalysisError) return `Play stopped at the ${MAX_PLIES}-ply cap. Could not evaluate the final position: ${finalAnalysisError}`;
    return `Play stopped at the ${MAX_PLIES}-ply cap. Evaluating the final position…`;
  })();

  const voteOutcome = position && vote ? judgeVote(vote, position.eval.score.value) : undefined;
  const voteLabel = vote === 'white' ? 'White' : vote === 'black' ? 'Black' : 'Equal';
  const nowText = nowScore
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
              : `You are playing ${playerColor}.`)}
      </p>
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
