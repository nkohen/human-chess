// A short, honest "how long ago" label for an ISO-8601 timestamp, relative to `now` — used by
// GameIdentity so the learner can tell a freshly-finished game from a stale one the site or our
// own cache handed back (user report 2026-09-17: fetched right after finishing a game, got the
// *previous* one — see memory/subprojects/memory-trainer.md).
//
// Deliberately coarse and monotone: never a negative duration, never more precision than the gap
// itself carries. Returns undefined when no honest relative phrase applies — older than 6 days, a
// future timestamp (clock skew), or an unparseable one — so the caller shows the absolute
// date-time alone instead of guessing (and instead of printing it twice).
export function relativeTime(iso: string, now: Date): string | undefined {
  const then = new Date(iso);
  const diffMs = now.getTime() - then.getTime();
  if (Number.isNaN(diffMs) || diffMs < 0) return undefined;

  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'just now';

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`;

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} hour${diffHour === 1 ? '' : 's'} ago`;

  const diffDay = Math.floor(diffHour / 24);
  if (diffDay === 1) return 'yesterday';
  if (diffDay <= 6) return `${diffDay} days ago`;

  return undefined;
}
