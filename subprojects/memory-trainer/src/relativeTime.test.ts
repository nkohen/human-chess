import { describe, expect, it } from 'vitest';
import { relativeTime } from './relativeTime';

const NOW = new Date('2026-09-17T12:00:00Z');

function isoBefore(ms: number): string {
  return new Date(NOW.getTime() - ms).toISOString();
}

const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('relativeTime', () => {
  it('says "just now" under 60 seconds', () => {
    expect(relativeTime(isoBefore(0), NOW)).toBe('just now');
    expect(relativeTime(isoBefore(30 * SEC), NOW)).toBe('just now');
    expect(relativeTime(isoBefore(59 * SEC), NOW)).toBe('just now');
  });

  it('says "N minutes ago", singular and plural', () => {
    expect(relativeTime(isoBefore(60 * SEC), NOW)).toBe('1 minute ago');
    expect(relativeTime(isoBefore(3 * MIN), NOW)).toBe('3 minutes ago');
    expect(relativeTime(isoBefore(59 * MIN), NOW)).toBe('59 minutes ago');
  });

  it('says "N hours ago", singular and plural', () => {
    expect(relativeTime(isoBefore(60 * MIN), NOW)).toBe('1 hour ago');
    expect(relativeTime(isoBefore(5 * HOUR), NOW)).toBe('5 hours ago');
    expect(relativeTime(isoBefore(23 * HOUR), NOW)).toBe('23 hours ago');
  });

  it('says "yesterday" for one day ago', () => {
    expect(relativeTime(isoBefore(24 * HOUR), NOW)).toBe('yesterday');
    expect(relativeTime(isoBefore(47 * HOUR), NOW)).toBe('yesterday');
  });

  it('says "N days ago" up to 6 days', () => {
    expect(relativeTime(isoBefore(2 * DAY), NOW)).toBe('2 days ago');
    expect(relativeTime(isoBefore(6 * DAY), NOW)).toBe('6 days ago');
  });

  it('gives no relative phrase for anything older than 6 days (the caller shows the date alone)', () => {
    expect(relativeTime(isoBefore(7 * DAY), NOW)).toBeUndefined();
    expect(relativeTime('2020-01-01T00:00:00Z', NOW)).toBeUndefined();
  });

  it('gives no relative phrase for a future timestamp, never a negative', () => {
    expect(relativeTime(new Date(NOW.getTime() + 5 * MIN).toISOString(), NOW)).toBeUndefined();
  });

  it('gives no relative phrase for an unparseable timestamp', () => {
    expect(relativeTime('not-a-date', NOW)).toBeUndefined();
  });
});
