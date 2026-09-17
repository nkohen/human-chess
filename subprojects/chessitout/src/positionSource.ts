// Which pool Chessitout draws its next position from: mined by self-play (today's default
// behaviour) or the user's own curated chess.com middlegames. Persisted per browser with the
// same guarded-localStorage pattern as subprojects/game-reviewer/src/storage.ts — reads and
// writes never throw, and a bad or missing stored value falls back to the default.
const KEY = 'human-chess.chessitout.position-source';

export type PositionSource = 'mined' | 'curated';
export const DEFAULT_POSITION_SOURCE: PositionSource = 'mined';

export function loadPositionSource(): PositionSource {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    return raw === 'curated' ? 'curated' : DEFAULT_POSITION_SOURCE;
  } catch {
    return DEFAULT_POSITION_SOURCE;
  }
}

export function savePositionSource(source: PositionSource): void {
  try {
    globalThis.localStorage?.setItem(KEY, source);
  } catch {
    // storage unavailable: the choice lives for this page only
  }
}
