// The "Your games" analysis's sources manager: linked lichess/chess.com accounts, persisted via
// @human-chess/store's GamesStore (listSources/putGames/setSyncState — see gamesStore.ts for the
// shared handle), each syncable (packages/import's syncSourceGames) and removable. Only one sync
// runs at a time app-wide (within this panel); every error surfaced here is the real thing
// syncSourceGames/the underlying fetch threw — a LichessRateLimited/ChesscomRateLimited message,
// a site-client cooldown message, or a plain fetch failure — never retried automatically (A1: no
// invented outcome, no invented retry).
import { useEffect, useRef, useState } from 'react';
import { syncSourceGames, type SyncProgress } from '@human-chess/import';
import type { GameSource, SyncState } from '@human-chess/store';
import { Button, Field, Panel, SegmentedControl, Status, Toolbar } from '@human-chess/ui';
import { getGamesStore } from './gamesStore';
import { formatLastPlayed, sourceKey } from './treeHelpers';
import {
  DEFAULT_MAX_GAMES,
  loadAddSourceSite,
  loadMaxGames,
  MAX_MAX_GAMES,
  MIN_MAX_GAMES,
  saveAddSourceSite,
  saveMaxGames,
} from './yourGamesStorage';

export interface SourcesPanelProps {
  /** Called with the store's current source list every time it changes (initial load, add,
   * remove, or a sync that touched it) — a fresh array each time, so a caller relying on
   * reference identity (GamesTreeView's game-loading effect) reliably re-runs even when a sync
   * only changed a source's game count, not the list of sources itself. */
  onSourcesChanged: (sources: GameSource[]) => void;
}

const SITE_OPTIONS: { value: 'lichess' | 'chess.com'; label: string }[] = [
  { value: 'lichess', label: 'lichess' },
  { value: 'chess.com', label: 'chess.com' },
];

