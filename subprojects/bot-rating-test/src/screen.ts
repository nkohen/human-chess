// Persisted snapshot for the bot-rating-test screen (docs/design/2026-09-18-reload-survival.md):
// the setup fields plus, once Start is pressed, the in-flight (or just-finished) game and
// whether it has already been recorded — so a finished game stays visible after a reload and is
// never double-recorded. Separate from the finished-game ledger (records.ts, a different key):
// this key is what screen is on, that key is what happened. No chessops Position is ever
// stored — only plain JSON, rebuilt through @human-chess/play's resumeGame.
import { isBoolean, isFiniteNumber, isOneOf, isRecord, isString, isStringArray, type PersistedStateOptions } from '@human-chess/ui';
import { resumeGame } from '@human-chess/play';
import { START_FEN, type Color } from '@human-chess/rules';
import { suggestedStartingElo } from './suggest';
import { loadRecords } from './records';

export const SCREEN_KEY = 'human-chess.bot-rating-test.screen.v1';

export type ColorChoice = 'white' | 'black' | 'random';
const isColor = isOneOf(['white', 'black'] as const);
const isColorChoice = isOneOf(['white', 'black', 'random'] as const);

export interface ActiveGame {
  elo: number;
  playerColor: Color;
  startFen: string;
}

export interface Screen {
  elo: number;
  colorChoice: ColorChoice;
  fenText: string;
  boardMode: boolean;
  blindfold: boolean;
  /** Undefined on the setup screen; the in-flight (or just-finished) game once Start is pressed. */
  active: ActiveGame | undefined;
  ucis: string[];
  resigned: boolean;
  /** Whether this finished game has already been appended to records.ts's ledger — restores the
   * recordedRef guard across a reload so a finished game is never recorded twice. */
  recorded: boolean;
}

export function defaultScreen(): Screen {
  return {
    elo: suggestedStartingElo(loadRecords()),
    colorChoice: 'white',
    fenText: START_FEN,
    boardMode: false,
    blindfold: false,
    active: undefined,
    ucis: [],
    resigned: false,
    recorded: true,
  };
}

/** The setup a fresh cross-tool hand-off seeds (packages/ui/src/handoff.ts): always lands on
 * the setup screen, never an in-flight game. */
export function screenFromHandoff(handoff: URLSearchParams): Screen {
  const color = handoff.get('color');
  const fen = handoff.get('fen');
  return {
    ...defaultScreen(),
    colorChoice: color === 'black' || color === 'white' ? color : 'white',
    fenText: fen ?? START_FEN,
    blindfold: handoff.get('blindfold') === '1',
  };
}

function isActiveGame(v: unknown): v is ActiveGame {
  return isRecord(v) && isFiniteNumber(v['elo']) && isColor(v['playerColor']) && isString(v['startFen']);
}

/** Validates a stored snapshot; rejects any shape that is not current, and — via resumeGame —
 * any UCI list the rules reject when there is an in-flight game, as a whole. */
export function parseScreen(raw: unknown): Screen | undefined {
  if (!isRecord(raw)) return undefined;
  const { elo, colorChoice, fenText, boardMode, blindfold, active, ucis, resigned, recorded } = raw;
  if (
    !isFiniteNumber(elo) ||
    !isColorChoice(colorChoice) ||
    !isString(fenText) ||
    !isBoolean(boardMode) ||
    !isBoolean(blindfold) ||
    !isStringArray(ucis) ||
    !isBoolean(resigned) ||
    !isBoolean(recorded)
  )
    return undefined;
  if (active === undefined) {
    if (ucis.length > 0) return undefined; // moves with no active game: inconsistent, reject
    return { elo, colorChoice, fenText, boardMode, blindfold, active: undefined, ucis, resigned, recorded };
  }
  if (!isActiveGame(active)) return undefined;
  try {
    resumeGame(active.startFen, active.playerColor, ucis);
  } catch {
    return undefined; // illegal move list: reject the whole snapshot, never half-restore
  }
  return { elo, colorChoice, fenText, boardMode, blindfold, active, ucis, resigned, recorded };
}

export const SCREEN_OPTIONS: PersistedStateOptions<Screen> = { parse: parseScreen };
