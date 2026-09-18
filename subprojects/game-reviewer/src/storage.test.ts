import type { ImportedGame } from '@human-chess/import';
import { gameId } from '@human-chess/import';
import type { GameReview } from '@human-chess/review';
import { describe, expect, it } from 'vitest';
import {
  fromStoredGameReview,
  parseReviewSnapshot,
  parseStoredGameReview,
  parseStoredScreen,
  serializeReviewSnapshot,
  toStoredGameReview,
  type ReviewSnapshot,
} from './storage';

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

const REVIEW: GameReview = {
  moves: [
    {
      ply: 1,
      san: 'e4',
      uci: 'e2e4',
      fenBefore: GAME.startFen,
      fenAfter: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
      evalBefore: { type: 'cp', value: 20 },
      bestMove: 'e2e4',
      bestSan: 'e4',
      evalAfterBest: { type: 'cp', value: 20 },
      evalAfterPlayed: { type: 'cp', value: 20 },
      lossCp: 0,
      classification: 'best',
      provenance: { engine: 'stockfish', depthBefore: 20, depthAfter: 20 },
    },
    {
      ply: 2,
      san: 'e5',
      uci: 'e7e5',
      fenBefore: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
      fenAfter: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
      evalBefore: { type: 'cp', value: 20 },
      bestMove: 'e7e5',
      bestSan: 'e5',
      evalAfterBest: { type: 'cp', value: 20 },
      evalAfterPlayed: { type: 'cp', value: 15 },
      lossCp: 5,
      classification: 'good',
      provenance: { engine: 'stockfish', depthBefore: 20, depthAfter: 20 },
    },
    {
      ply: 3,
      san: 'Nf3',
      uci: 'g1f3',
      fenBefore: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
      fenAfter: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2',
      evalBefore: { type: 'cp', value: 15 },
      bestMove: 'g1f3',
      bestSan: 'Nf3',
      evalAfterBest: { type: 'cp', value: 15 },
      evalAfterPlayed: { type: 'cp', value: 15 },
      lossCp: 0,
      classification: 'best',
      provenance: { engine: 'stockfish', depthBefore: 20, depthAfter: 20 },
    },
    {
      ply: 4,
      san: 'Nc6',
      uci: 'b8c6',
      fenBefore: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2',
      fenAfter: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
      evalBefore: { type: 'cp', value: 15 },
      bestMove: 'b8c6',
      bestSan: 'Nc6',
      evalAfterBest: { type: 'cp', value: 15 },
      evalAfterPlayed: { type: 'cp', value: 15 },
      lossCp: 0,
      classification: 'best',
      provenance: { engine: 'stockfish', depthBefore: 20, depthAfter: 20 },
    },
  ],
  end: undefined,
};

describe('parseStoredScreen', () => {
  it('round-trips the import screen', () => {
    expect(parseStoredScreen({ kind: 'import' })).toEqual({ kind: 'import' });
  });

  it('round-trips the review screen with a valid game', () => {
    expect(parseStoredScreen({ kind: 'review', game: GAME })).toEqual({ kind: 'review', game: GAME });
  });

  it('rejects a corrupt or unknown shape', () => {
    expect(parseStoredScreen(undefined)).toBeUndefined();
    expect(parseStoredScreen({ kind: 'review', game: { ...GAME, ucis: 'not-an-array' } })).toBeUndefined();
    expect(parseStoredScreen({ kind: 'something-else' })).toBeUndefined();
    expect(parseStoredScreen('review')).toBeUndefined();
  });
});

describe('toStoredGameReview / fromStoredGameReview', () => {
  it('round-trips a GameReview, dropping and recovering fenBefore', () => {
    const stored = toStoredGameReview(REVIEW);
    expect(stored.moves.every(m => !('fenBefore' in m))).toBe(true);
    const rebuilt = fromStoredGameReview(stored, GAME.startFen);
    expect(rebuilt).toEqual(REVIEW);
  });
});

