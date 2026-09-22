// Game reviewer, standard-review skeleton: import a game, then step move by move through a
// per-move engine eval, cp loss, classification, and the engine's best move. No what-if, no
// narrative report text yet — see memory/subprojects/game-reviewer.md for what this slice
// deliberately leaves out. Every eval and classification comes from @human-chess/review, which
// gets them from a real engine or a rules-verified game end, never invented here (A1).
import { useEffect, useId, useRef, useState } from 'react';
import { Board } from '@human-chess/board';
import { formatScore, type UciEngine } from '@human-chess/engine';
import { ImportScreen } from '@human-chess/import/react';
import { gameId, type ImportedGame } from '@human-chess/import';
import {
  ReviewCancelled, reviewGame, type Classification, type EvalOrEnd, type GameReview, type ReviewedMove, type ReviewProgress,
} from '@human-chess/review';
import { inCheck, opposite, positionFromFen, turn, uciSquares, type SquareName } from '@human-chess/rules';
import { Button, consumeHandoffParams, Field, navigateWithHandoff, Status, Toolbar, usePersistedState, Workbench } from '@human-chess/ui';
import {
  loadDepth, loadMovetimeSeconds, MAX_DEPTH, MAX_MOVETIME_SECONDS, MIN_DEPTH, MIN_MOVETIME_SECONDS, parseReviewSnapshot,
  parseStoredScreen, REVIEW_KEY, saveDepth, saveMovetimeSeconds, SCREEN_KEY, serializeReviewSnapshot,
  type ReviewSnapshot, type StoredScreen,
} from './storage';
import './game-reviewer.css';

export interface GameReviewerProps {
  /** A ready (initialised) engine, or undefined while it loads, or an Error when it could not load. */
  engine: UciEngine | Error | undefined;
}

type Screen = StoredScreen;

const STORAGE_KEY = 'human-chess.game-reviewer.import-username';

export function GameReviewer({ engine }: GameReviewerProps): React.JSX.Element {
  // Read once, from the hash App.tsx routed this component in on — GameReviewer is only ever
  // (re)mounted by that routing, so this is exactly whatever query a caller (puzzles' "Review
  // the source game") attached to '#/review'. `pgn` prefills the paste box directly; `gameUrl`
  // (a puzzle record that only carries a game id/URL, not the PGN text) can't be turned into a
  // PGN without a fetch this screen must not make on its own, so it's shown as a plain link
  // instead and the user pastes the PGN themselves. `consumeHandoffParams` also strips the
  // hand-off out of the URL, so a reload restores the persisted `screen` below instead of
  // replaying the same hand-off again.
  const [handoff] = useState(() => consumeHandoffParams());
  const handoffPgn = handoff.get('pgn') ?? undefined;
  const handoffGameUrl = handoff.get('gameUrl') ?? undefined;
  const hasHandoff = handoffPgn !== undefined || handoffGameUrl !== undefined;

  // A fresh hand-off wins over whatever screen was persisted (docs/design/2026-09-18-reload-
  // survival.md): rejecting the stored value unconditionally falls back to the `{kind:'import'}`
  // initial value, which is exactly where a hand-off needs to land (the paste box prefilled).
  const [screen, setScreen] = usePersistedState<Screen>(SCREEN_KEY, { kind: 'import' }, {
    parse: raw => (hasHandoff ? undefined : parseStoredScreen(raw)),
  });
  const startOver = (): void => setScreen({ kind: 'import' });

  if (screen.kind === 'import') {
    return (
      <ImportScreen
        storageKey={STORAGE_KEY}
        title="Game reviewer"
        initialPgnText={handoffPgn}
        notice={
          handoffPgn === undefined && handoffGameUrl !== undefined ? (
            <Status kind="info">
              Continuing from a puzzle&apos;s source game — paste its PGN below (human-chess does not fetch it automatically).{' '}
              <a href={handoffGameUrl} target="_blank" rel="noreferrer">
                Open the game
              </a>
              .
            </Status>
          ) : undefined
        }
        onImported={game => setScreen({ kind: 'review', game })}
      />
    );
  }
  return <ReviewScreen engine={engine} game={screen.game} onAnotherGame={startOver} />;
}

