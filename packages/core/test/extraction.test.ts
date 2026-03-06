import { describe, expect, it } from 'vitest';
import { analyzeFiles, extractFiles } from '../src';

describe('extraction flow', () => {
  it('keeps ignored files in raw analysis but excludes them from tokenization', () => {
    const files = [
      {
        path: 'src/button.css',
        content: '.button { color: #3366ff; padding: 8px; }',
      },
      {
        path: 'src/button.stories.tsx',
        content: 'export const Example = () => <div style={{ color: "#3366ff", padding: "8px" }} />;',
      },
    ];

    const analyzed = analyzeFiles(files, {
      sourceIgnorePatterns: ['**/*.stories.tsx'],
    });
    const extracted = extractFiles(files, {
      sourceIgnorePatterns: ['**/*.stories.tsx'],
    });

    expect(analyzed.rawIndex.filesAnalyzed).toBe(2);
    expect(analyzed.rawIndex.filesIgnored).toBe(1);

    const colorEntry = analyzed.rawIndex.entries.find((entry) => entry.type === 'color' && entry.value === '#3366ff');
    expect(colorEntry?.count).toBe(2);

    expect(JSON.stringify(extracted.tokens.color)).toContain('#3366ff');
    expect(JSON.stringify(extracted.tokens.color)).not.toContain('#f33a9e');
    expect(extracted.rawIndex.entries.find((entry) => entry.type === 'color' && entry.value === '#3366ff')?.count).toBe(2);
  });

  it('drops loose color literals from non-style source text', () => {
    const files = [
      {
        path: 'src/content.ts',
        content: 'export const copy = "Brand docs mention #3366ff and #ff6600 for reference.";'
      },
      {
        path: 'src/theme.ts',
        content: 'export const theme = { primary: "#3366ff", accent: "#ff6600" };',
      },
    ];

    const analyzed = analyzeFiles(files);
    const colors = analyzed.rawIndex.entries.filter((entry) => entry.type === 'color');

    expect(colors.map((entry) => entry.value)).toEqual(['#3366ff', '#ff6600']);
    expect(colors.every((entry) => entry.occurrences.every((occurrence) => occurrence.file === 'src/theme.ts'))).toBe(true);
  });

  it('excludes built-in ignored sources from tokenization output', () => {
    const files = [
      {
        path: 'src/button.css',
        content: '.button { color: #3366ff; }',
      },
      {
        path: 'src/button.stories.tsx',
        content: 'export const Example = () => <div style={{ color: "#f33a9e" }} />;',
      },
    ];

    const analyzed = analyzeFiles(files);
    const extracted = extractFiles(files);

    expect(analyzed.rawIndex.filesIgnored).toBe(1);
    expect(analyzed.rawIndex.entries.some((entry) => entry.type === 'color' && entry.value === '#f33a9e')).toBe(true);
    expect(extracted.tokensJson.includes('#f33a9e')).toBe(false);
    expect(extracted.tokensJson.includes('#3366ff')).toBe(true);
  });
});
