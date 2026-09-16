import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testEngines } from './testing';
import { EngineError, parseInfo, UciEngine, type UciTransport } from './uci';

const STRENGTH_OPTION_LINES = [
  'option name UCI_LimitStrength type check default false',
  'option name UCI_Elo type spin default 1320 min 1320 max 3190',
];

/** A fake engine that answers the UCI handshake and any `go` with a fixed `option name` set, and
 * records every line it was sent. Deterministic and fast: tests that only need to observe the
 * exact `setoption` traffic a UciEngine produces should reach for this rather than a real
 * engine, which is slow and (per manual testing) unsafe to instantiate several times over in
 * one process alongside the parameterized real-engine tests below. */
function fakeEngine(optionLines: string[] = STRENGTH_OPTION_LINES): { transport: UciTransport; sent: string[] } {
  const sent: string[] = [];
  let onLine: (line: string) => void = () => {};
  const transport: UciTransport = {
    send(line) {
      sent.push(line);
      if (line === 'uci') {
        onLine('id name FakeEngine');
        for (const l of optionLines) onLine(l);
        onLine('uciok');
      } else if (line === 'isready') {
        onLine('readyok');
      } else if (line.startsWith('go')) {
        onLine('bestmove e2e4');
      }
    },
    onLine(cb) {
      onLine = cb;
    },
    onError() {},
    close() {},
  };
  return { transport, sent };
}

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

describe('option restoration', () => {
  it('restores UCI_LimitStrength to its default after a limited-strength bestMove, before the next plain analyse', async () => {
    const { transport, sent } = fakeEngine();
    const engine = new UciEngine(transport);
    await engine.init();
    const startpos = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

    await engine.bestMove(startpos, [], { movetime: 10 }, { UCI_LimitStrength: true, UCI_Elo: 1320 });
    expect(sent).toContain('setoption name UCI_LimitStrength value true');
    const afterFirstMove = sent.length;

    await engine.analyse(startpos, [], { depth: 1 });
    const secondCallLines = sent.slice(afterFirstMove);
    expect(secondCallLines).toContain('setoption name UCI_LimitStrength value false');
    expect(secondCallLines).toContain('setoption name UCI_Elo value 1320');
  });

  it('leaves an untouched option alone: no setoption traffic when nothing was ever set', async () => {
    const { transport, sent } = fakeEngine();
    const engine = new UciEngine(transport);
    await engine.init();
    await engine.analyse('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', [], { depth: 1 });
    expect(sent.some(l => l.startsWith('setoption'))).toBe(false);
  });

  it('throws rather than guess when asked to restore an option with no known default', async () => {
    const { transport } = fakeEngine(['option name MyOption type string']);
    const engine = new UciEngine(transport);
    await engine.init();
    await engine.setOption('MyOption', 'x');
    await expect(engine.analyse('4k3/8/8/8/8/8/8/4K3 w - - 0 1', [], { depth: 1 })).rejects.toThrow(/no known default/);
  });
});

describe('stop', () => {
  it('sends stop to end an in-flight search early, and the pending analyse still resolves', async () => {
    const sent: string[] = [];
    let onLine: (line: string) => void = () => {};
    let onGo: (() => void) | undefined;
    const transport: UciTransport = {
      send(line) {
        sent.push(line);
        if (line === 'uci') {
          onLine('id name FakeEngine');
          onLine('uciok');
        } else if (line === 'isready') {
          onLine('readyok');
        } else if (line.startsWith('go')) {
          // Deliberately does not answer: the search only ends once `stop` arrives.
          onGo?.();
        } else if (line === 'stop') {
          onLine('bestmove e2e4');
        }
      },
      onLine(cb) {
        onLine = cb;
      },
      onError() {},
      close() {},
    };
    const engine = new UciEngine(transport);
    await engine.init();
    const startpos = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

    const goSent = new Promise<void>(resolve => {
      onGo = resolve;
    });
    const analysing = engine.analyse(startpos, [], { movetime: 5000 });
    await goSent;
    engine.stop();
    const a = await analysing;
    expect(a.bestmove).toBe('e2e4');
    expect(sent).toContain('stop');
  });

  it('is a no-op when no search is in flight', async () => {
    const { transport, sent } = fakeEngine();
    const engine = new UciEngine(transport);
    await engine.init();
    engine.stop();
    expect(sent.some(l => l === 'stop')).toBe(false);
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
