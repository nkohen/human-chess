// Which lessons the learner has declared themselves confident in. Kept per browser for now;
// moves to the account layer when one exists. Every access is guarded because storage can be
// missing or throw.
const KEY = 'human-chess.endgames-intro.confident';

export function loadConfident(): Set<string> {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

export function saveConfident(ids: Set<string>): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify([...ids]));
  } catch {
    // storage unavailable: progress lives for this page only
  }
}
