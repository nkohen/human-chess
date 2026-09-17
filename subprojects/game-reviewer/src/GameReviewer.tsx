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
import {
  loadDepth, loadMovetimeSeconds, MAX_DEPTH, MAX_MOVETIME_SECONDS, MIN_DEPTH, MIN_MOVETIME_SECONDS, saveDepth, saveMovetimeSeconds,
} from './storage';
import './game-reviewer.css';

export interface GameReviewerProps {
  /** A ready (initialised) engine, or undefined while it loads, or an Error when it could not load. */
  engine: UciEngine | Error | undefined;
}

type Screen = { kind: 'import' } | { kind: 'review'; game: ImportedGame };

const STORAGE_KEY = 'human-chess.game-reviewer.import-username';

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

  // Persisted per the openings builder's depth pattern (subprojects/openings-builder/src/
  // storage.ts): both settings survive a reload, and either one changing restarts the review
  // (the effect below depends on them) since a review already computed at the old settings
  // would misreport its own provenance.
  const [depth, setDepth] = useState<number>(() => loadDepth());
  const [depthText, setDepthText] = useState<string>(() => String(depth));
  const [movetimeSeconds, setMovetimeSeconds] = useState<number>(() => loadMovetimeSeconds());
  const [movetimeText, setMovetimeText] = useState<string>(() => String(movetimeSeconds));
  // Wall-clock start of the review currently running, for the "about N left" progress estimate;
  // read only, never rendered directly — reset at the top of every effect run.
  const startedAtRef = useRef<number | undefined>(undefined);

  function finalizeDepth(raw: string): void {
    const n = Number(raw);
    const clamped = raw.trim() !== '' && Number.isFinite(n) ? Math.min(MAX_DEPTH, Math.max(MIN_DEPTH, Math.round(n))) : depth;
    setDepth(clamped);
    saveDepth(clamped);
    setDepthText(String(clamped));
  }

  function finalizeMovetimeSeconds(raw: string): void {
    const n = Number(raw);
    const clamped = raw.trim() !== '' && Number.isFinite(n)
      ? Math.min(MAX_MOVETIME_SECONDS, Math.max(MIN_MOVETIME_SECONDS, Math.round(n)))
      : movetimeSeconds;
    setMovetimeSeconds(clamped);
    saveMovetimeSeconds(clamped);
    setMovetimeText(String(clamped));
  }

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
    startedAtRef.current = Date.now();
    reviewGame(
      readyEngine,
      { startFen: game.startFen, ucis: game.ucis },
      { depth, movetime: movetimeSeconds * 1000, signal: controller.signal },
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
  }, [readyEngine, game, depth, movetimeSeconds]);

  if (engine instanceof Error) {
    return (
      <div className="gr">
        <p className="gr-status">The engine could not be loaded: {engine.message}</p>
        <button onClick={onAnotherGame}>Another game</button>
      </div>
    );
  }
  const settingsRow = (
    <ReviewSettings
      depth={depth}
      depthText={depthText}
      onDepthChange={setDepthText}
      onDepthCommit={finalizeDepth}
      movetimeSeconds={movetimeSeconds}
      movetimeText={movetimeText}
      onMovetimeChange={setMovetimeText}
      onMovetimeCommit={finalizeMovetimeSeconds}
    />
  );

  if (phase === 'waiting-for-engine') {
    return (
      <div className="gr">
        {settingsRow}
        <p className="gr-status">Loading the engine…</p>
      </div>
    );
  }
  if (phase === 'analysing') {
    const k = progress?.searched ?? 0;
    const n = progress?.toSearch ?? game.ucis.length;
    const eta = reviewEta(progress, startedAtRef.current);
    return (
      <div className="gr">
        {settingsRow}
        <p className="gr-status">
          Analysing position {k} of {n} · {eta}
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
        {settingsRow}
        <p className="gr-settings-hint">Changing a setting retries the review.</p>
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

/** Depth and per-position time cap, persisted (subprojects/openings-builder's depth pattern),
 * shown before/while reviewing so the settings that produced the currently running (or about
 * to run) review are visible, not hidden behind a menu. Free text while focused, committed on
 * blur/Enter — same reasoning as the openings builder's depth field: committing every keystroke
 * would restart the review mid-type. */
function ReviewSettings({
  depth,
  depthText,
  onDepthChange,
  onDepthCommit,
  movetimeSeconds,
  movetimeText,
  onMovetimeChange,
  onMovetimeCommit,
}: {
  depth: number;
  depthText: string;
  onDepthChange: (raw: string) => void;
  onDepthCommit: (raw: string) => void;
  movetimeSeconds: number;
  movetimeText: string;
  onMovetimeChange: (raw: string) => void;
  onMovetimeCommit: (raw: string) => void;
}): React.JSX.Element {
  return (
    <div className="gr-settings">
      <label className="gr-setting">
        Depth{' '}
        <input
          type="number"
          min={MIN_DEPTH}
          max={MAX_DEPTH}
          value={depthText}
          onChange={e => onDepthChange(e.target.value)}
          onBlur={e => onDepthCommit(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') onDepthCommit(e.currentTarget.value);
          }}
        />
      </label>
      <label className="gr-setting">
        Max seconds per move{' '}
        <input
          type="number"
          min={MIN_MOVETIME_SECONDS}
          max={MAX_MOVETIME_SECONDS}
          value={movetimeText}
          onChange={e => onMovetimeChange(e.target.value)}
          onBlur={e => onMovetimeCommit(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') onMovetimeCommit(e.currentTarget.value);
          }}
        />
      </label>
      <p className="gr-settings-hint">
        Depth {depth}, at most {movetimeSeconds} s per move (whichever comes first).
      </p>
    </div>
  );
}

/** A wall-clock estimate of time remaining, from elapsed time / moves done * moves left — never
 * an engine claim, just arithmetic over this screen's own progress callbacks, so it carries no
 * false provenance. "estimating…" until at least 2 positions are done (one data point is too
 * noisy: the very first position's search time is a poor predictor of the rest). */
function reviewEta(progress: ReviewProgress | undefined, startedAt: number | undefined): string {
  if (!progress || !startedAt || progress.searched < 2) return 'estimating…';
  const elapsedMs = Date.now() - startedAt;
  const remaining = progress.toSearch - progress.searched;
  if (remaining <= 0) return 'almost done';
  const remainingMs = (elapsedMs / progress.searched) * remaining;
  return `about ${formatDuration(remainingMs)} left`;
}

/** Rounds to minutes above 90s, else to seconds — matches the resolution a user actually reads
 * an ETA at (nobody parses "about 137 s left"). */
function formatDuration(ms: number): string {
  const seconds = ms / 1000;
  if (seconds > 90) return `${Math.round(ms / 60_000)} min`;
  return `${Math.max(1, Math.round(seconds))} s`;
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
