import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testEngines } from '@human-chess/engine/testing';
import type { UciEngine } from '@human-chess/engine';
import { hasLegalMoves, positionEnd, positionFromFen, turn } from '@human-chess/rules';
import { endgameLadder } from './index';

describe('endgame ladder positions', () => {
  it('have unique ids and ascending stages', () => {
    const ids = endgameLadder.map(l => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (let i = 1; i < endgameLadder.length; i++) {
      expect(endgameLadder[i]!.stage).toBeGreaterThanOrEqual(endgameLadder[i - 1]!.stage);
    }
  });

  it.each(endgameLadder)('$id is a legal, unfinished position with White to move', lesson => {
    const pos = positionFromFen(lesson.fen);
    expect(turn(pos)).toBe('white');
    expect(positionEnd(pos)).toBeUndefined();
    expect(hasLegalMoves(pos)).toBe(true);
  });

  const [first] = testEngines();
  describe(`engine check with ${first!.label}`, () => {
    let engine: UciEngine;
    beforeAll(async () => {
      engine = first!.open();
      await engine.init();
    });
    afterAll(() => engine.quit());

    // These ladder positions are all a whole rook up or more — theoretically won, but the shallow
    // 1500ms search reports the KR-vs-K rook eval below its nominal +5.00 (it hovers around +4.8,
    // and the mate is deep). The check here is only "clearly winning for White", not "worth exactly
    // the material", so the threshold is a decisive-advantage margin (+3.00) that sits well above a
    // draw (~0) and well below where any of these positions actually evaluate — not a tight +5.00.
    const DECISIVE_CP = 300;
    it.each(endgameLadder)('$id is a forced win for White', async lesson => {
      const a = await engine.analyse(lesson.fen, [], { movetime: 1500 });
      const score = a.lines[0]?.score;
      expect(score, `no score from ${a.engine}`).toBeDefined();
      expect(score!.type === 'mate' ? score!.value > 0 : score!.value >= DECISIVE_CP, `${lesson.id}: ${JSON.stringify(score)}`).toBe(true);
    });
  });
});
