// A thin localStorage cache in front of lichessFetch, for GET responses that don't change (or
// change rarely enough that a TTL is fine) — e.g. an individual lichess puzzle by id, which is
// immutable once created. A cache hit never touches the network or the queue in fetch.ts.
import { lichessFetch, lichessNow, type LichessFetchImpl } from './fetch';

const CACHE_PREFIX = 'human-chess.lichess.cache.v1:';
const MAX_CACHE_BYTES = 2 * 1024 * 1024; // ~2 MB total, across all cached entries

interface CacheEntry {
  storedAt: number;
  body: string;
}

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

/** Evicts oldest-first cache entries until the total (existing + `incomingBytes`) fits the cap. */
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
      // Write failed (most likely quota, despite the eviction above — e.g. a single very large
      // entry). Evict everything else this entry needs room for and try once more; if it still
      // fails, caching this response is simply skipped.
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

/** Removes every entry this module has cached. */
export function clearLichessCache(): void {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return;
    for (const key of allCacheKeys(storage)) storage.removeItem(key);
  } catch {
    // ignore
  }
}

/**
 * GETs `url` (through lichessFetch by default) and caches a successful (2xx) response body as
 * text for `ttlMs`. A cache hit returns synchronously-resolved cached text with no network call
 * and no queue interaction. `fetchImpl` defaults to lichessFetch; tests may override it (same
 * pattern as the fetchImpl param on fetchLatestLichessGame / fetchNextPuzzle).
 */
export async function cachedLichessText(
  url: string,
  ttlMs: number,
  init?: RequestInit,
  fetchImpl: LichessFetchImpl = lichessFetch,
): Promise<string> {
  const method = (init?.method ?? 'GET').toUpperCase();
  const now = lichessNow();

  if (method === 'GET') {
    const cached = readEntry(url, ttlMs, now);
    if (cached !== undefined) return cached;
  }

  const response = await fetchImpl(url, init);
  const text = await response.text();
  if (method === 'GET' && response.ok) {
    writeEntry(url, text, now);
  }
  return text;
}

/** Same as cachedLichessText, but parses the body as JSON. */
export async function cachedLichessJson<T>(
  url: string,
  ttlMs: number,
  init?: RequestInit,
  fetchImpl: LichessFetchImpl = lichessFetch,
): Promise<T> {
  const text = await cachedLichessText(url, ttlMs, init, fetchImpl);
  return JSON.parse(text) as T;
}
