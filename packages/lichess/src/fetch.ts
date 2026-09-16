// lichess.org's published API policy is simple: make requests one at a time, and after
// receiving a 429 (too many requests) wait a full minute before sending anything else. This
// module is the single choke point every lichess.org (and explorer.lichess.ovh) call in the
// app passes through, so the whole app honors that policy together instead of each caller
// improvising its own throttling.

const RETRY_AT_STORAGE_KEY = 'human-chess.lichess.retryAt.v1';
const DEFAULT_COOLDOWN_MS = 60_000;
// Whatever Retry-After or a (possibly corrupt) persisted value says, never lock the app out for
// longer than this; lichess's own guidance is a minute, sometimes more (reviewer, 2026-09-16).
const MAX_COOLDOWN_MS = 10 * 60_000;
const AUTH_HOSTS = new Set(['lichess.org', 'explorer.lichess.ovh']);

/** Thrown instead of sending a request while lichess's cooldown is in effect, and for a 429. */
export class LichessRateLimited extends Error {
  readonly retryAt: number;

  constructor(retryAt: number, now: number) {
    const waitS = Math.max(0, Math.ceil((retryAt - now) / 1000));
    super(`lichess asked us to wait; try again in ${waitS} s`);
    this.name = 'LichessRateLimited';
    this.retryAt = retryAt;
  }
}

type NowFn = () => number;

// Deliberately narrower than `typeof fetch` (which also accepts URL | Request): every caller in
// this codebase passes a string URL, and lichessFetch itself only accepts a string (see below) —
// so this is the type actually threaded through configureLichessFetch, cachedLichessText/Json,
// and the fetchImpl override param on fetchLatestLichessGame / fetchNextPuzzle / fetchPuzzleById.
export type LichessFetchImpl = (url: string, init?: RequestInit) => Promise<Response>;

function defaultFetchImpl(url: string, init?: RequestInit): Promise<Response> {
  return globalThis.fetch(url, init);
}

// Overridable module state. Production always uses the real fetch/clock; tests swap them via
// configureLichessFetch so nothing here ever calls the real lichess.org.
let fetchImpl: LichessFetchImpl = defaultFetchImpl;
let nowFn: NowFn = () => Date.now();
let tokenProvider: (() => string | undefined) | undefined;

function readPersistedRetryAt(): number {
  try {
    const raw = globalThis.localStorage?.getItem(RETRY_AT_STORAGE_KEY);
    const parsed = raw ? Number(raw) : NaN;
    // Only the upper bound is applied here: a stale value in the past is harmless (the
    // `now < retryAt` checks simply pass), and tests install their fake clock after this load.
    return Number.isFinite(parsed) ? Math.min(parsed, nowFn() + MAX_COOLDOWN_MS) : 0;
  } catch {
    return 0;
  }
}

function persistRetryAt(value: number): void {
  try {
    globalThis.localStorage?.setItem(RETRY_AT_STORAGE_KEY, String(value));
  } catch {
    // No storage available (or it threw) — the in-memory retryAt still governs this session;
    // we just lose the "survive a reload" protection.
  }
}

// Read once at module load so a page reload picks up a cooldown set before it happened.
let retryAt = readPersistedRetryAt();

/**
 * Test-only: override the underlying fetch implementation and/or clock so fetch.test.ts and
 * cache.test.ts can run against a fake fetch and a fake clock instead of hitting lichess.org.
 * Production code never calls this.
 */
export function configureLichessFetch(opts: { fetchImpl?: LichessFetchImpl; now?: NowFn }): void {
  if (opts.fetchImpl) fetchImpl = opts.fetchImpl;
  if (opts.now) nowFn = opts.now;
}

/**
 * Test-only: resets all module-level state (queue, in-flight dedupe, cooldown, token provider,
 * fetch/clock overrides) between tests. Also re-reads any persisted retryAt from localStorage,
 * the same as a fresh module load would.
 */
export function _resetForTests(): void {
  fetchImpl = defaultFetchImpl;
  nowFn = () => Date.now();
  tokenProvider = undefined;
  queueTail = Promise.resolve();
  queueLength = 0;
  inFlight.clear();
  retryAt = readPersistedRetryAt();
}

/** The shared clock (overridable via configureLichessFetch's `now`); cache.ts reuses it too. */
export function lichessNow(): number {
  return nowFn();
}

/**
 * Hook for a future OAuth step: when the provider returns a token, lichessFetch adds
 * `Authorization: Bearer <token>` to requests targeting lichess.org or explorer.lichess.ovh
 * only. Pass `undefined` to clear it. Not wired to anything yet — this is just the seam.
 */
export function setLichessTokenProvider(fn: (() => string | undefined) | undefined): void {
  tokenProvider = fn;
}

let queueTail: Promise<void> = Promise.resolve();
let queueLength = 0;

/** Number of lichess requests currently queued or in flight app-wide. */
export function lichessQueueLength(): number {
  return queueLength;
}

// A single FIFO chain: each call's task only runs once every task ahead of it has finished
// (successfully, with an error, or aborted), and it releases the next task as soon as it's
// done — so one slow or aborted request never leaves the queue stuck.
function enqueue<T>(run: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  queueLength++;
  let decremented = false;
  const decrementOnce = (): void => {
    if (!decremented) {
      decremented = true;
      queueLength--;
    }
  };

  const myTurn = queueTail;
  let releaseNext: () => void = () => {};
  queueTail = new Promise<void>(resolve => {
    releaseNext = resolve;
  });

  const turnPromise = myTurn.then(run, run);
  turnPromise.then(decrementOnce, decrementOnce).finally(releaseNext).catch(() => {});

  // Let an abort settle the caller's promise immediately, without waiting for this task's
  // turn to come up. The queue itself is unaffected: turnPromise still runs in its slot (and
  // doFetch itself checks the pre-send signal before calling fetchImpl, so no request is sent),
  // and still releases the next task when it finishes.
  return raceAbort(turnPromise, signal);
}

