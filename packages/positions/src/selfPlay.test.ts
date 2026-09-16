import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testEngines } from '@human-chess/engine/testing';
import type { UciEngine } from '@human-chess/engine';
import { positionEnd, positionFromFen } from '@human-chess/rules';
import { generateSelfPlayPosition } from './selfPlay';

const [first] = testEngines();

describe(`generateSelfPlayPosition with ${first!.label}`, () => {
  let engine: UciEngine;
  beforeAll(async () => {
    engine = first!.open();
    await engine.init();
  });
  afterAll(() => engine.quit());

  it('produces a legal, unfinished position reachable within randomPlies + enginePlies moves', async () => {
    const randomPlies = 2;
    const enginePlies = 3;
    const result = await generateSelfPlayPosition(engine, { randomPlies, enginePlies, depth: 4 });
    expect(result.source).toBe('engine-self-play');
    const pos = positionFromFen(result.fen);
    expect(positionEnd(pos)).toBeUndefined();
    expect(result.moves.length).toBeLessThanOrEqual(randomPlies + enginePlies);
    expect(result.moves.length).toBeGreaterThan(0);
  });
});
