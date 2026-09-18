// Interactive building: the user plays moves for both colours on the board (their own moves,
// and the opponent's "what if" replies they want in the tree — memory/subprojects/openings-builder-trainer.md,
// "Building a repertoire"). Every move played is added to the tree. The MultiPV panel on the
// right gives the multi-line engine the user's interview asked for (priority 1, same file).
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Board, MoveLine } from '@human-chess/board';
import type { UciEngine } from '@human-chess/engine';
import type { TreeMove } from '@human-chess/opening-tree';
import { inCheck, legalDests, playMove, positionFromFen, turn, uciSquares, type Role, type SquareName } from '@human-chess/rules';
import type { GameSource } from '@human-chess/store';
import { Button, Panel, Status, Toolbar, usePersistedState, Workbench } from '@human-chess/ui';
import { ExplorerPanel } from './ExplorerPanel';
import { getGamesStore } from './gamesStore';
import { MultiPvPanel } from './MultiPvPanel';
import { OwnGamesPanel } from './OwnGamesPanel';
import { useOwnGamesTree } from './ownGamesTree';
import { BUILD_PATH_KEY, parseBuildPathSnapshot, rebuildBuildPath, type BuildPathSnapshot } from './persistence';
import { addMove, childrenOf, fenAt, movesBeyond, removeMove, type Opening, type OpeningMove } from './repertoire';
import { loadGamesTreeFilter } from './yourGamesStorage';

export interface BuilderViewProps {
  opening: Opening;
  onOpeningChange: (opening: Opening) => void;
  engine: UciEngine | undefined;
  /** The opening picker / new-opening form / build-drill toggle, shared with DrillView and
   * rendered by the parent (OpeningsBuilder) since it outlives either view. Rendered as
   * `primary` here — build mode has no other single "next action". */
  controls: ReactNode;
  /** The engine-failed-to-load banner, if any; rendered as Workbench's `status`. */
  status?: ReactNode;
}

