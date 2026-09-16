// Game reviewer, standard-review skeleton: import a game, then step move by move through a
// per-move engine eval, cp loss, classification, and the engine's best move. No what-if, no
// narrative report text yet — see memory/subprojects/game-reviewer.md for what this slice
// deliberately leaves out. Every eval and classification comes from @human-chess/review, which
// gets them from a real engine or a rules-verified game end, never invented here (A1).
import { useEffect, useState } from 'react';
import { Board } from '@human-chess/board';
import { formatScore, type Score, type UciEngine } from '@human-chess/engine';
import { fetchLatestLichessGame, importPgn, type ImportedGame } from '@human-chess/import';
import { reviewGame, type Classification, type GameReview, type ReviewedMove, type ReviewProgress } from '@human-chess/review';
import type { SquareName } from '@human-chess/rules';
import { loadLastUsername, saveLastUsername } from './storage';
import './game-reviewer.css';

export interface GameReviewerProps {
  /** A ready (initialised) engine, or undefined while it loads, or an Error when it could not load. */
  engine: UciEngine | Error | undefined;
}

type Screen = { kind: 'import' } | { kind: 'review'; game: ImportedGame };

const ANALYSE_DEPTH = 12;

export function GameReviewer({ engine }: GameReviewerProps): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>({ kind: 'import' });
  const startOver = (): void => setScreen({ kind: 'import' });

  if (screen.kind === 'import') {
    return <ImportScreen onImported={game => setScreen({ kind: 'review', game })} />;
  }
  return <ReviewScreen engine={engine} game={screen.game} onAnotherGame={startOver} />;
}

function ImportScreen({ onImported }: { onImported: (game: ImportedGame) => void }): React.JSX.Element {
  const [username, setUsername] = useState(() => loadLastUsername());
  const [pgnText, setPgnText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const fetchGame = (): void => {
    if (!username.trim()) return;
    setLoading(true);
    setError(undefined);
    fetchLatestLichessGame(username.trim())
      .then(game => {
        saveLastUsername(username.trim());
        onImported(game);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  };

  const usePastedPgn = (): void => {
    setError(undefined);
    try {
      onImported(importPgn(pgnText));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="gr gr-import">
      <h2>Game reviewer</h2>
      <section>
        <label htmlFor="gr-username">Lichess username</label>
        <input id="gr-username" value={username} onChange={e => setUsername(e.target.value)} disabled={loading} />
        <button onClick={fetchGame} disabled={loading || !username.trim()}>
          {loading ? 'Fetching…' : 'Fetch my latest game'}
        </button>
      </section>
      <section>
        <label htmlFor="gr-pgn">Or paste a PGN</label>
        <textarea id="gr-pgn" rows={8} value={pgnText} onChange={e => setPgnText(e.target.value)} />
        <button onClick={usePastedPgn} disabled={!pgnText.trim()}>
          Use this PGN
        </button>
      </section>
      {error && (
        <p className="gr-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
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
    let cancelled = false;
    setPhase('analysing');
    setProgress(undefined);
    setError(undefined);
    setReview(undefined);
    reviewGame(readyEngine, { startFen: game.startFen, ucis: game.ucis }, { depth: ANALYSE_DEPTH }, p => {
      if (!cancelled) setProgress(p);
    })
      .then(r => {
        if (cancelled) return;
        setReview(r);
        setSelectedPly(r.moves.length > 0 ? 1 : 0);
        setPhase('done');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setPhase('failed');
      });
    return () => {
      cancelled = true;
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
  const lastMove: [SquareName, SquareName] | undefined = move ? [move.uci.slice(0, 2) as SquareName, move.uci.slice(2, 4) as SquareName] : undefined;
  const canPrev = selectedPly > (review.moves.length > 0 ? 1 : 0);
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

      <Board fen={fen} orientation={game.playedAs ?? 'white'} turnColor="white" dests={new Map()} movableColor={undefined} lastMove={lastMove} check={false} onMove={() => undefined} />

      <div className="gr-nav">
        <button onClick={() => setSelectedPly(p => Math.max(review.moves.length > 0 ? 1 : 0, p - 1))} disabled={!canPrev}>
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

      <button onClick={onAnotherGame}>Another game</button>
    </div>
  );
}

function MoveDetail({ move }: { move: ReviewedMove }): React.JSX.Element {
  return (
    <div className="gr-detail">
      <p>
        Played <strong>{move.san}</strong> — {formatScore(move.evalAfterPlayed)}
        {move.lossCp !== undefined && move.classification !== 'best' && ` (${(move.lossCp / 100).toFixed(2)} pawns lost)`}
      </p>
      {move.classification !== 'best' && (
        <p>
          Best was <strong>{move.bestSan}</strong> — {formatScore(move.evalAfterBest)}
        </p>
      )}
      <p className={`gr-badge gr-badge-${move.classification}`}>{classificationLabel(move.classification)}</p>
      <p className="gr-provenance">
        {move.provenance.engine}, depth {move.provenance.depth}
      </p>
    </div>
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

function EvalStrip({
  review,
  selectedPly,
  onSelect,
}: {
  review: GameReview;
  selectedPly: number;
  onSelect: (ply: number) => void;
}): React.JSX.Element {
  if (review.moves.length === 0) return <div className="gr-strip" />;
  // One point per move (its eval after being played), tracing the game's eval, White perspective.
  return (
    <div className="gr-strip">
      {review.moves.map(m => {
        const pct = evalBarPercent(m.evalAfterPlayed);
        return (
          <button
            key={m.ply}
            className={`gr-strip-bar${selectedPly === m.ply ? ' gr-strip-bar-selected' : ''}`}
            style={{ '--pct': `${pct}%` } as React.CSSProperties}
            onClick={() => onSelect(m.ply)}
            title={`${m.san}: ${formatScore(m.evalAfterPlayed)}`}
          />
        );
      })}
    </div>
  );
}

const EVAL_CAP_CP = 500;

/** Maps a White-perspective Score to a 0-100 fill, clamped at ±5 pawns; a mate fills fully. */
function evalBarPercent(score: Score): number {
  if (score.type === 'mate') return score.value >= 0 ? 100 : 0;
  const clamped = Math.max(-EVAL_CAP_CP, Math.min(EVAL_CAP_CP, score.value));
  return ((clamped + EVAL_CAP_CP) / (2 * EVAL_CAP_CP)) * 100;
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
