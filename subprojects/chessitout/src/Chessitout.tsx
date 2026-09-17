// Chessitout, solo loop only (the user's own variant is not designed here; see
// memory/subprojects/chessitout-variant.md and memory/subprojects-overview.md's Chessitout
// note): mine an imbalanced position, vote who stands better without seeing the eval, play it
// out as the side you voted for, then see the result and how your vote reads against the real
// mining-time engine eval. Every number shown comes from a real Analysis or a real chessops
// board-state read (A1, V3); nothing here invents a position, a move, or a verdict.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Board } from '@human-chess/board';
import { formatScore, whitePerspective, type Analysis, type UciEngine } from '@human-chess/engine';
import {
  curatedGameDate, curatedMidgames, curatedOpponent, evaluateCuratedMidgame, generateImbalancedPosition,
  MAX_ABS_EVAL_CP, MIN_ABS_EVAL_CP, type CuratedPosition, type ImbalancedPosition,
} from '@human-chess/positions';
import {
  currentFen, describeEnd, isInCheck, isPlayersTurn, lastMove, limitedStrength, playerDests, sideToMove,
} from '@human-chess/play';
import { useEngineGame } from '@human-chess/play/react';
import { inCheck, pieceCounts, positionFromFen, turn, uciSquares, START_FEN, type Color, type SquareName } from '@human-chess/rules';
import { Button, Field, Panel, SegmentedControl, Status, Toolbar, Workbench } from '@human-chess/ui';
import { pickUnshownCuratedMidgame } from './curatedPick';
import { describeMaterialDifference } from './material';
import { loadPositionSource, savePositionSource, type PositionSource } from './positionSource';
import { judgeVote, type Vote } from './vote';
import './chessitout.css';

/** "From your game vs <opponent> on <site> (<ended date>)." — the one provenance line shown
 * for a curated position; never shows siteEvalShown (A1: only our own engine's number is ever
 * shown as an evaluation). */
function curatedProvenanceText(entry: CuratedPosition): string {
  const opponent = curatedOpponent(entry.game) ?? 'unknown opponent';
  const site = entry.game.site === 'chess.com' ? 'chess.com' : 'lichess';
  const date = curatedGameDate(entry.game);
  return date ? `From your game vs ${opponent} on ${site} (${date}).` : `From your game vs ${opponent} on ${site}.`;
}