type ReviewPhase = 'waiting-for-engine' | 'analysing' | 'done' | 'failed';

/** CSS size string for `@human-chess/board`'s `Board`, from the pixel side length `Workbench`'s
 * `board` render prop hands back (0 until the first measurement lands). */
function boardSize(sizePx: number): string {
  return sizePx > 0 ? `${sizePx}px` : '100%';
}

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
  const [progress, setProgress] = useState<ReviewProgress | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  // The finished review (whole, so a reload is instant — A1's provenance stays intact through
  // toStoredGameReview/fromStoredGameReview), the selected ply, and whether the board is
  // flipped, bound to this game via gameId so a snapshot from reviewing a different game is
  // never shown here (parseReviewSnapshot rejects a mismatched gameKey).
  const gameKey = gameId(game);
  const [snapshot, setSnapshot] = usePersistedState<ReviewSnapshot>(
    REVIEW_KEY,
    () => ({ gameKey, review: undefined, selectedPly: 0, flipped: false }),
    { parse: raw => parseReviewSnapshot(raw, game), serialize: serializeReviewSnapshot },
  );
  const { review, selectedPly, flipped } = snapshot;
  const setReview = (next: GameReview | undefined): void => setSnapshot(s => ({ ...s, review: next }));
  const setSelectedPly = (updater: number | ((p: number) => number)): void =>
    setSnapshot(s => ({ ...s, selectedPly: typeof updater === 'function' ? updater(s.selectedPly) : updater }));
  const setFlipped = (updater: boolean | ((f: boolean) => boolean)): void =>
    setSnapshot(s => ({ ...s, flipped: typeof updater === 'function' ? updater(s.flipped) : updater }));

  // Persisted per the openings builder's depth pattern (subprojects/openings-builder/src/
  // storage.ts): both settings survive a reload, and either one changing restarts the review
  // (the effect below depends on them) since a review already computed at the old settings
  // would misreport its own provenance.
  const [depth, setDepth] = useState<number>(() => loadDepth());
  const [depthText, setDepthText] = useState<string>(() => String(depth));
  const [movetimeSeconds, setMovetimeSeconds] = useState<number>(() => loadMovetimeSeconds());
  const [movetimeText, setMovetimeText] = useState<string>(() => String(movetimeSeconds));

  // A restored review is shown as-is even if it was made at different settings than what's
  // currently loaded (it's what the user was looking at) — only an explicit settings change (via
  // finalizeDepth/finalizeMovetimeSeconds below) should trigger a fresh run. This ref tracks the
  // depth/movetime the currently-shown result (restored or freshly computed) is "good for";
  // seeded from the current settings when a review was restored, so the mount-time effect run
  // below sees them as unchanged and skips straight past re-running.
  const lastRunSettingsRef = useRef<{ depth: number; movetime: number } | undefined>(
    review ? { depth, movetime: movetimeSeconds } : undefined,
  );
  const [phase, setPhase] = useState<ReviewPhase>(() => (review ? 'done' : 'waiting-for-engine'));
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
    // Nothing changed since the currently-shown result (restored or freshly computed) was
    // produced: leave it on screen. A reload lands here on the very first run whenever a
    // matching review was restored, regardless of whether the engine has finished loading yet —
    // showing a cached review never needs the engine.
    const unchanged = lastRunSettingsRef.current !== undefined
      && lastRunSettingsRef.current.depth === depth
      && lastRunSettingsRef.current.movetime === movetimeSeconds;
    if (unchanged) return;

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
        setSnapshot(s => ({ ...s, review: r, selectedPly: r.moves.length > 0 ? 1 : 0 }));
        setPhase('done');
        lastRunSettingsRef.current = { depth, movetime: movetimeSeconds };
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

  const baseOrientation = game.playedAs ?? 'white';
  const orientation = flipped ? opposite(baseOrientation) : baseOrientation;

  const move = review && selectedPly > 0 ? review.moves[selectedPly - 1] : undefined;
  const fen = move ? move.fenAfter : game.startFen;
  const lastMove: [SquareName, SquareName] | undefined = move ? uciSquares(move.uci) : undefined;
  const canPrev = review ? selectedPly > 0 : false;
  const canNext = review ? selectedPly < review.moves.length : false;

  const capHint = `Depth ${depth}, at most ${movetimeSeconds} s per move (whichever comes first).`;

  const settingsFields = (
    <div className="gr-settings">
      <Field label="Depth" htmlFor="gr-depth">
        <input
          id="gr-depth"
          type="number"
          min={MIN_DEPTH}
          max={MAX_DEPTH}
          value={depthText}
          onChange={e => setDepthText(e.target.value)}
          onBlur={e => finalizeDepth(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') finalizeDepth(e.currentTarget.value);
          }}
        />
      </Field>
      <Field label="Max seconds per move" htmlFor="gr-movetime">
        <input
          id="gr-movetime"
          type="number"
          min={MIN_MOVETIME_SECONDS}
          max={MAX_MOVETIME_SECONDS}
          value={movetimeText}
          onChange={e => setMovetimeText(e.target.value)}
          onBlur={e => finalizeMovetimeSeconds(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') finalizeMovetimeSeconds(e.currentTarget.value);
          }}
        />
      </Field>
    </div>
  );

  let status: React.ReactNode;
  let primary: React.ReactNode;
  let showAnotherGame = false;

  // A restored review (phase 'done') is shown on its own merits even when the engine failed to
  // load: the review itself does not need a live engine, only a fresh one would. The engine
  // error still needs to be visible (A1: never hide that an engine call failed), but as the
  // status alongside the review rather than a full-screen substitute for it — otherwise a
  // reload that also lost the engine would silently swap a finished review for an error page.
  if (review && phase === 'done') {
    primary = move ? <MoveSummary move={move} /> : <p className="gr-status">Starting position.</p>;
    showAnotherGame = true;
    if (engine instanceof Error) {
      status = <Status kind="error">The engine could not be loaded: {engine.message}</Status>;
    }
  } else if (engine instanceof Error) {
    status = <Status kind="error">The engine could not be loaded: {engine.message}</Status>;
    showAnotherGame = true;
  } else if (phase === 'waiting-for-engine') {
    status = (
      <>
        <Status kind="busy">Loading the engine…</Status>
        <p className="gr-time-cap-hint">{capHint}</p>
      </>
    );
    primary = settingsFields;
  } else if (phase === 'analysing') {
    const k = progress?.searched ?? 0;
    const n = progress?.toSearch ?? game.ucis.length;
    const eta = reviewEta(progress, startedAtRef.current);
    status = (
      <>
        <Status kind="busy">
          Analysing position {k} of {n} · {eta}
        </Status>
        <p className="gr-time-cap-hint">{capHint}</p>
      </>
    );
    primary = settingsFields;
  } else if (phase === 'failed') {
    status = (
      <>
        <Status kind="error">The engine failed: {error}</Status>
        <p className="gr-time-cap-hint">{capHint}</p>
      </>
    );
    primary = (
      <>
        {settingsFields}
        <p className="gr-settings-hint">Changing a setting retries the review.</p>
      </>
    );
    showAnotherGame = true;
  }

  return (
    <Workbench
      title="Game reviewer"
      status={status}
      primary={primary}
      aside={review && review.moves.length > 0 ? <EvalStrip review={review} selectedPly={selectedPly} onSelect={setSelectedPly} /> : undefined}
      board={sizePx => (
        <Board
          fen={fen}
          orientation={orientation}
          // The shown position's real side to move: chessground resolves check=true against
          // turnColor, so a hardcoded "white" glows the wrong king when Black is in check (V3 —
          // the check indicator is a board-state fact). The board is non-interactive, so this
          // only affects that highlight.
          turnColor={turn(positionFromFen(fen))}
          dests={new Map()}
          movableColor={undefined}
          lastMove={lastMove}
          check={inCheck(positionFromFen(fen))}
          onMove={() => undefined}
          size={boardSize(sizePx)}
        />
      )}
      footer={
        <Toolbar>
          {review && (
            <>
              <Button size="sm" onClick={() => setSelectedPly(p => Math.max(0, p - 1))} disabled={!canPrev}>
                prev
              </Button>
              <Button size="sm" onClick={() => setSelectedPly(p => Math.min(review.moves.length, p + 1))} disabled={!canNext}>
                next
              </Button>
            </>
          )}
          <Button variant="quiet" onClick={() => setFlipped(f => !f)}>
            Flip board
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              navigateWithHandoff('#/bot-rating', { fen, color: game.playedAs ?? turn(positionFromFen(fen)) })
            }
          >
            Play vs engine from here
          </Button>
          {showAnotherGame && (
            <Button variant="secondary" onClick={onAnotherGame}>
              Another game
            </Button>
          )}
        </Toolbar>
      }
    >
      {game.white && game.black && (
        <p className="gr-players">
          {game.white} vs {game.black} {game.result ? `(${game.result})` : ''}
        </p>
      )}
      {review && (
        <>
          {review.end && <p className="gr-end">{describeEnd(review.end)}</p>}
          <MoveTable moves={review.moves} selectedPly={selectedPly} onSelect={setSelectedPly} />
          <Legend />
        </>
      )}
    </Workbench>
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

