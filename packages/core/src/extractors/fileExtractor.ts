import { Occurrence, RawIndexEntry, SourceFile, ValueType } from '../model/types';
import { getLineAndColumn, getLineSnippet } from '../utils/lineInfo';
import { normalizeColor, toCanonicalColor } from '../utils/normalizeColor';
import { matchAnyPattern } from '../utils/patterns';
import { stableCompare } from '../utils/sortStable';

interface Hit {
  type: ValueType;
  value: string;
  occurrence: Occurrence;
  propertyHint?: string;
}

interface InternalEntry {
  type: ValueType;
  value: string;
  count: number;
  occurrences: Occurrence[];
  occurrenceKeys: Set<string>;
  propertiesHint: Set<string>;
}

interface RawIndexBuildResult {
  entries: RawIndexEntry[];
  filesAnalyzed: number;
  filesIgnored: number;
}

const COLOR_PATTERN = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b|rgba?\([^\)]+\)|hsla?\([^\)]+\)/g;
const LENGTH_PATTERN = /-?\d*\.?\d+(?:px|rem|em|%)/g;
const CSS_VAR_DEF_PATTERN = /(--[a-zA-Z0-9_-]+)\s*:\s*([^;\n}\r]+)/g;
const CSS_VAR_USE_PATTERN = /var\(\s*(--[a-zA-Z0-9_-]+)(?:\s*,[^\)]+)?\)/g;
const STYLE_VAR_DEF_PATTERN = /["'`]\s*(--[a-zA-Z0-9_-]+)\s*["'`]\s*:\s*["'`]([^"'`]+)["'`]/g;
const BOX_SHADOW_PATTERN = /box-shadow\s*:\s*([^;\n}\r]+)/g;
const FONT_WEIGHT_PATTERN = /font-weight\s*:\s*([^;\n}\r]+)/g;
const FONT_FAMILY_PATTERN = /font-family\s*:\s*([^;\n}\r]+)/g;
const PROPERTY_VALUE_PATTERN = /([a-zA-Z][a-zA-Z-]*)\s*:\s*([^;\n}\r]+)/g;
const TAILWIND_COLOR_PATTERN = /\b(bg|text|border|fill|stroke|ring|outline)-\[((?:#[0-9a-fA-F]{3,8})|(?:rgba?\([^\)]+\))|(?:hsla?\([^\)]+\)))\](?:\/(\d{1,3}))?/g;

const SPACING_HINTS = new Set([
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'padding-inline',
  'padding-inline-start',
  'padding-inline-end',
  'padding-block',
  'padding-block-start',
  'padding-block-end',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'margin-inline',
  'margin-inline-start',
  'margin-inline-end',
  'margin-block',
  'margin-block-start',
  'margin-block-end',
  'gap',
  'row-gap',
  'column-gap',
  'top',
  'right',
  'bottom',
  'left',
  'inset',
  'inset-inline',
  'inset-block',
]);

const RADIUS_HINTS = new Set([
  'border-radius',
  'border-top-left-radius',
  'border-top-right-radius',
  'border-bottom-left-radius',
  'border-bottom-right-radius',
]);

const TYPOGRAPHY_SIZE_HINTS = new Set(['font-size', 'line-height']);
const FONT_WEIGHT_HINTS = new Set(['font-weight']);
const FONT_FAMILY_HINTS = new Set(['font-family']);
const COLOR_HINTS = new Set([
  'color',
  'background',
  'background-color',
  'border-color',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'outline-color',
  'text-decoration-color',
  'fill',
  'stroke',
  'caret-color',
]);
const COMMON_HINTS = new Set([
  ...SPACING_HINTS,
  ...RADIUS_HINTS,
  ...TYPOGRAPHY_SIZE_HINTS,
  ...FONT_WEIGHT_HINTS,
  ...FONT_FAMILY_HINTS,
  ...COLOR_HINTS,
]);

const IGNORED_SOURCE_PATTERNS = [
  /(?:^|\/)tailwind-data\.[jt]s$/i,
  /\.stories\.[jt]sx?$/i,
  /(?:^|\/)storybook(?:\/|$)/i,
  /(?:^|\/)(?:__generated__|generated)(?:\/|$)/i,
  /(?:^|\/)(?:__mocks__|fixtures|examples)(?:\/|$)/i,
  /(?:^|\/)(?:ColorPicker|color-picker|colorpicker)(?:\/|$)/,
  /(?:^|\/)themes\/colors\.[jt]sx?$/i,
];

const STYLESHEET_FILE_PATTERN = /\.(?:css|scss)$/i;
const LOOSE_COLOR_CONTEXT_PATTERN = /\b(?:color|background|border|fill|stroke|outline|shadow|theme|palette|accent|primary|secondary|success|danger|warning|info|surface|style|styles|sx|tw)\b/i;

function camelToKebab(value: string): string {
  return value.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`).toLowerCase();
}

function normalizeProperty(property: string): string {
  return camelToKebab(property.trim());
}

function normalizedLengthValue(raw: string): { value: string; unit: string; amount: number } | null {
  const match = raw.trim().match(/^(-?\d*\.?\d+)(px|rem|em|%)$/);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;
  return {
    value: `${amount}${match[2]}`,
    amount,
    unit: match[2],
  };
}

function toPxEquivalent(length: { amount: number; unit: string }): number {
  if (length.unit === 'px') return length.amount;
  if (length.unit === 'rem' || length.unit === 'em') return length.amount * 16;
  return length.amount;
}

function isCandidateLength(property: string, rawValue: string): boolean {
  const length = normalizedLengthValue(rawValue);
  if (!length) return false;

  if (SPACING_HINTS.has(property)) {
    if (length.unit === '%') {
      return length.amount > 0 && length.amount <= 100 && Number.isInteger(length.amount);
    }

    const px = toPxEquivalent(length);
    return px >= 0 && px <= 256;
  }

  if (RADIUS_HINTS.has(property)) {
    if (length.unit === '%') {
      return length.amount === 50;
    }

    const px = toPxEquivalent(length);
    return px >= 0 && px <= 64;
  }

  if (TYPOGRAPHY_SIZE_HINTS.has(property)) {
    if (length.unit === '%') {
      return length.amount >= 50 && length.amount <= 150;
    }

    const px = toPxEquivalent(length);
    return px >= 8 && px <= 72;
  }

  return false;
}

function scoreEntry(type: ValueType, count: number, fileCount: number, propertiesHint: string[]): number {
  const usageScore = Math.min(0.45, Math.log10(count + 1) * 0.22);
  const spreadScore = Math.min(0.3, Math.log10(fileCount + 1) * 0.18);
  const propertyScore = propertiesHint.length > 0 ? Math.min(0.2, propertiesHint.length * 0.08) : 0;
  const typeScore = type === 'color' || type === 'length' || type === 'shadow' ? 0.08 : 0.04;
  const confidence = usageScore + spreadScore + propertyScore + typeScore;
  return Math.round(Math.min(0.99, confidence) * 100) / 100;
}

function pushHit(
  hits: Hit[],
  file: SourceFile,
  type: ValueType,
  value: string,
  atIndex: number,
  propertyHint?: string,
): void {
  const { line, column } = getLineAndColumn(file.content, atIndex);
  hits.push({
    type,
    value,
    propertyHint,
    occurrence: {
      file: file.path,
      line,
      column,
      snippet: getLineSnippet(file.content, line),
    },
  });
}

function withOpacity(value: string, opacity: string | undefined): string | null {
  const color = normalizeColor(value);
  if (!color) return null;
  if (!opacity) {
    return toCanonicalColor(value);
  }

  const alpha = Number(opacity) / 100;
  if (!Number.isFinite(alpha)) {
    return toCanonicalColor(value);
  }

  const nextAlpha = Math.max(0, Math.min(1, Math.round(color.a * alpha * 1000) / 1000));
  if (nextAlpha === 1) {
    return toCanonicalColor(value);
  }

  return `rgba(${color.r}, ${color.g}, ${color.b}, ${nextAlpha})`;
}

function tailwindHint(utility: string): string {
  switch (utility) {
    case 'bg':
      return 'background-color';
    case 'text':
      return 'color';
    case 'border':
    case 'ring':
    case 'outline':
      return 'border-color';
    case 'fill':
      return 'fill';
    case 'stroke':
      return 'stroke';
    default:
      return 'color';
  }
}

function extractTailwindColorHits(file: SourceFile): { hits: Hit[]; ranges: Array<{ start: number; end: number }> } {
  const hits: Hit[] = [];
  const ranges: Array<{ start: number; end: number }> = [];
  let match: RegExpExecArray | null;

  TAILWIND_COLOR_PATTERN.lastIndex = 0;
  while ((match = TAILWIND_COLOR_PATTERN.exec(file.content)) !== null) {
    const normalized = withOpacity(match[2], match[3]);
    if (!normalized) {
      continue;
    }

    pushHit(hits, file, 'color', normalized, match.index, tailwindHint(match[1]));
    ranges.push({ start: match.index, end: match.index + match[0].length });
  }

  return { hits, ranges };
}

function isInsideRange(index: number, ranges: Array<{ start: number; end: number }>): boolean {
  return ranges.some((range) => index >= range.start && index < range.end);
}

function shouldKeepLooseColorHit(file: SourceFile, index: number): boolean {
  if (STYLESHEET_FILE_PATTERN.test(file.path)) {
    return true;
  }

  const start = Math.max(0, index - 80);
  const end = Math.min(file.content.length, index + 80);
  const context = file.content.slice(start, end);

  return LOOSE_COLOR_CONTEXT_PATTERN.test(context);
}

function extractFromProperties(file: SourceFile): Hit[] {
  const hits: Hit[] = [];
  let match: RegExpExecArray | null;

  PROPERTY_VALUE_PATTERN.lastIndex = 0;
  while ((match = PROPERTY_VALUE_PATTERN.exec(file.content)) !== null) {
    const property = normalizeProperty(match[1]);
    const value = match[2];

    if (!COMMON_HINTS.has(property)) {
      continue;
    }

    LENGTH_PATTERN.lastIndex = 0;
    let lengthMatch: RegExpExecArray | null;
    while ((lengthMatch = LENGTH_PATTERN.exec(value)) !== null) {
      const normalized = normalizedLengthValue(lengthMatch[0]);
      if (!normalized || !isCandidateLength(property, normalized.value)) {
        continue;
      }

      pushHit(
        hits,
        file,
        'length',
        normalized.value,
        match.index + match[0].indexOf(lengthMatch[0]),
        property,
      );
    }

    if (COLOR_HINTS.has(property)) {
      COLOR_PATTERN.lastIndex = 0;
      let colorMatch: RegExpExecArray | null;
      while ((colorMatch = COLOR_PATTERN.exec(value)) !== null) {
        const normalized = toCanonicalColor(colorMatch[0]);
        if (!normalized) {
          continue;
        }

        pushHit(
          hits,
          file,
          'color',
          normalized,
          match.index + match[0].indexOf(colorMatch[0]),
          property,
        );
      }
    }
  }

  return hits;
}

export function shouldIgnoreSourceFile(filePath: string, sourceIgnorePatterns: string[] = []): boolean {
  return (
    IGNORED_SOURCE_PATTERNS.some((pattern) => pattern.test(filePath)) ||
    matchAnyPattern(filePath, sourceIgnorePatterns)
  );
}

function cleanFontFamily(raw: string): string | null {
  const normalized = raw
    .trim()
    .replace(/[;}]$/, '')
    .replace(/,\s*$/, '')
    .replace(/\s+/g, ' ');
  if (!normalized || normalized.includes('var(')) {
    return null;
  }
  return normalized;
}

export function extractFileHits(file: SourceFile): Hit[] {
  const hits: Hit[] = [];
  let match: RegExpExecArray | null;

  CSS_VAR_DEF_PATTERN.lastIndex = 0;
  while ((match = CSS_VAR_DEF_PATTERN.exec(file.content)) !== null) {
    pushHit(hits, file, 'css-var-def', match[1], match.index);
  }

  STYLE_VAR_DEF_PATTERN.lastIndex = 0;
  while ((match = STYLE_VAR_DEF_PATTERN.exec(file.content)) !== null) {
    pushHit(hits, file, 'css-var-def', match[1], match.index);
  }

  CSS_VAR_USE_PATTERN.lastIndex = 0;
  while ((match = CSS_VAR_USE_PATTERN.exec(file.content)) !== null) {
    pushHit(hits, file, 'css-var-use', match[1], match.index);
  }

  const tailwind = extractTailwindColorHits(file);
  hits.push(...tailwind.hits);

  COLOR_PATTERN.lastIndex = 0;
  while ((match = COLOR_PATTERN.exec(file.content)) !== null) {
    if (isInsideRange(match.index, tailwind.ranges)) {
      continue;
    }

    if (!shouldKeepLooseColorHit(file, match.index)) {
      continue;
    }

    const normalized = toCanonicalColor(match[0]);
    if (normalized) {
      pushHit(hits, file, 'color', normalized, match.index);
    }
  }

  BOX_SHADOW_PATTERN.lastIndex = 0;
  while ((match = BOX_SHADOW_PATTERN.exec(file.content)) !== null) {
    pushHit(hits, file, 'shadow', match[1].trim(), match.index, 'box-shadow');
  }

  FONT_WEIGHT_PATTERN.lastIndex = 0;
  while ((match = FONT_WEIGHT_PATTERN.exec(file.content)) !== null) {
    const normalized = match[1].trim().replace(/["']/g, '');
    pushHit(hits, file, 'font-weight', normalized, match.index, 'font-weight');
  }

  FONT_FAMILY_PATTERN.lastIndex = 0;
  while ((match = FONT_FAMILY_PATTERN.exec(file.content)) !== null) {
    const normalized = cleanFontFamily(match[1]);
    if (normalized) {
      pushHit(hits, file, 'font-family', normalized, match.index, 'font-family');
    }
  }

  hits.push(...extractFromProperties(file));

  return hits;
}

export function buildRawIndex(
  files: SourceFile[],
  options: { sourceIgnorePatterns?: string[] } = {},
): RawIndexBuildResult {
  const map = new Map<string, InternalEntry>();
  let filesIgnored = 0;
  let filesAnalyzed = 0;
  const sourceIgnorePatterns = options.sourceIgnorePatterns ?? [];

  for (const file of files) {
    if (shouldIgnoreSourceFile(file.path, sourceIgnorePatterns)) {
      filesIgnored += 1;
    }

    filesAnalyzed += 1;
    const hits = extractFileHits(file);
    for (const hit of hits) {
      const key = `${hit.type}::${hit.value}`;
      const occurrenceKey = `${hit.occurrence.file}:${hit.occurrence.line}:${hit.occurrence.column}`;
      const current = map.get(key);
      if (!current) {
        const next: InternalEntry = {
          type: hit.type,
          value: hit.value,
          count: 0,
          occurrences: [],
          occurrenceKeys: new Set<string>(),
          propertiesHint: new Set<string>(),
        };
        map.set(key, next);
      }

      const entry = map.get(key)!;
      if (!entry.occurrenceKeys.has(occurrenceKey)) {
        entry.count += 1;
        entry.occurrences.push(hit.occurrence);
        entry.occurrenceKeys.add(occurrenceKey);
      }

      if (hit.propertyHint) {
        entry.propertiesHint.add(hit.propertyHint);
      }
    }
  }

  const entries = Array.from(map.values())
    .map((entry) => {
      const uniqueFiles = new Set(entry.occurrences.map((occurrence) => occurrence.file));
      const propertiesHint = Array.from(entry.propertiesHint).sort(stableCompare);
      const occurrences = entry.occurrences.sort((a, b) => {
        return (
          stableCompare(a.file, b.file) ||
          stableCompare(a.line, b.line) ||
          stableCompare(a.column, b.column) ||
          stableCompare(a.snippet, b.snippet)
        );
      });

      return {
        type: entry.type,
        value: entry.value,
        count: entry.count,
        fileCount: uniqueFiles.size,
        confidence: scoreEntry(entry.type, entry.count, uniqueFiles.size, propertiesHint),
        propertiesHint,
        occurrences,
      } satisfies RawIndexEntry;
    })
    .sort((a, b) => {
      return stableCompare(a.type, b.type) || stableCompare(a.value, b.value);
    });

  return {
    entries,
    filesAnalyzed,
    filesIgnored,
  };
}
