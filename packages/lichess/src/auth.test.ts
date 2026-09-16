import { beforeEach, describe, expect, it, vi } from 'vitest';
import { _resetForTests, configureLichessFetch, lichessFetch, type LichessFetchImpl } from './fetch';
import {
  buildAuthorizeUrl,
  completeLichessLogin,
  currentLichessSession,
  forgetLichessSession,
  installLichessAuth,
  lastLichessLoginError,
  logoutLichess,
  parseCallbackQuery,
  startLichessLogin,
  subscribeLichessAuth,
} from './auth';

// The test environment (plain Node, no jsdom) has no global localStorage/sessionStorage, and no
// global location/history either — same situation fetch.test.ts documents for localStorage.
// Storage gets the same in-memory Storage stand-in used throughout this package's tests;
// location/history get minimal object stand-ins covering only what auth.ts actually reads or
// calls (href get/set, origin, pathname, search, hash, and history.replaceState). This is the
// "stub the globals you need minimally" option the task description offered, in preference to
// leaving startLichessLogin/completeLichessLogin entirely untested.
class MemoryStorage implements Storage {
  protected store = new Map<string, string>();
  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }
  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

interface FakeLocation {
  origin: string;
  pathname: string;
  search: string;
  hash: string;
  href: string;
}

function installFakeLocation(init: Partial<FakeLocation> = {}): FakeLocation {
  const loc: FakeLocation = {
    origin: 'http://localhost:5173',
    pathname: '/',
    search: '',
    hash: '',
    href: 'http://localhost:5173/',
    ...init,
  };
  globalThis.location = loc as unknown as Location;
  return loc;
}

function installFakeHistory(): { calls: unknown[][] } {
  const calls: unknown[][] = [];
  globalThis.history = {
    replaceState: (...args: unknown[]) => {
      calls.push(args);
    },
  } as unknown as History;
  return { calls };
}

let currentTime = 1_000_000;
const nowFn = (): number => currentTime;

function jsonResponse(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => {
  globalThis.localStorage = new MemoryStorage();
  globalThis.sessionStorage = new MemoryStorage();
  currentTime = 1_000_000;
  _resetForTests();
  configureLichessFetch({ now: nowFn });
});

describe('buildAuthorizeUrl', () => {
  it('builds the authorize URL with the fixed client_id, S256, and every required param', () => {
    const url = new URL(
      buildAuthorizeUrl({
        redirectUri: 'http://localhost:5173/',
        codeChallenge: 'CHALLENGE',
        state: 'STATE',
      }),
    );
    expect(url.origin + url.pathname).toBe('https://lichess.org/oauth');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('human-chess');
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:5173/');
    expect(url.searchParams.get('code_challenge')).toBe('CHALLENGE');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('state')).toBe('STATE');
    expect(url.searchParams.has('scope')).toBe(false);
  });

  it('includes a space-joined scope when scopes are given', () => {
    const url = new URL(
      buildAuthorizeUrl({
        redirectUri: 'http://localhost:5173/',
        codeChallenge: 'c',
        state: 's',
        scopes: ['board:play', 'puzzle:read'],
      }),
    );
    expect(url.searchParams.get('scope')).toBe('board:play puzzle:read');
  });
});

describe('parseCallbackQuery', () => {
  it('extracts code and state', () => {
    expect(parseCallbackQuery('?code=abc&state=xyz')).toEqual({
      code: 'abc',
      state: 'xyz',
      error: undefined,
      errorDescription: undefined,
    });
  });

  it('extracts an error and its description', () => {
    expect(parseCallbackQuery('?error=access_denied&error_description=nope')).toEqual({
      code: undefined,
      state: undefined,
      error: 'access_denied',
      errorDescription: 'nope',
    });
  });

  it('is all-undefined for an empty query', () => {
    expect(parseCallbackQuery('')).toEqual({ code: undefined, state: undefined, error: undefined, errorDescription: undefined });
  });
});

