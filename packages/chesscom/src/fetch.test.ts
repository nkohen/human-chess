import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryStorage, jsonResponse } from '@human-chess/site-client/testing';
import { _resetForTests, ChesscomRateLimited, chesscomFetch, configureChesscomFetch, type ChesscomFetchImpl } from './fetch';

let currentTime = 1_000_000;
const nowFn = (): number => currentTime;

beforeEach(() => {
  globalThis.localStorage = new MemoryStorage();
  currentTime = 1_000_000;
  _resetForTests();
  configureChesscomFetch({ now: nowFn });
});

describe('429 cooldown', () => {
  it('rejects immediately without a fetch call while in cooldown, using the chess.com storage key', async () => {
    const fetchImpl: ChesscomFetchImpl = vi.fn(async () => jsonResponse(429, {}, { 'Retry-After': '30' }));
    configureChesscomFetch({ fetchImpl });

    await expect(chesscomFetch('https://api.chess.com/pub/x')).rejects.toBeInstanceOf(ChesscomRateLimited);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    (fetchImpl as ReturnType<typeof vi.fn>).mockClear();
    await expect(chesscomFetch('https://api.chess.com/pub/x')).rejects.toBeInstanceOf(ChesscomRateLimited);
    expect(fetchImpl).not.toHaveBeenCalled();

    expect(globalThis.localStorage.getItem('human-chess.chesscom.retryAt.v1')).toBe(String(currentTime + 30_000));
  });

  it('honors a persisted retryAt from a fresh module load', async () => {
    const future = currentTime + 20_000;
    globalThis.localStorage.setItem('human-chess.chesscom.retryAt.v1', String(future));
    vi.resetModules();
    const fresh = await import('./fetch');
    const freshFetchImpl = vi.fn(async () => jsonResponse(200));
    fresh.configureChesscomFetch({ fetchImpl: freshFetchImpl, now: nowFn });

    await expect(fresh.chesscomFetch('https://api.chess.com/pub/w')).rejects.toBeInstanceOf(fresh.ChesscomRateLimited);
    expect(freshFetchImpl).not.toHaveBeenCalled();
  });

  it('carries a chess.com-flavoured message', async () => {
    const fetchImpl: ChesscomFetchImpl = vi.fn(async () => jsonResponse(429));
    configureChesscomFetch({ fetchImpl });
    await expect(chesscomFetch('https://api.chess.com/pub/x')).rejects.toMatchObject({
      message: expect.stringContaining('chess.com asked us to wait'),
    });
  });
});
