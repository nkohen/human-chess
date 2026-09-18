import { describe, expect, it } from 'vitest';
import { importPgn, type ImportedGame } from '@human-chess/import';
import { buildGamesTree } from '@human-chess/opening-tree';
import { positionFromFen, repetitionKey, START_FEN } from '@human-chess/rules';
import {
  parseBuilderState,
  parseBuildPathSnapshot,
  parseDrillSnapshot,
  parseGamesPathUcis,
  parseMoveTreeKeySet,
  rebuildBuildPath,
  rebuildGamesPath,
  reconcileMoveTreeKeys,
  replayTrail,
  serializeMoveTreeKeySet,
  type BuilderStateSnapshot,
  type BuildPathSnapshot,
  type DrillSnapshot,
} from './persistence';
import { addMove, createOpening } from './repertoire';

/** Same helper as opening-tree's own tests: a hand-written PGN imported the way a pasted-PGN
 * ImportedGame would be. */
function pgn(white: string, black: string, result: string, moves: string, extra: Partial<ImportedGame> = {}): ImportedGame {
  const game = importPgn(`[White "${white}"]\n[Black "${black}"]\n[Result "${result}"]\n\n${moves} ${result}`);
  return { ...game, ...extra };
}

describe('parseBuilderState', () => {
  const valid: BuilderStateSnapshot = { selectedId: 'op_1', mode: 'drill', severalIds: ['op_1', 'op_2'], newName: 'Italian', newColor: 'black' };

  it('round-trips a valid snapshot', () => {
    expect(parseBuilderState(JSON.parse(JSON.stringify(valid)))).toEqual(valid);
  });

  it('accepts a null selectedId (nothing picked)', () => {
    expect(parseBuilderState({ ...valid, selectedId: null })).toEqual({ ...valid, selectedId: null });
  });

  it.each([
    ['not a record', 'nope'],
    ['a bad mode', { ...valid, mode: 'practice' }],
    ['a bad colour', { ...valid, newColor: 'purple' }],
    ['a non-array severalIds', { ...valid, severalIds: 'op_1' }],
    ['a non-string entry in severalIds', { ...valid, severalIds: [1, 2] }],
    ['a numeric selectedId', { ...valid, selectedId: 42 }],
    ['a missing field', { mode: 'build' }],
  ])('rejects %s', (_label, raw) => {
    expect(parseBuilderState(raw)).toBeUndefined();
  });
});

describe('BuilderView path: parseBuildPathSnapshot / rebuildBuildPath', () => {
  const validSnapshot: BuildPathSnapshot = { openingId: 'op_1', ucis: ['e2e4', 'e7e5'] };

  it('round-trips a valid snapshot', () => {
    expect(parseBuildPathSnapshot(JSON.parse(JSON.stringify(validSnapshot)))).toEqual(validSnapshot);
  });

  it.each([
    ['not a record', 'nope'],
    ['a missing openingId', { ucis: ['e2e4'] }],
    ['a non-array ucis', { openingId: 'op_1', ucis: 'e2e4' }],
    ['a non-string uci', { openingId: 'op_1', ucis: [1] }],
  ])('rejects %s', (_label, raw) => {
    expect(parseBuildPathSnapshot(raw)).toBeUndefined();
  });

  it('rebuilds the full path when every uci is still in the opening', () => {
    let opening = createOpening('Italian', 'white');
    opening = addMove(opening, opening.root, 'e2e4');
    const afterE4 = opening.nodes[opening.root]!.moves[0]!.to;
    opening = addMove(opening, afterE4, 'e7e5');

    const path = rebuildBuildPath(opening, ['e2e4', 'e7e5']);
    expect(path.map(m => m.uci)).toEqual(['e2e4', 'e7e5']);
  });

  it('truncates at the first uci the opening no longer has (edited since the path was saved)', () => {
    let opening = createOpening('Italian', 'white');
    opening = addMove(opening, opening.root, 'e2e4');
    // 'e7e5' was never (or no longer) recorded here.
    const path = rebuildBuildPath(opening, ['e2e4', 'e7e5', 'g1f3']);
    expect(path.map(m => m.uci)).toEqual(['e2e4']);
  });

  it('truncates to empty when the very first uci is not in the opening', () => {
    const opening = createOpening('Italian', 'white');
    expect(rebuildBuildPath(opening, ['e2e4'])).toEqual([]);
  });
});

