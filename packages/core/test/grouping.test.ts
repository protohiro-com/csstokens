import { describe, expect, it } from 'vitest';
import { groupTokens } from '../src/grouping/tokens';
import { RawIndex } from '../src/model/types';

const baseRawIndex: RawIndex = {
  filesScanned: 1,
  entries: [
    {
      type: 'length',
      value: '16px',
      count: 1,
      fileCount: 1,
      confidence: 0.32,
      occurrences: [],
      propertiesHint: ['padding'],
    },
    {
      type: 'length',
      value: '8px',
      count: 1,
      fileCount: 1,
      confidence: 0.32,
      occurrences: [],
      propertiesHint: ['padding'],
    },
    {
      type: 'length',
      value: '12px',
      count: 1,
      fileCount: 1,
      confidence: 0.24,
      occurrences: [],
      propertiesHint: ['border-radius'],
    },
  ],
};

describe('groupTokens', () => {
  it('sorts spacing and radius deterministically', () => {
    const tokens = groupTokens(baseRawIndex);
    expect(tokens.space).toEqual({ '0': '8px', '1': '16px' });
    expect(tokens.radius).toEqual({ '0': '12px' });
  });

  it('reduces output in strict profile', () => {
    const tokens = groupTokens(baseRawIndex, { profile: 'strict' });
    expect(tokens.space).toEqual({});
    expect(tokens.radius).toEqual({});
  });
});
