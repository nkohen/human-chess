import { describe, expect, it } from 'vitest';
import { buttonClassName, cx, segmentClassName } from './components';

describe('cx', () => {
  it('joins truthy fragments with a single space', () => {
    expect(cx('a', 'b', 'c')).toBe('a b c');
  });

  it('drops false, undefined, null and empty-string fragments', () => {
    expect(cx('a', false, undefined, null, '', 'b')).toBe('a b');
  });

  it('returns an empty string when nothing is truthy', () => {
    expect(cx(false, undefined, null)).toBe('');
  });
});

describe('buttonClassName', () => {
  it('adds no modifier for the secondary variant', () => {
    expect(buttonClassName('secondary', 'md')).toBe('hc-button');
  });

  it('adds hc-primary for the primary variant', () => {
    expect(buttonClassName('primary', 'md')).toBe('hc-button hc-primary');
  });

  it('adds hc-quiet for the quiet variant', () => {
    expect(buttonClassName('quiet', 'md')).toBe('hc-button hc-quiet');
  });

  it('adds hc-button--sm for the sm size', () => {
    expect(buttonClassName('secondary', 'sm')).toBe('hc-button hc-button--sm');
  });

  it('combines variant, size and a passed-through className', () => {
    expect(buttonClassName('primary', 'sm', 'extra')).toBe('hc-button hc-primary hc-button--sm extra');
  });
});

describe('segmentClassName', () => {
  it('is the base class when not selected', () => {
    expect(segmentClassName(false)).toBe('hc-segmented__option');
  });

  it('adds the selected modifier when selected', () => {
    expect(segmentClassName(true)).toBe('hc-segmented__option hc-segmented__option--selected');
  });
});
