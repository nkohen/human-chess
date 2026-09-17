import { useEffect, useState } from 'react';
import { Board } from '@human-chess/board';
import { fetchLatestGameFrom, ImportScreen } from '@human-chess/import/react';
import type { ImportedGame } from '@human-chess/import';
import {
  annotateLine, fullmove, inCheck, opposite, positionFromFen, turn, uciSquares, type Color, type SquareName,
} from '@human-chess/rules';
import { classifyCompleteAttempt, compareReconstruction, fenSequence, type ReconstructionOutcome } from './compare';
import { relativeTime } from './relativeTime';
import {
  currentFen, lastReconstructedMove, playReconstructionMove, reconstructedSans, reconstructedUcis,
  reconstructionDests, sideToMove, startReconstruction, type Reconstruction,
} from './reconstruction';
import './memory-trainer.css';

const STORAGE_KEY = 'human-chess.memory-trainer.import-username';

type Screen =
  | { kind: 'import' }
  | { kind: 'reconstruct'; game: ImportedGame; reconstruction: Reconstruction }
  | { kind: 'review'; game: ImportedGame; reconstruction: Reconstruction; claimedComplete: boolean };

/** `style` plus the one CSS custom property this file uses, so `--mt-height` can be set without
 * an `as` cast at every call site. */
type ShellStyle = React.CSSProperties & { '--mt-height'?: string };

/**
 * Ply → (colour, move number), anchored to the game's real start position — not always White
 * to move 1 (a FEN start can begin with Black to move at any fullmove number). `startColor`
 * and `startFullmove` come from the start position once (see ReviewScreen) rather than being
 * re-derived per ply.
 */
const ordinalMove = (
  startColor: Color,
  startFullmove: number,
  ply: number,
): { moveNumber: number; color: 'White' | 'Black' } => {
  const plyColor = ply % 2 === 1 ? startColor : opposite(startColor);
  const offset = startColor === 'white' ? 1 : 0;
  return {
    moveNumber: startFullmove + Math.floor((ply - offset) / 2),
    color: plyColor === 'white' ? 'White' : 'Black',
  };
};

/**
 * The viewport height available below the app's header (`.app-header`, rendered by apps/web's
 * App.tsx — outside this subproject, so its height is read from the DOM rather than assumed).
 * Recomputed on window resize and whenever the header itself resizes (login state changing,
 * engine status text wrapping, ...). Undefined until the first measurement lands; callers fall
 * back to a viewport-relative CSS value (`100vh`) for that first paint.
 */
function useAvailableHeight(): number | undefined {
  const [height, setHeight] = useState<number | undefined>(undefined);
  useEffect(() => {
    const header = document.querySelector<HTMLElement>('.app-header');
    const compute = (): void => setHeight(window.innerHeight - (header?.getBoundingClientRect().height ?? 0));
    compute();
    window.addEventListener('resize', compute);
    let observer: ResizeObserver | undefined;
    if (header && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(compute);
      observer.observe(header);
    }
    return () => {
      window.removeEventListener('resize', compute);
      observer?.disconnect();
    };
  }, []);
  return height;
}

/**
 * Tracks a DOM node's rendered content-box size, so a board can be given the exact pixel size
 * that fits the space CSS has actually allotted it (the smaller of that space's width and
 * height), rather than a width-only CSS percentage that ignores how tall the space is. A
 * callback ref (not a plain object ref read inside `useEffect`) because the measured element
 * mounts and unmounts as `MemoryTrainer` switches screens, while the hook call itself must stay
 * unconditional (Rules of Hooks) — a callback ref re-fires whenever the node changes.
 */