/** A 429's cooldown end: at least the default wait if the header points to the past, never
 * more than MAX_COOLDOWN_MS ahead. */
function clampRetryAt(value: number, now: number): number {
  if (value <= now) return now + DEFAULT_COOLDOWN_MS;
  return Math.min(value, now + MAX_COOLDOWN_MS);
}

function parseRetryAfter(header: string | null, now: number): number {
  const raw = ((): number => {
    if (!header) return now + DEFAULT_COOLDOWN_MS;
    const trimmed = header.trim();
    if (trimmed === '') return now + DEFAULT_COOLDOWN_MS;
    const asSeconds = Number(trimmed);
    if (Number.isFinite(asSeconds)) return now + asSeconds * 1000;
    const asDate = Date.parse(trimmed);
    return Number.isNaN(asDate) ? now + DEFAULT_COOLDOWN_MS : asDate;
  })();
  return clampRetryAt(raw, now);
}

/** The host, only for https URLs: a bearer token is never sent in plaintext. */
function hostOf(url: string): string | undefined {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' ? u.host : undefined;
  } catch {
    return undefined;
  }
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

/** Settles as `promise` does, unless `signal` aborts first; the promise itself keeps running. */
function raceAbort<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return promise;
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const onAbort = (): void => {
      if (settled) return;
      settled = true;
      reject(new DOMException('The operation was aborted.', 'AbortError'));
    };
    if (signal.aborted) {
      onAbort();
    } else {
      signal.addEventListener('abort', onAbort, { once: true });
    }
    promise.then(
      value => {
        if (settled) return;
        settled = true;
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      err => {
        if (settled) return;
        settled = true;
        signal.removeEventListener('abort', onAbort);
        reject(err);
      },
    );
  });
}

function withAuthHeader(url: string, init: RequestInit | undefined): RequestInit | undefined {
  const token = tokenProvider?.();
  if (!token) return init;
  const host = hostOf(url);
  if (!host || !AUTH_HOSTS.has(host)) return init;
  const headers = new Headers(init?.headers);
  if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
  return { ...init, headers };
}

/** `preSend` is checked before the request goes out; for deduped GETs it is the leader's signal
 * while `init.signal` is stripped, so one caller aborting cannot kill the request its joiners
 * are waiting on (reviewer, 2026-09-16). */
async function doFetch(url: string, init: RequestInit | undefined, preSend?: AbortSignal): Promise<Response> {
  if (preSend?.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError');
  }
  const before = nowFn();
  if (before < retryAt) {
    throw new LichessRateLimited(retryAt, before);
  }
  const response = await fetchImpl(url, withAuthHeader(url, init));
  if (response.status === 429) {
    const at = parseRetryAfter(response.headers.get('Retry-After'), nowFn());
    retryAt = at;
    persistRetryAt(at);
    throw new LichessRateLimited(at, nowFn());
  }
  return response;
}

const inFlight = new Map<string, Promise<Response>>();

/**
 * The single entry point for every lichess.org / explorer.lichess.ovh request in the app: at
 * most one request in flight at a time (others wait their FIFO turn), an app-wide cooldown
 * after a 429 (lichess's own policy — see header comment), and same-URL GET dedupe. Non-429
 * responses are returned as-is; callers keep their own 404/empty-body handling.
 */
export async function lichessFetch(url: string, init?: RequestInit): Promise<Response> {
  const now = nowFn();
  if (now < retryAt) {
    throw new LichessRateLimited(retryAt, now);
  }

  const method = (init?.method ?? 'GET').toUpperCase();
  const signal = init?.signal ?? undefined;

  if (method !== 'GET') {
    return enqueue(() => doFetch(url, init, signal), signal);
  }

  // Dedupe key: the URL plus the Accept header, since lichess serves different bodies (PGN vs
  // JSON) for the same URL depending on it.
  const key = `${url}\n${new Headers(init?.headers).get('Accept') ?? ''}`;
  const existing = inFlight.get(key);
  if (existing) {
    const joined = existing.then(
      r => r.clone(),
      (err: unknown) => {
        // The leader was aborted before its turn came up (React StrictMode's double mount does
        // exactly this: the first effect's request is aborted, the second joins it). That abort
        // is the leader's, not this caller's — retry as a fresh leader; by now the cleanup below
        // has removed the dead entry. (seen in the browser smoke run, 2026-09-16)
        if (isAbortError(err) && !signal?.aborted) return lichessFetch(url, init);
        throw err;
      },
    );
    return raceAbort(joined, signal);
  }

  const { signal: _dropped, ...initWithoutSignal } = init ?? {};
  void _dropped;
  const shared = enqueue(() => doFetch(url, initWithoutSignal, signal), undefined);
  // The leader clones too, so the shared Response's body is never consumed by anyone and every
  // joiner's clone() stays valid regardless of who reads first.
  const promise = shared.then(r => r.clone());
  inFlight.set(key, shared);
  shared
    .finally(() => {
      if (inFlight.get(key) === shared) inFlight.delete(key);
    })
    .catch(() => {
      // Cleanup-only chain; the real rejection is delivered to whoever awaits `promise` itself.
    });
  return raceAbort(promise, signal);
}
