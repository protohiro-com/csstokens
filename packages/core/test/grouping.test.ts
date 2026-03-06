import { describe, expect, it } from 'vitest';
import { groupTokens } from '../src/grouping/tokens';
import { RawIndex } from '../src/model/types';

const baseRawIndex: RawIndex = {
  filesScanned: 1,
  filesAnalyzed: 1,
  filesIgnored: 0,
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

const colorHeuristicRawIndex: RawIndex = {
  filesScanned: 1,
  filesAnalyzed: 1,
  filesIgnored: 0,
  entries: [
    {
      type: 'color',
      value: '#2196f3',
      count: 8,
      fileCount: 7,
      confidence: 0.78,
      occurrences: [
        { file: 'src/theme.ts', line: 1, column: 1, snippet: 'primary: "#2196f3"' },
        { file: 'src/button.tsx', line: 1, column: 1, snippet: 'bg-[#2196F3]' },
      ],
      propertiesHint: ['background-color', 'color'],
    },
    {
      type: 'color',
      value: '#f33a9e',
      count: 6,
      fileCount: 5,
      confidence: 0.72,
      occurrences: [
        { file: 'src/forms.tsx', line: 1, column: 1, snippet: 'accent badge bg-[#F33A9E]' },
      ],
      propertiesHint: ['background-color', 'border-color'],
    },
    {
      type: 'color',
      value: '#22c59e',
      count: 5,
      fileCount: 4,
      confidence: 0.68,
      occurrences: [
        { file: 'src/status.tsx', line: 1, column: 1, snippet: 'success active bg-[#22C59E]' },
      ],
      propertiesHint: ['background-color'],
    },
    {
      type: 'color',
      value: '#e3f2fd',
      count: 7,
      fileCount: 6,
      confidence: 0.74,
      occurrences: [
        { file: 'src/table.tsx', line: 1, column: 1, snippet: 'status === "active" ? "bg-[#E3F2FD]" : ""' },
      ],
      propertiesHint: ['background-color'],
    },
    {
      type: 'color',
      value: '#ab59e4',
      count: 4,
      fileCount: 4,
      confidence: 0.61,
      occurrences: [
        { file: 'src/board.tsx', line: 1, column: 1, snippet: 'board color bg-[#AB59E4]' },
      ],
      propertiesHint: ['background-color', 'color'],
    },
    {
      type: 'color',
      value: '#e0e0e0',
      count: 9,
      fileCount: 8,
      confidence: 0.82,
      occurrences: [
        { file: 'src/card.css', line: 1, column: 1, snippet: 'background-color: #e0e0e0;' },
      ],
      propertiesHint: ['background-color', 'border-color'],
    },
    {
      type: 'color',
      value: '#333333',
      count: 10,
      fileCount: 9,
      confidence: 0.86,
      occurrences: [
        { file: 'src/text.css', line: 1, column: 1, snippet: 'color: #333333;' },
      ],
      propertiesHint: ['color'],
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

  it('prefers contextual color roles over raw hue guesses', () => {
    const tokens = groupTokens(colorHeuristicRawIndex, { profile: 'strict' });

    expect(Object.values(tokens.color.primary as Record<string, string>)).toContain('#2196f3');
    expect(Object.values(tokens.color.primary as Record<string, string>)).not.toContain('#f33a9e');
    expect(Object.values(tokens.color.accent as Record<string, string>)).toContain('#f33a9e');
    expect(Object.values(tokens.color.surface as Record<string, string>)).toContain('#e3f2fd');
    expect((tokens.color.status as Record<string, Record<string, string>>).success).toEqual({ '500': '#22c59e' });
  });
});
