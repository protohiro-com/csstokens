import { describe, expect, it } from 'vitest';
import { normalizeProfile, parseIntegerOption } from '../src/flags';

describe('flags', () => {
  it('rejects unsupported profiles', () => {
    expect(() => normalizeProfile('fast' as never)).toThrow(
      "Unsupported profile: fast. Use 'balanced' or 'strict'.",
    );
  });

  it('rejects invalid threshold values', () => {
    expect(() => parseIntegerOption(Number.NaN, 'min-count')).toThrow(
      'Invalid min-count: NaN. Use a non-negative integer.',
    );
    expect(() => parseIntegerOption(-1, 'min-file-count')).toThrow(
      'Invalid min-file-count: -1. Use a non-negative integer.',
    );
    expect(() => parseIntegerOption(1.5, 'min-count')).toThrow(
      'Invalid min-count: 1.5. Use a non-negative integer.',
    );
  });
});
