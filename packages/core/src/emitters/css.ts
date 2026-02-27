import { TokenSet } from '../model/types';

function walk(prefix: string[], value: string | Record<string, unknown>, lines: string[]): void {
  if (typeof value === 'string') {
    lines.push(`  --${prefix.join('-')}: ${value};`);
    return;
  }

  for (const key of Object.keys(value).sort()) {
    walk([...prefix, key], value[key] as string | Record<string, unknown>, lines);
  }
}

export function emitTokensCss(tokens: TokenSet, prefix: string): string {
  const lines: string[] = [':root {'];

  for (const key of Object.keys(tokens).sort()) {
    walk([prefix, key], tokens[key as keyof TokenSet] as Record<string, unknown>, lines);
  }

  lines.push('}');
  return `${lines.join('\n')}\n`;
}
