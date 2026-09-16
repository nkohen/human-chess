// A typed UCI client. Every result carries where it came from (engine name, search limit,
// depth, nodes, time) so that no number shown to a user is ever without provenance (A1).

export interface UciTransport {
  send(line: string): void;
  onLine(cb: (line: string) => void): void;
  /** Fatal transport failures: worker error, process exit, load failure. */
  onError(cb: (err: Error) => void): void;
  close(): void;
}

export interface SearchLimit {
  depth?: number;
  /** Milliseconds. */
  movetime?: number;
  nodes?: number;
}

/** Score from the side to move's point of view, exactly as UCI reports it. */
export type Score = { type: 'cp'; value: number } | { type: 'mate'; value: number };

export interface PvLine {
  multipv: number;
  depth: number;
  seldepth?: number;
  score: Score;
  nodes?: number;
  nps?: number;
  timeMs?: number;
  /** UCI moves. */
  pv: string[];
}

export interface Analysis {
  /** The engine's own `id name` line. */
  engine: string;
  fen: string;
  moves: string[];
  limit: SearchLimit;
  multipv: number;
  /** UCI move, or undefined when the engine reported `(none)`, i.e. no legal move. */
  bestmove: string | undefined;
  ponder?: string;
  /** The last `info` line per multipv slot, ascending. */
  lines: PvLine[];
  elapsedMs: number;
}

export class EngineError extends Error {}

export interface EngineIdentity {
  name: string;
  /** Option name → declared default, as parsed from `option name ...` lines. */
  options: Map<string, string | undefined>;
}

export interface UciEngineOpts {
  /** Extra wait beyond what the limit implies before an analysis is declared failed. */
  graceMs?: number;
}

export class UciEngine {
  private listeners = new Set<(line: string) => void>();
  private failures = new Set<(err: Error) => void>();
  private fatal: Error | undefined;
  private chain: Promise<unknown> = Promise.resolve();
  private identity: EngineIdentity | undefined;
  private currentMultiPv = 1;
  private closed = false;
  /** True while an `analyse` search's `go` is outstanding; lets `stop()` know whether sending
   * `stop` would land on a live search rather than firing at an arbitrary, unrelated time. */
  private searching = false;
  /** Every option name ever set, via `setOption` or a search's `options` param — restored to
   * its engine-reported default before any search that does not itself request it (A1: a
   * shared engine must never stay weakened for whoever uses it next). */
  private readonly optionsTouched = new Set<string>();
  private readonly graceMs: number;

  constructor(private readonly transport: UciTransport, opts: UciEngineOpts = {}) {
    this.graceMs = opts.graceMs ?? 5000;
    transport.onLine(line => {
      for (const l of line.split('\n')) {
        const trimmed = l.trim();
        if (!trimmed) continue;
        for (const cb of this.listeners) cb(trimmed);
      }
    });
    transport.onError(err => {
      this.fatal = new EngineError(`${this.name}: transport failed: ${err.message}`);
      for (const fail of [...this.failures]) fail(this.fatal);
    });
  }

  get name(): string {
    return this.identity?.name ?? 'unknown engine';
  }

  /** Handshake: `uci` … `uciok`, then `isready` … `readyok`. */
  init(): Promise<EngineIdentity> {
    return this.enqueue(async () => {
      const options = new Map<string, string | undefined>();
      let name = 'unknown engine';
      await this.exchange('uci', line => {
        if (line.startsWith('id name ')) name = line.slice('id name '.length);
        if (line.startsWith('option name ')) {
          const m = /^option name (.+?) type \S+(?: default (\S*))?/.exec(line);
          if (m) options.set(m[1]!, m[2]);
        }
        return line === 'uciok';
      }, 20_000);
      await this.ready();
      this.identity = { name, options };
      return this.identity;
    });
  }

  setOption(name: string, value: string | number | boolean): Promise<void> {
    return this.enqueue(async () => {
      this.transport.send(`setoption name ${name} value ${String(value)}`);
      if (name === 'MultiPV') this.currentMultiPv = Number(value);
      this.optionsTouched.add(name);
      await this.ready();
    });
  }

