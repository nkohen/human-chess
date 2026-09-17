// Generic one-at-a-time HTTP client for a single site's published API: a serial request queue,
// same-URL in-flight GET dedupe (with the aborted-leader retry), an app-wide 429 cooldown
// persisted to localStorage (Retry-After honoured, capped, defaulted), and a localStorage TTL
// cache in front of it. `packages/lichess` and `packages/chesscom` are both thin instances of
// this factory — extracted 2026-09-17 from packages/lichess/src/fetch.ts + cache.ts (lichess.org
// was the first site; chess.com's Published-Data API follows an identical one-request-at-a-time,
// 429-cooldown policy) so the throttling/caching logic exists in exactly one place (A2/R1).

const DEFAULT_COOLDOWN_MS = 60_000;
// Whatever Retry-After or a (possibly corrupt) persisted value says, never lock the app out for
// longer than this; lichess's own guidance is a minute, sometimes more (reviewer, 2026-09-16);
// chess.com documents no cooldown length at all, so the same cap is applied there too.
const MAX_COOLDOWN_MS = 10 * 60_000;
const MAX_CACHE_BYTES = 2 * 1024 * 1024; // ~2 MB total, across all cached entries for one site

// Deliberately narrower than `typeof fetch` (which also accepts URL | Request): every caller in
// this codebase passes a string URL.
export type SiteFetchImpl = (url: string, init?: RequestInit) => Promise<Response>;

type NowFn = () => number;

export interface SiteRateLimitedError extends Error {
  readonly retryAt: number;
}

export interface SiteRateLimitedCtor {
  new (retryAt: number, now: number): SiteRateLimitedError;
}

export interface SiteClientConfig {
  /** Used in the rate-limit error's message, e.g. "lichess" or "chess.com". */
  name: string;
  /** `Error.name` (and the exported class's effective identity), e.g. "LichessRateLimited". */
  errorClassName: string;
  /** localStorage key prefix, e.g. "human-chess.lichess". The retryAt key becomes
   * "<prefix>.retryAt.v1" and cache entries "<prefix>.cache.v1:<url>". */
  storagePrefix: string;
  /** Hosts eligible for the Authorization header from setTokenProvider. Omit (or pass an empty
   * list) to disable the auth-header mechanism entirely — chess.com's Published-Data API needs
   * no login, so its instance never configures this. */
  authHosts?: string[];
}

export interface SiteClient {
  /** The single entry point for every request to this site: at most one request in flight at a
   * time (others wait their FIFO turn), an app-wide cooldown after a 429, and same-URL GET
   * dedupe. Non-429 responses are returned as-is; callers keep their own 404/empty-body handling. */
  fetch: SiteFetchImpl;
  /** Test-only: override the underlying fetch implementation and/or clock. Production code
   * never calls this. */
  configureFetch(opts: { fetchImpl?: SiteFetchImpl; now?: NowFn }): void;
  /** Thrown instead of sending a request while this site's cooldown is in effect, and for a
   * 429. A real class — `instanceof` works — constructed once per createSiteClient() call. */
  RateLimited: SiteRateLimitedCtor;
  /** Number of requests to this site currently queued or in flight app-wide. */
  queueLength(): number;
  /** Hook for OAuth-style auth: when the provider returns a token, fetch adds
   * `Authorization: Bearer <token>` to requests targeting one of `authHosts` only. Pass
   * `undefined` to clear it. */
  setTokenProvider(fn: (() => string | undefined) | undefined): void;
  /** The shared clock (overridable via configureFetch's `now`); the cache reuses it too. */
  now(): number;
  /** GETs `url` (through `fetch` by default) and caches a successful (2xx) response body as
   * text for `ttlMs`. A cache hit returns synchronously-resolved cached text with no network
   * call and no queue interaction. */
  cachedText(url: string, ttlMs: number, init?: RequestInit, fetchImpl?: SiteFetchImpl): Promise<string>;
  /** Same as cachedText, but parses the body as JSON. */
  cachedJson<T>(url: string, ttlMs: number, init?: RequestInit, fetchImpl?: SiteFetchImpl): Promise<T>;
  /** Removes every entry this client has cached. */
  clearCache(): void;
  /** Test-only: resets all module-level state (queue, in-flight dedupe, cooldown, token
   * provider, fetch/clock overrides) between tests. Also re-reads any persisted retryAt from
   * localStorage, the same as a fresh construction would. */
  _resetForTests(): void;
}

