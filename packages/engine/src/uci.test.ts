import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testEngines } from './testing';
import { EngineError, parseInfo, UciEngine } from './uci';

describe('parseInfo', () => {
  it('parses a full info line', () => {
    expect(parseInfo('info depth 12 seldepth 18 multipv 2 score cp -35 nodes 12345 nps 500000 time 24 pv e2e4 e7e5 g1f3')).toEqual({
      multipv: 2, depth: 12, seldepth: 18, score: { type: 'cp', value: -35 }, nodes: 12345, nps: 500000, timeMs: 24, pv: ['e2e4', 'e7e5', 'g1f3'],
    });
  });
  it('ignores bound, currmove and string lines', () => {
    expect(parseInfo('info depth 9 score cp 20 lowerbound nodes 1 pv e2e4')).toBeUndefined();
    expect(parseInfo('info depth 9 currmove e2e4 currmovenumber 1')).toBeUndefined();
    expect(parseInfo('info string NNUE evaluation using nn.nnue')).toBeUndefined();
  });
  it('parses mate scores', () => {
    expect(parseInfo('info depth 5 score mate 3 pv a1a8')?.score).toEqual({ type: 'mate', value: 3 });
  });
});

describe.each(testEngines())('UciEngine against $label', ({ open }) => {
  let engine: UciEngine;
  beforeAll(async () => {
    engine = open();
    const id = await engine.init();
    expect(id.name.toLowerCase()).toContain('stockfish');
  });
  afterAll(() => engine.quit());

  it('reports the strength options the design relies on', async () => {
    const id = await engine.init();
    expect(id.options.get('Skill Level')).toBe('20');
    expect(id.options.has('UCI_Elo')).toBe(true);
  });

  it('returns a legal-looking best move with provenance from the start position', async () => {
    const a = await engine.analyse('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', [], { depth: 8 });
    expect(a.bestmove).toMatch(/^[a-h][1-8][a-h][1-8]$/);
    expect(a.engine.toLowerCase()).toContain('stockfish');
    expect(a.lines[0]?.depth).toBeGreaterThanOrEqual(8);
    expect(a.limit).toEqual({ depth: 8 });
  });

  it('finds a mate in one and reports it as a mate score', async () => {
    const a = await engine.analyse('4k3/7R/8/8/8/8/8/R3K3 w - - 0 1', [], { depth: 6 });
    expect(a.bestmove).toBe('a1a8');
    expect(a.lines[0]?.score).toEqual({ type: 'mate', value: 1 });
  });

  it('honours a moves list after the FEN and multipv', async () => {
    const a = await engine.analyse('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', ['e2e4'], { depth: 6 }, 3);
    expect(a.lines.map(l => l.multipv)).toEqual([1, 2, 3]);
    expect(a.moves).toEqual(['e2e4']);
  });

  it('has no move in a finished position', async () => {
    await expect(engine.bestMove('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1', [], { depth: 4 })).rejects.toBeInstanceOf(EngineError);
  });
});

describe('transport failures', () => {
  it('reject the in-flight exchange with the real cause', async () => {
    let fail: ((err: Error) => void) | undefined;
    const engine = new UciEngine({ send() {}, onLine() {}, onError(cb) { fail = cb; }, close() {} });
    const init = engine.init();
    fail!(new Error('spawn ENOENT'));
    await expect(init).rejects.toThrow(/spawn ENOENT/);
    await expect(engine.init()).rejects.toThrow(/spawn ENOENT/);
  });
});
