import { describe, expect, it } from 'vitest';
import { fitSquare } from './fit';

describe('fitSquare', () => {
  it('is width-bound when the box is wider than it is tall', () => {
    expect(fitSquare(400, 900, 0)).toBe(400);
  });

  it('is height-bound when the box is taller than it is wide', () => {
    expect(fitSquare(900, 400, 0)).toBe(400);
  });

  it('subtracts the gap from the bound dimension', () => {
    expect(fitSquare(400, 900, 16)).toBe(384);
    expect(fitSquare(900, 400, 16)).toBe(384);
  });

  it('never goes negative when the gap exceeds the available space', () => {
    expect(fitSquare(10, 10, 40)).toBe(0);
    expect(fitSquare(0, 0, 0)).toBe(0);
  });

  it('always returns an integer, flooring fractional input', () => {
    expect(fitSquare(401.7, 900, 0)).toBe(401);
    expect(fitSquare(400.2, 400.9, 0.1)).toBe(400);
    expect(Number.isInteger(fitSquare(333.33, 777.77, 12.5))).toBe(true);
  });

  it('treats a square box with no gap as itself', () => {
    expect(fitSquare(500, 500, 0)).toBe(500);
  });
});
