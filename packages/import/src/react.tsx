// React glue for importing a game (lichess username or pasted PGN), shared by every subproject
// that starts from an imported game. Kept out of the package's main entry ("./react" subpath)
// so non-React consumers of fetchLatestLichessGame/importPgn never pull in React.
import { useEffect, useRef, useState } from 'react';
import { fetchLatestLichessGame } from './lichess';
import { toImportedGame } from './parse';
import type { ImportedGame } from './types';

/** Reads the last lichess username tried under `storageKey`, per browser. Guarded because
 * storage can be missing (SSR, private browsing) or throw. */
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
  /** Namespaces the remembered lichess username so subprojects don't clobber each other's. */
  storageKey: string;
  /** Defaults to a generic heading; pass the subproject's own name for its screen. */
  title?: string;
}

/**
 * Import a game by lichess username (fetches the player's latest game) or by pasting a PGN.
 * Guards against a stale fetch clobbering a screen the user already moved past: `requestIdRef`
 * makes an old resolve stale the moment a newer fetch starts, `settledRef` makes it stale the
 * moment any import (fetch or paste) already succeeded, or the component unmounted.
 */
export function ImportScreen({ onImported, storageKey, title = 'Import a game' }: ImportScreenProps): React.JSX.Element {
  const { username, setUsername, save } = useLastUsername(storageKey);
  const [pgnText, setPgnText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

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
    fetchLatestLichessGame(username.trim())
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
    <div className="hc-import">
      <h2>{title}</h2>
      <section>
        <label htmlFor="hc-import-username">Lichess username</label>
        <input
          id="hc-import-username"
          value={username}
          onChange={e => setUsername(e.target.value)}
          disabled={loading}
        />
        <button onClick={fetchGame} disabled={loading || !username.trim()}>
          {loading ? 'Fetching…' : 'Fetch my latest game'}
        </button>
      </section>
      <section>
        <label htmlFor="hc-import-pgn">Or paste a PGN</label>
        <textarea id="hc-import-pgn" rows={8} value={pgnText} onChange={e => setPgnText(e.target.value)} />
        <button onClick={usePastedPgn} disabled={!pgnText.trim() || loading}>
          Use this PGN
        </button>
      </section>
      {error && (
        <p className="hc-import-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
