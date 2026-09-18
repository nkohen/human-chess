import { describe, expect, it } from 'vitest';
import { acceptedMoves, isOnPath, liveOpenings, nextMoveOptions, pickReply } from './drill';
import { addMove, childrenOf, createOpening, type Opening } from './repertoire';

/** Italian: 1.e4 e5 2.Nf3, both moves recorded (the opponent's e5 as a recorded reply, the way
 * the app's own tree-building records opponent moves too). */
function italian(): Opening {
  let o = createOpening('Italian', 'white');
  o = addMove(o, o.root, 'e2e4');
  const afterE4 = childrenOf(o, o.root)[0]!.to;
  o = addMove(o, afterE4, 'e7e5');
  const afterE5 = childrenOf(o, afterE4)[0]!.to;
  o = addMove(o, afterE5, 'g1f3');
  return o;
}

/** London System: 1.d4 d5 2.Bf4 — a different first move than the Italian, so the two openings
 * diverge at the root. */
function london(): Opening {
  let o = createOpening('London', 'white');
  o = addMove(o, o.root, 'd2d4');
  const afterD4 = childrenOf(o, o.root)[0]!.to;
  o = addMove(o, afterD4, 'd7d5');
  const afterD5 = childrenOf(o, afterD4)[0]!.to;
  o = addMove(o, afterD5, 'c1f4');
  return o;
}

/** A second white opening that also plays 1.e4 e5 2.Nf3 (same as the Italian) but then diverges
 * with 3.Bc4 vs. some other Italian continuation, so the two share an edge and then split. */
function bishopsOpeningLike(): Opening {
  let o = createOpening('Bishop-ish', 'white');
  o = addMove(o, o.root, 'e2e4');
  const afterE4 = childrenOf(o, o.root)[0]!.to;
  o = addMove(o, afterE4, 'e7e5');
  const afterE5 = childrenOf(o, afterE4)[0]!.to;
  o = addMove(o, afterE5, 'g1f3');
  return o;
}

/** Two openings sharing 1.e4 e5 2.Nf3 Nc6, then diverging: the Italian plays 3.Bc4, the Scotch
 * plays 3.d4. Both stay live through the shared prefix, so at the Nc6 position each one's third
 * move is "wrong" for the other but accepted because both are selected. Returns the two openings
 * plus the shared EPD they diverge from. */
function italianVsScotch(): [Opening, Opening, string] {
  const sharedPrefix = (name: string): [Opening, string] => {
    let o = createOpening(name, 'white');
    o = addMove(o, o.root, 'e2e4');
    const afterE4 = childrenOf(o, o.root)[0]!.to;
    o = addMove(o, afterE4, 'e7e5');
    const afterE5 = childrenOf(o, afterE4)[0]!.to;
    o = addMove(o, afterE5, 'g1f3');
    const afterNf3 = childrenOf(o, afterE5)[0]!.to;
    o = addMove(o, afterNf3, 'b8c6');
    const afterNc6 = childrenOf(o, afterNf3)[0]!.to;
    return [o, afterNc6];
  };
  const [italianBase, afterNc6] = sharedPrefix('Italian');
  const italianOp = addMove(italianBase, afterNc6, 'f1c4');

  const [scotchBase] = sharedPrefix('Scotch');
  const scotch = addMove(scotchBase, afterNc6, 'd2d4');

  return [italianOp, scotch, afterNc6];
}

describe('isOnPath / liveOpenings', () => {
  it('stays on path while every played move matches the opening\'s own edges', () => {
    const it1 = italian();
    expect(isOnPath(it1, [])).toBe(true);
    expect(isOnPath(it1, ['e2e4'])).toBe(true);
    expect(isOnPath(it1, ['e2e4', 'e7e5'])).toBe(true);
    expect(isOnPath(it1, ['e2e4', 'e7e5', 'g1f3'])).toBe(true);
  });

  it('falls off the path the moment a played move has no matching edge, and never rejoins', () => {
    const it1 = italian();
    expect(isOnPath(it1, ['d2d4'])).toBe(false);
    // A move later in the trail that would have matched (e7e5) doesn't resurrect it.
    expect(isOnPath(it1, ['d2d4', 'e7e5'])).toBe(false);
  });

  it('liveOpenings keeps only the openings whose graph still matches the trail', () => {
    const openings = [italian(), london()];
    expect(liveOpenings(openings, []).map(o => o.name)).toEqual(['Italian', 'London']);
    expect(liveOpenings(openings, ['e2e4']).map(o => o.name)).toEqual(['Italian']);
    expect(liveOpenings(openings, ['d2d4']).map(o => o.name)).toEqual(['London']);
    expect(liveOpenings(openings, ['c2c4'])).toEqual([]);
  });

  it('drops an opening from the live set once the path leaves it, for the rest of the drill', () => {
    const openings = [italian(), london()];
    // 1.e4 kills London; 1...e5 is irrelevant to London either way.
    const trail = ['e2e4', 'e7e5'];
    expect(liveOpenings(openings, trail).map(o => o.name)).toEqual(['Italian']);
  });
});

