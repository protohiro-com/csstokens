import {
  RawIndex,
  RefactorFilePlan,
  RefactorPlan,
  RefactorSuggestion,
  TokenSet,
  TokenTree,
} from '../model/types';
import { stableCompare } from '../utils/sortStable';

interface TokenLeaf {
  value: string;
  tokenPath: string;
}

function walkTokenTree(prefix: string[], value: string | TokenTree, leaves: TokenLeaf[]): void {
  if (typeof value === 'string') {
    leaves.push({
      value,
      tokenPath: prefix.join('.'),
    });
    return;
  }

  for (const key of Object.keys(value).sort(stableCompare)) {
    walkTokenTree([...prefix, key], value[key] as string | TokenTree, leaves);
  }
}

function collectTokenLeaves(tokens: TokenSet): Map<string, TokenLeaf> {
  const leaves: TokenLeaf[] = [];

  walkTokenTree(['color'], tokens.color, leaves);
  for (const [key, value] of Object.entries(tokens.space)) {
    leaves.push({ value, tokenPath: `space.${key}` });
  }
  for (const [key, value] of Object.entries(tokens.radius)) {
    leaves.push({ value, tokenPath: `radius.${key}` });
  }
  for (const [key, value] of Object.entries(tokens.shadow)) {
    leaves.push({ value, tokenPath: `shadow.${key}` });
  }
  if (tokens.font?.size) {
    for (const [key, value] of Object.entries(tokens.font.size)) {
      leaves.push({ value, tokenPath: `font.size.${key}` });
    }
  }

  return leaves
    .sort((a, b) => stableCompare(a.tokenPath, b.tokenPath))
    .reduce<Map<string, TokenLeaf>>((acc, leaf) => {
      if (!acc.has(leaf.value)) {
        acc.set(leaf.value, leaf);
      }
      return acc;
    }, new Map<string, TokenLeaf>());
}

function replacementReference(prefix: string, tokenPath: string): string {
  return `var(--${[prefix, ...tokenPath.split('.')].join('-')})`;
}

export function buildRefactorPlan(rawIndex: RawIndex, tokens: TokenSet, prefix = 'pt'): RefactorPlan {
  const tokenLeaves = collectTokenLeaves(tokens);
  const suggestions: RefactorSuggestion[] = [];

  for (const entry of rawIndex.entries) {
    if (entry.type !== 'color' && entry.type !== 'length' && entry.type !== 'shadow') {
      continue;
    }

    const token = tokenLeaves.get(entry.value);
    if (!token) {
      continue;
    }

    for (const occurrence of entry.occurrences) {
      suggestions.push({
        file: occurrence.file,
        line: occurrence.line,
        column: occurrence.column,
        type: entry.type,
        currentValue: entry.value,
        replacementValue: replacementReference(prefix, token.tokenPath),
        tokenPath: token.tokenPath,
        snippet: occurrence.snippet,
      });
    }
  }

  const filePlans = suggestions
    .sort((a, b) => {
      return (
        stableCompare(a.file, b.file) ||
        stableCompare(a.line, b.line) ||
        stableCompare(a.column, b.column) ||
        stableCompare(a.tokenPath, b.tokenPath)
      );
    })
    .reduce<RefactorFilePlan[]>((acc, suggestion) => {
      const last = acc[acc.length - 1];
      if (!last || last.file !== suggestion.file) {
        acc.push({ file: suggestion.file, replacements: [suggestion] });
        return acc;
      }

      last.replacements.push(suggestion);
      return acc;
    }, []);

  return {
    files: filePlans,
    totalFiles: filePlans.length,
    totalReplacements: suggestions.length,
  };
}

export function emitRefactorPlanMarkdown(plan: RefactorPlan): string {
  const lines: string[] = [
    '# csstokens refactor dry run',
    '',
    `- Files with replacements: ${plan.totalFiles}`,
    `- Proposed replacements: ${plan.totalReplacements}`,
    '',
  ];

  if (plan.files.length === 0) {
    lines.push('No replacements found.');
    return `${lines.join('\n')}\n`;
  }

  for (const file of plan.files) {
    lines.push(`## ${file.file}`);
    for (const replacement of file.replacements.slice(0, 20)) {
      lines.push(
        `- L${replacement.line}:C${replacement.column} \`${replacement.currentValue}\` -> \`${replacement.replacementValue}\` (${replacement.tokenPath})`,
      );
      lines.push(`  ${replacement.snippet}`);
    }
    if (file.replacements.length > 20) {
      lines.push(`- ... ${file.replacements.length - 20} more replacements`);
    }
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}
