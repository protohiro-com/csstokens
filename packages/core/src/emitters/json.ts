import { TokenSet } from '../model/types';
import { sortObjectDeep } from '../utils/sortStable';

export function emitTokensJson(tokens: TokenSet): string {
  return `${JSON.stringify(sortObjectDeep(tokens), null, 2)}\n`;
}

export function emitRawIndexJson(value: unknown): string {
  return `${JSON.stringify(sortObjectDeep(value), null, 2)}\n`;
}
