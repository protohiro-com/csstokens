import { buildRawIndex, shouldIgnoreSourceFile } from './extractors/fileExtractor';
import { emitTokensCss } from './emitters/css';
import { emitTokensJson, emitRawIndexJson } from './emitters/json';
import { emitReport } from './emitters/report';
import { emitTokensTs } from './emitters/ts';
import { buildRefactorPlan, emitRefactorPlanMarkdown } from './refactor/plan';
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

function filterRawIndexForTokenization(rawIndex: RawIndex, sourceIgnorePatterns: string[] = []): RawIndex {
  function scoreEntry(count: number, fileCount: number, propertiesHintCount: number, type: string): number {
    const usageScore = Math.min(0.45, Math.log10(count + 1) * 0.22);
    const spreadScore = Math.min(0.3, Math.log10(fileCount + 1) * 0.18);
    const propertyScore = propertiesHintCount > 0 ? Math.min(0.2, propertiesHintCount * 0.08) : 0;
    const typeScore = type === 'color' || type === 'length' || type === 'shadow' ? 0.08 : 0.04;
    const confidence = usageScore + spreadScore + propertyScore + typeScore;
    return Math.round(Math.min(0.99, confidence) * 100) / 100;
  }

  const entries = rawIndex.entries
    .map((entry) => {
      const occurrences = entry.occurrences.filter(
        (occurrence) => !shouldIgnoreSourceFile(occurrence.file, sourceIgnorePatterns),
      );
      const uniqueFiles = new Set(occurrences.map((occurrence) => occurrence.file));

      return {
        ...entry,
        count: occurrences.length,
        fileCount: uniqueFiles.size,
        confidence: scoreEntry(
          occurrences.length,
          uniqueFiles.size,
          entry.propertiesHint.length,
          entry.type,
        ),
        occurrences,
      };
    })
    .filter((entry) => entry.count > 0)
    .sort((a, b) => stableCompare(a.type, b.type) || stableCompare(a.value, b.value));

  return {
    ...rawIndex,
    entries,
  };
}

export function extractFiles(inputFiles: SourceFile[], options: ExtractOptions = {}): ExtractResult {
  const prefix = options.prefix ?? 'pt';
  const analysis = analyzeFiles(inputFiles, {
    sourceIgnorePatterns: options.sourceIgnorePatterns,
  });
  const tokenizationIndex = filterRawIndexForTokenization(
    analysis.rawIndex,
    options.sourceIgnorePatterns,
  );
  const tokens = groupTokens(tokenizationIndex, {
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

export { buildRefactorPlan, emitRefactorPlanMarkdown };
