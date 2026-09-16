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

  it('trailingRandomPlies extends the move list by up to that amount (less only if a drop happened)', async () => {
    // No engine plies, so this needs no engine call at all — deterministic enough to assert a
    // tight range without a fake engine.
    const trailingRandomPlies = 3;
    const result = await generateSelfPlayPosition(engine, { randomPlies: 0, enginePlies: 0, trailingRandomPlies });
    expect(result.moves.length).toBeGreaterThanOrEqual(trailingRandomPlies - 1);
    expect(result.moves.length).toBeLessThanOrEqual(trailingRandomPlies);
    const pos = positionFromFen(result.fen);
    expect(positionEnd(pos)).toBeUndefined();
  });
});

describe('generateSelfPlayPosition with an aborted signal', () => {
  it('rejects with an AbortError before any engine call when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const fakeEngine = {
      bestMove: () => {
        throw new Error('bestMove should not be called once the signal is already aborted');
      },
    } as unknown as UciEngine;

    await expect(generateSelfPlayPosition(fakeEngine, { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
  });
});
