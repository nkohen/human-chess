// Guarded localStorage for guess-the-eval's own settings: reads and writes never throw, and a
// bad or missing stored value falls back to the default rather than sinking the settings
// screen. Same pattern as openings-builder/src/storage.ts and endgames-intro/src/progress.ts.
import { DEFAULT_PVE_TIME_LIMIT, DEFAULT_PVP_TIME_LIMIT, PVE_TIME_LIMITS, PVP_TIME_LIMITS, type PveTimeLimit, type TimeLimitSec } from './timing';

const PVE_LIMIT_KEY = 'human-chess.guessTheEval.pveTimeLimit.v1';
const PVP_LIMIT_KEY = 'human-chess.guessTheEval.pvpTimeLimit.v1';
const PLAYER_NAMES_KEY = 'human-chess.guessTheEval.pvpPlayerNames.v1';

export const DEFAULT_PLAYER1_NAME = 'Player 1';
export const DEFAULT_PLAYER2_NAME = 'Player 2';

function isPveTimeLimit(v: unknown): v is PveTimeLimit {
  return (PVE_TIME_LIMITS as readonly unknown[]).includes(v);
}

function isPvpTimeLimit(v: unknown): v is TimeLimitSec {
  return (PVP_TIME_LIMITS as readonly unknown[]).includes(v);
}

export function loadPveTimeLimit(): PveTimeLimit {
  try {
    const raw = globalThis.localStorage?.getItem(PVE_LIMIT_KEY);
    if (raw === null || raw === undefined) return DEFAULT_PVE_TIME_LIMIT;
    const parsed: unknown = JSON.parse(raw);
    return isPveTimeLimit(parsed) ? parsed : DEFAULT_PVE_TIME_LIMIT;
  } catch {
    return DEFAULT_PVE_TIME_LIMIT;
  }
}

export function savePveTimeLimit(limit: PveTimeLimit): void {
  try {
    globalThis.localStorage?.setItem(PVE_LIMIT_KEY, JSON.stringify(limit));
  } catch {
    // storage unavailable: choice lives for this page only
  }
}

export function loadPvpTimeLimit(): TimeLimitSec {
  try {
    const raw = globalThis.localStorage?.getItem(PVP_LIMIT_KEY);
    if (raw === null || raw === undefined) return DEFAULT_PVP_TIME_LIMIT;
    const parsed: unknown = JSON.parse(raw);
    return isPvpTimeLimit(parsed) ? parsed : DEFAULT_PVP_TIME_LIMIT;
  } catch {
    return DEFAULT_PVP_TIME_LIMIT;
  }
}

export function savePvpTimeLimit(limit: TimeLimitSec): void {
  try {
    globalThis.localStorage?.setItem(PVP_LIMIT_KEY, JSON.stringify(limit));
  } catch {
    // storage unavailable: choice lives for this page only
  }
}

export interface PlayerNames {
  player1: string;
  player2: string;
}

const DEFAULT_PLAYER_NAMES: PlayerNames = { player1: DEFAULT_PLAYER1_NAME, player2: DEFAULT_PLAYER2_NAME };

export function loadPlayerNames(): PlayerNames {
  try {
    const raw = globalThis.localStorage?.getItem(PLAYER_NAMES_KEY);
    if (!raw) return DEFAULT_PLAYER_NAMES;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_PLAYER_NAMES;
    const p = parsed as { player1?: unknown; player2?: unknown };
    return {
      player1: typeof p.player1 === 'string' && p.player1.trim() !== '' ? p.player1 : DEFAULT_PLAYER1_NAME,
      player2: typeof p.player2 === 'string' && p.player2.trim() !== '' ? p.player2 : DEFAULT_PLAYER2_NAME,
    };
  } catch {
    return DEFAULT_PLAYER_NAMES;
  }
}

export function savePlayerNames(names: PlayerNames): void {
  try {
    globalThis.localStorage?.setItem(PLAYER_NAMES_KEY, JSON.stringify(names));
  } catch {
    // storage unavailable: names live for this page only
  }
}
