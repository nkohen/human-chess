// lichess OAuth2 PKCE login (verified facts: memory/reuse-library.md, "lichess opening explorer
// API"). No client registration — client_id is any string, fixed here as 'human-chess'.
// startLichessLogin sends the browser to lichess; completeLichessLogin (called once at app
// start) picks the flow back up when lichess redirects to the app root with ?code&state.
//
// Testability: the pure parts (authorize-URL building, callback-query parsing, session/pending-
// login storage) take plain values and are unit tested directly. startLichessLogin and
// completeLichessLogin also read/write `location` and `history` — there is no jsdom in this
// workspace's vitest run, so auth.test.ts stubs minimal Location/History-shaped objects onto
// `globalThis` for those two functions, rather than leaving them untested.
import { lichessFetch, lichessNow, setLichessTokenProvider } from './fetch';
import { challengeFor, createVerifier } from './pkce';

const CLIENT_ID = 'human-chess';
const AUTHORIZE_URL = 'https://lichess.org/oauth';
const TOKEN_URL = 'https://lichess.org/api/token';
const ACCOUNT_URL = 'https://lichess.org/api/account';

const PKCE_KEY = 'human-chess.lichess.pkce.v1';
const SESSION_KEY = 'human-chess.lichess.session.v1';

export interface LichessSession {
  accessToken: string;
  expiresAt: number;
  username: string;
}

interface PendingLogin {
  verifier: string;
  state: string;
  redirectUri: string;
  returnHash: string;
}

// ---- pure helpers (unit tested without any DOM) ----------------------------------------

export function buildAuthorizeUrl(opts: {
  redirectUri: string;
  codeChallenge: string;
  state: string;
  scopes?: string[];
}): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', CLIENT_ID);
  url.searchParams.set('redirect_uri', opts.redirectUri);
  url.searchParams.set('code_challenge', opts.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', opts.state);
  if (opts.scopes && opts.scopes.length > 0) url.searchParams.set('scope', opts.scopes.join(' '));
  return url.toString();
}

export interface CallbackQuery {
  code: string | undefined;
  state: string | undefined;
  error: string | undefined;
  errorDescription: string | undefined;
}

export function parseCallbackQuery(search: string): CallbackQuery {
  const params = new URLSearchParams(search);
  return {
    code: params.get('code') ?? undefined,
    state: params.get('state') ?? undefined,
    error: params.get('error') ?? undefined,
    errorDescription: params.get('error_description') ?? undefined,
  };
}

function randomState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

// ---- storage (guarded the same way storage.ts / cache.ts are: never throws) --------------

function isPendingLogin(v: unknown): v is PendingLogin {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as Record<string, unknown>).verifier === 'string' &&
    typeof (v as Record<string, unknown>).state === 'string' &&
    typeof (v as Record<string, unknown>).redirectUri === 'string' &&
    typeof (v as Record<string, unknown>).returnHash === 'string'
  );
}

function savePendingLogin(pending: PendingLogin): void {
  try {
    globalThis.sessionStorage?.setItem(PKCE_KEY, JSON.stringify(pending));
  } catch {
    // No storage: the redirect back will fail with "no pending login found", which is an
    // honest outcome rather than a silently broken one.
  }
}

