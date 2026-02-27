import path from 'node:path';
import { analyzeFiles, rawIndexToJson } from '@protohiro/csstokens-core';
import { info } from '../logger';
import { collectFiles, CommonFlags, writeText } from './shared';

export async function runAnalyze(targetPath: string, flags: CommonFlags): Promise<void> {
  if (flags.format !== 'simple') {
    throw new Error(`Unsupported format: ${flags.format}. Only 'simple' is currently available.`);
  }

  const files = await collectFiles(targetPath, flags.include, flags.exclude);
  const result = analyzeFiles(files, {
    sourceIgnorePatterns: flags.sourceIgnorePatterns,
  });
  const outDir = path.resolve(flags.out);

  if (flags.dryRun) {
    info(`Dry run: analyzed ${files.length} files.`);
    info(`Entries found: ${result.rawIndex.entries.length}`);
    info(`Profile: ${flags.profile}`);
    return;
  }

  await writeText(path.join(outDir, 'raw-index.json'), rawIndexToJson(result.rawIndex));
  await writeText(path.join(outDir, 'report.md'), result.report);

  info(`✔ Found ${result.rawIndex.entries.length} index entries`);
  info(`✔ Generated ${path.join(outDir, 'raw-index.json')}`);
  info(`✔ Generated ${path.join(outDir, 'report.md')}`);
}
