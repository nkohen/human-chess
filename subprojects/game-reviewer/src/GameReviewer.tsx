// Game reviewer, standard-review skeleton: import a game, then step move by move through a
// per-move engine eval, cp loss, classification, and the engine's best move. No what-if, no
// narrative report text yet — see memory/subprojects/game-reviewer.md for what this slice
// deliberately leaves out. Every eval and classification comes from @human-chess/review, which
// gets them from a real engine or a rules-verified game end, never invented here (A1).
import { useEffect, useId, useRef, useState } from 'react';
import { Board } from '@human-chess/board';
import { formatScore, type UciEngine } from '@human-chess/engine';
import { ImportScreen } from '@human-chess/import/react';
import type { ImportedGame } from '@human-chess/import';
import {
  ReviewCancelled, reviewGame, type Classification, type EvalOrEnd, type GameReview, type ReviewedMove, type ReviewProgress,
} from '@human-chess/review';
import { inCheck, positionFromFen, uciSquares, type SquareName } from '@human-chess/rules';
import './game-reviewer.css';

export interface GameReviewerProps {
  /** A ready (initialised) engine, or undefined while it loads, or an Error when it could not load. */
  engine: UciEngine | Error | undefined;
}

type Screen = { kind: 'import' } | { kind: 'review'; game: ImportedGame };

const ANALYSE_DEPTH = 20;
const STORAGE_KEY = 'human-chess.game-reviewer.lichess-username';

export function GameReviewer({ engine }: GameReviewerProps): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>({ kind: 'import' });
  const startOver = (): void => setScreen({ kind: 'import' });

  if (screen.kind === 'import') {
    return (
      <div className="gr">
        <ImportScreen storageKey={STORAGE_KEY} title="Game reviewer" onImported={game => setScreen({ kind: 'review', game })} />
      </div>
    );
  }
  return <ReviewScreen engine={engine} game={screen.game} onAnotherGame={startOver} />;
}

type ReviewPhase = 'waiting-for-engine' | 'analysing' | 'done' | 'failed';