function readPendingLogin(): PendingLogin | undefined {
  try {
    const raw = globalThis.sessionStorage?.getItem(PKCE_KEY);
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    return isPendingLogin(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function clearPendingLogin(): void {
  try {
    globalThis.sessionStorage?.removeItem(PKCE_KEY);
  } catch {
    // ignore
  }
}

function isStoredSession(v: unknown): v is LichessSession {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as Record<string, unknown>).accessToken === 'string' &&
    typeof (v as Record<string, unknown>).expiresAt === 'number' &&
    typeof (v as Record<string, unknown>).username === 'string'
  );
}

function readSession(now: number): LichessSession | undefined {
  try {
    const raw = globalThis.localStorage?.getItem(SESSION_KEY);
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    if (!isStoredSession(parsed)) return undefined;
    if (parsed.expiresAt <= now) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

function writeSession(session: LichessSession): void {
  try {
    globalThis.localStorage?.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Best-effort: the session still lives for the rest of this page load (module state isn't
    // used to hold it — currentLichessSession always re-reads storage — so a failed write here
    // simply means the login doesn't survive a reload).
  }
}

function clearSession(): void {
  try {
    globalThis.localStorage?.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}

// ---- change notification, for react.tsx's useLichessSession ------------------------------

type Listener = () => void;
const listeners = new Set<Listener>();

/** Subscribes to login/logout events; returns an unsubscribe function. */
export function subscribeLichessAuth(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(): void {
  for (const listener of listeners) listener();
}

// ---- the flow ------------------------------------------------------------------------------

/**
 * Sends the browser to lichess's OAuth authorize endpoint. Saves a fresh PKCE verifier, a CSRF
 * state, the redirect_uri, and the current `location.hash` (so completeLichessLogin can return
 * the user to the same subproject) in sessionStorage, then navigates via `location.href`.
 */
export async function startLichessLogin(opts?: { scopes?: string[] }): Promise<void> {
  const verifier = createVerifier();
  const codeChallenge = await challengeFor(verifier);
  const state = randomState();
  const redirectUri = `${location.origin}${location.pathname}`;

  savePendingLogin({ verifier, state, redirectUri, returnHash: location.hash });

  location.href = buildAuthorizeUrl({
    redirectUri,
    codeChallenge,
    state,
    ...(opts?.scopes ? { scopes: opts.scopes } : {}),
  });
}

// The last login failure, for the UI: App.tsx runs completeLichessLogin at startup, where no
// component is around to catch the rejection, so the message is kept here and exposed through
// useLichessSession (reviewer, 2026-09-16). Cleared by the next successful login.
let lastLoginError: string | undefined;

/** The message of the most recent failed login callback, until a login succeeds. */
export function lastLichessLoginError(): string | undefined {
  return lastLoginError;
}

function isTokenResponse(v: unknown): v is { access_token: string; expires_in: number } {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as Record<string, unknown>).access_token === 'string' &&
    (v as Record<string, unknown>).access_token !== '' &&
    Number.isFinite((v as Record<string, unknown>).expires_in)
  );
}

/**
 * Call once at app start. If the URL carries `?code&state` from a lichess redirect, exchanges
 * the code for a token, fetches the username, stores the session, and returns the new session.
 * If the URL carries `?error=...`, throws. In both cases the URL is cleaned (query dropped,
 * saved hash restored) whether the flow succeeds or fails, so a reload never replays the
 * callback; a failure is also kept in lastLichessLoginError for the UI. Otherwise returns the
 * currently stored (unexpired) session, if any.
 */
export async function completeLichessLogin(): Promise<LichessSession | undefined> {
  const query = parseCallbackQuery(location.search);
  const isCallback = query.error !== undefined || (query.code !== undefined && query.state !== undefined);
  if (!isCallback) return readSession(lichessNow());

  const pending = readPendingLogin();
  clearPendingLogin();
  const returnHash = pending?.returnHash ?? location.hash;
  try {
    const session = await exchangeCallback(query, pending);
    lastLoginError = undefined;
    writeSession(session);
    notify();
    return session;
  } catch (err) {
    lastLoginError = err instanceof Error ? err.message : String(err);
    notify();
    throw err;
  } finally {
    history.replaceState(null, '', `${location.pathname}${returnHash}`);
    // replaceState fires no hashchange, so a hash router (apps/web's useHash) would keep showing
    // the page the callback URL loaded with (no hash: home) instead of the restored one — seen
    // in the browser smoke run (2026-09-16). Absent in the Node test environment, hence guarded.
    if (typeof HashChangeEvent === 'function' && typeof dispatchEvent === 'function') {
      dispatchEvent(new HashChangeEvent('hashchange'));
    }
  }
}

async function exchangeCallback(query: CallbackQuery, pending: PendingLogin | undefined): Promise<LichessSession> {
  if (query.error) {
    throw new Error(
      `lichess login failed: ${query.error}${query.errorDescription ? ` (${query.errorDescription})` : ''}`,
    );
  }
  if (!pending) {
    throw new Error('lichess login: no pending login found in this browser (state lost)');
  }
  if (pending.state !== query.state) {
    throw new Error('lichess login: state mismatch (possible CSRF or a stale login attempt)');
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: query.code ?? '',
    code_verifier: pending.verifier,
    redirect_uri: pending.redirectUri,
    client_id: CLIENT_ID,
  });
  const tokenResponse = await lichessFetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!tokenResponse.ok) {
    throw new Error(`lichess token exchange failed: HTTP ${tokenResponse.status}`);
  }
  const tokenJson: unknown = await tokenResponse.json();
  if (!isTokenResponse(tokenJson)) {
    throw new Error('lichess token exchange failed: response carried no access_token/expires_in');
  }

  const accountResponse = await lichessFetch(ACCOUNT_URL, {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  });
  if (!accountResponse.ok) {
    throw new Error(`lichess account lookup failed: HTTP ${accountResponse.status}`);
  }
  const account: unknown = await accountResponse.json();
  const username = typeof account === 'object' && account !== null ? (account as Record<string, unknown>).username : undefined;
  if (typeof username !== 'string') {
    throw new Error('lichess account lookup failed: response carried no username');
  }

  return {
    accessToken: tokenJson.access_token,
    expiresAt: lichessNow() + tokenJson.expires_in * 1000,
    username,
  };
}

/** The currently stored session, or undefined if there is none or it has expired. */
export function currentLichessSession(): LichessSession | undefined {
  return readSession(lichessNow());
}

/** Drops the local session without contacting lichess: for when lichess itself has stopped
 * accepting the token (a 401 on an authenticated call), so the UI falls back to "log in". */
export function forgetLichessSession(): void {
  clearSession();
  notify();
}

/** Revokes the token with lichess (best-effort) and clears the local session either way. */
export async function logoutLichess(): Promise<void> {
  const session = readSession(lichessNow());
  clearSession();
  notify();
  if (!session) return;
  try {
    await lichessFetch(TOKEN_URL, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
  } catch {
    // Revocation failing (offline, already revoked, ...) doesn't matter: the local session is
    // already gone, which is what logging out means to this app.
  }
}

let installed = false;

/** Wires lichessFetch's token provider to the stored session. Call once from the app; safe to
 * call more than once (idempotent), matching the StrictMode-safe pattern App.tsx uses it under. */
export function installLichessAuth(): void {
  if (installed) return;
  installed = true;
  setLichessTokenProvider(() => currentLichessSession()?.accessToken);
}