describe('DrillView: parseDrillSnapshot / replayTrail', () => {
  const validSnapshot: DrillSnapshot = { scopeKey: 'op_1', trail: ['e2e4', 'e7e5'], status: 'wrong', expected: [{ san: 'Nf3', openingNames: ['Italian'] }] };

  it('round-trips a valid snapshot', () => {
    expect(parseDrillSnapshot(JSON.parse(JSON.stringify(validSnapshot)))).toEqual(validSnapshot);
  });

  it.each([
    ['not a record', 'nope'],
    ['a bad status', { ...validSnapshot, status: 'thinking' }],
    ['a non-array trail', { ...validSnapshot, trail: 'e2e4' }],
    ['an expected entry missing openingNames', { ...validSnapshot, expected: [{ san: 'Nf3' }] }],
    ['an expected entry with non-string openingNames', { ...validSnapshot, expected: [{ san: 'Nf3', openingNames: [1] }] }],
  ])('rejects %s', (_label, raw) => {
    expect(parseDrillSnapshot(raw)).toBeUndefined();
  });

  it('replays a legal trail to the resulting EPD', () => {
    const root = repetitionKey(positionFromFen(START_FEN));
    const epd = replayTrail(root, ['e2e4', 'e7e5']);
    expect(epd).toBeDefined();
    // Same EPD `createOpening` + two `addMove`s would land the tree on.
    let opening = createOpening('x', 'white');
    opening = addMove(opening, opening.root, 'e2e4');
    const afterE4 = opening.nodes[opening.root]!.moves[0]!.to;
    opening = addMove(opening, afterE4, 'e7e5');
    const afterE5 = opening.nodes[afterE4]!.moves[0]!.to;
    expect(epd).toBe(afterE5);
  });

  it('rejects (returns undefined for) an illegal trail rather than throwing', () => {
    const root = repetitionKey(positionFromFen(START_FEN));
    // e2e4 twice in a row: the pawn is no longer on e2 for the second move.
    expect(replayTrail(root, ['e2e4', 'e2e4'])).toBeUndefined();
  });

  it('rejects a trail with an unparseable uci', () => {
    const root = repetitionKey(positionFromFen(START_FEN));
    expect(replayTrail(root, ['not-a-uci'])).toBeUndefined();
  });

  it('the empty trail replays to the root itself', () => {
    const root = repetitionKey(positionFromFen(START_FEN));
    expect(replayTrail(root, [])).toBe(root);
  });
});

describe('GamesTreeView path: parseGamesPathUcis / rebuildGamesPath', () => {
  it('round-trips a valid uci list', () => {
    expect(parseGamesPathUcis(['e2e4', 'e7e5'])).toEqual(['e2e4', 'e7e5']);
  });

  it.each([
    ['not an array', 'e2e4'],
    ['an array with a non-string entry', ['e2e4', 3]],
  ])('rejects %s', (_label, raw) => {
    expect(parseGamesPathUcis(raw)).toBeUndefined();
  });

  it('rebuilds the full path when every uci is still in the tree', () => {
    const games = [pgn('nadavk', 'opp', '1-0', '1. e4 e5 2. Nf3'), pgn('nadavk', 'opp2', '1-0', '1. e4 e5 2. Nf3')];
    const tree = buildGamesTree(games, 'nadavk', 'white');
    const path = rebuildGamesPath(tree, ['e2e4', 'e7e5', 'g1f3']);
    expect(path.map(m => m.uci)).toEqual(['e2e4', 'e7e5', 'g1f3']);
  });

  it('truncates at the first uci no longer in the tree (a fresh sync, a changed filter, or a changed colour)', () => {
    const games = [pgn('nadavk', 'opp', '1-0', '1. e4 e5')];
    const tree = buildGamesTree(games, 'nadavk', 'white');
    const path = rebuildGamesPath(tree, ['e2e4', 'e7e5', 'g1f3']); // g1f3 was never played after e5 here
    expect(path.map(m => m.uci)).toEqual(['e2e4', 'e7e5']);
  });

  it('truncates to empty for a uci absent even at the root', () => {
    const games = [pgn('nadavk', 'opp', '1-0', '1. e4 e5')];
    const tree = buildGamesTree(games, 'nadavk', 'white');
    expect(rebuildGamesPath(tree, ['d2d4'])).toEqual([]);
  });
});

describe('MoveTree state: parseMoveTreeKeySet / serializeMoveTreeKeySet / reconcileMoveTreeKeys', () => {
  it('round-trips a Set through the array shape usePersistedState stores', () => {
    const set = new Set(['', 'e2e4', 'e2e4 e7e5']);
    const stored = serializeMoveTreeKeySet(set);
    expect(parseMoveTreeKeySet(stored)).toEqual(set);
  });

  it.each([
    ['not an array', 'e2e4'],
    ['an array with a non-string entry', ['e2e4', 1]],
  ])('rejects %s', (_label, raw) => {
    expect(parseMoveTreeKeySet(raw)).toBeUndefined();
  });

  it('keeps only path keys that still resolve against the tree, always keeping the root key', () => {
    const games = [pgn('nadavk', 'opp', '1-0', '1. e4 e5')];
    const tree = buildGamesTree(games, 'nadavk', 'white');
    const kept = reconcileMoveTreeKeys(tree, new Set(['', 'e2e4', 'e2e4 e7e5', 'd2d4', 'e2e4 e7e5 g1f3']));
    // 'd2d4' was never played; 'e2e4 e7e5 g1f3' has no g1f3 recorded after e7e5.
    expect(kept).toEqual(new Set(['', 'e2e4', 'e2e4 e7e5']));
  });

  it('keeps the root key even against an empty tree', () => {
    const tree = buildGamesTree([], 'nadavk', 'white');
    expect(reconcileMoveTreeKeys(tree, new Set(['', 'e2e4']))).toEqual(new Set(['']));
  });
});