function ReviewScreen({
  engine,
  game,
  onAnotherGame,
}: {
  engine: UciEngine | Error | undefined;
  game: ImportedGame;
  onAnotherGame: () => void;
}): React.JSX.Element {
  const readyEngine = engine instanceof Error ? undefined : engine;
  const [phase, setPhase] = useState<ReviewPhase>('waiting-for-engine');
  const [progress, setProgress] = useState<ReviewProgress | undefined>(undefined);
  const [review, setReview] = useState<GameReview | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [selectedPly, setSelectedPly] = useState(0);

  useEffect(() => {
    if (!readyEngine) {
      setPhase('waiting-for-engine');
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    setPhase('analysing');
    setProgress(undefined);
    setError(undefined);
    setReview(undefined);
    reviewGame(
      readyEngine,
      { startFen: game.startFen, ucis: game.ucis },
      { depth: ANALYSE_DEPTH, signal: controller.signal },
      p => {
        if (!cancelled) setProgress(p);
      },
    )
      .then(r => {
        if (cancelled) return;
        setReview(r);
        setSelectedPly(r.moves.length > 0 ? 1 : 0);
        setPhase('done');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // A cancellation is expected whenever this effect re-runs or unmounts mid-review (the
        // cleanup below triggers it); it is swallowed silently. Any other failure is real and
        // must be shown (A1: never hide that an engine call failed).
        if (err instanceof ReviewCancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setPhase('failed');
      });
    return () => {
      cancelled = true;
      controller.abort();
      readyEngine.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readyEngine, game]);

  if (engine instanceof Error) {
    return (
      <div className="gr">
        <p className="gr-status">The engine could not be loaded: {engine.message}</p>
        <button onClick={onAnotherGame}>Another game</button>
      </div>
    );
  }
  if (phase === 'waiting-for-engine') {
    return (
      <div className="gr">
        <p className="gr-status">Loading the engine…</p>
      </div>
    );
  }
  if (phase === 'analysing') {
    const k = progress?.ply ?? 0;
    const n = progress?.total ?? game.ucis.length;
    return (
      <div className="gr">
        <p className="gr-status">
          Analysing move {k} of {n}…
        </p>
      </div>
    );
  }
  if (phase === 'failed') {
    return (
      <div className="gr">
        <p className="gr-status" role="alert">
          The engine failed: {error}
        </p>
        <button onClick={onAnotherGame}>Another game</button>
      </div>
    );
  }
  if (!review) {
    // Unreachable in practice (phase is only 'done' once review is set), kept for exhaustiveness.
    return <div className="gr" />;
  }

  const move = selectedPly > 0 ? review.moves[selectedPly - 1] : undefined;
  const fen = move ? move.fenAfter : game.startFen;
  const lastMove: [SquareName, SquareName] | undefined = move ? uciSquares(move.uci) : undefined;
  // Ply 0 (the starting position) is a valid stop, not a floor to avoid — "prev" can reach it.
  const canPrev = selectedPly > 0;
  const canNext = selectedPly < review.moves.length;

  return (
    <div className="gr gr-review">
      <h2>Game reviewer</h2>
      {game.white && game.black && (
        <p className="gr-players">
          {game.white} vs {game.black} {game.result ? `(${game.result})` : ''}
        </p>
      )}

      <EvalStrip review={review} selectedPly={selectedPly} onSelect={setSelectedPly} />

      <Board
        fen={fen}
        orientation={game.playedAs ?? 'white'}
        turnColor="white"
        dests={new Map()}
        movableColor={undefined}
        lastMove={lastMove}
        check={inCheck(positionFromFen(fen))}
        onMove={() => undefined}
      />

      <div className="gr-nav">
        <button onClick={() => setSelectedPly(p => Math.max(0, p - 1))} disabled={!canPrev}>
          prev
        </button>
        <button onClick={() => setSelectedPly(p => Math.min(review.moves.length, p + 1))} disabled={!canNext}>
          next
        </button>
      </div>

      {move ? (
        <MoveDetail move={move} />
      ) : (
        <p className="gr-status">Starting position.</p>
      )}

      {review.end && <p className="gr-end">{describeEnd(review.end)}</p>}

      <MoveList moves={review.moves} selectedPly={selectedPly} onSelect={setSelectedPly} />

      <Legend />

      <button onClick={onAnotherGame}>Another game</button>
    </div>
  );
}

function MoveDetail({ move }: { move: ReviewedMove }): React.JSX.Element {
  return (
    <div className="gr-detail">
      <p>
        Played <strong>{move.san}</strong> — {formatEvalOrEnd(move.evalAfterPlayed)}
        {move.lossCp !== undefined && move.classification !== 'best' && ` (${(move.lossCp / 100).toFixed(2)} pawns lost)`}
      </p>
      {move.classification !== 'best' && (
        <p>
          Best was <strong>{move.bestSan}</strong> — {formatScore(move.evalAfterBest)}
        </p>
      )}
      <p className={`gr-badge gr-badge-${move.classification}`}>{classificationLabel(move.classification)}</p>
      <p className="gr-provenance">
        {move.provenance.engine}, depth {move.provenance.depthBefore} → {move.provenance.depthAfter}
      </p>
    </div>
  );
}

const ALL_CLASSIFICATIONS: Classification[] = ['best', 'good', 'inaccuracy', 'mistake', 'blunder', 'mate-lost', 'mate-allowed'];

function Legend(): React.JSX.Element {
  return (
    <p className="gr-legend">
      {ALL_CLASSIFICATIONS.map(c => (
        <span key={c} className={`gr-badge gr-badge-${c}`}>
          {classificationLabel(c)}
        </span>
      ))}
      <span className="gr-legend-hint"> (first-guess cutoffs)</span>
    </p>
  );
}

function MoveList({
  moves,
  selectedPly,
  onSelect,
}: {
  moves: ReviewedMove[];
  selectedPly: number;
  onSelect: (ply: number) => void;
}): React.JSX.Element {
  const pairs: { moveNumber: number; white: ReviewedMove | undefined; black: ReviewedMove | undefined }[] = [];
  for (let i = 0; i < moves.length; i += 2) {
    pairs.push({ moveNumber: i / 2 + 1, white: moves[i], black: moves[i + 1] });
  }
  return (
    <ol className="gr-moves">
      {pairs.map(p => (
        <li key={p.moveNumber}>
          <span className="gr-move-number">{p.moveNumber}.</span>
          {p.white && <MoveCell move={p.white} selected={selectedPly === p.white.ply} onSelect={onSelect} />}
          {p.black && <MoveCell move={p.black} selected={selectedPly === p.black.ply} onSelect={onSelect} />}
        </li>
      ))}
    </ol>
  );
}

function MoveCell({ move, selected, onSelect }: { move: ReviewedMove; selected: boolean; onSelect: (ply: number) => void }): React.JSX.Element {
  return (
    <button
      className={`gr-move gr-badge-${move.classification}${selected ? ' gr-move-selected' : ''}`}
      onClick={() => onSelect(move.ply)}
    >
      {move.san}
    </button>
  );
}

// The eval chart follows lichess's analysis chart: a zero line across the middle, the area above
// it (White ahead) filled white and the area below (Black ahead) filled dark, every eval mapped
// through lichess's winning-chance curve so the middle of the chart has the resolution and a
// +8 and a +20 look alike. Moves worth a look are marked in their classification colour.
// Markers at a mate score sit on the chart's edge; kept whole by nudging them inward by their radius.
const MARK_R = 4;
const MARKED: Classification[] = ['inaccuracy', 'mistake', 'blunder', 'mate-lost', 'mate-allowed'];
const MARK_COLOR: Record<Classification, string> = {
  best: '#2e7d32', good: '#558b2f', inaccuracy: '#f9a825', mistake: '#ef6c00', blunder: '#c62828',
  'mate-lost': '#6a1b9a', 'mate-allowed': '#4527a0',
};

/** The element's rendered pixel size, so the SVG can be drawn 1:1 (no viewBox stretching, which
 * would turn the round markers into ellipses); the initial guess is replaced on first layout. */
function useElementSize<T extends Element>(): [React.RefObject<T | null>, { w: number; h: number }] {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 600, h: 96 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = (): void => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setSize(s => (s.w === r.width && s.h === r.height ? s : { w: r.width, h: r.height }));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, size];
}

function EvalStrip({
  review,
  selectedPly,
  onSelect,
}: {
  review: GameReview;
  selectedPly: number;
  onSelect: (ply: number) => void;
}): React.JSX.Element {
  const [ref, { w, h }] = useElementSize<SVGSVGElement>();
  // Per-instance clip ids: a second chart on the same page would otherwise clip through this one's.
  const clipId = useId();
  const upperId = `${clipId}-upper`;
  const lowerId = `${clipId}-lower`;
  const n = review.moves.length;
  const mid = h / 2;
  const xOf = (i: number): number => ((i + 1) / n) * w;
  // One point per move (its eval after being played); the curve starts at the zero line before
  // the first move so the first eval is a step away from "even", not a jump from the left edge.
  const points = review.moves.map((m, i) => ({ x: xOf(i), y: mid - winningChance(m.evalAfterPlayed) * mid }));
  const line = `M0,${mid} ` + points.map(p => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area = `${line} L${w},${mid} Z`;
  const selected = review.moves.findIndex(m => m.ply === selectedPly);
  return (
    <svg
      ref={ref}
      className="gr-strip"
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label="Evaluation over the game, White's perspective; above the middle line White is ahead"
    >
      {n > 0 && (
        <>
          <defs>
            <clipPath id={upperId}><rect x="0" y="0" width={w} height={mid} /></clipPath>
            <clipPath id={lowerId}><rect x="0" y={mid} width={w} height={mid} /></clipPath>
          </defs>
          <rect className="gr-chart-bg" x="0" y="0" width={w} height={h} />
          <path className="gr-chart-white" d={area} clipPath={`url(#${upperId})`} />
          <path className="gr-chart-black" d={area} clipPath={`url(#${lowerId})`} />
          <line className="gr-chart-zero" x1="0" y1={mid} x2={w} y2={mid} />
          <path className="gr-chart-line" d={line} />
          {selected >= 0 && <line className="gr-chart-selected" x1={xOf(selected)} y1="0" x2={xOf(selected)} y2={h} />}
          {review.moves.map((m, i) =>
            MARKED.includes(m.classification) ? (
              <circle key={`mark-${m.ply}`} className="gr-chart-mark" cx={points[i]!.x} cy={Math.min(h - MARK_R, Math.max(MARK_R, points[i]!.y))} r={MARK_R} fill={MARK_COLOR[m.classification]} />
            ) : null,
          )}
          {/* Hit areas centred on each move's point, so a click near a marker selects that move. */}
          {review.moves.map((m, i) => (
            <rect key={m.ply} className="gr-chart-hit" x={xOf(i) - w / (2 * n)} y="0" width={w / n} height={h} onClick={() => onSelect(m.ply)}>
              <title>{`${m.san}: ${formatEvalOrEnd(m.evalAfterPlayed)} (${classificationLabel(m.classification)})`}</title>
            </rect>
          ))}
        </>
      )}
    </svg>
  );
}

/** lichess's winning-chance curve, in [-1, 1] from White's side: the constant is lila's
 * ui/ceval winningChances.ts (2/(1+e^(-0.00368208·cp)) - 1); mate and checkmate go to the chart's
 * edge (±1, winner-aware, never guessed from a sign) as lila's acpl chart does, and a
 * rules-verified draw sits on the zero line. */
function winningChance(e: EvalOrEnd): number {
  if (e.type === 'checkmate') return e.winner === 'white' ? 1 : -1;
  if (e.type === 'draw') return 0;
  if (e.type === 'mate') return e.value >= 0 ? 1 : -1;
  return 2 / (1 + Math.exp(-0.00368208 * e.value)) - 1;
}

/** Plain-language rendering of an EvalOrEnd: a real Score formats as usual; a delivered
 * checkmate or a draw is stated in words directly from the rules-verified fact, winner-aware,
 * never as an invented score (V3). */
function formatEvalOrEnd(e: EvalOrEnd): string {
  if (e.type === 'checkmate') return `checkmate — ${e.winner === 'white' ? 'White' : 'Black'} wins`;
  if (e.type === 'draw') return `draw (${e.reason})`;
  return formatScore(e);
}

function classificationLabel(c: Classification): string {
  switch (c) {
    case 'best': return 'Best';
    case 'good': return 'Good';
    case 'inaccuracy': return 'Inaccuracy';
    case 'mistake': return 'Mistake';
    case 'blunder': return 'Blunder';
    case 'mate-lost': return 'Mate lost';
    case 'mate-allowed': return 'Mate allowed';
  }
}

function describeEnd(end: NonNullable<GameReview['end']>): string {
  const how = end.end;
  switch (how.kind) {
    case 'checkmate': return `Checkmate — ${how.winner === 'white' ? 'White' : 'Black'} wins.`;
    case 'stalemate': return 'Stalemate — drawn.';
    case 'insufficient-material': return 'Drawn by insufficient material.';
    case 'fifty-moves': return 'Drawn by the fifty-move rule.';
    default: return 'The game ended.';
  }
}
