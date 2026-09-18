// Persisted snapshot for Hand and Brain (docs/design/2026-09-18-reload-survival.md): the UCI
// move list plus the mid-turn "called" phase — the brain has named a piece type but the hand
// has not moved yet. Replayed from startGame() through the game module's own call()/move(), so
// a corrupt or illegal snapshot throws partway through and is rejected as a whole; the screen
// never half-restores a game (A1). No chessops Position is ever stored — only plain JSON.
import { isOneOf, isRecord, isStringArray, type PersistedStateOptions } from '@human-chess/ui';
import { parseUciMove, roleAt, type Role } from '@human-chess/rules';
import { call, move, startGame, type HandAndBrainGame } from './game';

export const SCREEN_KEY = 'human-chess.hand-and-brain.screen.v1';

export interface Screen {
  ucis: string[];
  /** The role the brain has called for the side to move's current turn, mid-turn; undefined
   * once the hand has moved (or before any call this turn). */
  calledRole: Role | undefined;
}

export function defaultScreen(): Screen {
  return { ucis: [], calledRole: undefined };
}

const ROLES = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'] as const;
const isRole = isOneOf(ROLES);

/**
 * Replays a snapshot from startGame() through call()/move(), inferring each turn's called role
 * from the piece actually standing on the move's "from" square (the same role the brain must
 * have called for that move to have been legal) rather than storing it redundantly per move.
 * Throws — via call()/move() — on any move or a final `calledRole` the current position
 * rejects, so a tampered or stale snapshot never half-restores.
 */
export function replayGame(screen: Screen): HandAndBrainGame {
  let game = startGame();
  for (const uci of screen.ucis) {
    const { from, to, promotion } = parseUciMove(uci);
    const role = roleAt(game.pos, from);
    if (!role) throw new Error(`no piece on ${from} to move`);
    game = move(call(game, role), from, to, promotion);
  }
  if (screen.calledRole !== undefined) game = call(game, screen.calledRole);
  return game;
}

/** Validates a stored snapshot; rejects any shape that is not current, and — via replayGame —
 * any UCI list or called role the rules reject, as a whole (never a partial restore). */
export function parseScreen(raw: unknown): Screen | undefined {
  if (!isRecord(raw)) return undefined;
  const { ucis, calledRole } = raw;
  if (!isStringArray(ucis)) return undefined;
  if (calledRole !== undefined && !isRole(calledRole)) return undefined;
  const screen: Screen = { ucis, calledRole: calledRole as Role | undefined };
  try {
    replayGame(screen);
  } catch {
    return undefined;
  }
  return screen;
}

export const SCREEN_OPTIONS: PersistedStateOptions<Screen> = { parse: parseScreen };
