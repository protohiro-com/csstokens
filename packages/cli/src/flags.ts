import { TokenProfile } from '@protohiro/csstokens-core';
import {
  DEFAULT_EXCLUDE,
  DEFAULT_INCLUDE,
  DEFAULT_OUT_DIR,
  DEFAULT_PROFILE,
  loadRepoConfig,
} from './config';
import { CommonFlags } from './commands/shared';

export interface Flags {
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

export function normalizeProfile(profile: string | undefined): TokenProfile {
  if (!profile) {
    return DEFAULT_PROFILE;
  }

  if (profile === 'balanced' || profile === 'strict') {
    return profile;
  }

  throw new Error(`Unsupported profile: ${profile}. Use 'balanced' or 'strict'.`);
}

export function parseIntegerOption(value: unknown, label: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid ${label}: ${String(value)}. Use a non-negative integer.`);
  }

  return value;
}

export async function resolveFlags(targetPath: string, flags: Flags): Promise<CommonFlags> {
  const config = await loadRepoConfig(targetPath, flags.config);

  return {
    out: flags.out ?? DEFAULT_OUT_DIR,
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
    minCount: parseIntegerOption(flags.minCount ?? config.thresholds?.minCount, 'min-count'),
    minFileCount: parseIntegerOption(
      flags.minFileCount ?? config.thresholds?.minFileCount,
      'min-file-count',
    ),
  };
}