function CuratedProvenance({ entry }: { entry: CuratedPosition }): React.JSX.Element {
  return (
    <p className="ci-provenance-line">
      {curatedProvenanceText(entry)}
      {entry.game.url && (
        <>
          {' '}
          <a href={entry.game.url} target="_blank" rel="noreferrer">
            view game
          </a>
        </>
      )}
    </p>
  );
}

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
  const [positionSource, setPositionSource] = useState<PositionSource>(() => loadPositionSource());
  // The curated entry (opponent name, date, url) behind the current `position`, when its source
  // is 'curated-user-game' — undefined for a mined position. Kept separately from `position`
  // because ImbalancedPosition itself carries no game metadata, only the fen/eval/source A1
  // shape shared with the mined path.
  const [curatedEntry, setCuratedEntry] = useState<CuratedPosition | undefined>(undefined);
  // Which curated midgame ids have already come up this session (see curatedPick.ts) — a ref,
  // not state, since nothing renders it and updating it must not retrigger the mining effect.
  const shownCuratedIds = useRef<Set<string>>(new Set());
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
    setCuratedEntry(undefined);
    setViewFrom('white');
    setMiningError(undefined);
    setMiningProgress(undefined);
    setVote(undefined);
    setPlayerColor(undefined);
    setFinalAnalysis(undefined);
    setFinalAnalysisError(undefined);
  }, []);

  const changeSource = useCallback(
    (source: PositionSource) => {
      setPositionSource(source);
      savePositionSource(source);
      next();
    },
    [next],
  );

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
    (async () => {
      if (positionSource === 'mined') {
        const pos = await generateImbalancedPosition(readyEngine, {
          signal: controller.signal,
          onProgress: (attempt, maxAttempts) => {
            if (!cancelled) setMiningProgress({ attempt, maxAttempts });
          },
        });
        if (cancelled) return;
        setPosition(pos);
        setCuratedEntry(undefined);
        setPhase('voting');
      } else {
        // Random, not-yet-shown-this-session pick (curatedPick.ts), then a real depth-18
        // evaluate — never the chess.com-displayed siteEvalShown (A1).
        const { position: picked, shownIds } = pickUnshownCuratedMidgame(curatedMidgames, shownCuratedIds.current);
        const evaluated = await evaluateCuratedMidgame(readyEngine, picked, { signal: controller.signal });
        if (cancelled) return;
        shownCuratedIds.current = shownIds;
        setPosition(evaluated);
        setCuratedEntry(picked);
        setPhase('voting');
      }
    })().catch((err: unknown) => {
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
  }, [readyEngine, phase, generation, positionSource]);

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

  // A non-interactive starting-position board, used while there is no mined/curated position to
  // show yet (engine still loading, engine failed, or mining in flight) so the two-column layout
  // (and its board sizing) stays put across those transient phases instead of jumping in once a
  // real position arrives.
  const idleBoard = (sizePx: number): React.JSX.Element => (
    <Board
      fen={START_FEN}
      orientation="white"
      turnColor="white"
      dests={new Map()}
      movableColor={undefined}
      check={false}
      onMove={() => undefined}
      size={`${sizePx}px`}
    />
  );

  if (engine instanceof Error) {
    return (
      <Workbench title="Chessitout" board={idleBoard} primary={<Status kind="error">The engine could not be loaded: {engine.message}</Status>}>
        {null}
      </Workbench>
    );
  }
  if (!engine) {
    return (
      <Workbench title="Chessitout" board={idleBoard} primary={<Status kind="busy">Loading the engine…</Status>}>
        {null}
      </Workbench>
    );
  }

  // Changing source restarts the attempt (`changeSource` -> `next`), so this control only needs
  // showing before a position is committed to (mining/voting) — mirrors the Elo selector, which
  // is likewise only editable before its choice takes effect (there it disables after the first
  // move rather than hiding).
  const sourceSelector = (
    <Field label="Position source">
      <SegmentedControl<PositionSource>
        ariaLabel="Position source"
        options={[
          { value: 'mined', label: 'Mined by the engine' },
          { value: 'curated', label: 'From your games' },
        ]}
        value={positionSource}
        onChange={changeSource}
      />
    </Field>
  );

  if (phase === 'mining') {
    return (
      <Workbench
        title="Chessitout"
        board={idleBoard}
        primary={
          miningError ? (
            <>
              <Status kind="error">The engine failed to load a position: {miningError}</Status>
              <Button variant="primary" onClick={next}>
                Try again
              </Button>
            </>
          ) : positionSource === 'curated' ? (
            <Status kind="busy">Loading one of your games…</Status>
          ) : (
            <Status kind="busy">
              {miningProgress
                ? `Mining a position… (attempt ${miningProgress.attempt} of ${miningProgress.maxAttempts})`
                : 'Mining a position…'}
            </Status>
          )
        }
      >
        {sourceSelector}
        {!miningError && positionSource === 'mined' && (
          <p className="ci-mining-note">
            Looking for a middlegame where one side is {MIN_ABS_EVAL_CP / 100} to {MAX_ABS_EVAL_CP / 100} pawns better according to the engine.
          </p>
        )}
      </Workbench>
    );
  }

  if (!position) {
    // Should not happen once phase leaves 'mining', but keeps the render exhaustive and typed.
    return (
      <Workbench title="Chessitout" board={idleBoard} primary={<Status kind="busy">Mining a position…</Status>}>
        {null}
      </Workbench>
    );
  }

  if (phase === 'voting') {
    const pos = positionFromFen(position.fen);
    // position.moves is the real self-play move list mined to reach this position (A1); the
    // last entry is the move that produced position.fen, so this is a real previous move, not
    // an invented one.
    const lastMined = position.moves[position.moves.length - 1];
    const miningLastMove: [SquareName, SquareName] | undefined = lastMined ? uciSquares(lastMined) : undefined;
    const votingBoard = (sizePx: number): React.JSX.Element => (
      <Board
        fen={position.fen}
        orientation={viewFrom}
        turnColor={turn(pos)}
        dests={new Map()}
        movableColor={undefined}
        lastMove={miningLastMove}
        check={inCheck(pos)}
        onMove={() => undefined}
        size={`${sizePx}px`}
      />
    );
    return (
      <Workbench
        title="Chessitout"
        board={votingBoard}
        primary={
          <>
            <p className="ci-turn">{turn(pos) === 'white' ? 'White to move' : 'Black to move'}</p>
            <p className="ci-material">{describeMaterialDifference(pieceCounts(pos))}</p>
            <p className="ci-prompt">Who stands better?</p>
            <Toolbar className="ci-vote-buttons">
              <Button onClick={() => onVote('white')}>White is better</Button>
              <Button onClick={() => onVote('black')}>Black is better</Button>
            </Toolbar>
          </>
        }
        footer={
          <Toolbar>
            <Button variant="quiet" onClick={() => setViewFrom(c => (c === 'white' ? 'black' : 'white'))}>
              Flip board (seen from {viewFrom === 'white' ? "White's" : "Black's"} side)
            </Button>
          </Toolbar>
        }
      >
        {sourceSelector}
        {curatedEntry && <CuratedProvenance entry={curatedEntry} />}
      </Workbench>
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

  const playBoard = (sizePx: number): React.JSX.Element => (
    <Board
      fen={fen}
      orientation={playerColor ?? 'white'}
      turnColor={sideToMove(game)}
      dests={playerDests(game)}
      movableColor={phase === 'playing' && isPlayersTurn(game) ? game.playerColor : undefined}
      lastMove={lastMove(game)}
      check={isInCheck(game)}
      onMove={onPlayerMove}
      size={`${sizePx}px`}
    />
  );

  const primary =
    phase === 'playing' ? (
      <>
        <Status kind={engineState.kind === 'failed' ? 'error' : engineState.kind === 'thinking' ? 'busy' : 'info'}>
          {engineState.kind === 'failed'
            ? `The engine failed: ${engineState.message}`
            : engineState.kind === 'thinking'
              ? 'Engine is thinking…'
              : `You are playing ${playerColor}. Your move.`}
        </Status>
        <Button variant="primary" onClick={onStop} disabled={engineState.kind === 'thinking'}>
          Stop and evaluate
        </Button>
      </>
    ) : (
      <>
        <Button variant="primary" onClick={next}>
          Next position
        </Button>
        {curatedEntry && <CuratedProvenance entry={curatedEntry} />}
        <p>{headline}</p>
        <p>
          Your vote: {voteLabel} — {voteOutcome === 'right' ? 'right.' : 'wrong.'}
          <br />
          {curatedEntry ? 'Engine' : 'Engine at mining time'}: {formatScore(position.eval.score)}{' '}
          <span className="ci-provenance">
            ({position.eval.engine}, depth {position.eval.depth})
          </span>
          .
          <br />
          Engine now: {nowText}
        </p>
      </>
    );

  return (
    <Workbench title="Chessitout" board={playBoard} primary={primary}>
      <Field label="Opponent strength (Elo)" htmlFor="ci-elo-select">
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
      </Field>
      <Panel title="Moves">
        <ol className="ci-moves">
          {moveLines.length === 0 ? <li>No moves yet.</li> : moveLines.map((line, i) => <li key={i}>{line}</li>)}
        </ol>
      </Panel>
      {phase === 'result' && (
        <p className="ci-tally">
          Votes: {tally.right} right, {tally.wrong} wrong (of {tally.right + tally.wrong}).
        </p>
      )}
    </Workbench>
  );
}
