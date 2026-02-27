import { Occurrence, RawIndex, RawIndexEntry, TokenProfile, TokenSet, TokenTree } from '../model/types';
import { normalizeColor, rgbHue, rgbLuminance, rgbSaturation } from '../utils/normalizeColor';
import { stableCompare } from '../utils/sortStable';

interface ValCount {
  value: string;
  count: number;
  fileCount: number;
  confidence: number;
  propertiesHint: string[];
}

interface ColorCandidate {
  entry: RawIndexEntry;
  role: SemanticColorRole;
  lum: number;
  sat: number;
  hue: number;
}

interface GroupOptions {
  profile: TokenProfile;
  minCount?: number;
  minFileCount?: number;
}

type SemanticColorRole =
  | 'text'
  | 'surface'
  | 'border'
  | 'brand'
  | 'success'
  | 'danger'
  | 'warning'
  | 'info';

const SPACE_HINTS = new Set([
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
]);

const RADIUS_HINTS = new Set([
  'border-radius',
  'border-top-left-radius',
  'border-top-right-radius',
  'border-bottom-left-radius',
  'border-bottom-right-radius',
]);

const TEXT_COLOR_HINTS = new Set(['color', 'fill', 'stroke', 'caret-color', 'text-decoration-color']);
const SURFACE_COLOR_HINTS = new Set(['background', 'background-color']);
const BORDER_COLOR_HINTS = new Set(['border-color', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color', 'outline-color']);

const PREFERRED_SPACE_PX = [4, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 64];
const PREFERRED_RADIUS_PX = [4, 6, 8, 10, 12, 16, 24];
const PREFERRED_FONT_PX = [12, 14, 16, 18, 20, 24, 32, 40];

const PROFILE_DEFAULTS: Record<TokenProfile, { minCount: number; minFileCount: number }> = {
  balanced: { minCount: 2, minFileCount: 1 },
  strict: { minCount: 3, minFileCount: 2 },
};

function byType(rawIndex: RawIndex, type: RawIndexEntry['type']): ValCount[] {
  return rawIndex.entries
    .filter((entry) => entry.type === type)
    .map((entry) => ({
      value: entry.value,
      count: entry.count,
      fileCount: entry.fileCount,
      confidence: entry.confidence,
      propertiesHint: entry.propertiesHint,
    }));
}

function parseLength(length: string): { amount: number; unit: string } | null {
  const match = length.match(/^(-?\d*\.?\d+)(px|rem|em|%)$/);
  if (!match) return null;
  return { amount: Number(match[1]), unit: match[2] };
}

function toPx(length: string): number | null {
  const parsed = parseLength(length);
  if (!parsed) return null;
  if (parsed.unit === 'px') return parsed.amount;
  if (parsed.unit === 'rem' || parsed.unit === 'em') return parsed.amount * 16;
  return parsed.amount;
}

function toSortValue(length: string): number {
  return toPx(length) ?? Number.POSITIVE_INFINITY;
}

function effectiveMinCount(options: GroupOptions): number {
  return Math.max(options.minCount ?? 0, PROFILE_DEFAULTS[options.profile].minCount);
}

function effectiveMinFileCount(options: GroupOptions): number {
  return Math.max(options.minFileCount ?? 0, PROFILE_DEFAULTS[options.profile].minFileCount);
}

function pickRepresentative(values: string[], meta: Map<string, ValCount>): string {
  return [...values].sort((a, b) => {
    const left = meta.get(a)!;
    const right = meta.get(b)!;
    return (
      stableCompare(right.confidence, left.confidence) ||
      right.count - left.count ||
      right.fileCount - left.fileCount ||
      stableCompare(a.includes('px') ? 0 : 1, b.includes('px') ? 0 : 1) ||
      stableCompare(a, b)
    );
  })[0];
}

function mapStep(index: number, total: number): string {
  if (total <= 1) return '500';
  if (total === 2) return index === 0 ? '400' : '600';
  if (total === 3) return ['300', '500', '700'][index];
  const ratio = index / (total - 1);
  const level = Math.round(ratio * 8) + 1;
  return `${level * 100}`;
}

function nearestPreferred(px: number, preferred: number[]): number | null {
  let winner: number | null = null;
  let delta = Number.POSITIVE_INFINITY;

  for (const candidate of preferred) {
    const nextDelta = Math.abs(candidate - px);
    if (nextDelta < delta) {
      delta = nextDelta;
      winner = candidate;
    }
  }

  if (winner === null) return null;
  const tolerance = winner <= 12 ? 0.75 : winner <= 24 ? 1 : 2;
  return delta <= tolerance ? winner : null;
}

function clusterLengths(items: ValCount[], preferred: number[], minConfidence: number, options: GroupOptions): Record<string, string> {
  const meta = new Map<string, ValCount>();
  for (const item of items) {
    meta.set(item.value, item);
  }

  const buckets = new Map<number, string[]>();
  for (const item of items) {
    const px = toPx(item.value);
    if (px === null) continue;
    if (item.count < effectiveMinCount(options) && item.fileCount < effectiveMinFileCount(options)) {
      continue;
    }

    const preferredValue = nearestPreferred(px, preferred);
    if (preferredValue === null || item.confidence < minConfidence) {
      continue;
    }

    const list = buckets.get(preferredValue) ?? [];
    list.push(item.value);
    buckets.set(preferredValue, list);
  }

  return Array.from(buckets.entries())
    .sort((a, b) => a[0] - b[0])
    .reduce<Record<string, string>>((acc, [, values], index) => {
      acc[String(index)] = pickRepresentative(values, meta);
      return acc;
    }, {});
}

function keywordScore(occurrences: Occurrence[], regex: RegExp): number {
  let score = 0;
  for (const occurrence of occurrences) {
    const haystack = `${occurrence.file} ${occurrence.snippet}`.toLowerCase();
    if (regex.test(haystack)) {
      score += 1;
    }
  }
  return score;
}

function inferColorRole(entry: RawIndexEntry): SemanticColorRole {
  const scores = new Map<SemanticColorRole, number>([
    ['brand', 0],
    ['text', 0],
    ['surface', 0],
    ['border', 0],
    ['success', 0],
    ['danger', 0],
    ['warning', 0],
    ['info', 0],
  ]);

  for (const hint of entry.propertiesHint) {
    if (TEXT_COLOR_HINTS.has(hint)) scores.set('text', scores.get('text')! + 3);
    if (SURFACE_COLOR_HINTS.has(hint)) scores.set('surface', scores.get('surface')! + 3);
    if (BORDER_COLOR_HINTS.has(hint)) scores.set('border', scores.get('border')! + 3);
  }

  scores.set('brand', scores.get('brand')! + keywordScore(entry.occurrences, /\b(primary|brand|accent|logo|main|secondary)\b/));
  scores.set('success', scores.get('success')! + keywordScore(entry.occurrences, /\b(success|paid|complete|done|positive|approved|active)\b/));
  scores.set('danger', scores.get('danger')! + keywordScore(entry.occurrences, /\b(error|danger|failed|destructive|invalid|negative|critical|cancel)\b/));
  scores.set('warning', scores.get('warning')! + keywordScore(entry.occurrences, /\b(warning|pending|alert|caution|draft)\b/));
  scores.set('info', scores.get('info')! + keywordScore(entry.occurrences, /\b(info|notice|help|neutral|link)\b/));
  scores.set('text', scores.get('text')! + keywordScore(entry.occurrences, /\b(text|label|heading|title|subtitle|caption)\b/));
  scores.set('surface', scores.get('surface')! + keywordScore(entry.occurrences, /\b(background|surface|card|modal|drawer|banner|panel|page|overlay)\b/));
  scores.set('border', scores.get('border')! + keywordScore(entry.occurrences, /\b(border|divider|separator|outline|ring)\b/));

  const rgba = normalizeColor(entry.value);
  if (!rgba) return 'brand';

  const saturation = rgbSaturation(rgba);
  const luminance = rgbLuminance(rgba);
  const hue = rgbHue(rgba);

  if (rgba.a === 0) {
    return 'surface';
  }

  if (saturation < 0.1) {
    if (luminance < 120) return 'text';
    if (luminance < 220) return 'border';
    return 'surface';
  }

  if ((hue >= 80 && hue <= 170) || scores.get('success')! > 0) {
    if (scores.get('success')! >= scores.get('brand')!) return 'success';
  }
  if ((hue >= 0 && hue <= 20) || hue >= 345 || scores.get('danger')! > 0) {
    if (scores.get('danger')! >= scores.get('brand')!) return 'danger';
  }
  if ((hue >= 25 && hue <= 75) || scores.get('warning')! > 0) {
    if (scores.get('warning')! >= scores.get('brand')!) return 'warning';
  }
  if ((hue >= 180 && hue <= 255) || scores.get('info')! > 0) {
    if (scores.get('info')! > scores.get('brand')!) return 'info';
  }

  const ordered = Array.from(scores.entries()).sort((a, b) => {
    return stableCompare(b[1], a[1]) || stableCompare(a[0], b[0]);
  });

  const topRole = ordered[0][1] > 0 ? ordered[0][0] : 'brand';
  if ((topRole === 'text' || topRole === 'border') && saturation > 0.3 && luminance < 240) {
    return 'brand';
  }
  if (topRole === 'surface' && luminance < 150 && saturation < 0.12) {
    return 'text';
  }
  return topRole;
}

function prioritizeColor(entry: RawIndexEntry, options: GroupOptions): boolean {
  const rgba = normalizeColor(entry.value);
  if (!rgba || rgba.a === 0) {
    return false;
  }

  const minCount = effectiveMinCount(options);
  const minFileCount = effectiveMinFileCount(options);
  const minConfidence = options.profile === 'strict' ? 0.42 : 0.3;

  if (entry.count >= minCount || entry.fileCount >= minFileCount) {
    return entry.confidence >= minConfidence - 0.08;
  }

  return entry.propertiesHint.length > 0 && entry.confidence >= minConfidence;
}

function sortCandidates(items: ColorCandidate[]): ColorCandidate[] {
  return items.sort((a, b) => {
    return (
      stableCompare(b.entry.confidence, a.entry.confidence) ||
      b.entry.count - a.entry.count ||
      b.entry.fileCount - a.entry.fileCount ||
      stableCompare(a.lum, b.lum) ||
      stableCompare(a.entry.value, b.entry.value)
    );
  });
}

function toScale(items: ColorCandidate[], limit: number): Record<string, string> {
  const chosen = sortCandidates(items)
    .slice(0, limit)
    .sort((a, b) => stableCompare(a.lum, b.lum) || stableCompare(a.entry.value, b.entry.value));

  return chosen.reduce<Record<string, string>>((acc, item, index) => {
    acc[mapStep(index, chosen.length)] = item.entry.value;
    return acc;
  }, {});
}

function brandBucketKeywordScore(item: ColorCandidate, regex: RegExp): number {
  return keywordScore(item.entry.occurrences, regex);
}

function choosePrimaryAccent(items: ColorCandidate[]): { primary: ColorCandidate[]; accent: ColorCandidate[] } {
  if (items.length === 0) {
    return { primary: [], accent: [] };
  }

  const ordered = sortCandidates([...items]);
  const primaryPool = items.filter((item) => item.hue >= 185 && item.hue <= 250 && item.sat >= 0.2);
  const primaryAnchor = (primaryPool.length > 0 ? primaryPool : ordered).sort((a, b) => {
    const aKeyword = brandBucketKeywordScore(a, /\b(primary|brand|main|logo)\b/);
    const bKeyword = brandBucketKeywordScore(b, /\b(primary|brand|main|logo)\b/);
    return (
      stableCompare(bKeyword, aKeyword) ||
      stableCompare(b.entry.confidence, a.entry.confidence) ||
      b.entry.count - a.entry.count ||
      stableCompare(a.entry.value, b.entry.value)
    );
  })[0];

  const accentAnchor = items
    .filter((item) => item.entry.value !== primaryAnchor.entry.value)
    .sort((a, b) => {
      const aKeyword = brandBucketKeywordScore(a, /\b(accent|secondary|highlight|marketing)\b/);
      const bKeyword = brandBucketKeywordScore(b, /\b(accent|secondary|highlight|marketing)\b/);
      const aDistance = Math.abs(a.hue - primaryAnchor.hue);
      const bDistance = Math.abs(b.hue - primaryAnchor.hue);
      return (
        stableCompare(bKeyword, aKeyword) ||
        stableCompare(bDistance, aDistance) ||
        stableCompare(b.entry.confidence, a.entry.confidence) ||
        stableCompare(a.entry.value, b.entry.value)
      );
    })[0];

  const primary: ColorCandidate[] = [];
  const accent: ColorCandidate[] = [];

  for (const item of items) {
    if (!accentAnchor) {
      primary.push(item);
      continue;
    }

    const primaryKeyword = brandBucketKeywordScore(item, /\b(primary|brand|main|logo)\b/);
    const accentKeyword = brandBucketKeywordScore(item, /\b(accent|secondary|highlight|marketing)\b/);
    const primaryDistance = Math.abs(item.hue - primaryAnchor.hue);
    const accentDistance = Math.abs(item.hue - accentAnchor.hue);

    if (accentKeyword > primaryKeyword) {
      accent.push(item);
    } else if (primaryKeyword > accentKeyword) {
      primary.push(item);
    } else if (accentDistance + 12 < primaryDistance) {
      accent.push(item);
    } else {
      primary.push(item);
    }
  }

  return { primary, accent };
}

function buildColorTokens(rawIndex: RawIndex, options: GroupOptions): TokenTree {
  const candidates: ColorCandidate[] = [];

  for (const entry of rawIndex.entries.filter((item) => item.type === 'color')) {
    if (!prioritizeColor(entry, options)) {
      continue;
    }

    const rgba = normalizeColor(entry.value);
    if (!rgba) continue;

    const saturation = rgbSaturation(rgba);
    const luminance = rgbLuminance(rgba);
    const hue = rgbHue(rgba);

    if (options.profile === 'strict' && (rgba.a < 0.6 || saturation < 0.05)) {
      if (luminance > 245) {
        continue;
      }
    }

    candidates.push({
      entry,
      role: inferColorRole(entry),
      lum: luminance,
      sat: saturation,
      hue,
    });
  }

  const grouped = new Map<SemanticColorRole, ColorCandidate[]>();
  for (const item of candidates) {
    const list = grouped.get(item.role) ?? [];
    list.push(item);
    grouped.set(item.role, list);
  }

  const color: TokenTree = {};
  const scaleLimits = options.profile === 'strict'
    ? { text: 4, surface: 4, border: 3, brand: 4, status: 2 }
    : { text: 5, surface: 5, border: 4, brand: 5, status: 3 };

  const text = grouped.get('text') ?? [];
  const surface = grouped.get('surface') ?? [];
  const border = grouped.get('border') ?? [];
  const brand = grouped.get('brand') ?? [];
  const success = grouped.get('success') ?? [];
  const danger = grouped.get('danger') ?? [];
  const warning = grouped.get('warning') ?? [];
  const info = grouped.get('info') ?? [];

  if (text.length > 0) color.text = toScale(text, scaleLimits.text);
  if (surface.length > 0) color.surface = toScale(surface, scaleLimits.surface);
  if (border.length > 0) color.border = toScale(border, scaleLimits.border);

  const { primary, accent } = choosePrimaryAccent(brand);
  if (primary.length > 0) color.primary = toScale(primary, scaleLimits.brand);
  if (accent.length > 1 || (accent.length === 1 && options.profile !== 'strict')) {
    color.accent = toScale(accent, Math.min(scaleLimits.brand - 1, accent.length));
  }

  const status: TokenTree = {};
  if (success.length > 0) status.success = toScale(success, scaleLimits.status);
  if (danger.length > 0) status.danger = toScale(danger, scaleLimits.status);
  if (warning.length > 0) status.warning = toScale(warning, scaleLimits.status);
  if (info.length > 0) status.info = toScale(info, scaleLimits.status);
  if (Object.keys(status).length > 0) color.status = status;

  return color;
}

function shouldKeepSpaceToken(item: ValCount, options: GroupOptions): boolean {
  if (!item.propertiesHint.some((hint) => SPACE_HINTS.has(hint))) return false;
  const px = toPx(item.value);
  if (px === null || px < 0 || px > (options.profile === 'strict' ? 48 : 64)) return false;
  return item.count >= effectiveMinCount(options) || item.fileCount >= effectiveMinFileCount(options) || item.confidence >= (options.profile === 'strict' ? 0.48 : 0.32);
}

function shouldKeepRadiusToken(item: ValCount, options: GroupOptions): boolean {
  if (!item.propertiesHint.some((hint) => RADIUS_HINTS.has(hint))) return false;
  const parsed = parseLength(item.value);
  if (!parsed) return false;
  if (parsed.unit === '%') {
    return parsed.amount === 50 && item.confidence >= (options.profile === 'strict' ? 0.4 : 0.24);
  }
  const px = toPx(item.value);
  if (px === null || px < 0 || px > (options.profile === 'strict' ? 16 : 24)) return false;
  return item.count >= 1 && item.confidence >= (options.profile === 'strict' ? 0.32 : 0.2);
}

function buildRadiusTokens(items: ValCount[], options: GroupOptions): Record<string, string> {
  const percentValues = items
    .filter((item) => item.value === '50%')
    .sort((a, b) => stableCompare(b.confidence, a.confidence) || stableCompare(a.value, b.value));

  const clustered = clusterLengths(
    items.filter((item) => item.value !== '50%'),
    PREFERRED_RADIUS_PX,
    options.profile === 'strict' ? 0.32 : 0.2,
    options,
  );

  const entries = Object.values(clustered);
  if (percentValues.length > 0 && options.profile !== 'strict') {
    entries.push('50%');
  }

  return entries.reduce<Record<string, string>>((acc, value, index) => {
    acc[String(index)] = value;
    return acc;
  }, {});
}

function buildShadowTokens(rawIndex: RawIndex, options: GroupOptions): Record<string, string> {
  const candidates = byType(rawIndex, 'shadow')
    .filter((item) => {
      if (item.value.includes('var(') || item.value.includes('1000px')) return false;
      if (options.profile === 'strict' && (item.count < effectiveMinCount(options) || item.fileCount < effectiveMinFileCount(options))) {
        return false;
      }
      return item.confidence >= (options.profile === 'strict' ? 0.4 : 0.2);
    })
    .sort((a, b) => {
      return (
        stableCompare(b.confidence, a.confidence) ||
        b.count - a.count ||
        stableCompare(a.value.length, b.value.length) ||
        stableCompare(a.value, b.value)
      );
    })
    .slice(0, options.profile === 'strict' ? 3 : 4);

  const items = candidates.length > 0
    ? candidates
    : options.profile === 'strict'
      ? byType(rawIndex, 'shadow')
          .filter((item) => !item.value.includes('var(') && !item.value.includes('1000px'))
          .sort((a, b) => {
            return (
              stableCompare(b.confidence, a.confidence) ||
              b.count - a.count ||
              stableCompare(a.value.length, b.value.length) ||
              stableCompare(a.value, b.value)
            );
          })
          .slice(0, 2)
      : [];

  return items.reduce<Record<string, string>>((acc, item, index) => {
    acc[String(index + 1)] = item.value;
    return acc;
  }, {});
}

function canonicalizeFontWeight(value: string): string {
  if (value.toLowerCase() === 'bold') return '700';
  return value;
}

function buildTypography(rawIndex: RawIndex, options: GroupOptions): TokenSet['font'] | undefined {
  const fontSizeItems = byType(rawIndex, 'length').filter(
    (item) => item.propertiesHint.includes('font-size') && item.confidence >= (options.profile === 'strict' ? 0.4 : 0.24),
  );
  const familyValues = byType(rawIndex, 'font-family')
    .filter((item) => item.fileCount >= effectiveMinFileCount(options) || item.count >= effectiveMinCount(options))
    .sort((a, b) => {
      return (
        stableCompare(b.confidence, a.confidence) ||
        b.fileCount - a.fileCount ||
        b.count - a.count ||
        stableCompare(a.value, b.value)
      );
    })
    .slice(0, options.profile === 'strict' ? 2 : 3);
  const weightValues = Array.from(
    new Set(
      byType(rawIndex, 'font-weight')
        .filter((item) => item.count >= effectiveMinCount(options) || item.fileCount >= effectiveMinFileCount(options))
        .map((item) => canonicalizeFontWeight(item.value)),
    ),
  ).sort(stableCompare);

  const font: NonNullable<TokenSet['font']> = {};

  const sizeTokens = clusterLengths(
    fontSizeItems,
    PREFERRED_FONT_PX,
    options.profile === 'strict' ? 0.4 : 0.24,
    options,
  );
  if (Object.keys(sizeTokens).length > 0) {
    font.size = sizeTokens;
  }

  if (weightValues.length > 0) {
    font.weight = weightValues.reduce<Record<string, string>>((acc, value) => {
      acc[value] = value;
      return acc;
    }, {});
  }

  if (familyValues.length > 0) {
    font.family = familyValues.reduce<Record<string, string>>((acc, value, index) => {
      acc[String(index)] = value.value;
      return acc;
    }, {});
  }

  if (!font.size && !font.weight && !font.family) {
    return undefined;
  }

  return font;
}

export function groupTokens(rawIndex: RawIndex, inputOptions: Partial<GroupOptions> = {}): TokenSet {
  const options: GroupOptions = {
    profile: inputOptions.profile ?? 'balanced',
    minCount: inputOptions.minCount,
    minFileCount: inputOptions.minFileCount,
  };
  const lengths = byType(rawIndex, 'length');

  const space = clusterLengths(
    lengths.filter((item) => shouldKeepSpaceToken(item, options)),
    PREFERRED_SPACE_PX,
    options.profile === 'strict' ? 0.48 : 0.32,
    options,
  );
  const radius = buildRadiusTokens(lengths.filter((item) => shouldKeepRadiusToken(item, options)), options);

  const tokens: TokenSet = {
    color: buildColorTokens(rawIndex, options),
    space,
    radius,
    shadow: buildShadowTokens(rawIndex, options),
  };

  const font = buildTypography(rawIndex, options);
  if (font) {
    tokens.font = font;
  }

  return tokens;
}
