import { describe, expect, it } from 'vitest';
import { parseAmount } from './wallet';

describe('parseAmount', () => {
  it('reads the shorthand the game shows', () => {
    expect(parseAmount('5.2M')).toBe(5_200_000);
    expect(parseAmount('36.8k')).toBe(36_800);
    expect(parseAmount('1,200,000')).toBe(1_200_000);
    expect(parseAmount('')).toBeUndefined();
    expect(parseAmount('abc')).toBeUndefined();
  });
});
