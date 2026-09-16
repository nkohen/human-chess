// Position "recipes": named ways to generate a round's position so that successive rounds of a
// guessing game (guess-the-eval) vary in material and game phase, rather than always landing on
// a quiet, roughly-equal early middlegame (user feedback, 2026-09-16). Every recipe is built on
// generateSelfPlayPosition / generateImbalancedPosition — no move generation, legality, or
// evaluation logic is duplicated here, only ply-count and filter choices layered on those (A1,
// and the "never re-implement rules" convention in CLAUDE.md).
import type { UciEngine } from '@human-chess/engine';
import {
  ENGINE_PLIES as IMBALANCED_ENGINE_PLIES,
  generateImbalancedPosition,
  RANDOM_PLIES as IMBALANCED_RANDOM_PLIES,
} from './imbalanced';
import { generateSelfPlayPosition } from './selfPlay';

export type RecipeId = 'quiet' | 'sharp' | 'late' | 'imbalanced';

export const RECIPES: RecipeId[] = ['quiet', 'sharp', 'late', 'imbalanced'];

export interface RecipePosition {
  fen: string;
  /** The recipe that actually produced this position. Usually equal to the one requested, except
   * that 'imbalanced' falls back to 'sharp' when no imbalance is mined in time (see `imbalanced`
   * below) — the caller must show this field, never the originally requested recipe, so the
   * provenance line is never wrong. */
  recipe: RecipeId;
  /** Plain words for the provenance line shown to the player, process only (never the eval or
   * band that produced the position — see describeRecipe). */
  description: string;
  moves: string[];
}

export interface RecipePositionOpts {
  random?: () => number;
  /** Aborts generation; see SelfPlayOpts.signal for the contract. */
  signal?: AbortSignal;
}

// Ranges, not fixed counts, so repeats of the same recipe still differ (user feedback item 3).
// "quiet" keeps the app's original defaults (randomPlies 6, enginePlies ~14) as the centre of
// its range.
const QUIET_RANDOM_PLIES: readonly [number, number] = [5, 7];
const QUIET_ENGINE_PLIES: readonly [number, number] = [12, 16];
const QUIET_DEPTH = 6;

const SHARP_EXTRA_PLIES: readonly [number, number] = [1, 2];

const LATE_RANDOM_PLIES: readonly [number, number] = [8, 12];
const LATE_ENGINE_PLIES: readonly [number, number] = [30, 50];
// Kept low: this many extra plies, run in a browser against the wasm engine, must still stay
// within a few seconds per round (the native binary used in tests is much faster).
const LATE_DEPTH = 4;

/** Plain-language, process-only description of a recipe, for the "Position source" provenance
 * line shown before the reveal. Never mentions an eval band or anything else that would let the
 * player read off the answer (user feedback, 2026-09-16, item 3) — templated from the same range
 * constants the recipes themselves use so the two cannot drift apart. */
export function describeRecipe(id: RecipeId): string {
  switch (id) {
    case 'quiet':
      return `engine self-play: ${QUIET_RANDOM_PLIES[0]}-${QUIET_RANDOM_PLIES[1]} random plies, then ${QUIET_ENGINE_PLIES[0]}-${QUIET_ENGINE_PLIES[1]} engine plies at depth ${QUIET_DEPTH}`;
    case 'sharp':
      return `engine self-play, then ${SHARP_EXTRA_PLIES[0]}-${SHARP_EXTRA_PLIES[1]} extra random plies`;
    case 'late':
      return `engine self-play: ${LATE_RANDOM_PLIES[0]}-${LATE_RANDOM_PLIES[1]} random plies, then ${LATE_ENGINE_PLIES[0]}-${LATE_ENGINE_PLIES[1]} engine plies at depth ${LATE_DEPTH}`;
    case 'imbalanced':
      return 'engine self-play, mined for a material imbalance';
  }
}

/** The documented ply-count range for each recipe's `moves`, derived from the same constants the
 * recipes are built from (never a separately hand-kept number, so the two cannot drift). Used by
 * tests, and safe for callers that want to sanity-check a returned position's length. */
