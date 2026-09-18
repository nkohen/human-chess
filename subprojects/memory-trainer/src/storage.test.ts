import type { ImportedGame } from '@human-chess/import';
import { describe, expect, it } from 'vitest';
import { reconstructedUcis, startReconstruction } from './reconstruction';
import { INITIAL_SNAPSHOT, parseTrainerSnapshot, serializeTrainerSnapshot, type TrainerSnapshot } from './storage';

const GAME: ImportedGame = {
  source: 'pgn',
  username: undefined,
  pgn: '1. e4 e5 2. Nf3 Nc6',
  headers: {},
  startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  ucis: ['e2e4', 'e7e5', 'g1f3', 'b8c6'],
  sans: ['e4', 'e5', 'Nf3', 'Nc6'],
  white: undefined,
  black: undefined,
  result: undefined,
  playedAs: 'white',
  url: undefined,
  playedAt: undefined,
};

describe('parseTrainerSnapshot', () => {
  it('round-trips the import screen', () => {
    expect(parseTrainerSnapshot(serializeTrainerSnapshot(INITIAL_SNAPSHOT))).toEqual(INITIAL_SNAPSHOT);
  });

  it('round-trips a reconstruct screen, rebuilding the position from the stored ucis', () => {
    const reconstruction = startReconstruction(GAME.startFen);
    const snapshot: TrainerSnapshot = {
      screen: { kind: 'reconstruct', game: GAME, reconstruction },
      flipped: true,
      replayIndex: 0,
    };
    const stored = serializeTrainerSnapshot(snapshot);
    const parsed = parseTrainerSnapshot(stored);
    expect(parsed?.screen.kind).toBe('reconstruct');
    expect(parsed?.flipped).toBe(true);
    if (parsed?.screen.kind === 'reconstruct') {
      expect(reconstructedUcis(parsed.screen.reconstruction)).toEqual([]);
      expect(parsed.screen.reconstruction.startFen).toBe(GAME.startFen);
    }
  });

  it('round-trips a review screen with claimedComplete and a non-empty move list', () => {
    const stored = {
      screen: { kind: 'review', game: GAME, ucis: ['e2e4', 'e7e5'], claimedComplete: true },
      flipped: false,
      replayIndex: 1,
    };
    const parsed = parseTrainerSnapshot(stored);
    expect(parsed?.screen.kind).toBe('review');
    if (parsed?.screen.kind === 'review') {
      expect(parsed.screen.claimedComplete).toBe(true);
      expect(reconstructedUcis(parsed.screen.reconstruction)).toEqual(['e2e4', 'e7e5']);
    }
    expect(parsed?.replayIndex).toBe(1);
  });

  it('rejects a stored uci list that fails to replay (illegal move)', () => {
    const stored = {
      screen: { kind: 'reconstruct', game: GAME, ucis: ['e2e5'] }, // e2-e5 is not a legal opening move
      flipped: false,
      replayIndex: 0,
    };
    expect(parseTrainerSnapshot(stored)).toBeUndefined();
  });

  it('rejects reconstruct/review kinds missing the game or the uci list', () => {
    expect(parseTrainerSnapshot({ screen: { kind: 'reconstruct' }, flipped: false, replayIndex: 0 })).toBeUndefined();
    expect(parseTrainerSnapshot({ screen: { kind: 'reconstruct', game: GAME }, flipped: false, replayIndex: 0 })).toBeUndefined();
  });

  it('rejects a review screen missing claimedComplete', () => {
    const stored = { screen: { kind: 'review', game: GAME, ucis: [] }, flipped: false, replayIndex: 0 };
    expect(parseTrainerSnapshot(stored)).toBeUndefined();
  });

  it('rejects a corrupt overall shape', () => {
    expect(parseTrainerSnapshot(undefined)).toBeUndefined();
    expect(parseTrainerSnapshot({ screen: { kind: 'import' }, flipped: 'nope', replayIndex: 0 })).toBeUndefined();
    expect(parseTrainerSnapshot({ screen: { kind: 'import' }, flipped: false, replayIndex: -1 })).toBeUndefined();
  });
});
