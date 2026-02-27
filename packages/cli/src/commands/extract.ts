import path from 'node:path';
import { extractFiles, rawIndexToJson } from '@protohiro/csstokens-core';
import { info } from '../logger';
import { collectFiles, CommonFlags, writeText } from './shared';

export async function runExtract(targetPath: string, flags: CommonFlags): Promise<void> {
  if (flags.format !== 'simple') {
    throw new Error(`Unsupported format: ${flags.format}. Only 'simple' is available in MVP.`);
  }

  const files = await collectFiles(targetPath, flags.include, flags.exclude);
  const result = extractFiles(files, {
    prefix: flags.prefix,
    profile: flags.profile,
    minCount: flags.minCount,
    minFileCount: flags.minFileCount,
    sourceIgnorePatterns: flags.sourceIgnorePatterns,
  });
  const outDir = path.resolve(flags.out);

  if (flags.dryRun) {
    info(`Dry run: analyzed ${files.length} files.`);
    info(`Profile: ${flags.profile}`);
    info(`Tokens: color=${Object.keys(result.tokens.color).length}, space=${Object.keys(result.tokens.space).length}, radius=${Object.keys(result.tokens.radius).length}, shadow=${Object.keys(result.tokens.shadow).length}`);
    return;
  }

  await Promise.all([
    writeText(path.join(outDir, 'raw-index.json'), rawIndexToJson(result.rawIndex)),
    writeText(path.join(outDir, 'report.md'), result.report),
    writeText(path.join(outDir, 'tokens.json'), result.tokensJson),
    writeText(path.join(outDir, 'tokens.css'), result.tokensCss),
    writeText(path.join(outDir, 'tokens.ts'), result.tokensTs),
  ]);

  info(`✔ Generated ${path.join(outDir, 'raw-index.json')}`);
  info(`✔ Generated ${path.join(outDir, 'report.md')}`);
  info(`✔ Generated ${path.join(outDir, 'tokens.json')}`);
  info(`✔ Generated ${path.join(outDir, 'tokens.css')}`);
  info(`✔ Generated ${path.join(outDir, 'tokens.ts')}`);
}