/** The selected move's summary — played move, eval, cp loss, the best move when the played one
 * wasn't it, the classification badge, and provenance. Text and numbers are unchanged from the
 * previous per-move detail panel (A1): only its place on screen (now `Workbench`'s `primary`)
 * moved. */
function MoveSummary({ move }: { move: ReviewedMove }): React.JSX.Element {
  return (
    <div className="gr-summary">
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

/** Every reviewed move as one row: move, eval, loss, classification, best move, provenance — all
 * straight off `ReviewedMove` (A1/V3), nothing computed here beyond formatting. Replaces the
 * previous White/Black move-pair list; clicking a row selects that ply, same as before. */
function MoveTable({
  moves,
  selectedPly,
  onSelect,
}: {
  moves: ReviewedMove[];
  selectedPly: number;
  onSelect: (ply: number) => void;
}): React.JSX.Element {
  return (
    <table className="gr-move-table">
      <thead>
        <tr>
          <th>Move</th>
          <th>Eval</th>
          <th>Loss</th>
          <th>Class</th>
          <th>Best</th>
          <th>Provenance</th>
        </tr>
      </thead>
      <tbody>
        {moves.map(m => (
          <tr key={m.ply} className={m.ply === selectedPly ? 'gr-move-row-selected' : undefined} onClick={() => onSelect(m.ply)}>
            <td>
              {/* ply is 1-based; the same White-first numbering the previous pair list used. A
                  button, not just a clickable row, so the move is reachable by keyboard. */}
              <button type="button" className="gr-move-button" aria-pressed={m.ply === selectedPly} onClick={() => onSelect(m.ply)}>
                {Math.ceil(m.ply / 2)}
                {m.ply % 2 === 1 ? '. ' : '… '}
                {m.san}
              </button>
            </td>
            <td>{formatEvalOrEnd(m.evalAfterPlayed)}</td>
            <td>{m.lossCp !== undefined ? (m.lossCp / 100).toFixed(2) : '—'}</td>
            <td>
              <span className={`gr-badge gr-badge-${m.classification}`}>{classificationLabel(m.classification)}</span>
            </td>
            <td>{m.classification !== 'best' ? m.bestSan : '—'}</td>
            <td className="gr-provenance">
              {m.provenance.engine}, depth {m.provenance.depthBefore} → {m.provenance.depthAfter}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
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
