import { describe, expect, it } from 'vitest';
import { addMove, childrenOf, createOpening, deserialize, movesBeyond, removeMove, repertoireMoves, serialize } from './repertoire';

describe('repertoire', () => {
  it('adds moves and records SAN + the resulting EPD', () => {
    let opening = createOpening('Italian', 'white');
    opening = addMove(opening, opening.root, 'e2e4');
    const kids = childrenOf(opening, opening.root);
    expect(kids).toHaveLength(1);
    expect(kids[0]).toMatchObject({ uci: 'e2e4', san: 'e4' });
  });

  it('is idempotent: adding the same move twice does not duplicate the edge', () => {
    let opening = createOpening('Italian', 'white');
    opening = addMove(opening, opening.root, 'e2e4');
    opening = addMove(opening, opening.root, 'e2e4');
    expect(childrenOf(opening, opening.root)).toHaveLength(1);
  });

  it('merges transpositions: 1.Nf3 d5 2.d4 and 1.d4 d5 2.Nf3 reach the same node', () => {
    let a = createOpening('Transposition test', 'white');
    a = addMove(a, a.root, 'g1f3');
    let node = childrenOf(a, a.root)[0]!.to;
    a = addMove(a, node, 'd7d5');
    node = childrenOf(a, node)[0]!.to;
    a = addMove(a, node, 'd2d4');
    const viaNf3First = childrenOf(a, node)[0]!.to;

    let b = createOpening('Transposition test', 'white');
    b = addMove(b, b.root, 'd2d4');
    let nodeB = childrenOf(b, b.root)[0]!.to;
    b = addMove(b, nodeB, 'd7d5');
    nodeB = childrenOf(b, nodeB)[0]!.to;
    b = addMove(b, nodeB, 'g1f3');
    const viaDFirst = childrenOf(b, nodeB)[0]!.to;

    expect(viaNf3First).toBe(viaDFirst);
  });

  it('removes a move', () => {
    let opening = createOpening('Italian', 'white');
    opening = addMove(opening, opening.root, 'e2e4');
    opening = removeMove(opening, opening.root, 'e2e4');
    expect(childrenOf(opening, opening.root)).toHaveLength(0);
  });

  it('counts the moves recorded beyond a node once each, transpositions included', () => {
    let o = createOpening('count', 'white');
    o = addMove(o, o.root, 'e2e4');
    const afterE4 = childrenOf(o, o.root)[0]!.to;
    o = addMove(o, afterE4, 'e7e5');
    o = addMove(o, afterE4, 'c7c5');
    const afterE5 = childrenOf(o, afterE4)[0]!.to;
    o = addMove(o, afterE5, 'g1f3');
    expect(movesBeyond(o, o.root)).toBe(4);
    expect(movesBeyond(o, afterE4)).toBe(3);
    expect(movesBeyond(o, afterE5)).toBe(1);
    expect(movesBeyond(o, childrenOf(o, afterE5)[0]!.to)).toBe(0);
  });

  it('round-trips through serialize/deserialize', () => {
    let opening = createOpening('Italian', 'white');
    opening = addMove(opening, opening.root, 'e2e4');
    const back = deserialize(serialize(opening));
    expect(back).toEqual(opening);
  });

  it('repertoireMoves respects colour: only the opening owner\'s moves show up on their turn', () => {
    let white = createOpening('Italian', 'white');
    white = addMove(white, white.root, 'e2e4');
    // White to move at the root: this is White's own repertoire move.
    expect(repertoireMoves(white, white.root)).toHaveLength(1);
    const afterE4 = childrenOf(white, white.root)[0]!.to;
    // Black to move after 1.e4: not White's repertoire moves, even if edges existed.
    white = addMove(white, afterE4, 'e7e5');
    expect(repertoireMoves(white, afterE4)).toHaveLength(0);

    let black = createOpening('Sicilian', 'black');
    black = addMove(black, black.root, 'e2e4');
    // White to move at the root: not Black's repertoire moves.
    expect(repertoireMoves(black, black.root)).toHaveLength(0);
    const afterE4Black = childrenOf(black, black.root)[0]!.to;
    black = addMove(black, afterE4Black, 'c7c5');
    // Black to move after 1.e4: this is Black's own repertoire move.
    expect(repertoireMoves(black, afterE4Black)).toHaveLength(1);
  });
});
