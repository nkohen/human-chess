// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { clearPersisted, isOneOf, isRecord, isStringArray, readPersisted, usePersistedState, writePersisted } from './persisted';

const KEY = 'human-chess.test.state.v1';
const parse = (raw: unknown): { moves: string[] } | undefined => (isRecord(raw) && isStringArray(raw.moves) ? { moves: raw.moves } : undefined);

afterEach(() => localStorage.clear());

describe('usePersistedState', () => {
  it('starts from the initial value, writes it at once, then writes changes', () => {
    const { result } = renderHook(() => usePersistedState(KEY, { moves: [] }, { parse }));
    expect(result.current[0]).toEqual({ moves: [] });
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ moves: [] }); // seeded value survives an immediate reload
    act(() => result.current[1]({ moves: ['e2e4'] }));
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ moves: ['e2e4'] });
  });

  it('restores a stored value on mount without rewriting it', () => {
    const raw = JSON.stringify({ moves: ['e2e4', 'e7e5'] });
    localStorage.setItem(KEY, raw);
    const { result } = renderHook(() => usePersistedState(KEY, { moves: [] }, { parse }));
    expect(result.current[0]).toEqual({ moves: ['e2e4', 'e7e5'] });
    expect(localStorage.getItem(KEY)).toBe(raw);
  });

  it('replaces a rejected entry with the initial value on mount', () => {
    localStorage.setItem(KEY, JSON.stringify({ moves: [1] }));
    renderHook(() => usePersistedState(KEY, { moves: ['x'] }, { parse }));
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ moves: ['x'] });
  });

  it('falls back to the initial value on corrupt or rejected entries', () => {
    localStorage.setItem(KEY, '{not json');
    expect(renderHook(() => usePersistedState(KEY, { moves: ['x'] }, { parse })).result.current[0]).toEqual({ moves: ['x'] });
    localStorage.setItem(KEY, JSON.stringify({ moves: [1, 2] }));
    expect(renderHook(() => usePersistedState(KEY, { moves: ['x'] }, { parse })).result.current[0]).toEqual({ moves: ['x'] });
  });

  it('supports a lazy initial value and functional updates', () => {
    const { result } = renderHook(() => usePersistedState(KEY, () => ({ moves: ['lazy'] }), { parse }));
    expect(result.current[0]).toEqual({ moves: ['lazy'] });
    act(() => result.current[1](prev => ({ moves: [...prev.moves, 'd2d4'] })));
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ moves: ['lazy', 'd2d4'] });
  });

  it('uses sessionStorage when asked', () => {
    const { result } = renderHook(() => usePersistedState(KEY, { moves: [] }, { parse, storage: 'session' }));
    act(() => result.current[1]({ moves: ['a'] }));
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(JSON.parse(sessionStorage.getItem(KEY)!)).toEqual({ moves: ['a'] });
    sessionStorage.clear();
  });

  it('serializes non-JSON values through `serialize`', () => {
    const { result } = renderHook(() =>
      usePersistedState<Set<string>>(KEY, new Set<string>(), {
        parse: raw => (isStringArray(raw) ? new Set(raw) : undefined),
        serialize: set => [...set],
      }),
    );
    act(() => result.current[1](new Set(['k1', 'k2'])));
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(['k1', 'k2']);
    expect(readPersisted(KEY, raw => (isStringArray(raw) ? new Set(raw) : undefined))).toEqual(new Set(['k1', 'k2']));
  });
});

describe('helpers', () => {
  it('read/write/clear round-trip and never throw', () => {
    writePersisted(KEY, { moves: ['e2e4'] });
    expect(readPersisted(KEY, parse)).toEqual({ moves: ['e2e4'] });
    clearPersisted(KEY);
    expect(readPersisted(KEY, parse)).toBeUndefined();
    expect(() => readPersisted('missing', parse)).not.toThrow();
  });

  it('isOneOf narrows to the literal set', () => {
    const isMode = isOneOf(['build', 'drill'] as const);
    expect(isMode('build')).toBe(true);
    expect(isMode('games')).toBe(false);
    expect(isMode(3)).toBe(false);
  });
});
