import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { loadRepoConfig } from '../src/config';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('loadRepoConfig', () => {
  it('loads csstokens.config.json from target repo', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'csstokens-'));
    tempDirs.push(dir);
    await fs.writeFile(
      path.join(dir, 'csstokens.config.json'),
      JSON.stringify({
        profile: 'strict',
        include: ['src/**/*.{ts,tsx}'],
        sourceIgnorePatterns: ['**/*.stories.tsx'],
        thresholds: { minCount: 3, minFileCount: 2 },
      }),
      'utf8',
    );

    const config = await loadRepoConfig(dir);

    expect(config).toEqual({
      profile: 'strict',
      include: ['src/**/*.{ts,tsx}'],
      sourceIgnorePatterns: ['**/*.stories.tsx'],
      thresholds: { minCount: 3, minFileCount: 2 },
    });
  });

  it('falls back to legacy protohiro config names', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'csstokens-legacy-'));
    tempDirs.push(dir);
    await fs.writeFile(
      path.join(dir, 'protohiro-tokens.config.json'),
      JSON.stringify({
        profile: 'balanced',
        exclude: ['**/vendor/**'],
      }),
      'utf8',
    );

    const config = await loadRepoConfig(dir);

    expect(config).toEqual({
      profile: 'balanced',
      exclude: ['**/vendor/**'],
    });
  });
});
