import { describe, expect, it } from 'vitest';
import { normalizeColor, toCanonicalColor } from '../src/utils/normalizeColor';

describe('normalizeColor', () => {
  it('normalizes hex', () => {
    expect(normalizeColor('#abc')).toEqual({ r: 170, g: 187, b: 204, a: 1 });
  });

  it('normalizes rgb', () => {
    expect(toCanonicalColor('rgb(51, 102, 255)')).toBe('#3366ff');
  });

  it('normalizes hsl', () => {
    expect(toCanonicalColor('hsl(220, 100%, 60%)')).toBe('#3377ff');
  });

  it('keeps alpha', () => {
    expect(toCanonicalColor('rgba(0,0,0,0.2)')).toBe('rgba(0, 0, 0, 0.2)');
  });

  it('supports space-separated rgb syntax', () => {
    expect(toCanonicalColor('rgb(0 0 0 / 12%)')).toBe('rgba(0, 0, 0, 0.12)');
  });

  it('rejects unsupported var-based rgb syntax', () => {
    expect(toCanonicalColor('rgba(var(--token), 0.12)')).toBeNull();
  });
});