describe('startLichessLogin', () => {
  it('saves a pending login and navigates to the authorize URL', async () => {
    const loc = installFakeLocation({ pathname: '/', hash: '#/openings' });

    await startLichessLogin();

    const raw = globalThis.sessionStorage.getItem('human-chess.lichess.pkce.v1');
    expect(raw).not.toBeNull();
    const pending = JSON.parse(raw as string) as { verifier: string; state: string; redirectUri: string; returnHash: string };
    expect(pending.redirectUri).toBe('http://localhost:5173/');
    expect(pending.returnHash).toBe('#/openings');
    expect(pending.verifier.length).toBeGreaterThanOrEqual(43);

    expect(loc.href.startsWith('https://lichess.org/oauth?')).toBe(true);
    const url = new URL(loc.href);
    expect(url.searchParams.get('state')).toBe(pending.state);
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:5173/');
  });

  it('passes scopes through when given', async () => {
    const loc = installFakeLocation();
    await startLichessLogin({ scopes: ['board:play'] });
    expect(new URL(loc.href).searchParams.get('scope')).toBe('board:play');
  });
});

describe('completeLichessLogin', () => {
  it('throws a clear error when lichess reports an OAuth error, cleans the URL and records the failure', async () => {
    installFakeLocation({ search: '?error=access_denied&error_description=user+said+no', hash: '#/openings' });
    const history = installFakeHistory();
    let notified = 0;
    const unsubscribe = subscribeLichessAuth(() => notified++);
    await expect(completeLichessLogin()).rejects.toThrow(/access_denied/);
    // A reload must not replay the callback: the query is gone, the current hash kept.
    expect(history.calls).toEqual([[null, '', '/#/openings']]);
    expect(lastLichessLoginError()).toMatch(/access_denied/);
    expect(notified).toBe(1);
    unsubscribe();
  });

  it('throws when there is no pending login to match the callback against, and cleans the URL', async () => {
    installFakeLocation({ search: '?code=abc&state=xyz' });
    const history = installFakeHistory();
    await expect(completeLichessLogin()).rejects.toThrow(/no pending login/);
    expect(history.calls).toEqual([[null, '', '/']]);
    expect(lastLichessLoginError()).toMatch(/no pending login/);
  });

  it('throws on a state mismatch, clears the pending login and restores its saved hash', async () => {
    installFakeLocation({ search: '?code=abc&state=WRONG' });
    const history = installFakeHistory();
    globalThis.sessionStorage.setItem(
      'human-chess.lichess.pkce.v1',
      JSON.stringify({ verifier: 'v', state: 'RIGHT', redirectUri: 'http://localhost:5173/', returnHash: '#/puzzles' }),
    );
    await expect(completeLichessLogin()).rejects.toThrow(/state mismatch/);
    expect(globalThis.sessionStorage.getItem('human-chess.lichess.pkce.v1')).toBeNull();
    expect(history.calls).toEqual([[null, '', '/#/puzzles']]);
  });

  it('rejects a token response without access_token/expires_in instead of storing a never-expiring session', async () => {
    installFakeLocation({ search: '?code=abc&state=xyz' });
    const history = installFakeHistory();
    globalThis.sessionStorage.setItem(
      'human-chess.lichess.pkce.v1',
      JSON.stringify({ verifier: 'v', state: 'xyz', redirectUri: 'http://localhost:5173/', returnHash: '' }),
    );
    const fetchImpl: LichessFetchImpl = vi.fn(async () => jsonResponse(200, { token_type: 'Bearer', access_token: 'tok' }));
    configureLichessFetch({ fetchImpl });
    await expect(completeLichessLogin()).rejects.toThrow(/access_token\/expires_in/);
    expect(currentLichessSession()).toBeUndefined();
    expect(globalThis.localStorage.getItem('human-chess.lichess.session.v1')).toBeNull();
    expect(history.calls).toEqual([[null, '', '/']]);
  });

  it('announces the restored hash with a hashchange event, since replaceState fires none', async () => {
    installFakeLocation({ search: '?code=abc&state=nope' });
    installFakeHistory();
    const dispatched: string[] = [];
    class FakeHashChangeEvent {
      constructor(readonly type: string) {}
    }
    (globalThis as Record<string, unknown>).HashChangeEvent = FakeHashChangeEvent;
    (globalThis as Record<string, unknown>).dispatchEvent = (e: FakeHashChangeEvent) => {
      dispatched.push(e.type);
      return true;
    };
    try {
      await expect(completeLichessLogin()).rejects.toThrow(/no pending login/);
      expect(dispatched).toEqual(['hashchange']);
    } finally {
      delete (globalThis as Record<string, unknown>).HashChangeEvent;
      delete (globalThis as Record<string, unknown>).dispatchEvent;
    }
  });

  it('a successful login clears an earlier recorded failure', async () => {
    installFakeLocation({ search: '?code=abc&state=xyz' });
    installFakeHistory();
    await expect(completeLichessLogin()).rejects.toThrow(/no pending login/);
    expect(lastLichessLoginError()).toBeDefined();

    globalThis.sessionStorage.setItem(
      'human-chess.lichess.pkce.v1',
      JSON.stringify({ verifier: 'v', state: 'xyz', redirectUri: 'http://localhost:5173/', returnHash: '' }),
    );
    const fetchImpl: LichessFetchImpl = vi.fn(async url =>
      url === 'https://lichess.org/api/token'
        ? jsonResponse(200, { token_type: 'Bearer', access_token: 'tok', expires_in: 60 })
        : jsonResponse(200, { username: 'tester' }),
    );
    configureLichessFetch({ fetchImpl });
    await completeLichessLogin();
    expect(lastLichessLoginError()).toBeUndefined();
  });

  it('exchanges the code, fetches the account, stores the session, and cleans the URL', async () => {
    installFakeLocation({ pathname: '/', search: '?code=abc&state=xyz' });
    const history = installFakeHistory();
    globalThis.sessionStorage.setItem(
      'human-chess.lichess.pkce.v1',
      JSON.stringify({ verifier: 'the-verifier', state: 'xyz', redirectUri: 'http://localhost:5173/', returnHash: '#/openings' }),
    );

    const calls: { url: string; init: RequestInit | undefined }[] = [];
    const fetchImpl: LichessFetchImpl = vi.fn(async (url, init) => {
      calls.push({ url, init });
      if (url === 'https://lichess.org/api/token') {
        return jsonResponse(200, { token_type: 'Bearer', access_token: 'tok-123', expires_in: 3600 });
      }
      if (url === 'https://lichess.org/api/account') {
        return jsonResponse(200, { username: 'tester' });
      }
      throw new Error(`unexpected URL ${url}`);
    });
    configureLichessFetch({ fetchImpl });

    let notified = 0;
    const unsubscribe = subscribeLichessAuth(() => notified++);

    const session = await completeLichessLogin();

    expect(session).toEqual({ accessToken: 'tok-123', expiresAt: currentTime + 3_600_000, username: 'tester' });
    expect(currentLichessSession()).toEqual(session);
    expect(notified).toBe(1);

    // Token exchange was form-encoded and carried the verifier/redirect_uri/client_id.
    const tokenCall = calls.find(c => c.url === 'https://lichess.org/api/token');
    expect(tokenCall?.init?.method).toBe('POST');
    const body = new URLSearchParams(tokenCall?.init?.body as string);
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('abc');
    expect(body.get('code_verifier')).toBe('the-verifier');
    expect(body.get('redirect_uri')).toBe('http://localhost:5173/');
    expect(body.get('client_id')).toBe('human-chess');

    // Account lookup carried the fresh token explicitly (the token provider isn't wired to it
    // yet at this point in the flow).
    const accountCall = calls.find(c => c.url === 'https://lichess.org/api/account');
    expect(new Headers(accountCall?.init?.headers).get('Authorization')).toBe('Bearer tok-123');

    // URL cleaned: query dropped, saved hash restored.
    expect(history.calls).toEqual([[null, '', '/#/openings']]);

    // Pending login consumed.
    expect(globalThis.sessionStorage.getItem('human-chess.lichess.pkce.v1')).toBeNull();

    unsubscribe();
  });

  it('returns the stored session when there is no callback in the URL', async () => {
    installFakeLocation({ search: '' });
    globalThis.localStorage.setItem(
      'human-chess.lichess.session.v1',
      JSON.stringify({ accessToken: 'stored-tok', expiresAt: currentTime + 10_000, username: 'stored-user' }),
    );
    await expect(completeLichessLogin()).resolves.toEqual({
      accessToken: 'stored-tok',
      expiresAt: currentTime + 10_000,
      username: 'stored-user',
    });
  });

  it('returns undefined when the stored session has expired', async () => {
    installFakeLocation({ search: '' });
    globalThis.localStorage.setItem(
      'human-chess.lichess.session.v1',
      JSON.stringify({ accessToken: 'stale-tok', expiresAt: currentTime - 1, username: 'stale-user' }),
    );
    await expect(completeLichessLogin()).resolves.toBeUndefined();
  });
});