  /**
   * Applies `requested` options for one search, then restores every option this engine has
   * ever been asked to set (here or via `setOption`) that `requested` does not mention, back
   * to the default the engine itself declared during the `uci` handshake. Throws rather than
   * guess when an option was touched but no default was ever recorded for it.
   */
  private async applyOptions(requested: Record<string, string | number | boolean> | undefined): Promise<void> {
    const entries = Object.entries(requested ?? {});
    const requestedNames = new Set(entries.map(([n]) => n));
    const toRestore = [...this.optionsTouched].filter(n => !requestedNames.has(n));
    if (entries.length === 0 && toRestore.length === 0) return;
    for (const [name, value] of entries) {
      this.transport.send(`setoption name ${name} value ${String(value)}`);
      if (name === 'MultiPV') this.currentMultiPv = Number(value);
      this.optionsTouched.add(name);
    }
    for (const name of toRestore) {
      const def = this.identity?.options.get(name);
      if (def === undefined) {
        throw new EngineError(`no known default for UCI option "${name}"; cannot restore it after use`);
      }
      this.transport.send(`setoption name ${name} value ${def}`);
    }
    await this.ready();
  }

  newGame(): Promise<void> {
    return this.enqueue(async () => {
      this.transport.send('ucinewgame');
      await this.ready();
    });
  }

  /**
   * Runs one search and resolves with its final `Analysis` once `bestmove` arrives.
   *
   * `onProgress`, when given, is called after every parsed `info` line that carries a pv —
   * with the current lines so far, sorted by multipv ascending (same shape as
   * `Analysis.lines`) — so a caller can show a deep search's intermediate output while it is
   * still running (A1: these are real engine lines, just not the final ones). It is never
   * called after the search ends; the last call always precedes the resolved promise.
   */
  analyse(
    fen: string,
    moves: string[],
    limit: SearchLimit,
    multipv = 1,
    options?: Record<string, string | number | boolean>,
    onProgress?: (lines: PvLine[]) => void,
  ): Promise<Analysis> {
    if (!limit.depth && !limit.movetime && !limit.nodes) {
      return Promise.reject(new EngineError('a search limit (depth, movetime or nodes) is required'));
    }
    return this.enqueue(async () => {
      await this.applyOptions(options);
      if (multipv !== this.currentMultiPv) {
        this.transport.send(`setoption name MultiPV value ${multipv}`);
        this.currentMultiPv = multipv;
        await this.ready();
      }
      const lines = new Map<number, PvLine>();
      const started = Date.now();
      const timeout = (limit.movetime ? limit.movetime * 3 : 60_000) + this.graceMs;
      this.transport.send(`position fen ${fen}${moves.length ? ' moves ' + moves.join(' ') : ''}`);
      let bestmove: string | undefined;
      let ponder: string | undefined;
      // A throwing progress callback must not abort the exchange mid-search: the listener would
      // be dropped while the engine keeps searching and its late `bestmove` would be attributed
      // to the next queued search (A1). Instead the error is kept, the search is stopped, the
      // exchange completes on the real `bestmove`, and only then is the error rethrown.
      let progressError: unknown;
      this.searching = true;
      try {
        await this.exchange(`go${goArgs(limit)}`, line => {
          if (line.startsWith('info ')) {
            const pv = parseInfo(line);
            if (pv) {
              lines.set(pv.multipv, pv);
              if (onProgress && progressError === undefined) {
                try {
                  onProgress([...lines.values()].sort((a, b) => a.multipv - b.multipv));
                } catch (err) {
                  progressError = err;
                  this.transport.send('stop');
                }
              }
            }
            return false;
          }
          if (line.startsWith('bestmove')) {
            const parts = line.split(/\s+/);
            bestmove = parts[1] === '(none)' || parts[1] === undefined ? undefined : parts[1];
            if (parts[2] === 'ponder' && parts[3]) ponder = parts[3];
            return true;
          }
          return false;
        }, timeout, async () => {
          // Let the aborted search finish so its late bestmove cannot be mistaken for the next one's.
          this.transport.send('stop');
          await this.waitForLine(line => line.startsWith('bestmove'), 3000).catch(() => undefined);
        });
      } finally {
        this.searching = false;
      }
      if (progressError !== undefined) {
        throw progressError instanceof Error ? progressError : new Error(String(progressError));
      }
      const analysis: Analysis = {
        engine: this.name,
        fen,
        moves: [...moves],
        limit: { ...limit },
        multipv,
        bestmove,
        lines: [...lines.values()].sort((a, b) => a.multipv - b.multipv),
        elapsedMs: Date.now() - started,
      };
      if (ponder !== undefined) analysis.ponder = ponder;
      return analysis;
    });
  }

  /** The engine's chosen move. Throws EngineError when the engine has no move to offer. */
  async bestMove(
    fen: string,
    moves: string[],
    limit: SearchLimit,
    options?: Record<string, string | number | boolean>,
  ): Promise<{ move: string; analysis: Analysis }> {
    const analysis = await this.analyse(fen, moves, limit, 1, options);
    if (!analysis.bestmove) throw new EngineError(`${analysis.engine} returned no move for ${fen}`);
    return { move: analysis.bestmove, analysis };
  }

