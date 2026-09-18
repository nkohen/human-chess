// "Your games": an opening tree folded from the user's own lichess or chess.com games
// (memory/subprojects/openings-builder-trainer.md, priority 2 — "analysis through an opening
// tree over the user's own games", openingtree.com named as the diagnostic reference but NOT
// its code, per the task's reuse directive: this is a small, independent implementation).
// Fetching is @human-chess/import's fetchRecentLichessGames/fetchRecentChesscomGames; folding
// into a position graph is @human-chess/opening-tree's buildGamesTree — this file is display
// and navigation only, same division BuilderView keeps with repertoire.ts.
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Board, MoveLine } from '@human-chess/board';
import {
  fetchRecentChesscomGames,
  fetchRecentLichessGames,
  type FetchRecentChesscomGamesOpts,
  type FetchRecentLichessGamesOpts,
  type ImportedGame,
  type RecentGamesResult,
} from '@human-chess/import';
import { useLastUsername, type ImportSite } from '@human-chess/import/react';
import {
  buildGamesTree,
  childrenOf,
  fenAt,
  mostPlayed,
  moveScore,
  type GameRef,
  type GamesTree,
  type MoveResults,
  type TreeMove,
} from '@human-chess/opening-tree';
import { inCheck, positionFromFen, turn, uciSquares, START_FEN, type Color, type SquareName } from '@human-chess/rules';
import { Button, Field, Panel, SegmentedControl, Status, Toolbar, Workbench } from '@human-chess/ui';

/** What GamesTreeView needs from the build tab's currently selected opening to offer "Add to
 * <name>": its display name, its colour (only surfaced when it matches the tree's own colour —
 * a black-repertoire opening has no use for a move from a white-perspective tree), and a
 * callback that adds a whole line, from the opening's own root, and persists. A *line* rather
 * than a single (epd, uci) pair: this view's own EPDs are keyed into the games tree, not
 * necessarily a node the target opening has ever reached — `addMove` on an opening now throws
 * on an unknown `fromEpd` (repertoire.ts, B2) rather than silently creating an orphan node, so
 * the caller (OpeningsBuilder) walks the opening's tree from its root instead, adding each move
 * in `ucis` in turn (each `addMove` idempotent) so every intermediate node is guaranteed to
 * exist by the time the next one needs it. Kept as a closure so this file never has to import
 * the repertoire model itself. */
export interface GamesTreeTarget {
  name: string;
  color: Color;
  addLine: (ucis: string[]) => void;
}

export interface GamesTreeViewProps {
  /** The opening picker / new-opening form / mode toggle, shared with BuilderView and DrillView.
   * Rendered as `primary`, same role it plays in both those views. */
  controls: ReactNode;
  /** The engine-failed-to-load banner, if any; rendered as Workbench's `status`, same as the
   * other two views (this view never calls the engine itself, but the banner is mode-agnostic). */
  status?: ReactNode;
  targetOpening?: GamesTreeTarget | undefined;
}

const STORAGE_KEY = 'human-chess.openings.gamesTree.username';
const DEFAULT_GAMES = 100;
const MIN_GAMES = 1;
const MAX_GAMES = 300;
// Matches the openings builder's own repertoire depth in spirit (deep enough for real opening
// theory, shallow enough to fold hundreds of games quickly) — a first guess, not measured
// against real games. Configurable in @human-chess/opening-tree; fixed here since the task
// doesn't ask for a second depth control alongside the count field.
const MAX_PLIES_PER_SIDE = 20;
const GAME_REF_DISPLAY_CAP = 20;

const NO_DESTS = new Map<SquareName, SquareName[]>();

const SITE_OPTIONS: { value: ImportSite; label: string }[] = [
  { value: 'lichess', label: 'lichess' },
  { value: 'chess.com', label: 'chess.com' },
];
const COLOR_OPTIONS: { value: Color; label: string }[] = [
  { value: 'white', label: 'White' },
  { value: 'black', label: 'Black' },
];

function clampGames(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_GAMES;
  return Math.min(MAX_GAMES, Math.max(MIN_GAMES, Math.round(n)));
}

/** Cached per (site, username, count) for the session — re-selecting the same combination (e.g.
 * switching back from build mode) doesn't re-fetch. Module-level, not component state, so it
 * survives GamesTreeView unmounting when the user switches modes and remounting when they
 * switch back (the task's own suggested shape). Stores the whole `RecentGamesResult` (games +
 * how many the fetch itself couldn't parse, M1), not just the games array, so a cache hit keeps
 * the same "folded N of M" honesty a fresh fetch has. */
const recentGamesCache = new Map<string, RecentGamesResult>();

function cacheKey(site: ImportSite, username: string, maxGames: number): string {
  return `${site}:${username.toLowerCase()}:${maxGames}`;
}

function fetchRecent(site: ImportSite, username: string, maxGames: number): Promise<RecentGamesResult> {
  const opts: FetchRecentLichessGamesOpts & FetchRecentChesscomGamesOpts = { maxGames };
  return site === 'lichess' ? fetchRecentLichessGames(username, opts) : fetchRecentChesscomGames(username, opts);
}