export function BuilderView({ opening, onOpeningChange, engine, controls, status }: BuilderViewProps): React.JSX.Element {
  // The path of edges taken from the root to here, persisted as a UCI list keyed by opening id
  // (every opening shares the same root EPD — the standard starting position — so the id is the
  // only thing that tells "this opening's saved path" apart from an unrelated one that happens
  // to start the same way). Restoring only happens in this initialiser (parseSnapshot runs once,
  // at mount) — the sentinel below, unchanged from before, handles the opening changing *after*
  // mount (the picker, not a reload): switching to a different opening still starts at its root,
  // same as today, unless a later reload finds a saved path for that exact opening.
  const parseSnapshot = (raw: unknown): OpeningMove[] | undefined => {
    const snapshot = parseBuildPathSnapshot(raw);
    if (!snapshot || snapshot.openingId !== opening.id) return undefined;
    return rebuildBuildPath(opening, snapshot.ucis);
  };
  const serializeSnapshot = useCallback((value: OpeningMove[]): BuildPathSnapshot => ({ openingId: opening.id, ucis: value.map(m => m.uci) }), [opening.id]);
  const [path, setPath] = usePersistedState<OpeningMove[]>(BUILD_PATH_KEY, [], { parse: parseSnapshot, serialize: serializeSnapshot });
  const [pathOpeningId, setPathOpeningId] = useState(opening.id);
  if (pathOpeningId !== opening.id) {
    setPathOpeningId(opening.id);
    setPath([]);
  }

  const currentEpd = path.length ? path[path.length - 1]!.to : opening.root;
  const fen = fenAt(currentEpd);
  const pos = useMemo(() => positionFromFen(fen), [fen]);
  const dests = useMemo(() => legalDests(pos), [pos]);
  const lastPathMove = path.length ? path[path.length - 1] : undefined;
  const lastMove: [SquareName, SquareName] | undefined = lastPathMove ? uciSquares(lastPathMove.uci) : undefined;

  const playAndAdd = (uci: string): void => {
    const updated = addMove(opening, currentEpd, uci);
    const edge = childrenOf(updated, currentEpd).find(m => m.uci === uci);
    onOpeningChange(updated);
    if (edge) setPath(p => [...p, edge]);
  };

  // Records several candidate opponent replies at once without moving along any of them; the
  // user then answers each from "Tree at this position".
  const children = childrenOf(opening, currentEpd);

  // A reply the rules library rejects (an explorer move that isn't legal here, say) is reported
  // and skipped, so it never takes the legal ones down with it (reviewer, 2026-09-16).
  const [replyError, setReplyError] = useState<string | undefined>(undefined);
  const addReplies = (ucis: string[]): void => {
    let updated = opening;
    const failed: string[] = [];
    for (const uci of ucis) {
      try {
        updated = addMove(updated, currentEpd, uci);
      } catch (err) {
        failed.push(`${uci} (${err instanceof Error ? err.message : String(err)})`);
      }
    }
    if (updated !== opening) onOpeningChange(updated);
    setReplyError(failed.length > 0 ? `Could not add: ${failed.join(', ')}` : undefined);
  };

  // "Your games": the openingtree-style own-games statistics, brought into Build mode alongside
  // the engine lines and the explorer (task, 2026-09-18). Unlike GamesTreeView (fed by
  // SourcesPanel's onSourcesChanged, which also drives syncing), this view never syncs — it only
  // needs to know which accounts are already linked, so a one-shot listSources() on mount is
  // enough; `ownGamesFilter` is read once too (the persisted Your-games filter, so the two modes
  // agree), never edited from here.
  const [ownGamesSources, setOwnGamesSources] = useState<GameSource[]>([]);
  const [ownGamesSourcesLoaded, setOwnGamesSourcesLoaded] = useState(false);
  const [ownGamesSourcesError, setOwnGamesSourcesError] = useState<string | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    getGamesStore()
      .listSources()
      .then(list => {
        if (cancelled) return;
        setOwnGamesSources(list);
        setOwnGamesSourcesLoaded(true);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setOwnGamesSourcesError(err instanceof Error ? err.message : String(err));
        setOwnGamesSourcesLoaded(true);
      });
    return () => {
      cancelled = true;
    };
    // Runs once on mount only — this view never adds/removes/syncs an account itself, so there is
    // nothing else that would need to re-list sources.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [ownGamesFilter] = useState(() => loadGamesTreeFilter());
  // Built with the opening's own colour, not the persisted Your-games colour (docs: the two
  // modes must agree on "your side" for this position) — and only from `sources`/`color`/
  // `filter`, never `currentEpd`/`path`, so it is not rebuilt on every move (performance
  // requirement).
  const ownGamesTree = useOwnGamesTree({ sources: ownGamesSources, color: opening.color, filter: ownGamesFilter });
  const ownGamesTurnIsOwn = turn(pos) === opening.color;
  const onAddOwnGamesMove = (move: TreeMove): void => {
    if (ownGamesTurnIsOwn) playAndAdd(move.uci);
    else addReplies([move.uci]);
  };
  const onGoOwnGamesMove = (move: TreeMove): void => {
    const edge = children.find(m => m.uci === move.uci);
    if (edge) setPath(p => [...p, edge]);
  };

  // Removing an edge whose continuation has recorded moves takes those with it (they become
  // unreachable), so that case asks first; a leaf goes without a prompt.
  const removeReply = (m: OpeningMove): void => {
    const beyond = movesBeyond(opening, m.to);
    if (beyond > 0 && !window.confirm(`Remove ${m.san} and the ${beyond} move${beyond === 1 ? '' : 's'} recorded after it?`)) return;
    onOpeningChange(removeMove(opening, currentEpd, m.uci));
  };

  const onBoardMove = (from: SquareName, to: SquareName, promotion?: Role): void => {
    const played = playMove(pos, from, to, promotion);
    playAndAdd(played.uci);
  };

  return (
    <Workbench
      title={opening.name}
      status={status}
      primary={controls}
      aside={
        <div className="ob-aside-scroll">
          <Panel title="Engine lines">
            <MultiPvPanel
              engine={engine}
              fen={fen}
              onPlayMove={playAndAdd}
              orientation={opening.color}
              inTree={children.map(m => m.uci)}
              {...(turn(pos) !== opening.color ? { onAddReplies: addReplies } : {})}
            />
          </Panel>
          <Panel title="Your games">
            <OwnGamesPanel
              tree={ownGamesTree.tree}
              epd={currentEpd}
              turnIsOwn={ownGamesTurnIsOwn}
              repertoireChildren={children}
              onAdd={onAddOwnGamesMove}
              onGo={onGoOwnGamesMove}
              hasSources={ownGamesSources.length > 0}
              loading={!ownGamesSourcesLoaded || ownGamesTree.loading}
              loadError={ownGamesSourcesError ?? ownGamesTree.loadError}
              selectedGamesCount={ownGamesTree.selectedGames.length}
            />
          </Panel>
          {turn(pos) !== opening.color && (
            <Panel title="Lichess explorer">
              <ExplorerPanel fen={fen} onAddMoves={addReplies} />
            </Panel>
          )}
          {replyError && <Status kind="error">{replyError}</Status>}
        </div>
      }
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
          orientation={opening.color}
          turnColor={turn(pos)}
          dests={dests}
          movableColor={turn(pos)}
          lastMove={lastMove}
          check={inCheck(pos)}
          onMove={onBoardMove}
          size={`${sizePx}px`}
        />
      )}
    >
      <div className="ob-path">{path.length === 0 ? <Status kind="info">(start)</Status> : <MoveLine startFen={fenAt(opening.root)} ucis={path.map(m => m.uci)} orientation={opening.color} />}</div>
      <Panel title="Tree at this position">
        {children.length === 0 && <Status kind="info">No moves recorded here yet.</Status>}
        <ul className="ob-children">
          {children.map(m => (
            <li key={m.uci}>
              <Button variant="secondary" size="sm" onClick={() => setPath(p => [...p, m])}>
                {m.san}
              </Button>
              <Button
                variant="quiet"
                size="sm"
                className="ob-remove"
                title={`Remove ${m.san} from the tree`}
                aria-label={`Remove ${m.san} from the tree`}
                onClick={() => removeReply(m)}
              >
                ×
              </Button>
            </li>
          ))}
        </ul>
      </Panel>
    </Workbench>
  );
}
