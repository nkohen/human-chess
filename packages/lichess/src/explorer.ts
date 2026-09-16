// The lichess opening explorer: what moves are actually played at a position, and how they did
// (memory/reuse-library.md, "lichess opening explorer API"). Requires any bearer token (no
// scope) — anonymous requests get 401 — so this throws a distinct error when there is no
// session, for callers to render a login prompt from (A1/V3: every number here traces back to
// this one real response, never invented).
import { cachedLichessJson } from './cache';
import { currentLichessSession, forgetLichessSession } from './auth';
import { lichessFetch, type LichessFetchImpl } from './fetch';

/** Thrown by explorerMoves when there is no lichess session to authenticate the request with. */
export class LichessLoginRequired extends Error {
  constructor() {
    super('log in with lichess to use the opening explorer');
    this.name = 'LichessLoginRequired';
  }
}

// lichess's documented rating buckets; each covers up to the next (or upward, for the last).
export const EXPLORER_RATING_BUCKETS = [0, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500] as const;

/** Every documented rating bucket within [min, max] inclusive. */
export function ratingBucketsBetween(min: number, max: number): number[] {
  return EXPLORER_RATING_BUCKETS.filter(bucket => bucket >= min && bucket <= max);
}

export interface ExplorerMove {
  uci: string;
  san: string;
  total: number;
  white: number;
  draws: number;
  black: number;
  /** This move's share of `total` games at the position, in [0, 1]. */
  share: number;
}

export interface ExplorerResult {
  fen: string;
  total: number;
  moves: ExplorerMove[];
  /** e.g. "lichess opening explorer, blitz+rapid+classical, ratings 1600–2000, 123,456 games". */
  provenance: string;
}

interface RawExplorerMove {
  uci: string;
  san: string;
  white: number;
  draws: number;
  black: number;
}

interface RawExplorerResponse {
  white: number;
  draws: number;
  black: number;
  moves: RawExplorerMove[];
}

const EXPLORER_URL = 'https://explorer.lichess.ovh/lichess';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// cachedLichessJson parses whatever body comes back, so the HTTP status is checked here first:
// a 401 means lichess no longer accepts the stored token (revoked server-side while the local
// expiry still looked fine), which is a "log in again" situation, not a JSON error
// (reviewer, 2026-09-16).
const statusCheckedFetch: LichessFetchImpl = async (url, init) => {
  const response = await lichessFetch(url, init);
  if (response.status === 401) {
    forgetLichessSession();
    throw new LichessLoginRequired();
  }
  if (!response.ok) {
    throw new Error(`lichess opening explorer: HTTP ${response.status}`);
  }
  return response;
};

function isRawMove(v: unknown): v is RawExplorerMove {
  const m = v as Record<string, unknown>;
  return (
    typeof v === 'object' && v !== null &&
    typeof m.uci === 'string' && typeof m.san === 'string' &&
    Number.isFinite(m.white) && Number.isFinite(m.draws) && Number.isFinite(m.black)
  );
}

function isRawResponse(v: unknown): v is RawExplorerResponse {
  const r = v as Record<string, unknown>;
  return (
    typeof v === 'object' && v !== null &&
    Number.isFinite(r.white) && Number.isFinite(r.draws) && Number.isFinite(r.black) &&
    Array.isArray(r.moves) && r.moves.every(isRawMove)
  );
}

function withThousands(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function ratingLabel(ratings: number[]): string {
  if (ratings.length === 0) return 'ratings (none selected)';
  const sorted = [...ratings].sort((a, b) => a - b);
  return `ratings ${sorted[0]}–${sorted[sorted.length - 1]}`;
}

/**
 * Move frequencies and results for `fen` at the given rating bands and speeds, from lichess's
 * opening explorer. Cached for 7 days (the underlying data changes slowly). Throws
 * LichessLoginRequired when there is no lichess session, and LichessRateLimited (from fetch.ts,
 * via cachedLichessJson) on a 429 or during lichess's cooldown.
 */
export async function explorerMoves(
  fen: string,
  opts: { ratings: number[]; speeds: string[]; signal?: AbortSignal },
): Promise<ExplorerResult> {
  if (!currentLichessSession()) {
    throw new LichessLoginRequired();
  }

  const url = new URL(EXPLORER_URL);
  url.searchParams.set('variant', 'standard');
  url.searchParams.set('fen', fen);
  url.searchParams.set('speeds', opts.speeds.join(','));
  url.searchParams.set('ratings', opts.ratings.join(','));
  url.searchParams.set('moves', '12');
  url.searchParams.set('topGames', '0');
  url.searchParams.set('recentGames', '0');

  const init: RequestInit = opts.signal ? { signal: opts.signal } : {};
  const raw: unknown = await cachedLichessJson(url.toString(), SEVEN_DAYS_MS, init, statusCheckedFetch);
  if (!isRawResponse(raw)) {
    throw new Error('lichess opening explorer: response was not in the expected shape');
  }

  const total = raw.white + raw.draws + raw.black;
  const moves: ExplorerMove[] = raw.moves.map(m => {
    const moveTotal = m.white + m.draws + m.black;
    return {
      uci: m.uci,
      san: m.san,
      total: moveTotal,
      white: m.white,
      draws: m.draws,
      black: m.black,
      share: total > 0 ? moveTotal / total : 0,
    };
  });

  const provenance = `lichess opening explorer, ${opts.speeds.join('+')}, ${ratingLabel(opts.ratings)}, ${withThousands(total)} games`;

  return { fen, total, moves, provenance };
}
