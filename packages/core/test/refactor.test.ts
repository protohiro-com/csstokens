import { describe, expect, it } from 'vitest';
import { buildRefactorPlan, extractFiles, emitRefactorPlanMarkdown } from '../src';

describe('buildRefactorPlan', () => {
  it('proposes css variable replacements for extracted token values', () => {
    const files = [
      {
        path: 'src/button.css',
        content: '.button { color: #3366ff; padding: 8px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08); }',
      },
      {
        path: 'src/card.css',
        content: '.card { color: #3366ff; padding: 8px; }',
      },
    ];

    const result = extractFiles(files, { prefix: 'pt' });
    const plan = buildRefactorPlan(result.rawIndex, result.tokens, 'pt');

    expect(plan.totalFiles).toBe(2);
    expect(plan.totalReplacements).toBeGreaterThanOrEqual(4);
    expect(plan.files[0]?.replacements.some((item) => item.replacementValue.startsWith('var(--pt-color-'))).toBe(true);
    expect(plan.files[0]?.replacements.some((item) => item.replacementValue === 'var(--pt-space-0)')).toBe(true);

    const markdown = emitRefactorPlanMarkdown(plan);
    expect(markdown).toContain('# csstokens refactor dry run');
    expect(markdown).toContain('var(--pt-color-');
  });
});
