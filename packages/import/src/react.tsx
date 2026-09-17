// React glue for importing a game (lichess username, chess.com username, or pasted PGN),
// shared by every subproject that starts from an imported game. Kept out of the package's main
// entry ("./react" subpath) so non-React consumers of fetchLatestLichessGame/importPgn never
// pull in React.
import { useEffect, useRef, useState } from 'react';
import { Button, Field, Page, SegmentedControl, Status } from '@human-chess/ui';
import { fetchLatestChesscomGame } from './chesscom';
import { fetchLatestLichessGame } from './lichess';
import { toImportedGame } from './parse';
import type { ImportedGame } from './types';

/** The two sites ImportScreen can fetch a "latest game" from; 'pgn' import is always available
 * alongside whichever of these is selected. */
export type ImportSite = 'lichess' | 'chess.com';

const SITE_STORAGE_SUFFIX = '.site';

/** Reads the last site picked under `storageKey`, per browser. Defaults to lichess (the
 * original, and still first-listed, option) when nothing is stored or storage is unavailable. */
function loadLastSite(storageKey: string): ImportSite {
  try {
    return globalThis.localStorage?.getItem(`${storageKey}${SITE_STORAGE_SUFFIX}`) === 'chess.com' ? 'chess.com' : 'lichess';
  } catch {
    return 'lichess';
  }
}

function saveLastSite(storageKey: string, site: ImportSite): void {
  try {
    globalThis.localStorage?.setItem(`${storageKey}${SITE_STORAGE_SUFFIX}`, site);
  } catch {
    // storage unavailable: the site just won't be remembered next time
  }
}

/** Reads the last username tried under `storageKey`, per browser. Guarded because storage can
 * be missing (SSR, private browsing) or throw. */
function loadLastUsername(storageKey: string): string {
  try {
    return globalThis.localStorage?.getItem(storageKey) ?? '';
  } catch {
    return '';
  }
}

function saveLastUsername(storageKey: string, username: string): void {
  try {
    globalThis.localStorage?.setItem(storageKey, username);
  } catch {
    // storage unavailable: the username just won't be remembered next time
  }
}

/**
 * Per-viewer "last username tried" state, namespaced by `storageKey` so each subproject keeps
 * its own value. `setUsername` only updates the in-memory field (e.g. while typing); `save`
 * persists a value to storage once an import actually succeeds with it.
 */
export function useLastUsername(storageKey: string): {
  username: string;
  setUsername: (value: string) => void;
  save: (value: string) => void;
} {
  const [username, setUsername] = useState(() => loadLastUsername(storageKey));
  const save = (value: string): void => saveLastUsername(storageKey, value);
  return { username, setUsername, save };
}

export interface ImportScreenProps {
  onImported: (game: ImportedGame) => void;
  /** Namespaces the remembered username (and site choice) so subprojects don't clobber each
   * other's. */
  storageKey: string;
  /** Defaults to a generic heading; pass the subproject's own name for its screen. */
  title?: string;
}

const SITE_LABELS: Record<ImportSite, string> = { lichess: 'lichess', 'chess.com': 'chess.com' };
const SITE_DISPLAY_NAMES: Record<ImportSite, string> = { lichess: 'Lichess', 'chess.com': 'Chess.com' };
const FETCHERS: Record<ImportSite, (username: string) => Promise<ImportedGame>> = {
  lichess: fetchLatestLichessGame,
  'chess.com': fetchLatestChesscomGame,
};

/** The one place that turns (site, username) into a fetch — used by ImportScreen's own button
 * and by any other screen (e.g. the memory trainer's "Fetch again") that needs to re-run the
 * exact same fetch later, so there is only one path to duplicate a bug in. */
export function fetchLatestGameFrom(site: ImportSite, username: string): Promise<ImportedGame> {
  return FETCHERS[site](username);
}

/** The source picked in the SegmentedControl: either site ImportScreen can fetch a latest game
 * from, or 'pgn' to switch the form over to pasting one. Local display state only — the fetch
 * path still only ever knows about `ImportSite`. */
type Source = ImportSite | 'pgn';

const SOURCE_OPTIONS: { value: Source; label: string }[] = [
  { value: 'lichess', label: 'lichess' },
  { value: 'chess.com', label: 'chess.com' },
  { value: 'pgn', label: 'pasted PGN' },
];

/**
 * Import a game by username from lichess or chess.com (fetches the player's latest game) or by
 * pasting a PGN. Guards against a stale fetch clobbering a screen the user already moved past:
 * `requestIdRef` makes an old resolve stale the moment a newer fetch starts, `settledRef` makes
 * it stale the moment any import (fetch or paste) already succeeded, or the component unmounted.
 */
export function ImportScreen({ onImported, storageKey, title = 'Import a game' }: ImportScreenProps): React.JSX.Element {
  const { username, setUsername, save } = useLastUsername(storageKey);
  const [site, setSite] = useState<ImportSite>(() => loadLastSite(storageKey));
  const [pgnMode, setPgnMode] = useState(false);
  const [pgnText, setPgnText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const chooseSite = (next: ImportSite): void => {
    setSite(next);
    saveLastSite(storageKey, next);
    setError(undefined);
  };

  const chooseSource = (next: Source): void => {
    if (next === 'pgn') {
      setPgnMode(true);
      setError(undefined);
      return;
    }
    setPgnMode(false);
    chooseSite(next);
  };

  const requestIdRef = useRef(0);
  const settledRef = useRef(false);
  useEffect(() => {
    // Reset on (re)mount: React StrictMode mounts, unmounts and mounts again in development, and
    // a cleanup-only effect left `settledRef` stuck at true, so every fetch result was silently
    // dropped (user report 2026-09-16: "clicked fetch and nothing happened").
    settledRef.current = false;
    return () => {
      settledRef.current = true;
    };
  }, []);

  const fetchGame = (): void => {
    if (!username.trim()) return;
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(undefined);
    fetchLatestGameFrom(site, username.trim())
      .then(game => {
        if (settledRef.current || requestIdRef.current !== requestId) return;
        settledRef.current = true;
        save(username.trim());
        onImported(game);
      })
      .catch((err: unknown) => {
        if (settledRef.current || requestIdRef.current !== requestId) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (requestIdRef.current === requestId) setLoading(false);
      });
  };

  const usePastedPgn = (): void => {
    setError(undefined);
    try {
      const game = toImportedGame('pgn', pgnText);
      settledRef.current = true;
      onImported(game);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Page title={title} width="medium">
      <SegmentedControl options={SOURCE_OPTIONS} value={pgnMode ? 'pgn' : site} onChange={chooseSource} ariaLabel="Import source" />
      {!pgnMode && (
        <>
          <Field label={`${SITE_DISPLAY_NAMES[site]} username`} htmlFor="hc-import-username">
            <input
              id="hc-import-username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder={`${SITE_DISPLAY_NAMES[site]} username`}
              disabled={loading}
            />
          </Field>
          <Button variant="primary" onClick={fetchGame} disabled={loading || !username.trim()}>
            {loading ? 'Fetching…' : `Fetch my latest game from ${SITE_LABELS[site]}`}
          </Button>
        </>
      )}
      {pgnMode && (
        <>
          <Field label="Paste a PGN" htmlFor="hc-import-pgn">
            <textarea id="hc-import-pgn" rows={8} value={pgnText} onChange={e => setPgnText(e.target.value)} />
          </Field>
          <Button onClick={usePastedPgn} disabled={!pgnText.trim() || loading}>
            Use this PGN
          </Button>
        </>
      )}
      {error && <Status kind="error">{error}</Status>}
    </Page>
  );
}
