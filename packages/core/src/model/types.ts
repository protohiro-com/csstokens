export type ValueType =
  | 'css-var-def'
  | 'css-var-use'
  | 'color'
  | 'length'
  | 'shadow'
  | 'font-weight'
  | 'font-family';

export interface Occurrence {
  file: string;
  line: number;
  column: number;
  snippet: string;
}

export interface RawIndexEntry {
  type: ValueType;
  value: string;
  count: number;
  fileCount: number;
  confidence: number;
  occurrences: Occurrence[];
  propertiesHint: string[];
}

export interface RawIndex {
  filesScanned: number;
  filesAnalyzed: number;
  filesIgnored: number;
  entries: RawIndexEntry[];
}

export interface SourceFile {
  path: string;
  content: string;
}

export interface AnalyzeResult {
  rawIndex: RawIndex;
  report: string;
}

export interface ExtractResult extends AnalyzeResult {
  tokens: TokenSet;
  tokensJson: string;
  tokensCss: string;
  tokensTs: string;
}

export interface TokenTree {
  [key: string]: string | TokenTree;
}

export type TokenProfile = 'balanced' | 'strict';

export interface TokenSet {
  color: TokenTree;
  space: Record<string, string>;
  radius: Record<string, string>;
  shadow: Record<string, string>;
  font?: {
    size?: Record<string, string>;
    weight?: Record<string, string>;
    family?: Record<string, string>;
  };
}

export interface ExtractOptions {
  prefix?: string;
  profile?: TokenProfile;
  minCount?: number;
  minFileCount?: number;
  sourceIgnorePatterns?: string[];
}

export interface AnalyzeOptions {
  sourceIgnorePatterns?: string[];
}
