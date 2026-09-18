// Shared runtime validator for `ImportedGame` (types.ts), used before trusting one out of
// storage (docs/design/2026-09-18-reload-survival.md). Originally duplicated verbatim in
// game-reviewer's and memory-trainer's storage.ts (same shape, same reasoning); moved here once
// a second caller needed it, per A2/R1 — subprojects consume the shared layer, never duplicate
// it.
import { isOneOf, isRecord, isString, isStringArray } from '@human-chess/ui';
import type { ImportedGame } from './types';

const isColor = isOneOf(['white', 'black'] as const);
const isSource = isOneOf(['lichess', 'chess.com', 'pgn'] as const);

function isHeaders(v: unknown): v is Record<string, string> {
  return isRecord(v) && Object.values(v).every(isString);
}

/** Validates an `ImportedGame` before trusting it out of storage. */
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
