// Pure aggregation over bot-rating-test records: no engine calls, no storage access. Every
// number here is a count of real stored records, never invented (A1).
import type { BotRatingRecord } from './records';

export interface EloSummary {
  elo: number;
  wins: number;
  draws: number;
  losses: number;
}

/** One row per Elo that has at least one record, ascending by Elo. */
export function summarize(records: BotRatingRecord[]): EloSummary[] {
  const byElo = new Map<number, EloSummary>();
  for (const r of records) {
    const row = byElo.get(r.elo) ?? { elo: r.elo, wins: 0, draws: 0, losses: 0 };
    if (r.result === 'won') row.wins += 1;
    else if (r.result === 'draw') row.draws += 1;
    else row.losses += 1;
    byElo.set(r.elo, row);
  }
  return [...byElo.values()].sort((a, b) => a.elo - b.elo);
}

/**
 * The highest Elo with at least one recorded win, and how many wins at that Elo — or
 * undefined when no win is recorded yet. Never claims a win that wasn't played (A1).
 */
export function highestWin(records: BotRatingRecord[]): { elo: number; wins: number } | undefined {
  const rows = summarize(records).filter(r => r.wins > 0);
  if (rows.length === 0) return undefined;
  const best = rows.reduce((a, b) => (b.elo > a.elo ? b : a));
  return { elo: best.elo, wins: best.wins };
}
