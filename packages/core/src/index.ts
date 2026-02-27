import { buildRawIndex } from './extractors/fileExtractor';
import { emitTokensCss } from './emitters/css';
import { emitTokensJson, emitRawIndexJson } from './emitters/json';
import { emitReport } from './emitters/report';
import { emitTokensTs } from './emitters/ts';
import {
  AnalyzeResult,
  AnalyzeOptions,
  ExtractOptions,
  ExtractResult,
  RawIndex,
  SourceFile,
} from './model/types';
import { groupTokens } from './grouping/tokens';
import { stableCompare } from './utils/sortStable';

export * from './model/types';
export { normalizeColor, toCanonicalColor } from './utils/normalizeColor';

export function analyzeFiles(inputFiles: SourceFile[], options: AnalyzeOptions = {}): AnalyzeResult {
  const files = [...inputFiles].sort((a, b) => stableCompare(a.path, b.path));
  const { entries, filesAnalyzed, filesIgnored } = buildRawIndex(files, {
    sourceIgnorePatterns: options.sourceIgnorePatterns,
  });
  const rawIndex: RawIndex = {
    filesScanned: files.length,
    filesAnalyzed,
    filesIgnored,
    entries,
  };

  return {
    rawIndex,
    report: emitReport(rawIndex),
  };
}

export function extractFiles(inputFiles: SourceFile[], options: ExtractOptions = {}): ExtractResult {
  const prefix = options.prefix ?? 'pt';
  const analysis = analyzeFiles(inputFiles, {
    sourceIgnorePatterns: options.sourceIgnorePatterns,
  });
  const tokens = groupTokens(analysis.rawIndex, {
    profile: options.profile ?? 'balanced',
    minCount: options.minCount,
    minFileCount: options.minFileCount,
  });

  return {
    ...analysis,
    report: emitReport(analysis.rawIndex, tokens),
    tokens,
    tokensJson: emitTokensJson(tokens),
    tokensCss: emitTokensCss(tokens, prefix),
    tokensTs: emitTokensTs(tokens),
  };
}

export function rawIndexToJson(rawIndex: RawIndex): string {
  return emitRawIndexJson(rawIndex);
}