interface CacheEntry {
  storedAt: number;
  body: string;
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
      // Preserve the signal's own reason (e.g. AbortSignal.timeout()'s TimeoutError) instead of
      // masking every abort as a generic AbortError — callers such as the importers pattern-match
      // on `err.name === 'TimeoutError'` to report "did not answer within 15 s" (reviewer, 2026-09-17).
      reject(signal.reason ?? new DOMException('The operation was aborted.', 'AbortError'));
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

function defaultFetchImpl(url: string, init?: RequestInit): Promise<Response> {
  return globalThis.fetch(url, init);
}

/** Builds one site's client: its own queue, cooldown, cache, and RateLimited class, all
 * independent of any other client this factory has built. */
export function createSiteClient(config: SiteClientConfig): SiteClient {
  const RETRY_AT_STORAGE_KEY = `${config.storagePrefix}.retryAt.v1`;
  const CACHE_PREFIX = `${config.storagePrefix}.cache.v1:`;
  const authHosts = new Set(config.authHosts ?? []);

  class RateLimited extends Error implements SiteRateLimitedError {
    readonly retryAt: number;
    constructor(retryAt: number, now: number) {
      const waitS = Math.max(0, Math.ceil((retryAt - now) / 1000));
      super(`${config.name} asked us to wait; try again in ${waitS} s`);
      this.name = config.errorClassName;
      this.retryAt = retryAt;
    }
  }

  let fetchImpl: SiteFetchImpl = defaultFetchImpl;
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

  // Read once at construction so a page reload picks up a cooldown set before it happened.
  let retryAt = readPersistedRetryAt();

  let queueTail: Promise<void> = Promise.resolve();
  let queueLen = 0;
  const inFlight = new Map<string, Promise<Response>>();

  // A single FIFO chain: each call's task only runs once every task ahead of it has finished
  // (successfully, with an error, or aborted), and it releases the next task as soon as it's
  // done — so one slow or aborted request never leaves the queue stuck.
  function enqueue<T>(run: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    queueLen++;
    let decremented = false;
    const decrementOnce = (): void => {
      if (!decremented) {
        decremented = true;
        queueLen--;
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
    // doFetch itself checks the pre-send signal before calling fetchImpl, so no request is
    // sent), and still releases the next task when it finishes.
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

  function withAuthHeader(url: string, init: RequestInit | undefined): RequestInit | undefined {
    const token = tokenProvider?.();
    if (!token) return init;
    const host = hostOf(url);
    if (!host || !authHosts.has(host)) return init;
    const headers = new Headers(init?.headers);
    if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
    return { ...init, headers };
  }

  /** `preSend` is checked before the request goes out; for deduped GETs it is the leader's
   * signal while `init.signal` is stripped, so one caller aborting cannot kill the request its
   * joiners are waiting on (reviewer, 2026-09-16).
   *
   * Consequence (reviewer, 2026-09-17): once a GET has actually been sent to `fetchImpl`, no
   * signal — not even the sole leader's own, when it has no joiners — can cancel it, because
   * `fetchImpl` itself is called without a signal (see `initWithoutSignal` below). A caller that
   * aborts (e.g. via `AbortSignal.timeout`) still gets its own promise rejected promptly by
   * `raceAbort`, but the in-flight request keeps running in its queue slot until it settles on
   * its own; the queue is not released early. This is deliberate, not an oversight: the
   * alternative (wiring the leader's own signal into `fetchImpl`) would abort the shared
   * network call out from under any joiner that attaches later, which is exactly the failure
   * this dedupe exists to prevent (see the "a joiner survives its leader being aborted" test).
   * A hung server can therefore stall this site's queue until `fetchImpl`'s own transport-level
   * timeout (if any) fires; every caller in this codebase already applies its own
   * `AbortSignal.timeout` at the call site, which bounds each *caller's* wait but not the queue. */
  async function doFetch(url: string, init: RequestInit | undefined, preSend?: AbortSignal): Promise<Response> {
    if (preSend?.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError');
    }
    const before = nowFn();
    if (before < retryAt) {
      throw new RateLimited(retryAt, before);
    }
    const response = await fetchImpl(url, withAuthHeader(url, init));
    if (response.status === 429) {
      const at = parseRetryAfter(response.headers.get('Retry-After'), nowFn());
      retryAt = at;
      persistRetryAt(at);
      throw new RateLimited(at, nowFn());
    }
    return response;
  }

  const siteFetch: SiteFetchImpl = async (url, init) => {
    const now = nowFn();
    if (now < retryAt) {
      throw new RateLimited(retryAt, now);
    }

    const method = (init?.method ?? 'GET').toUpperCase();
    const signal = init?.signal ?? undefined;

    if (method !== 'GET') {
      // Non-GET requests are never deduped/shared, so `init` (with its signal intact) goes
      // straight to `fetchImpl`: the underlying network call itself is aborted when `signal`
      // fires, unlike the GET path below (see the comment on `doFetch`).
      return enqueue(() => doFetch(url, init, signal), signal);
    }

    // Dedupe key: the URL plus the Accept header, since a site can serve different bodies (PGN
    // vs JSON, say) for the same URL depending on it.
    const key = `${url}\n${new Headers(init?.headers).get('Accept') ?? ''}`;
    const existing = inFlight.get(key);
    if (existing) {
      const joined = existing.then(
        r => r.clone(),
        (err: unknown) => {
          // The leader was aborted before its turn came up (React StrictMode's double mount
          // does exactly this: the first effect's request is aborted, the second joins it).
          // That abort is the leader's, not this caller's — retry as a fresh leader; by now the
          // cleanup below has removed the dead entry. (seen in the browser smoke run, 2026-09-16)
          if (isAbortError(err) && !signal?.aborted) return siteFetch(url, init);
          throw err;
        },
      );
      return raceAbort(joined, signal);
    }

    const { signal: _dropped, ...initWithoutSignal } = init ?? {};
    void _dropped;
    const shared = enqueue(() => doFetch(url, initWithoutSignal, signal), undefined);
    // The leader clones too, so the shared Response's body is never consumed by anyone and
    // every joiner's clone() stays valid regardless of who reads first.
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
  };

  // ---- cache -----------------------------------------------------------------------------

  function cacheKey(url: string): string {
    return `${CACHE_PREFIX}${url}`;
  }

  function isCacheEntry(value: unknown): value is CacheEntry {
    return (
      typeof value === 'object' &&
      value !== null &&
      typeof (value as Record<string, unknown>).storedAt === 'number' &&
      typeof (value as Record<string, unknown>).body === 'string'
    );
  }

  function readEntry(url: string, ttlMs: number, now: number): string | undefined {
    try {
      const storage = globalThis.localStorage;
      if (!storage) return undefined;
      const raw = storage.getItem(cacheKey(url));
      if (!raw) return undefined;
      const parsed: unknown = JSON.parse(raw);
      if (!isCacheEntry(parsed)) return undefined;
      if (now - parsed.storedAt > ttlMs) return undefined;
      return parsed.body;
    } catch {
      return undefined;
    }
  }

  function allCacheKeys(storage: Storage): string[] {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && key.startsWith(CACHE_PREFIX)) keys.push(key);
    }
    return keys;
  }

  function entrySize(key: string, value: string): number {
    return key.length + value.length;
  }

  /** Evicts oldest-first cache entries until the total (existing + `incomingBytes`) fits the
   * cap. */
  function evictToFit(storage: Storage, incomingBytes: number): void {
    const keys = allCacheKeys(storage);
    const withAge = keys.map(key => {
      const raw = storage.getItem(key);
      let storedAt = 0;
      if (raw) {
        try {
          const parsed: unknown = JSON.parse(raw);
          if (isCacheEntry(parsed)) storedAt = parsed.storedAt;
        } catch {
          // Corrupt entry — treat as oldest so it's evicted first.
        }
      }
      return { key, value: raw ?? '', storedAt };
    });
    withAge.sort((a, b) => a.storedAt - b.storedAt);

    let total = incomingBytes;
    for (const { key, value } of withAge) total += entrySize(key, value);

    for (const { key, value } of withAge) {
      if (total <= MAX_CACHE_BYTES) break;
      storage.removeItem(key);
      total -= entrySize(key, value);
    }
  }

  function writeEntry(url: string, body: string, now: number): void {
    try {
      const storage = globalThis.localStorage;
      if (!storage) return;
      const key = cacheKey(url);
      const value = JSON.stringify({ storedAt: now, body } satisfies CacheEntry);
      evictToFit(storage, entrySize(key, value));
      try {
        storage.setItem(key, value);
      } catch {
        // Write failed (most likely quota, despite the eviction above — e.g. a single very
        // large entry). Evict everything else this entry needs room for and try once more; if
        // it still fails, caching this response is simply skipped.
        evictToFit(storage, entrySize(key, value) + MAX_CACHE_BYTES);
        try {
          storage.setItem(key, value);
        } catch {
          // Give up silently — caching is best-effort, never load-bearing.
        }
      }
    } catch {
      // No storage available at all.
    }
  }

  async function cachedText(
    url: string,
    ttlMs: number,
    init?: RequestInit,
    fetchImplOverride: SiteFetchImpl = siteFetch,
  ): Promise<string> {
    const method = (init?.method ?? 'GET').toUpperCase();
    const now = nowFn();

    if (method === 'GET') {
      const cached = readEntry(url, ttlMs, now);
      if (cached !== undefined) return cached;
    }

    const response = await fetchImplOverride(url, init);
    const text = await response.text();
    if (method === 'GET' && response.ok) {
      writeEntry(url, text, now);
    }
    return text;
  }

  async function cachedJson<T>(
    url: string,
    ttlMs: number,
    init?: RequestInit,
    fetchImplOverride: SiteFetchImpl = siteFetch,
  ): Promise<T> {
    const text = await cachedText(url, ttlMs, init, fetchImplOverride);
    return JSON.parse(text) as T;
  }

  function clearCache(): void {
    try {
      const storage = globalThis.localStorage;
      if (!storage) return;
      for (const key of allCacheKeys(storage)) storage.removeItem(key);
    } catch {
      // ignore
    }
  }

  return {
    fetch: siteFetch,
    configureFetch(opts) {
      if (opts.fetchImpl) fetchImpl = opts.fetchImpl;
      if (opts.now) nowFn = opts.now;
    },
    RateLimited,
    queueLength: () => queueLen,
    setTokenProvider(fn) {
      tokenProvider = fn;
    },
    now: () => nowFn(),
    cachedText,
    cachedJson,
    clearCache,
    _resetForTests() {
      fetchImpl = defaultFetchImpl;
      nowFn = () => Date.now();
      tokenProvider = undefined;
      queueTail = Promise.resolve();
      queueLen = 0;
      inFlight.clear();
      retryAt = readPersistedRetryAt();
    },
  };
}
