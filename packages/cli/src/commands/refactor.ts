import {
  buildRefactorPlan,
  emitRefactorPlanMarkdown,
  extractFiles,
  rawIndexToJson,
} from '@protohiro/csstokens-core';
import { info } from '../logger';
import { collectFiles, CommonFlags, writeText } from './shared';
import path from 'node:path';

export async function runRefactor(targetPath: string, flags: CommonFlags): Promise<void> {
  if (flags.format !== 'simple') {
    throw new Error(`Unsupported format: ${flags.format}. Only 'simple' is currently available.`);
  }

  const files = await collectFiles(targetPath, flags.include, flags.exclude);
  const result = extractFiles(files, {
    prefix: flags.prefix,
    profile: flags.profile,
    minCount: flags.minCount,
    minFileCount: flags.minFileCount,
    sourceIgnorePatterns: flags.sourceIgnorePatterns,
  });
  const plan = buildRefactorPlan(result.rawIndex, result.tokens, flags.prefix);
  const outDir = path.resolve(flags.out);

  if (flags.dryRun) {
    info(`Dry run: analyzed ${files.length} files.`);
    info(`Refactor candidates: ${plan.totalReplacements} replacements across ${plan.totalFiles} files.`);
    for (const file of plan.files.slice(0, 10)) {
      info(`- ${file.file}: ${file.replacements.length} replacements`);
    }
    return;
  }

  await Promise.all([
    writeText(path.join(outDir, 'raw-index.json'), rawIndexToJson(result.rawIndex)),
    writeText(path.join(outDir, 'tokens.json'), result.tokensJson),
    writeText(path.join(outDir, 'tokens.css'), result.tokensCss),
    writeText(path.join(outDir, 'tokens.ts'), result.tokensTs),
    writeText(path.join(outDir, 'refactor-plan.md'), emitRefactorPlanMarkdown(plan)),
    writeText(path.join(outDir, 'refactor-plan.json'), `${JSON.stringify(plan, null, 2)}\n`),
  ]);

  info(`✔ Generated ${path.join(outDir, 'refactor-plan.md')}`);
  info(`✔ Generated ${path.join(outDir, 'refactor-plan.json')}`);
}
