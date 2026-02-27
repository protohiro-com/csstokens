import { TokenSet } from '../model/types';
import { sortObjectDeep } from '../utils/sortStable';

export function emitTokensTs(tokens: TokenSet): string {
  const sorted = sortObjectDeep(tokens);
  return [
    `export const tokens = ${JSON.stringify(sorted, null, 2)} as const;`,
    '',
    'export type Tokens = typeof tokens;',
    '',
  ].join('\n');
}