function useElementSize<T extends HTMLElement>(): [(node: T | null) => void, { width: number; height: number } | undefined] {
  const [node, setNode] = useState<T | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | undefined>(undefined);
  useEffect(() => {
    if (!node || typeof ResizeObserver === 'undefined') {
      setSize(undefined);
      return;
    }
    const observer = new ResizeObserver((entries: ResizeObserverEntry[]) => {
      const box = entries[0]?.contentRect;
      if (box) setSize({ width: box.width, height: box.height });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);
  return [setNode, size];
}

/** The square board size (CSS px) that fits inside a measured area without forcing the page to
 * scroll: the smaller of the area's width and height. '100%' until the first measurement lands
 * (a single-frame fallback; the area itself clips overflow while unmeasured). */
function squareSize(area: { width: number; height: number } | undefined): string {
  return area ? `${Math.max(0, Math.floor(Math.min(area.width, area.height)))}px` : '100%';
}

export function MemoryTrainer(): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>({ kind: 'import' });
  const availableHeight = useAvailableHeight();
  // Both board areas are sized by the same pair of hooks regardless of which screen is showing
  // (Rules of Hooks: the same hooks must run every render), so only one screen's ref is ever
  // actually attached to a DOM node at a time.
  const [reconstructBoardRef, reconstructBoardArea] = useElementSize<HTMLDivElement>();
  const [reviewBoardRef, reviewBoardArea] = useElementSize<HTMLDivElement>();
  const shellStyle: ShellStyle | undefined =
    availableHeight !== undefined ? { '--mt-height': `${Math.max(0, Math.floor(availableHeight))}px` } : undefined;

  const startOver = (): void => setScreen({ kind: 'import' });

  const [refetching, setRefetching] = useState(false);
  const [refetchError, setRefetchError] = useState<string | undefined>(undefined);

  const beginReconstruction = (game: ImportedGame): void => {
    setRefetchError(undefined);
    setScreen({ kind: 'reconstruct', game, reconstruction: startReconstruction(game.startFen) });
  };

  // "Fetch again" on the reconstruct screen (site lag / our own 60 s cache can hand back the
  // game before the last one — see memory/subprojects/memory-trainer.md) reuses this exact same
  // path: it discards the in-progress reconstruction and re-runs fetchLatestGameFrom for the
  // game's own site+username, landing on a fresh reconstruct screen via beginReconstruction.
  const fetchAgain = (game: ImportedGame): void => {
    const site = game.source;
    const username = game.username;
    if ((site !== 'lichess' && site !== 'chess.com') || !username) return;
    setRefetching(true);
    setRefetchError(undefined);
    fetchLatestGameFrom(site, username)
      .then(fetched => {
        // Stale-result guard (reviewer): if the learner has meanwhile finished the attempt or
        // gone elsewhere, the late answer must not yank them back to a fresh reconstruct screen.
        setScreen(prev =>
          prev.kind === 'reconstruct' && prev.game === game
            ? { kind: 'reconstruct', game: fetched, reconstruction: startReconstruction(fetched.startFen) }
            : prev,
        );
        setRefetchError(undefined);
      })
      .catch((err: unknown) => setRefetchError(err instanceof Error ? err.message : String(err)))
      .finally(() => setRefetching(false));
  };

  if (screen.kind === 'import') {
    return (
      <div className="memory-trainer" style={shellStyle}>
        <ImportScreen storageKey={STORAGE_KEY} title="Memory trainer" onImported={beginReconstruction} />
      </div>
    );
  }

  if (screen.kind === 'reconstruct') {
    const { game, reconstruction } = screen;
    const onMove = (from: SquareName, to: SquareName): void => {
      setScreen({ kind: 'reconstruct', game, reconstruction: playReconstructionMove(reconstruction, from, to) });
    };
    // `claimedComplete` only records which button ended the attempt — it never reveals the real
    // game's length itself; ReviewScreen is the only place that compares against it.
    const onDone = (claimedComplete: boolean): void => setScreen({ kind: 'review', game, reconstruction, claimedComplete });
    return (
      <div className="memory-trainer" style={shellStyle}>
        <GameIdentity game={game} withResult={false} />
        <RecencyNote game={game} refetching={refetching} error={refetchError} onFetchAgain={() => fetchAgain(game)} />
        <div className="mt-reconstruct">
          <div className="mt-board-area" ref={reconstructBoardRef}>
            <Board
              fen={currentFen(reconstruction)}
              orientation={game.playedAs ?? 'white'}
              turnColor={sideToMove(reconstruction)}
              dests={reconstructionDests(reconstruction)}
              movableColor={sideToMove(reconstruction)}
              lastMove={lastReconstructedMove(reconstruction)}
              check={inCheck(reconstruction.pos)}
              onMove={onMove}
              size={squareSize(reconstructBoardArea)}
            />
          </div>
          <div className="mt-side">
            <p className="memory-trainer-note">
              Enter both sides' moves as best you remember them. Wrong moves are accepted silently —
              the board just keeps going from your version of the position. Promotions always become
              a queen.
            </p>
            <MoveList startFen={reconstruction.startFen} ucis={reconstructedUcis(reconstruction)} />
            <div className="mt-buttons">
              <button className="memory-trainer-done" onClick={() => onDone(false)}>
                I have no idea
              </button>
              <button className="memory-trainer-claim-complete" onClick={() => onDone(true)}>
                That's the whole game
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const { game, reconstruction, claimedComplete } = screen;
  return (
    <ReviewScreen
      game={game}
      reconstruction={reconstruction}
      claimedComplete={claimedComplete}
      onAnotherGame={startOver}
      shellStyle={shellStyle}
      boardAreaRef={reviewBoardRef}
      boardArea={reviewBoardArea}
    />
  );
}

/** One line identifying the fetched game — site, players, which colour the learner played, when
 * it was played, and a link when the source gives one — so the learner can tell it apart from
 * whatever they think they last played (user report 2026-09-17: "perhaps it isn't pulling the
 * most recent game correctly", with no way on screen to check). All fields come straight off
 * `ImportedGame`; nothing here is guessed. */
const SOURCE_LABELS: Record<ImportedGame['source'], string> = { lichess: 'Lichess', 'chess.com': 'Chess.com', pgn: 'Pasted PGN' };

/** Counts in the review text are plies (half-moves), the unit compareReconstruction works in;
 * saying "moves" for them would overstate a game's length by half. */
function plies(n: number): string {
  return `${n} ${n === 1 ? 'ply' : 'plies'}`;
}

/** Refreshed once a minute while a component using it stays mounted, so a relative "3 minutes
 * ago" doesn't sit stale on screen (the reconstruct screen can stay open a long time). */
function useNow(intervalMs: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** The clock-time part of the identity line: just the time when `iso` falls on today (relative
 * to `now`), the full locale date-time otherwise — anchors a vague "3 minutes ago" to an actual
 * time the learner can cross-check against memory. Kept separate from relativeTime, which answers
 * a different question ("how long ago", coarse and never negative). */
function absoluteTimeLabel(iso: string, now: Date): string | undefined {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return undefined;
  const isToday = then.toDateString() === now.toDateString();
  return isToday
    ? then.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    : then.toLocaleString();
}

/** One line saying which game was fetched, from ImportedGame's own fields only. `withResult`
 * is off on the reconstruction screen so the learner is not told who won before they try.
 * `playedAt` is chess.com's own game-END time but lichess/PGN's game-START time (from the PGN's
 * UTCDate/UTCTime headers) — worded accordingly ("ended"/"started") rather than blurring the
 * two into one ambiguous timestamp. */
function GameIdentity({ game, withResult }: { game: ImportedGame; withResult: boolean }): React.JSX.Element | null {
  const now = useNow(60_000);
  if (!game.white || !game.black) return null;
  const result = withResult && game.result && game.result !== '*' ? ` (${game.result})` : '';
  const played = game.playedAs ? `, you played ${game.playedAs === 'white' ? 'White' : 'Black'}` : '';
  const verb = game.source === 'chess.com' ? 'ended' : 'started';
  const ago = game.playedAt ? relativeTime(game.playedAt, now) : undefined;
  const clock = game.playedAt ? absoluteTimeLabel(game.playedAt, now) : undefined;
  // "ended 3 minutes ago (14:39)" while a relative phrase applies; just the date-time otherwise;
  // nothing at all for an unparseable timestamp (never "Invalid Date").
  const when = clock ? `, ${verb} ${ago ? `${ago} (${clock})` : clock}` : '';
  return (
    <p className="memory-trainer-identity">
      {SOURCE_LABELS[game.source]}: {game.white} vs {game.black}
      {result}
      {played}
      {when}
      {game.url && (
        <>
          {' '}
          <a href={game.url} target="_blank" rel="noreferrer">
            view game
          </a>
        </>
      )}
    </p>
  );
}

/** Shown only on the reconstruct screen, and only for a game fetched from a site (a pasted PGN
 * has no fetch to redo). Explains why the game just fetched can lag the one the learner just
 * finished — the site's own publishing lag plus, for chess.com only, our client's 60 s cache on
 * the archives list and newest archive (packages/chesscom/src/endpoints.ts's SHORT_TTL_MS; the
 * lichess import goes through lichessFetch with no TTL cache, so that clause is not shown for
 * lichess) — and offers to redo the exact fetch that landed on this screen, via the same
 * fetchLatestGameFrom path ImportScreen itself uses. */
function RecencyNote({
  game,
  refetching,
  error,
  onFetchAgain,
}: {
  game: ImportedGame;
  refetching: boolean;
  error: string | undefined;
  onFetchAgain: () => void;
}): React.JSX.Element | null {
  if (game.source !== 'chess.com' && game.source !== 'lichess') return null;
  return (
    <p className="memory-trainer-recency-note">
      Not the game you just played? A finished game can take a minute or two to appear on {game.source}
      {game.source === 'chess.com' ? ', and this app reuses its last chess.com fetch for 60 s' : ''}.{' '}
      <button onClick={onFetchAgain} disabled={refetching}>
        {refetching ? 'Fetching…' : 'Fetch again'}
      </button>
      {error && (
        <span role="alert" className="memory-trainer-recency-error">
          {' '}
          {error}
        </span>
      )}
    </p>
  );
}

/** Reuses `@human-chess/rules`'s `annotateLine` for the colour/move-number of each ply, rather
 * than assuming ply 0 is always White's — a "From Position" pasted PGN can start with Black to
 * move at any fullmove number (the same thing ReviewScreen's `ordinalMove` already accounts for;
 * this component previously didn't, and mislabelled such a game's move list). */
function MoveList({ startFen, ucis }: { startFen: string; ucis: string[] }): React.JSX.Element {
  const plies = annotateLine(startFen, ucis);
  const rows: { moveNumber: number; white?: string; black?: string }[] = [];
  for (const ply of plies) {
    const last = rows[rows.length - 1];
    if (last && last.moveNumber === ply.moveNumber && last[ply.color] === undefined) {
      last[ply.color] = ply.san;
    } else {
      rows.push({ moveNumber: ply.moveNumber, [ply.color]: ply.san });
    }
  }
  return (
    <ol className="memory-trainer-moves">
      {rows.map(r => (
        <li key={r.moveNumber}>
          {r.moveNumber}. {r.white ?? ''} {r.black ?? ''}
        </li>
      ))}
    </ol>
  );
}

function ReviewScreen({
  game,
  reconstruction,
  claimedComplete,
  onAnotherGame,
  shellStyle,
  boardAreaRef,
  boardArea,
}: {
  game: ImportedGame;
  reconstruction: Reconstruction;
  claimedComplete: boolean;
  onAnotherGame: () => void;
  shellStyle: ShellStyle | undefined;
  boardAreaRef: (node: HTMLDivElement | null) => void;
  boardArea: { width: number; height: number } | undefined;
}): React.JSX.Element {
  // ReviewScreen only mounts once per attempt (ReplayBoard below owns its own step state), so
  // this pure comparison runs once rather than needing memoisation.
  const userUcis = reconstructedUcis(reconstruction);
  const userSans = reconstructedSans(reconstruction);
  const segments = compareReconstruction(game.startFen, game.ucis, userUcis);
  const realFens = fenSequence(game.startFen, game.ucis);

  // Ply → colour/move-number is anchored to the actual start position (parsed once here),
  // not assumed to be White to move 1.
  const startPos = positionFromFen(game.startFen);
  const startColor = turn(startPos);
  const startFullmove = fullmove(startPos);

  const firstSegment = segments[0];
  const correctBeforeFirstDivergence = firstSegment?.kind === 'match' ? firstSegment.toPly : 0;
  const diverged = segments.filter(s => s.kind === 'diverged');
  const lastMatchPly = firstSegment?.kind === 'match' ? firstSegment.toPly : 0;

  // Only meaningful when the learner claimed the attempt was the whole game — "I have no idea"
  // makes no claim about length, so it keeps the plain first-divergence text below. Built only
  // from compareReconstruction's own segments and the two move counts (never free-form).
  const outcome: ReconstructionOutcome | undefined = claimedComplete
    ? classifyCompleteAttempt(segments, game.ucis.length, userUcis.length)
    : undefined;

  return (
    <div className="memory-trainer memory-trainer-review" style={shellStyle}>
      <h2>How you did</h2>
      <GameIdentity game={game} withResult={true} />
      <p>
        {userUcis.length === 0
          ? 'You entered no moves.'
          : outcome?.kind === 'perfect'
            ? `Perfect: the whole game, ${plies(outcome.moves)}.`
            : outcome?.kind === 'matched-shorter'
              ? `You matched all ${plies(outcome.matched)} you entered, but the game went on for ${plies(outcome.remaining)} more.`
              : outcome?.kind === 'matched-longer'
                ? `You entered ${plies(outcome.extra)} more than the game had.`
                : correctBeforeFirstDivergence > 0
                  ? `You reconstructed the first ${correctBeforeFirstDivergence} ${correctBeforeFirstDivergence === 1 ? 'ply' : 'plies'} correctly.`
                  : 'The very first move you entered did not match the real game.'}
      </p>

      {realFens.length > 1 && (
        <div className="mt-review-board">
          <ReplayBoard
            fens={realFens.slice(0, lastMatchPly + 1)}
            ucis={game.ucis.slice(0, lastMatchPly)}
            orientation={game.playedAs ?? 'white'}
            size={squareSize(boardArea)}
            boardSlotRef={boardAreaRef}
          />
        </div>
      )}

      <div className="mt-review-details">
        {diverged.length === 0 && segments.length > 0 && <p>No divergence — you reconstructed the whole game you entered.</p>}

        {diverged.map((seg, i) => {
          const { moveNumber, color } = ordinalMove(startColor, startFullmove, seg.fromPly);
          const youPlayed = userSans[seg.fromPly - 1] ?? '?';
          const gameWent = game.sans[seg.fromPly - 1] ?? '?';
          const nextSegment = segments[segments.indexOf(seg) + 1];
          const rejoinedAt = nextSegment?.kind === 'match' ? nextSegment.fromPly : undefined;
          return (
            <p key={i}>
              At move {moveNumber} ({color}) you played {youPlayed}, the game went {gameWent}.{' '}
              {rejoinedAt !== undefined
                ? `Your reconstruction rejoined the real game at ply ${rejoinedAt}.`
                : 'It never rejoined the real game after that.'}
            </p>
          );
        })}
      </div>

      <button onClick={onAnotherGame}>Another game</button>
    </div>
  );
}

function ReplayBoard({
  fens,
  ucis,
  orientation,
  size,
  boardSlotRef,
}: {
  fens: string[];
  ucis: string[];
  orientation: Color;
  size: string;
  boardSlotRef: (node: HTMLDivElement | null) => void;
}): React.JSX.Element {
  const [index, setIndex] = useState(0);
  const clampedIndex = Math.min(index, fens.length - 1);
  const fen = fens[clampedIndex] ?? fens[0]!;
  // fens[0] is the start position (no previous move); fens[i] for i > 0 is the position after
  // ucis[i - 1], so that is the real move that produced the position now shown.
  const uci = clampedIndex > 0 ? ucis[clampedIndex - 1] : undefined;
  const lastMove: [SquareName, SquareName] | undefined = uci ? uciSquares(uci) : undefined;
  return (
    <div className="memory-trainer-replay">
      <div className="mt-board-area" ref={boardSlotRef}>
        <Board
          fen={fen}
          orientation={orientation}
          turnColor="white"
          dests={new Map()}
          movableColor={undefined}
          lastMove={lastMove}
          check={false}
          onMove={() => {}}
          size={size}
        />
      </div>
      <div className="memory-trainer-replay-controls">
        <button onClick={() => setIndex(i => Math.max(0, i - 1))} disabled={index === 0}>
          prev
        </button>
        <button onClick={() => setIndex(i => Math.min(fens.length - 1, i + 1))} disabled={index >= fens.length - 1}>
          next
        </button>
      </div>
    </div>
  );
}
