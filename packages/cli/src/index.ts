#!/usr/bin/env node
import { Command } from 'commander';
import { TokenProfile } from '@protohiro/csstokens-core';
import {
  DEFAULT_EXCLUDE,
  DEFAULT_INCLUDE,
  DEFAULT_OUT_DIR,
  DEFAULT_PROFILE,
  loadRepoConfig,
} from './config';
import { runAnalyze } from './commands/analyze';
import { runExtract } from './commands/extract';
import { CommonFlags } from './commands/shared';
import { error } from './logger';

interface Flags {
  out: string;
  include: string[];
  exclude: string[];
  sourceIgnore: string[];
  prefix: string;
  format: string;
  dryRun: boolean;
  profile?: TokenProfile;
  config?: string;
  minCount?: number;
  minFileCount?: number;
}

const SUBCOMMANDS = new Set(['analyze', 'extract']);
const ROOT_ONLY_FLAGS = new Set(['help', '--help', '-h', 'version', '--version', '-V']);

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function applyCommonOptions(command: Command): Command {
  return command
    .option('--out <dir>', 'output directory', DEFAULT_OUT_DIR)
    .option('--include <glob>', 'include glob', collect, [])
    .option('--exclude <glob>', 'exclude glob', collect, [])
    .option('--source-ignore <glob>', 'ignore source file for ranking/tokenization', collect, [])
    .option('--prefix <string>', 'CSS variable prefix', 'pt')
    .option('--format <name>', 'output format', 'simple')
    .option('--profile <name>', 'token profile: balanced or strict')
    .option('--min-count <number>', 'minimum occurrence count for candidate tokens', (value) => Number(value))
    .option('--min-file-count <number>', 'minimum file count for candidate tokens', (value) => Number(value))
    .option('--config <path>', 'path to repo config file')
    .option('--dry-run', 'analyze without writing files', false);
}

function normalizeProfile(profile: string | undefined): TokenProfile {
  if (!profile) {
    return DEFAULT_PROFILE;
  }

  if (profile === 'balanced' || profile === 'strict') {
    return profile;
  }

  throw new Error(`Unsupported profile: ${profile}. Use 'balanced' or 'strict'.`);
}

async function resolveFlags(targetPath: string, flags: Flags): Promise<CommonFlags> {
  const config = await loadRepoConfig(targetPath, flags.config);

  return {
    out: flags.out,
    include: flags.include.length > 0 ? flags.include : config.include ?? [...DEFAULT_INCLUDE],
    exclude: flags.exclude.length > 0 ? flags.exclude : config.exclude ?? [...DEFAULT_EXCLUDE],
    sourceIgnorePatterns:
      flags.sourceIgnore.length > 0
        ? flags.sourceIgnore
        : config.sourceIgnorePatterns ?? [],
    prefix: flags.prefix,
    format: flags.format,
    dryRun: flags.dryRun,
    profile: normalizeProfile(flags.profile ?? config.profile),
    minCount: flags.minCount ?? config.thresholds?.minCount,
    minFileCount: flags.minFileCount ?? config.thresholds?.minFileCount,
  };
}

async function main(): Promise<void> {
  const program = new Command();

  program
    .name('csstokens')
    .description('Extract design token candidates from frontend repositories')
    .version('0.1.0');

  applyCommonOptions(program.command('analyze [path]').description('Generate raw index and report'))
    .action(async (targetPath = '.', flags: Flags) => {
      await runAnalyze(targetPath, await resolveFlags(targetPath, flags));
    });

  applyCommonOptions(program.command('extract [path]').description('Generate token files and report'))
    .action(async (targetPath = '.', flags: Flags) => {
      await runExtract(targetPath, await resolveFlags(targetPath, flags));
    });

  const args = process.argv.slice(2);
  const firstArg = args[0];
  const shouldDefaultToExtract =
    !firstArg ||
    (firstArg.startsWith('-') && !ROOT_ONLY_FLAGS.has(firstArg)) ||
    (!SUBCOMMANDS.has(firstArg) && !ROOT_ONLY_FLAGS.has(firstArg));

  await program.parseAsync(
    shouldDefaultToExtract
      ? [process.argv[0], process.argv[1], 'extract', ...args]
      : process.argv,
  );
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  error(`Error: ${message}`);
  process.exitCode = 1;
});