describe('currentLichessSession', () => {
  it('mirrors completeLichessLogin\'s stored-session read (undefined when nothing is stored)', () => {
    expect(currentLichessSession()).toBeUndefined();
  });
});

describe('logoutLichess', () => {
  it('revokes the token and clears the stored session, notifying subscribers', async () => {
    globalThis.localStorage.setItem(
      'human-chess.lichess.session.v1',
      JSON.stringify({ accessToken: 'tok-to-revoke', expiresAt: currentTime + 10_000, username: 'u' }),
    );
    const calls: { url: string; init: RequestInit | undefined }[] = [];
    const fetchImpl: LichessFetchImpl = vi.fn(async (url, init) => {
      calls.push({ url, init });
      return jsonResponse(204);
    });
    configureLichessFetch({ fetchImpl });

    let notified = 0;
    const unsubscribe = subscribeLichessAuth(() => notified++);

    await logoutLichess();

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://lichess.org/api/token');
    expect(calls[0]?.init?.method).toBe('DELETE');
    expect(new Headers(calls[0]?.init?.headers).get('Authorization')).toBe('Bearer tok-to-revoke');
    expect(currentLichessSession()).toBeUndefined();
    expect(notified).toBe(1);

    unsubscribe();
  });

  it('does nothing over the network, but still clears storage, when there is no session', async () => {
    const fetchImpl: LichessFetchImpl = vi.fn(async () => jsonResponse(204));
    configureLichessFetch({ fetchImpl });
    await logoutLichess();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('clears the local session even when revocation fails', async () => {
    globalThis.localStorage.setItem(
      'human-chess.lichess.session.v1',
      JSON.stringify({ accessToken: 'tok', expiresAt: currentTime + 10_000, username: 'u' }),
    );
    const fetchImpl: LichessFetchImpl = vi.fn(async () => {
      throw new Error('network down');
    });
    configureLichessFetch({ fetchImpl });
    await expect(logoutLichess()).resolves.toBeUndefined();
    expect(currentLichessSession()).toBeUndefined();
  });
});

describe('forgetLichessSession', () => {
  it('drops the stored session without any request and notifies subscribers', async () => {
    globalThis.localStorage.setItem(
      'human-chess.lichess.session.v1',
      JSON.stringify({ accessToken: 'tok', expiresAt: currentTime + 10_000, username: 'tester' }),
    );
    const fetchImpl: LichessFetchImpl = vi.fn(async () => jsonResponse(204));
    configureLichessFetch({ fetchImpl });
    let notified = 0;
    const unsubscribe = subscribeLichessAuth(() => notified++);
    forgetLichessSession();
    expect(currentLichessSession()).toBeUndefined();
    expect(notified).toBe(1);
    expect(fetchImpl).not.toHaveBeenCalled();
    unsubscribe();
  });
});

describe('installLichessAuth', () => {
  // Calling it twice (idempotency) and checking the wiring in one test, rather than two, so
  // this doesn't depend on declaration order against the module-level "already installed" flag
  // that installLichessAuth itself is not reset between tests.
  it('is idempotent and wires the stored session\'s token into lichessFetch\'s Authorization header', async () => {
    expect(() => {
      installLichessAuth();
      installLichessAuth();
    }).not.toThrow();

    globalThis.localStorage.setItem(
      'human-chess.lichess.session.v1',
      JSON.stringify({ accessToken: 'wired-tok', expiresAt: currentTime + 10_000, username: 'u' }),
    );
    const fetchImpl: LichessFetchImpl = vi.fn(async () => jsonResponse(200));
    configureLichessFetch({ fetchImpl });

    await lichessFetch('https://lichess.org/api/account');

    const call = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit | undefined];
    expect(new Headers(call[1]?.headers).get('Authorization')).toBe('Bearer wired-tok');
  });
});