describe('parseStoredGameReview', () => {
  it('rejects a move list with a corrupt entry', () => {
    const stored = toStoredGameReview(REVIEW);
    const badMoves = stored.moves.map((m, i) => (i === 1 ? { ...m, classification: 'not-a-real-classification' } : m));
    expect(parseStoredGameReview({ ...stored, moves: badMoves })).toBeUndefined();
  });

  it('rejects a non-array moves field', () => {
    expect(parseStoredGameReview({ moves: 'nope', end: undefined })).toBeUndefined();
  });
});

describe('parseReviewSnapshot', () => {
  const gameKey = gameId(GAME);

  it('round-trips a snapshot with no review yet', () => {
    const snapshot: ReviewSnapshot = { gameKey, review: undefined, selectedPly: 0, flipped: false };
    const stored = serializeReviewSnapshot(snapshot);
    expect(parseReviewSnapshot(stored, GAME)).toEqual(snapshot);
  });

  it('round-trips a snapshot with a finished review', () => {
    const snapshot: ReviewSnapshot = { gameKey, review: REVIEW, selectedPly: 1, flipped: true };
    const stored = serializeReviewSnapshot(snapshot);
    expect(parseReviewSnapshot(stored, GAME)).toEqual(snapshot);
  });

  it('rejects a snapshot bound to a different game (stale gameKey)', () => {
    const snapshot: ReviewSnapshot = { gameKey: 'pgn:deadbeef', review: undefined, selectedPly: 0, flipped: false };
    expect(parseReviewSnapshot(snapshot, GAME)).toBeUndefined();
  });

  it('rejects a selectedPly out of range for the restored review', () => {
    const stored = serializeReviewSnapshot({ gameKey, review: REVIEW, selectedPly: 1, flipped: false });
    expect(parseReviewSnapshot({ ...stored, selectedPly: 99 }, GAME)).toBeUndefined();
  });

  it('rejects a non-zero selectedPly when there is no review', () => {
    const stored = serializeReviewSnapshot({ gameKey, review: undefined, selectedPly: 0, flipped: false });
    expect(parseReviewSnapshot({ ...stored, selectedPly: 1 }, GAME)).toBeUndefined();
  });

  it('rejects a review with a corrupt move list', () => {
    const stored = serializeReviewSnapshot({ gameKey, review: REVIEW, selectedPly: 1, flipped: false });
    const corrupt = { ...stored, review: { ...stored.review, moves: [{ not: 'a move' }] } };
    expect(parseReviewSnapshot(corrupt, GAME)).toBeUndefined();
  });

  it('rejects a corrupt overall shape', () => {
    expect(parseReviewSnapshot(undefined, GAME)).toBeUndefined();
    expect(parseReviewSnapshot({ gameKey, selectedPly: 0 }, GAME)).toBeUndefined(); // missing flipped
  });

  it('rejects a stored review whose move list does not match the game (same url, different ucis)', () => {
    // Two ImportedGames sharing a URL (a truncated paste, or a re-fetch of a game that was still
    // in progress) collide on gameId even though their move lists differ — parseReviewSnapshot
    // must not restore a review bound to a URL under a game whose actual moves have diverged.
    const urlGame: ImportedGame = { ...GAME, url: 'https://lichess.org/abcd1234' };
    const differentMovesGame: ImportedGame = {
      ...urlGame,
      ucis: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5'], // one extra move beyond the stored review
      sans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'],
    };
    const snapshot: ReviewSnapshot = { gameKey: gameId(urlGame), review: REVIEW, selectedPly: 1, flipped: false };
    const stored = serializeReviewSnapshot(snapshot);
    // Same gameKey (both derived from the same url), but the stored review's moves don't match
    // differentMovesGame.ucis — must be rejected rather than restored under the wrong game.
    expect(gameId(differentMovesGame)).toBe(stored.gameKey);
    expect(parseReviewSnapshot(stored, differentMovesGame)).toBeUndefined();
  });
});