  /**
   * Ends an in-flight search early, if one is running: sends `stop` so the engine's pending
   * `bestmove` arrives now instead of at the search's full depth/time, letting the already
   * pending `analyse`/`bestMove` promise resolve early rather than queuing behind a superseded
   * search. A no-op when nothing is searching.
   */
  stop(): void {
    if (this.searching) this.transport.send('stop');
  }

  quit(): void {
    if (this.closed) return;
    this.closed = true;
    try {
      this.transport.send('quit');
    } finally {
      this.transport.close();
    }
  }

  private ready(): Promise<void> {
    return this.exchange('isready', line => line === 'readyok', 20_000).then(() => undefined);
  }

  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    const run = this.chain.then(job, job);
    this.chain = run.catch(() => undefined);
    return run;
  }

  private exchange(
    command: string,
    onLine: (line: string) => boolean,
    timeoutMs: number,
    onTimeout?: () => Promise<void>,
  ): Promise<void> {
    if (this.closed) return Promise.reject(new EngineError('engine has been closed'));
    if (this.fatal) return Promise.reject(this.fatal);
    return new Promise<void>((resolve, reject) => {
      const finish = (): void => {
        clearTimeout(timer);
        this.listeners.delete(listener);
        this.failures.delete(fail);
      };
      const fail = (err: Error): void => {
        finish();
        reject(err);
      };
      const timer = setTimeout(() => {
        finish();
        const err = new EngineError(`${this.name}: no answer to "${command}" within ${timeoutMs} ms`);
        (onTimeout ? onTimeout() : Promise.resolve()).finally(() => reject(err));
      }, timeoutMs);
      const listener = (line: string): void => {
        let done = false;
        try {
          done = onLine(line);
        } catch (err) {
          fail(err instanceof Error ? err : new Error(String(err)));
          return;
        }
        if (done) {
          finish();
          resolve();
        }
      };
      this.listeners.add(listener);
      this.failures.add(fail);
      this.transport.send(command);
    });
  }

  /** Resolves on the first line matching `pred`, without sending anything. */
  private waitForLine(pred: (line: string) => boolean, timeoutMs: number): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.listeners.delete(listener);
        reject(new EngineError('timed out waiting for engine output'));
      }, timeoutMs);
      const listener = (line: string): void => {
        if (!pred(line)) return;
        clearTimeout(timer);
        this.listeners.delete(listener);
        resolve(line);
      };
      this.listeners.add(listener);
    });
  }
}

function goArgs(limit: SearchLimit): string {
  let s = '';
  if (limit.depth) s += ` depth ${limit.depth}`;
  if (limit.movetime) s += ` movetime ${limit.movetime}`;
  if (limit.nodes) s += ` nodes ${limit.nodes}`;
  return s;
}

/** Parses one `info` line into a PV line; returns undefined for lines without a score+pv (currmove, string, bounds). */
export function parseInfo(line: string): PvLine | undefined {
  const t = line.split(/\s+/);
  let depth: number | undefined;
  let seldepth: number | undefined;
  let multipv = 1;
  let score: Score | undefined;
  let nodes: number | undefined;
  let nps: number | undefined;
  let timeMs: number | undefined;
  let pv: string[] | undefined;
  for (let i = 1; i < t.length; i++) {
    switch (t[i]) {
      case 'depth': depth = Number(t[++i]); break;
      case 'seldepth': seldepth = Number(t[++i]); break;
      case 'multipv': multipv = Number(t[++i]); break;
      case 'nodes': nodes = Number(t[++i]); break;
      case 'nps': nps = Number(t[++i]); break;
      case 'time': timeMs = Number(t[++i]); break;
      case 'score': {
        const type = t[++i];
        const value = Number(t[++i]);
        if (t[i + 1] === 'lowerbound' || t[i + 1] === 'upperbound') return undefined;
        if (type === 'cp' || type === 'mate') score = { type, value };
        break;
      }
      case 'pv': pv = t.slice(i + 1); i = t.length; break;
      case 'string': return undefined;
      case 'currmove': return undefined;
      default: break;
    }
  }
  if (depth === undefined || !score || !pv || pv.length === 0) return undefined;
  const out: PvLine = { multipv, depth, score, pv };
  if (seldepth !== undefined) out.seldepth = seldepth;
  if (nodes !== undefined) out.nodes = nodes;
  if (nps !== undefined) out.nps = nps;
  if (timeMs !== undefined) out.timeMs = timeMs;
  return out;
}
