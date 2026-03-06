import path from 'node:path';
import { promises as fs } from 'node:fs';
import fg from 'fast-glob';
import { SourceFile } from '@protohiro/csstokens-core';
import { toPosix } from '../paths';

import { TokenProfile } from '@protohiro/csstokens-core';

export interface CommonFlags {
  out: string;
  include: string[];
  exclude: string[];
  sourceIgnorePatterns: string[];
  prefix: string;
  format: string;
  dryRun: boolean;
  profile: TokenProfile;
  minCount?: number;
  minFileCount?: number;
}

export async function collectFiles(rootPath: string, include: string[], exclude: string[]): Promise<SourceFile[]> {
  const cwd = path.resolve(rootPath);
  const entries = await fg(include, {
    cwd,
    absolute: true,
    ignore: exclude,
    onlyFiles: true,
    dot: false,
    unique: true,
  });

  entries.sort();

  return Promise.all(
    entries.map(async (file) => {
      const content = await fs.readFile(file, 'utf8');
      const relative = toPosix(path.relative(cwd, file));
      return { path: relative, content };
    }),
  );
}

export async function writeText(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
}
