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

    it.each(endgameLadder)('$id is a forced win for White', async lesson => {
      const a = await engine.analyse(lesson.fen, [], { movetime: 1500 });
      const score = a.lines[0]?.score;
      expect(score, `no score from ${a.engine}`).toBeDefined();
      expect(score!.type === 'mate' ? score!.value > 0 : score!.value >= 500, `${lesson.id}: ${JSON.stringify(score)}`).toBe(true);
    });
  });
});
