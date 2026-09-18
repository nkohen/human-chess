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

// Dismissal of the "Ready for a whole game?" meta hand-off card (interview:
// memory/subprojects/endgames-introduction.md "Meta: hand-off to other tools"). Shown once the
// learner is two lessons in, then never again once dismissed — same guarded-localStorage
// pattern as `confident` above, a separate key so clearing one never touches the other.
const META_HANDOFF_DISMISSED_KEY = 'human-chess.endgames-intro.meta-handoff-dismissed';

export function loadMetaHandoffDismissed(): boolean {
  try {
    return globalThis.localStorage?.getItem(META_HANDOFF_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveMetaHandoffDismissed(): void {
  try {
    globalThis.localStorage?.setItem(META_HANDOFF_DISMISSED_KEY, '1');
  } catch {
    // storage unavailable: the card just reappears next visit
  }
}