/** The games and the username they were fetched *as*, taken together at load time (M2) — built
 * as one snapshot rather than pairing the fetched games with whatever the live username input
 * says right now, which would silently rebuild the tree against a half-typed name the moment the
 * user starts editing it after a load. `fetchSkipped` is folded into the "N of M" total the
 * loadForm panel shows, alongside the tree's own `gamesSkipped`. */
interface LoadedGames {
  games: ImportedGame[];
  username: string;
  fetchSkipped: number;
}

function wdlPercents(r: MoveResults): { win: number; draw: number; loss: number } {
  const total = r.wins + r.draws + r.losses;
  if (total <= 0) return { win: 0, draw: 0, loss: 0 };
  return { win: (r.wins / total) * 100, draw: (r.draws / total) * 100, loss: (r.losses / total) * 100 };
}

function wdlTitle(pct: { win: number; draw: number; loss: number }, total: number): string {
  return `Won ${pct.win.toFixed(1)}% · Drew ${pct.draw.toFixed(1)}% · Lost ${pct.loss.toFixed(1)}% (${total} game${total === 1 ? '' : 's'}, your side)`;
}

/** The games behind one edge, capped so a heavily-played move (hundreds of games) doesn't dump
 * an unbounded list — every entry is a real GameRef (url/playedAt/opponent straight off the
 * ImportedGame that contributed it), never summarised or invented. */
function GameRefList({ refs }: { refs: GameRef[] }): React.JSX.Element {
  const shown = refs.slice(0, GAME_REF_DISPLAY_CAP);
  return (
    <ul className="ob-tree-gamerefs">
      {shown.map((ref, i) => (
        <li key={i}>
          {ref.url ? (
            <a href={ref.url} target="_blank" rel="noreferrer">
              {ref.opponent ?? 'game'}
            </a>
          ) : (
            (ref.opponent ?? 'game')
          )}
          {ref.playedAt ? ` — ${ref.playedAt.slice(0, 10)}` : ''}
        </li>
      ))}
      {refs.length > GAME_REF_DISPLAY_CAP && <li>+{refs.length - GAME_REF_DISPLAY_CAP} more</li>}
    </ul>
  );
}

