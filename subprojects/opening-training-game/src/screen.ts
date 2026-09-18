// Persisted snapshot for the opening training game (docs/design/2026-09-18-reload-survival.md):
// the setup fields plus, once a round is under way, the fixed settings it was started with and
// the UCI moves played. The engine's final-position verdict is cheap to recompute (whitePerspective
// + the existing effect) and is deliberately not stored. No chessops Position is ever stored —
// only plain JSON, rebuilt through @human-chess/play's resumeGame.
import { isFiniteNumber, isOneOf, isRecord, isStringArray, type PersistedStateOptions } from '@human-chess/ui';
import { resumeGame } from '@human-chess/play';
import { START_FEN, type Color } from '@human-chess/rules';

export const SCREEN_KEY = 'human-chess.opening-training-game.screen.v1';

export type ColorChoice = Color | 'random';
const isColor = isOneOf(['white', 'black'] as const);
const isColorChoice = isOneOf(['white', 'black', 'random'] as const);

export interface Settings {
  movesN: number;
  playerColor: Color;
  elo: number;
}

export interface Screen {
  movesN: number;
  colorChoice: ColorChoice;
  elo: number;
  /** Undefined on the setup screen; the round's fixed settings once Start is pressed. */
  settings: Settings | undefined;
  ucis: string[];
}

export function defaultScreen(movesN: number, elo: number): Screen {
  return { movesN, colorChoice: 'random', elo, settings: undefined, ucis: [] };
}

function isSettings(v: unknown): v is Settings {
  return isRecord(v) && isFiniteNumber(v['movesN']) && isColor(v['playerColor']) && isFiniteNumber(v['elo']);
}

/** Validates a stored snapshot; rejects any shape that is not current, and — via resumeGame —
 * any UCI list the rules reject or one longer than the round's move cap, as a whole. */
export function parseScreen(raw: unknown): Screen | undefined {
  if (!isRecord(raw)) return undefined;
  const { movesN, colorChoice, elo, settings, ucis } = raw;
  if (!isFiniteNumber(movesN) || !isColorChoice(colorChoice) || !isFiniteNumber(elo) || !isStringArray(ucis)) return undefined;
  if (settings === undefined) {
    if (ucis.length > 0) return undefined; // moves with no round in progress: inconsistent, reject
    return { movesN, colorChoice, elo, settings: undefined, ucis };
  }
  if (!isSettings(settings)) return undefined;
  if (ucis.length > 2 * settings.movesN) return undefined;
  try {
    resumeGame(START_FEN, settings.playerColor, ucis);
  } catch {
    return undefined; // illegal move list: reject the whole snapshot, never half-restore
  }
  return { movesN, colorChoice, elo, settings, ucis };
}

export const SCREEN_OPTIONS: PersistedStateOptions<Screen> = { parse: parseScreen };
