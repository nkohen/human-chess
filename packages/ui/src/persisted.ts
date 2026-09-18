// Page-reload survival for view state. A hash route already survives a reload; the state
// inside a tool (selected item, in-progress game, expanded path) is plain React state and
// does not. On a phone this matters most: iOS Safari reloads a background tab whenever the
// user comes back to it. `usePersistedState` is `useState` whose value is mirrored to
// storage under a namespaced key and read back on mount, with a validator so a stale or
// corrupt entry falls back to the initial value instead of crashing the tool.
//
// Rules for callers (the same guarded-localStorage pattern as the subprojects' storage.ts
// files: reads and writes never throw):
// - Keys are `human-chess.<tool>.<name>.v<n>`; bump `v<n>` when the shape changes.
// - Store only plain JSON. A chess position is stored as start FEN + UCI move list and
//   rebuilt through @human-chess/rules, never as an object.
// - `parse` receives the decoded JSON and returns the typed value, or undefined to reject it.
//   Reject anything not in the current shape; never trust the stored value blindly.
// - Engine results and fetched data are re-derived on load, not stored here.
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

export type PersistedStorage = 'local' | 'session';

export interface PersistedStateOptions<T> {
  /** Validates the decoded JSON; return undefined to reject and use the initial value. */
  parse: (raw: unknown) => T | undefined;
  /** `local` (default) survives closing the tab; `session` survives a reload only. */
  storage?: PersistedStorage;
  /** Serializer for values that are not plain JSON (Set, Map). Default: identity. */
  serialize?: (value: T) => unknown;
}

function storageFor(kind: PersistedStorage): Storage | undefined {
  try {
    return kind === 'session' ? globalThis.sessionStorage : globalThis.localStorage;
  } catch {
    return undefined; // access itself can throw (blocked site data)
  }
}

/** Read and validate a persisted value; undefined when missing, corrupt, or rejected. */
export function readPersisted<T>(key: string, parse: (raw: unknown) => T | undefined, storage: PersistedStorage = 'local'): T | undefined {
  try {
    const raw = storageFor(storage)?.getItem(key);
    if (raw === null || raw === undefined) return undefined;
    return parse(JSON.parse(raw));
  } catch {
    return undefined;
  }
}

/** Write a value; silently a no-op when storage is unavailable or full. */
export function writePersisted(key: string, value: unknown, storage: PersistedStorage = 'local'): void {
  try {
    storageFor(storage)?.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable or over quota: the value lives for this page only
  }
}

/** Remove a persisted value (e.g. when a game ends and there is nothing to resume). */
export function clearPersisted(key: string, storage: PersistedStorage = 'local'): void {
  try {
    storageFor(storage)?.removeItem(key);
  } catch {
    // nothing to clear
  }
}

/**
 * `useState` whose value survives a page reload. The initial render reads storage
 * synchronously (no flash of the default), every change is written back, and a value the
 * validator rejects falls back to `initial`.
 */
export function usePersistedState<T>(key: string, initial: T | (() => T), options: PersistedStateOptions<T>): [T, Dispatch<SetStateAction<T>>] {
  const { parse, storage = 'local', serialize } = options;
  const restored = useRef(false);
  const [value, setValue] = useState<T>(() => {
    const stored = readPersisted(key, parse, storage);
    if (stored !== undefined) {
      restored.current = true;
      return stored;
    }
    return typeof initial === 'function' ? (initial as () => T)() : initial;
  });
  // On mount, a value that came back from storage needs no write. A value that did not (first
  // visit, rejected entry, or a caller that seeded `initial` from a hand-off and cleared the
  // old snapshot) is written at once, so a reload before the first interaction still lands on
  // it rather than on the default.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      if (restored.current) return;
    }
    writePersisted(key, serialize ? serialize(value) : value, storage);
  }, [key, value, storage, serialize]);
  return [value, setValue];
}

// Small validators for the common shapes; combine them in a tool's `parse`.
export const isString = (v: unknown): v is string => typeof v === 'string';
export const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
export const isBoolean = (v: unknown): v is boolean => typeof v === 'boolean';
export const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
export const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(isString);
/** One of a fixed set of string literals. */
export function isOneOf<const T extends readonly string[]>(values: T): (v: unknown) => v is T[number] {
  return (v: unknown): v is T[number] => typeof v === 'string' && (values as readonly string[]).includes(v);
}
