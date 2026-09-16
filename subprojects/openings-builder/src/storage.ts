// The whole repertoire (every opening) as one JSON array in localStorage. Guarded because
// storage can be missing (no browser) or throw (private mode, quota); on any failure the
// repertoire simply lives for this page only, same pattern as endgames-intro/src/progress.ts.
import { deserialize, serialize, type Opening } from './repertoire';

const KEY = 'human-chess.openings.v1';

export function loadRepertoire(): Opening[] {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const openings: Opening[] = [];
    for (const item of parsed) {
      try {
        openings.push(deserialize(JSON.stringify(item)));
      } catch {
        // one corrupt entry doesn't sink the rest
      }
    }
    return openings;
  } catch {
    return [];
  }
}

export function saveRepertoire(openings: Opening[]): void {
  try {
    globalThis.localStorage?.setItem(KEY, `[${openings.map(serialize).join(',')}]`);
  } catch {
    // storage unavailable: repertoire lives for this page only
  }
}
