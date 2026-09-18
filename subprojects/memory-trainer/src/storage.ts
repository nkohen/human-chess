// Reload survival (docs/design/2026-09-18-reload-survival.md): the whole memory-trainer screen
// — import/reconstruct/review, the fetched game, the reconstruction so far, and the per-screen
// cursor state (flipped, replayIndex) — as one snapshot object, since there is exactly one
// screen active at a time and none of its pieces make sense without the others.
import type { ImportedGame } from '@human-chess/import';
import { isBoolean, isFiniteNumber, isOneOf, isRecord, isString, isStringArray } from '@human-chess/ui';
import { reconstructedUcis, replayReconstruction, type Reconstruction } from './reconstruction';

export const STATE_KEY = 'human-chess.memory-trainer.state.v1';

const isColor = isOneOf(['white', 'black'] as const);
const isSource = isOneOf(['lichess', 'chess.com', 'pgn'] as const);

function isHeaders(v: unknown): v is Record<string, string> {
  return isRecord(v) && Object.values(v).every(isString);
}

/**
 * Validates an `ImportedGame` (packages/import) before trusting it out of storage. Duplicated in
 * game-reviewer's storage.ts (same shape, same reasoning) rather than added to packages/import:
 * this task's scope is the three subprojects only, not the shared layer — a shared validator
 * would be the natural next move if a third caller needs it.
 */
export function isImportedGame(v: unknown): v is ImportedGame {
  if (!isRecord(v)) return false;
  return (
    isSource(v.source) &&
    (v.username === undefined || isString(v.username)) &&
    isString(v.pgn) &&
    isHeaders(v.headers) &&
    isString(v.startFen) &&
    isStringArray(v.ucis) &&
    isStringArray(v.sans) &&
    (v.white === undefined || isString(v.white)) &&
    (v.black === undefined || isString(v.black)) &&
    (v.result === undefined || isString(v.result)) &&
    (v.playedAs === undefined || isColor(v.playedAs)) &&
    (v.url === undefined || isString(v.url)) &&
    (v.playedAt === undefined || isString(v.playedAt)) &&
    (v.meta === undefined || isRecord(v.meta))
  );
}

export type Screen =
  | { kind: 'import' }
  | { kind: 'reconstruct'; game: ImportedGame; reconstruction: Reconstruction }
  | { kind: 'review'; game: ImportedGame; reconstruction: Reconstruction; claimedComplete: boolean };

export interface TrainerSnapshot {
  screen: Screen;
  flipped: boolean;
  replayIndex: number;
}

interface StoredScreen {
  kind: 'import' | 'reconstruct' | 'review';
  game?: ImportedGame;
  ucis?: string[];
  claimedComplete?: boolean;
}

interface StoredTrainerSnapshot {
  screen: StoredScreen;
  flipped: boolean;
  replayIndex: number;
}

/** Rebuilds `screen.reconstruction` by replaying its stored UCI list; a replay that throws
 * (an illegal move in a corrupt/stale entry) rejects the whole snapshot, never half-restoring. */
export function parseTrainerSnapshot(raw: unknown): TrainerSnapshot | undefined {
  if (!isRecord(raw) || !isRecord(raw.screen) || !isBoolean(raw.flipped)) return undefined;
  if (!isFiniteNumber(raw.replayIndex) || raw.replayIndex < 0 || !Number.isInteger(raw.replayIndex)) return undefined;
  const { screen: s, flipped, replayIndex } = raw as { screen: Record<string, unknown>; flipped: boolean; replayIndex: number };

  if (s.kind === 'import') {
    return { screen: { kind: 'import' }, flipped, replayIndex };
  }
  if ((s.kind === 'reconstruct' || s.kind === 'review') && isImportedGame(s.game) && isStringArray(s.ucis)) {
    let reconstruction: Reconstruction;
    try {
      reconstruction = replayReconstruction(s.game.startFen, s.ucis);
    } catch {
      return undefined; // a replay that throws rejects the whole snapshot
    }
    if (s.kind === 'reconstruct') {
      return { screen: { kind: 'reconstruct', game: s.game, reconstruction }, flipped, replayIndex };
    }
    if (isBoolean(s.claimedComplete)) {
      return { screen: { kind: 'review', game: s.game, reconstruction, claimedComplete: s.claimedComplete }, flipped, replayIndex };
    }
  }
  return undefined;
}

export function serializeTrainerSnapshot(snapshot: TrainerSnapshot): StoredTrainerSnapshot {
  const { screen, flipped, replayIndex } = snapshot;
  if (screen.kind === 'import') return { screen: { kind: 'import' }, flipped, replayIndex };
  const ucis = reconstructedUcis(screen.reconstruction);
  if (screen.kind === 'reconstruct') return { screen: { kind: 'reconstruct', game: screen.game, ucis }, flipped, replayIndex };
  return { screen: { kind: 'review', game: screen.game, ucis, claimedComplete: screen.claimedComplete }, flipped, replayIndex };
}

export const INITIAL_SNAPSHOT: TrainerSnapshot = { screen: { kind: 'import' }, flipped: false, replayIndex: 0 };
