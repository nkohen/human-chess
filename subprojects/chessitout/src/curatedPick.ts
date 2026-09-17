// Picks the next curated midgame for Chessitout's "From your games" source: a random entry not
// yet shown this session, starting over (as if nothing had been shown) once every entry in the
// pool has come up, so the loop never gets stuck. "This session" is in-memory only (a Set of
// ids held by the component, reset on reload) — deliberately not persisted, unlike the source
// choice itself (positionSource.ts).
import type { CuratedPosition } from '@human-chess/positions';

export interface PickResult {
  position: CuratedPosition;
  shownIds: Set<string>;
}

export function pickUnshownCuratedMidgame(
  pool: readonly CuratedPosition[],
  shownIds: ReadonlySet<string>,
  random: () => number = Math.random,
): PickResult {
  if (pool.length === 0) throw new Error('no curated midgames available');
  const unshown = pool.filter(p => !shownIds.has(p.id));
  const startingOver = unshown.length === 0;
  const candidates = startingOver ? pool : unshown;
  const base = startingOver ? new Set<string>() : new Set(shownIds);
  const position = candidates[Math.floor(random() * candidates.length)]!;
  base.add(position.id);
  return { position, shownIds: base };
}