describe('acceptedMoves (union rule for the user\'s own moves)', () => {
  it('unions accepted moves across live openings at the root', () => {
    const live = liveOpenings([italian(), london()], []);
    const accepted = acceptedMoves(live, live[0]!.root);
    const byUci = new Map(accepted.map(a => [a.uci, a]));
    expect([...byUci.keys()].sort()).toEqual(['d2d4', 'e2e4']);
    expect(byUci.get('e2e4')!.openingNames).toEqual(['Italian']);
    expect(byUci.get('d2d4')!.openingNames).toEqual(['London']);
  });

  it('a move wrong for every live opening is simply absent from acceptedMoves', () => {
    const live = liveOpenings([italian(), london()], []);
    const accepted = acceptedMoves(live, live[0]!.root);
    expect(accepted.some(a => a.uci === 'c2c4')).toBe(false);
  });

  it('a move wrong for opening A but right for opening B is accepted when both are selected', () => {
    const [italianOp, scotch, afterNc6] = italianVsScotch();
    const trail = ['e2e4', 'e7e5', 'g1f3', 'b8c6'];
    const live = liveOpenings([italianOp, scotch], trail);
    expect(live).toHaveLength(2); // both still on the shared prefix

    const accepted = acceptedMoves(live, afterNc6);
    const byUci = new Map(accepted.map(a => [a.uci, a]));
    // Bc4 is wrong for the Scotch alone, and d4 is wrong for the Italian alone, but both are
    // accepted here because both openings are selected (the union rule).
    expect([...byUci.keys()].sort()).toEqual(['d2d4', 'f1c4']);
    expect(byUci.get('f1c4')!.openingNames).toEqual(['Italian']);
    expect(byUci.get('d2d4')!.openingNames).toEqual(['Scotch']);
  });

  it('collapses one UCI shared by two live openings into a single entry naming both', () => {
    const a = italian();
    const b = bishopsOpeningLike();
    const trail = ['e2e4', 'e7e5'];
    const live = liveOpenings([a, b], trail);
    expect(live).toHaveLength(2);
    const epd = childrenOf(a, childrenOf(a, a.root)[0]!.to)[0]!.to;
    const accepted = acceptedMoves(live, epd);
    expect(accepted).toHaveLength(1);
    expect(accepted[0]!.uci).toBe('g1f3');
    expect(accepted[0]!.openingNames.sort()).toEqual(['Bishop-ish', 'Italian']);
  });
});

describe('nextMoveOptions / pickReply', () => {
  it('unions opponent replies across live openings and drops duplicates', () => {
    const a = italian();
    const b = bishopsOpeningLike();
    const afterE4 = childrenOf(a, a.root)[0]!.to;
    const options = nextMoveOptions([a, b], afterE4);
    expect(options).toHaveLength(1);
    expect(options[0]!.uci).toBe('e7e5');
    expect(options[0]!.openingNames.sort()).toEqual(['Bishop-ish', 'Italian']);
  });

  it('is empty at a leaf, which callers treat as line-complete', () => {
    const a = italian();
    const leaf = childrenOf(a, childrenOf(a, childrenOf(a, a.root)[0]!.to)[0]!.to)[0]!.to;
    expect(nextMoveOptions([a], leaf)).toEqual([]);
    expect(pickReply([a], leaf)).toBeUndefined();
  });

  it('pickReply draws deterministically from the injected random', () => {
    const a = italian();
    const b = london();
    const options = nextMoveOptions([a, b], a.root);
    expect(options.map(o => o.uci).sort()).toEqual(['d2d4', 'e2e4']);
    const first = pickReply([a, b], a.root, () => 0);
    const second = pickReply([a, b], a.root, () => 0.999999);
    expect(first!.uci).not.toBe(second!.uci);
  });
});
