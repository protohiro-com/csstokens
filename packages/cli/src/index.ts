#!/usr/bin/env node
import { Command } from 'commander';
import {
  DEFAULT_OUT_DIR,
} from './config';
import { runAnalyze } from './commands/analyze';
import { runExtract } from './commands/extract';
import { runRefactor } from './commands/refactor';
import { error } from './logger';
import { Flags, resolveFlags } from './flags';

const SUBCOMMANDS = new Set(['analyze', 'extract', 'refactor']);
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

  applyCommonOptions(program.command('refactor [path]').description('Generate a refactor dry run plan'))
    .action(async (targetPath = '.', flags: Flags) => {
      await runRefactor(targetPath, await resolveFlags(targetPath, flags));
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
