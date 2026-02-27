import path from 'node:path';
import { promises as fs } from 'node:fs';
import { TokenProfile } from '@protohiro/csstokens-core';

export const DEFAULT_OUT_DIR = './csstokens-out';
export const DEFAULT_INCLUDE = ['**/*.{css,scss,tsx,ts,jsx,js}'];
export const DEFAULT_EXCLUDE = ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.next/**'];
export const DEFAULT_PROFILE: TokenProfile = 'balanced';
const DEFAULT_CONFIG_FILES = [
  'csstokens.config.json',
  '.csstokensrc.json',
  'protohiro-tokens.config.json',
  '.protohiro-tokensrc.json',
];

export interface RepoConfig {
  include?: string[];
  exclude?: string[];
  sourceIgnorePatterns?: string[];
  profile?: TokenProfile;
  thresholds?: {
    minCount?: number;
    minFileCount?: number;
  };
}

export async function loadRepoConfig(rootPath: string, explicitConfigPath?: string): Promise<RepoConfig> {
  const resolvedRoot = path.resolve(rootPath);
  const candidates = explicitConfigPath
    ? [path.resolve(explicitConfigPath)]
    : DEFAULT_CONFIG_FILES.map((file) => path.join(resolvedRoot, file));

  for (const filePath of candidates) {
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw) as RepoConfig;
      return parsed;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        continue;
      }
      throw new Error(`Failed to load config at ${filePath}: ${(error as Error).message}`);
    }
  }

  return {};
}
