// React bindings for the lichess session: a hook every subproject can share, and a small login
// button. Published as the package's "./react" subpath so consumers that don't need React (or
// don't want it pulled in) can import the plain client from the package root instead.
import { useCallback, useEffect, useState } from 'react';
import { currentLichessSession, lastLichessLoginError, logoutLichess, startLichessLogin, subscribeLichessAuth, type LichessSession } from './auth';

export interface UseLichessSessionResult {
  session: LichessSession | undefined;
  login: (opts?: { scopes?: string[] }) => void;
  logout: () => void;
  /** True while a login or logout is in flight. login() itself normally navigates away before
   * this would ever clear; it's reset on failure (e.g. the PKCE step throwing). */
  busy: boolean;
  error: string | undefined;
}

/** The lichess session, kept in sync with login/logout anywhere in the app via a shared
 * module-level event (see auth.ts's subscribeLichessAuth), plus login/logout actions. */
export function useLichessSession(): UseLichessSessionResult {
  const [session, setSession] = useState<LichessSession | undefined>(() => currentLichessSession());
  const [busy, setBusy] = useState(false);
  // Seeded from, and refreshed with, auth.ts's record of the startup callback's outcome: the
  // redirect back from lichess is completed by App.tsx, not by any component, so this is how a
  // failed login reaches the person who clicked the button.
  const [error, setError] = useState<string | undefined>(() => lastLichessLoginError());

  useEffect(() => {
    setSession(currentLichessSession());
    setError(lastLichessLoginError());
    return subscribeLichessAuth(() => {
      setSession(currentLichessSession());
      setError(lastLichessLoginError());
    });
  }, []);

  const login = useCallback((opts?: { scopes?: string[] }): void => {
    setBusy(true);
    setError(undefined);
    startLichessLogin(opts).catch((err: unknown) => {
      setBusy(false);
      setError(err instanceof Error ? err.message : String(err));
    });
    // No setBusy(false) on success: startLichessLogin navigates the page away.
  }, []);

  const logout = useCallback((): void => {
    setBusy(true);
    setError(undefined);
    logoutLichess()
      .then(() => setBusy(false))
      .catch((err: unknown) => {
        setBusy(false);
        setError(err instanceof Error ? err.message : String(err));
      });
  }, []);

  return { session, login, logout, busy, error };
}

/** "Log in with lichess", or "lichess: <username>" + "Log out". Class names are stable:
 * `.lichess-login`, `.lichess-login-user`, `.lichess-login-error` — see apps/web/src/styles.css. */
export function LichessLogin(): React.JSX.Element {
  const { session, login, logout, busy, error } = useLichessSession();
  return (
    <div className="lichess-login">
      {session ? (
        <>
          <span className="lichess-login-user">lichess: {session.username}</span>
          <button onClick={logout} disabled={busy}>
            Log out
          </button>
        </>
      ) : (
        <button onClick={() => login()} disabled={busy}>
          Log in with lichess
        </button>
      )}
      {error && <span className="lichess-login-error">{error}</span>}
    </div>
  );
}