function isAbort(err: unknown): boolean {
  return (err instanceof DOMException || err instanceof Error) && err.name === 'AbortError';
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

interface SourceRow {
  source: GameSource;
  count: number;
  syncState: SyncState | undefined;
}

export function SourcesPanel({ onSourcesChanged }: SourcesPanelProps): React.JSX.Element {
  const [rows, setRows] = useState<SourceRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const [site, setSite] = useState<'lichess' | 'chess.com'>(() => loadAddSourceSite());
  const [username, setUsername] = useState('');
  const [maxGamesText, setMaxGamesText] = useState(String(loadMaxGames()));
  const [maxGames, setMaxGames] = useState(loadMaxGames());
  const [syncingKey, setSyncingKey] = useState<string | undefined>(undefined);
  const [progress, setProgress] = useState<SyncProgress | undefined>(undefined);
  const [errors, setErrors] = useState<Map<string, string>>(new Map());
  // The source just submitted via "Add & sync", shown as its own row (busy/Cancel/error) even
  // though it has no entry in `rows` yet — without this, a source whose very first sync fails
  // before ever writing a game (e.g. a 404 "no such lichess user") has nowhere to render its
  // Status/Cancel/error at all, and the failure just vanishes. Cleared once `rows` actually lists
  // it (see the effect below), not merely once the sync settles, so a failed first sync keeps
  // showing its row and its error until the user removes or successfully retries it.
  const [pending, setPending] = useState<GameSource | undefined>(undefined);
  const abortRef = useRef<AbortController | undefined>(undefined);

  const refresh = async (): Promise<void> => {
    const store = getGamesStore();
    const sources = await store.listSources();
    const next = await Promise.all(
      sources.map(async source => ({
        source,
        count: await store.countGames(source),
        syncState: await store.getSyncState(source),
      })),
    );
    setRows(next);
    setLoaded(true);
    setLoadError(undefined);
    onSourcesChanged(sources);
  };

  useEffect(() => {
    refresh().catch((err: unknown) => {
      // A failed initial listSources() used to just leave the panel showing "no linked accounts
      // yet" with the real failure silently dropped — now it's surfaced as an error Status too,
      // still leaving the add form usable.
      setLoaded(true);
      setLoadError(errMessage(err));
    });
    // Runs once on mount only — `refresh` itself is what re-fires this panel's own updates
    // afterwards (add/remove/sync all call it directly).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clears `pending` once the store actually lists the source it names — a successful sync (even
  // a partial one that wrote at least one game before erroring) makes it a real row, at which
  // point the dedicated pending row would just be a duplicate of it.
  useEffect(() => {
    if (pending && rows.some(r => sourceKey(r.source) === sourceKey(pending))) {
      setPending(undefined);
    }
  }, [pending, rows]);

  // Shown once, right when the initial load settles (loaded flips false -> true): open when there
  // are no accounts yet (nothing else to see, and the add form is the point), closed once there
  // are some (the tree below deserves the vertical space more at first glance). Deliberately not
  // re-run on every `rows` change — `onToggle` below is what makes the user's own later toggles
  // stick instead of being fought by a recompute on the next add/remove.
  const [detailsOpen, setDetailsOpen] = useState(true);
  useEffect(() => {
    if (loaded) setDetailsOpen(rows.length === 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  const runSync = (source: GameSource): void => {
    if (abortRef.current) return; // only one sync at a time; the ref (not the stale syncingKey
    // state) is checked so two rapid clicks before a re-render can't both pass the guard.
    const key = sourceKey(source);
    setSyncingKey(key);
    setProgress(undefined);
    setErrors(prev => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
    const controller = new AbortController();
    abortRef.current = controller;
    syncSourceGames(getGamesStore(), source, {
      maxGames,
      onProgress: p => setProgress(p),
      signal: controller.signal,
    })
      .then(() => refresh())
      .catch((err: unknown) => {
        if (isAbort(err)) {
          // A cancelled sync may still have written some games before the abort landed —
          // refresh() so the row (or count) reflects whatever actually made it into the store,
          // rather than leaving the list stale until some unrelated change refreshes it.
          refresh().catch((refreshErr: unknown) => setLoadError(errMessage(refreshErr)));
          return;
        }
        setErrors(prev => new Map(prev).set(key, errMessage(err)));
      })
      .finally(() => {
        setSyncingKey(undefined);
        setProgress(undefined);
        abortRef.current = undefined;
      });
  };

  const cancelSync = (): void => {
    abortRef.current?.abort();
  };

  const addSource = (): void => {
    const name = username.trim();
    if (!name) return;
    const source = { site, username: name };
    if (rows.some(r => sourceKey(r.source) === sourceKey(source))) return; // already linked
    saveAddSourceSite(site);
    setUsername('');
    setPending(source);
    runSync(source);
  };

  const removeSource = (source: GameSource): void => {
    const ok = typeof confirm === 'function' ? confirm(`Remove ${source.site} account "${source.username}"? This deletes its synced games.`) : true;
    if (!ok) return;
    getGamesStore()
      .clearSource(source)
      .then(() => refresh())
      .catch((err: unknown) => setLoadError(errMessage(err)));
  };

  const finalizeMaxGames = (raw: string): void => {
    const n = Number(raw);
    const clamped = Number.isFinite(n) ? Math.min(MAX_MAX_GAMES, Math.max(MIN_MAX_GAMES, Math.round(n))) : DEFAULT_MAX_GAMES;
    setMaxGames(clamped);
    setMaxGamesText(String(clamped));
    saveMaxGames(clamped);
  };

  const pendingKey = pending ? sourceKey(pending) : undefined;
  // Errors with nowhere else to show: not the currently-pending source (that one gets its error
  // inline in its own pending row below) and not an existing row (each row shows its own error
  // inline too) — e.g. a previous add's failure, left behind once a *different* source becomes
  // pending. Shown under the add form rather than dropped.
  const orphanedErrors = Array.from(errors.entries()).filter(
    ([key]) => key !== pendingKey && !rows.some(r => sourceKey(r.source) === key),
  );

  return (
    <Panel title="Linked accounts">
      {loadError && <Status kind="error">Couldn't load linked accounts: {loadError}</Status>}
      <details className="ob-sources-details" open={detailsOpen} onToggle={e => setDetailsOpen(e.currentTarget.open)}>
        <summary>{rows.length > 0 ? `${rows.length} account${rows.length === 1 ? '' : 's'} linked` : 'No accounts linked yet'}</summary>
        <div className="ob-sources-details-body">
          {loaded && rows.length === 0 && !pending && <Status kind="info">Link a lichess or chess.com account and sync to build your tree.</Status>}
          {(rows.length > 0 || pending) && (
            <ul className="ob-sources">
              {rows.map(({ source, count, syncState }) => {
                const key = sourceKey(source);
                const isSyncing = syncingKey === key;
                return (
                  <li key={key} className="ob-sources-row">
                    <div className="ob-sources-row-main">
                      <span className="ob-sources-label">
                        {source.site} · {source.username}
                      </span>
                      <span className="ob-sources-meta">
                        {count} game{count === 1 ? '' : 's'} · last synced {formatLastPlayed(syncState?.lastSyncAt)}
                      </span>
                    </div>
                    <Toolbar>
                      {isSyncing ? (
                        <Button variant="quiet" size="sm" onClick={cancelSync}>
                          Cancel
                        </Button>
                      ) : (
                        <Button variant="secondary" size="sm" onClick={() => runSync(source)} disabled={syncingKey !== undefined}>
                          Sync
                        </Button>
                      )}
                      <Button variant="quiet" size="sm" onClick={() => removeSource(source)} disabled={isSyncing}>
                        Remove
                      </Button>
                    </Toolbar>
                    {isSyncing && progress && (
                      <Status kind="busy">{progress.total !== undefined ? progress.stage : `${progress.stage}… ${progress.done}`}</Status>
                    )}
                    {errors.get(key) && <Status kind="error">{errors.get(key)}</Status>}
                  </li>
                );
              })}
              {pending && (
                <li key={pendingKey} className="ob-sources-row">
                  <div className="ob-sources-row-main">
                    <span className="ob-sources-label">
                      {pending.site} · {pending.username}
                    </span>
                  </div>
                  <Toolbar>
                    <Button variant="quiet" size="sm" onClick={cancelSync}>
                      Cancel
                    </Button>
                  </Toolbar>
                  {progress && <Status kind="busy">{progress.total !== undefined ? progress.stage : `${progress.stage}… ${progress.done}`}</Status>}
                  {pendingKey && errors.get(pendingKey) && <Status kind="error">{errors.get(pendingKey)}</Status>}
                </li>
              )}
            </ul>
          )}

          <div className="ob-sources-add">
            <Field label="Site">
              <SegmentedControl ariaLabel="Site to link" options={SITE_OPTIONS} value={site} onChange={setSite} />
            </Field>
            <Field label={`${site === 'lichess' ? 'Lichess' : 'Chess.com'} username`} htmlFor="ob-sources-username">
              <input
                id="ob-sources-username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') addSource();
                }}
              />
            </Field>
            <Button variant="primary" onClick={addSource} disabled={!username.trim() || syncingKey !== undefined}>
              Add &amp; sync
            </Button>
          </div>
          {orphanedErrors.map(([key, msg]) => (
            <Status key={key} kind="error">
              {key}: {msg}
            </Status>
          ))}
          <Field
            label="Max games per sync"
            htmlFor="ob-sources-maxgames"
            hint={`First guess: ${DEFAULT_MAX_GAMES}. Range ${MIN_MAX_GAMES}–${MAX_MAX_GAMES}.`}
          >
            <input
              id="ob-sources-maxgames"
              type="number"
              min={MIN_MAX_GAMES}
              max={MAX_MAX_GAMES}
              value={maxGamesText}
              onChange={e => setMaxGamesText(e.target.value)}
              onBlur={e => finalizeMaxGames(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') finalizeMaxGames(e.currentTarget.value);
              }}
            />
          </Field>
        </div>
      </details>
    </Panel>
  );
}
