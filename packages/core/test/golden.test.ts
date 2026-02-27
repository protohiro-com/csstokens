import path from 'node:path';
import { promises as fs } from 'node:fs';
import fg from 'fast-glob';
import { describe, expect, it } from 'vitest';
import { extractFiles, rawIndexToJson, SourceFile } from '../src';

async function loadFixture(name: string): Promise<SourceFile[]> {
  const root = path.resolve(process.cwd(), '..', '..', 'examples', name);
  const files = await fg('**/*.{css,scss,tsx,ts,jsx,js}', {
    cwd: root,
    absolute: true,
    onlyFiles: true,
  });

  files.sort();

  const out: SourceFile[] = [];
  for (const file of files) {
    const content = await fs.readFile(file, 'utf8');
    out.push({ path: path.relative(root, file).replace(/\\/g, '/'), content });
  }

  return out;
}

describe('golden extract', () => {
  it('matches snapshot for messy-ui fixture', async () => {
    const files = await loadFixture('messy-ui');
    const result = extractFiles(files, { prefix: 'pt' });

    expect(result.tokensJson).toMatchSnapshot('tokens.json');
    expect(result.tokensCss).toMatchSnapshot('tokens.css');
    expect(result.report).toMatchSnapshot('report.md');
    expect(rawIndexToJson(result.rawIndex)).toMatchSnapshot('raw-index.json');
  });
});
