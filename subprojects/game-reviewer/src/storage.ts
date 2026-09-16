// Remembers the last lichess username tried, per browser. Every access is guarded because
// storage can be missing (SSR, private browsing) or throw.
const KEY = 'human-chess.game-reviewer.lichess-username';

export function loadLastUsername(): string {
  try {
    return globalThis.localStorage?.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveLastUsername(username: string): void {
  try {
    globalThis.localStorage?.setItem(KEY, username);
  } catch {
    // storage unavailable: the username just won't be remembered next time
  }
}