export const RECIPE_PLY_RANGES: Record<RecipeId, { min: number; max: number }> = {
  quiet: {
    min: QUIET_RANDOM_PLIES[0] + QUIET_ENGINE_PLIES[0],
    max: QUIET_RANDOM_PLIES[1] + QUIET_ENGINE_PLIES[1],
  },
  sharp: {
    // Floor is quiet's own floor: the extra trailing plies can end the game and be dropped, per
    // generateSelfPlayPosition's documented contract, leaving sharp at quiet's shortest case.
    min: QUIET_RANDOM_PLIES[0] + QUIET_ENGINE_PLIES[0],
    max: QUIET_RANDOM_PLIES[1] + QUIET_ENGINE_PLIES[1] + SHARP_EXTRA_PLIES[1],
  },
  late: {
    min: LATE_RANDOM_PLIES[0] + LATE_ENGINE_PLIES[0],
    max: LATE_RANDOM_PLIES[1] + LATE_ENGINE_PLIES[1],
  },
  imbalanced: {
    // Fixed ply counts in imbalanced.ts (not a range), minus the possible drop of a finishing ply.
    min: IMBALANCED_RANDOM_PLIES + IMBALANCED_ENGINE_PLIES - 1,
    max: IMBALANCED_RANDOM_PLIES + IMBALANCED_ENGINE_PLIES,
  },
};

export function pickRecipe(random: () => number = Math.random): RecipeId {
  return RECIPES[Math.floor(random() * RECIPES.length)]!;
}

/** Integer uniformly distributed in [min, max]. */
function randInt(min: number, max: number, random: () => number): number {
  return min + Math.floor(random() * (max - min + 1));
}

async function quiet(engine: UciEngine, random: () => number, signal?: AbortSignal): Promise<RecipePosition> {
  const randomPlies = randInt(...QUIET_RANDOM_PLIES, random);
  const enginePlies = randInt(...QUIET_ENGINE_PLIES, random);
  const pos = await generateSelfPlayPosition(engine, {
    randomPlies,
    enginePlies,
    depth: QUIET_DEPTH,
    random,
    ...(signal ? { signal } : {}),
  });
  return { fen: pos.fen, recipe: 'quiet', description: describeRecipe('quiet'), moves: pos.moves };
}

async function sharp(engine: UciEngine, random: () => number, signal?: AbortSignal): Promise<RecipePosition> {
  const randomPlies = randInt(...QUIET_RANDOM_PLIES, random);
  const enginePlies = randInt(...QUIET_ENGINE_PLIES, random);
  const trailingRandomPlies = randInt(...SHARP_EXTRA_PLIES, random);
  // Built on generateSelfPlayPosition's own trailingRandomPlies (finding 6b) instead of
  // duplicating the "play N more random plies, respecting the never-finished contract" loop here.
  const pos = await generateSelfPlayPosition(engine, {
    randomPlies,
    enginePlies,
    depth: QUIET_DEPTH,
    random,
    trailingRandomPlies,
    ...(signal ? { signal } : {}),
  });
  return { fen: pos.fen, recipe: 'sharp', description: describeRecipe('sharp'), moves: pos.moves };
}

async function late(engine: UciEngine, random: () => number, signal?: AbortSignal): Promise<RecipePosition> {
  const randomPlies = randInt(...LATE_RANDOM_PLIES, random);
  const enginePlies = randInt(...LATE_ENGINE_PLIES, random);
  const pos = await generateSelfPlayPosition(engine, {
    randomPlies,
    enginePlies,
    depth: LATE_DEPTH,
    random,
    ...(signal ? { signal } : {}),
  });
  return { fen: pos.fen, recipe: 'late', description: describeRecipe('late'), moves: pos.moves };
}

async function imbalanced(engine: UciEngine, random: () => number, signal?: AbortSignal): Promise<RecipePosition> {
  try {
    const pos = await generateImbalancedPosition(engine, { random, ...(signal ? { signal } : {}) });
    return { fen: pos.fen, recipe: 'imbalanced', description: describeRecipe('imbalanced'), moves: pos.moves };
  } catch (err: unknown) {
    // generateImbalancedPosition throws only when it exhausts its mining attempts without
    // finding a material imbalance within the eval band (about 1 in 5 calls) — never fabricate a
    // position for the player, fall back to a recipe that always succeeds instead. Any other
    // failure (a genuine engine error, an abort) is not this case and must propagate.
    if (err instanceof Error && /no imbalanced position found/.test(err.message)) {
      return sharp(engine, random, signal);
    }
    throw err;
  }
}

/**
 * Generates one round's position for `recipe`. All engine work is bounded per recipe (see each
 * function's ply ranges and depths above) so a round stays within a few seconds against a native
 * engine; the wasm engine used in the browser is slower, which is why self-play depths are kept
 * low (4-6) rather than raised for quality.
 */
export async function generateRecipePosition(engine: UciEngine, recipe: RecipeId, opts: RecipePositionOpts = {}): Promise<RecipePosition> {
  const random = opts.random ?? Math.random;
  const signal = opts.signal;
  switch (recipe) {
    case 'quiet':
      return quiet(engine, random, signal);
    case 'sharp':
      return sharp(engine, random, signal);
    case 'late':
      return late(engine, random, signal);
    case 'imbalanced':
      return imbalanced(engine, random, signal);
  }
}
