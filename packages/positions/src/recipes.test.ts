import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testEngines } from '@human-chess/engine/testing';
import type { UciEngine } from '@human-chess/engine';
import { fenOf, playUci, positionEnd, positionFromFen, START_FEN } from '@human-chess/rules';
import { generateRecipePosition, pickRecipe, RECIPE_PLY_RANGES, RECIPES, type RecipeId } from './recipes';

describe('RECIPES', () => {
  it('lists the four documented recipes', () => {
    expect(RECIPES).toEqual(['quiet', 'sharp', 'late', 'imbalanced']);
  });
});

describe('pickRecipe', () => {
  it('always returns one of RECIPES', () => {
    for (let i = 0; i < 50; i++) {
      expect(RECIPES).toContain(pickRecipe(Math.random));
    }
  });

  it('is driven by the injected random function, not global state', () => {
    expect(pickRecipe(() => 0)).toBe(RECIPES[0]);
    expect(pickRecipe(() => 0.999)).toBe(RECIPES[RECIPES.length - 1]);
  });
});

// Needs real search (self-play plies, and for "imbalanced" a mining loop with its own eval
// check) to produce genuine positions within a bounded number of engine calls; like
// imbalanced.test.ts, this is slow enough on the wasm engine that it only runs against a native
// Stockfish (STOCKFISH_PATH or /opt/homebrew/bin/stockfish), and is skipped, with this note,
// when neither is present.
const native = testEngines().find(e => e.label.startsWith('native'));

describe.skipIf(!native)(
  native ? `generateRecipePosition with ${native.label}` : 'generateRecipePosition (no native Stockfish found, skipped)',
  () => {
    let engine: UciEngine;
    beforeAll(async () => {
      engine = native!.open();
      await engine.init();
    });
    afterAll(() => engine.quit());

    // Every recipe must: stay within its documented ply-count range (indexed by the recipe that
    // was *actually* returned, since 'imbalanced' can fall back to 'sharp'), land on an unfinished
    // legal position, and replay its own `moves` from START_FEN to exactly that position's fen —
    // the position is never something other than what the recorded moves reach.
    async function checkRecipe(recipe: RecipeId) {
      const pos = await generateRecipePosition(engine, recipe);
      const p = positionFromFen(pos.fen);
      expect(positionEnd(p)).toBeUndefined();

      const range = RECIPE_PLY_RANGES[pos.recipe];
      expect(pos.moves.length).toBeGreaterThanOrEqual(range.min);
      expect(pos.moves.length).toBeLessThanOrEqual(range.max);

      let replayed = positionFromFen(START_FEN);
      for (const uci of pos.moves) replayed = playUci(replayed, uci).pos;
      expect(fenOf(replayed)).toBe(pos.fen);

      return pos;
    }

    it('quiet produces a legal, unfinished position within its documented range', async () => {
      const pos = await checkRecipe('quiet');
      expect(pos.recipe).toBe('quiet');
      expect(pos.description.length).toBeGreaterThan(0);
    });

    it(
      'sharp produces a legal, unfinished position within its documented range',
      async () => {
        const pos = await checkRecipe('sharp');
        expect(pos.recipe).toBe('sharp');
      },
      20_000,
    );

    it(
      'late produces a legal, unfinished position within its documented range',
      async () => {
        const pos = await checkRecipe('late');
        expect(pos.recipe).toBe('late');
      },
      20_000,
    );

    it(
      'imbalanced returns either the imbalanced recipe or its sharp fallback, both within range',
      async () => {
        const pos = await checkRecipe('imbalanced');
        expect(['imbalanced', 'sharp']).toContain(pos.recipe);
      },
      20_000,
    );
  },
);