export function GamesTreeView({ controls, status, targetOpening }: GamesTreeViewProps): React.JSX.Element {
  const { username, setUsername, save } = useLastUsername(STORAGE_KEY);
  const [site, setSite] = useState<ImportSite>('lichess');
  const [color, setColor] = useState<Color>('white');
  // Free text while typing, clamped on blur/Enter — same pattern as MultiPvPanel's depth field,
  // so "300" doesn't get chopped to "3" mid-keystroke.
  const [gamesText, setGamesText] = useState(String(DEFAULT_GAMES));
  const [gamesCount, setGamesCount] = useState(DEFAULT_GAMES);
  const [loaded, setLoaded] = useState<LoadedGames | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | undefined>(undefined);
  const [path, setPath] = useState<TreeMove[]>([]);

  const requestIdRef = useRef(0);

  // Built from `loaded` (the games and the username they were fetched as, captured together at
  // load time), never from the live `username` input directly (M2) — typing in that field after
  // a load must not rebuild the tree against a name that no longer matches the games it has.
  const tree: GamesTree | undefined = useMemo(
    () => (loaded ? buildGamesTree(loaded.games, loaded.username, color, { maxPliesPerSide: MAX_PLIES_PER_SIDE }) : undefined),
    [loaded, color],
  );

  // A newly built tree (a fetch completed, or the colour changed) invalidates any in-progress
  // path — same "compare during render, reset if changed" trick BuilderView uses for a changed
  // opening id, since an effect would let one stale-tree render slip through first.
  const [pathForTree, setPathForTree] = useState(tree);
  if (pathForTree !== tree) {
    setPathForTree(tree);
    setPath([]);
  }

  function finalizeGames(raw: string): void {
    setGamesCount(clampGames(Number(raw) || DEFAULT_GAMES));
    setGamesText(String(clampGames(Number(raw) || DEFAULT_GAMES)));
  }

  const load = (force: boolean): void => {
    const name = username.trim();
    if (!name) return;
    const key = cacheKey(site, name, gamesCount);
    if (!force) {
      const cached = recentGamesCache.get(key);
      if (cached) {
        setLoaded({ games: cached.games, username: name, fetchSkipped: cached.skipped });
        setFetchError(undefined);
        save(name);
        return;
      }
    }
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setFetchError(undefined);
    fetchRecent(site, name, gamesCount)
      .then(fetched => {
        if (requestIdRef.current !== requestId) return;
        recentGamesCache.set(key, fetched);
        setLoaded({ games: fetched.games, username: name, fetchSkipped: fetched.skipped });
        save(name);
      })
      .catch((err: unknown) => {
        if (requestIdRef.current !== requestId) return;
        setFetchError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (requestIdRef.current === requestId) setLoading(false);
      });
  };

  const currentEpd = tree ? (path.length ? path[path.length - 1]!.to : tree.root) : undefined;
  const fen = currentEpd ? fenAt(currentEpd) : START_FEN;
  const pos = useMemo(() => positionFromFen(fen), [fen]);
  const lastMove: [SquareName, SquareName] | undefined = path.length ? uciSquares(path[path.length - 1]!.uci) : undefined;
  const children = tree && currentEpd ? mostPlayed(childrenOf(tree, currentEpd)) : [];
  const lastEdge = path.length ? path[path.length - 1] : undefined;

  const loadForm = (
    <Panel title="Load your games">
      <div className="ob-tree-form">
        <Field label="Site">
          <SegmentedControl ariaLabel="Games site" options={SITE_OPTIONS} value={site} onChange={setSite} />
        </Field>
        <Field label={`${site === 'lichess' ? 'Lichess' : 'Chess.com'} username`} htmlFor="gtv-username">
          <input id="gtv-username" value={username} onChange={e => setUsername(e.target.value)} disabled={loading} />
        </Field>
        <Field label="Colour">
          <SegmentedControl ariaLabel="Games tree colour" options={COLOR_OPTIONS} value={color} onChange={setColor} />
        </Field>
        <Field label="Games to load (max 300)" htmlFor="gtv-count" hint="First guess: 100.">
          <input
            id="gtv-count"
            type="number"
            min={MIN_GAMES}
            max={MAX_GAMES}
            value={gamesText}
            onChange={e => setGamesText(e.target.value)}
            onBlur={e => finalizeGames(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') finalizeGames(e.currentTarget.value);
            }}
            disabled={loading}
          />
        </Field>
        <Button variant="primary" onClick={() => load(false)} disabled={loading || !username.trim()}>
          {loading ? 'Loading…' : 'Load'}
        </Button>
        {loaded !== undefined && (
          <Button variant="secondary" onClick={() => load(true)} disabled={loading || !username.trim()}>
            Fetch again
          </Button>
        )}
      </div>
      {loading && <Status kind="busy">Fetching games from {site}…</Status>}
      {fetchError && <Status kind="error">{fetchError}</Status>}
      {tree && loaded && (
        <Status kind="info">
          Folded {tree.gamesFolded} of {tree.gamesFolded + tree.gamesSkipped + loaded.fetchSkipped} fetched games ({loaded.username} as{' '}
          {tree.color}); depth capped at {tree.maxPliesPerSide} plies per side.
          {loaded.fetchSkipped > 0 && ` ${loaded.fetchSkipped} could not be parsed and were excluded before folding.`}
        </Status>
      )}
    </Panel>
  );

  return (
    <Workbench
      title="Your games"
      status={status}
      primary={controls}
      aside={loadForm}
      footer={
        <Toolbar>
          <Button variant="quiet" onClick={() => setPath([])} disabled={path.length === 0}>
            Back to start
          </Button>
          <Button variant="quiet" onClick={() => setPath(p => p.slice(0, -1))} disabled={path.length === 0}>
            Back
          </Button>
        </Toolbar>
      }
      board={sizePx => (
        <Board
          fen={fen}
          orientation={color}
          turnColor={turn(pos)}
          dests={NO_DESTS}
          movableColor={undefined}
          lastMove={lastMove}
          check={inCheck(pos)}
          onMove={() => {}}
          size={`${sizePx}px`}
        />
      )}
    >
      <div className="ob-path">
        {tree && path.length > 0 ? <MoveLine startFen={fenAt(tree.root)} ucis={path.map(m => m.uci)} orientation={color} /> : <Status kind="info">(start)</Status>}
      </div>
      <Panel title="Moves played here">
        {!tree && <Status kind="info">Load your games above to see your opening tree.</Status>}
        {tree && children.length === 0 && <Status kind="info">No folded game reaches this position.</Status>}
        {tree && children.length > 0 && (
          <ul className="ob-tree-moves">
            {children.map(m => {
              const pct = wdlPercents(m.results);
              return (
                <li key={m.uci}>
                  <Button variant="secondary" size="sm" className="ob-tree-move-button" onClick={() => setPath(p => [...p, m])}>
                    {m.san} · {m.count} game{m.count === 1 ? '' : 's'} · {(moveScore(m) * 100).toFixed(0)}%
                  </Button>
                  <span className="ob-tree-wdl" title={wdlTitle(pct, m.count)}>
                    <span className="ob-tree-wdl-win" style={{ width: `${pct.win}%` }} />
                    <span className="ob-tree-wdl-draw" style={{ width: `${pct.draw}%` }} />
                    <span className="ob-tree-wdl-loss" style={{ width: `${pct.loss}%` }} />
                  </span>
                  {targetOpening && targetOpening.color === color && (
                    <Button variant="quiet" size="sm" onClick={() => targetOpening.addLine([...path.map(p => p.uci), m.uci])}>
                      Add to {targetOpening.name}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
      {lastEdge && (
        <Panel title="Games with this move">
          <GameRefList refs={lastEdge.games} />
        </Panel>
      )}
    </Workbench>
  );
}
