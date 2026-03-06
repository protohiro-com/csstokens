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
  roleScore: number;
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

interface ColorSignals {
  textHints: number;
  surfaceHints: number;
  borderHints: number;
  brandKeywords: number;
  successKeywords: number;
  dangerKeywords: number;
  warningKeywords: number;
  infoKeywords: number;
  textKeywords: number;
  surfaceKeywords: number;
  borderKeywords: number;
}

function collectColorSignals(entry: RawIndexEntry): ColorSignals {
  const signals: ColorSignals = {
    textHints: 0,
    surfaceHints: 0,
    borderHints: 0,
    brandKeywords: 0,
    successKeywords: 0,
    dangerKeywords: 0,
    warningKeywords: 0,
    infoKeywords: 0,
    textKeywords: 0,
    surfaceKeywords: 0,
    borderKeywords: 0,
  };

  for (const hint of entry.propertiesHint) {
    if (TEXT_COLOR_HINTS.has(hint)) signals.textHints += 1;
    if (SURFACE_COLOR_HINTS.has(hint)) signals.surfaceHints += 1;
    if (BORDER_COLOR_HINTS.has(hint)) signals.borderHints += 1;
  }

  signals.brandKeywords = keywordScore(entry.occurrences, /\b(primary|brand|accent|logo|main|secondary)\b/);
  signals.successKeywords = keywordScore(entry.occurrences, /\b(success|paid|complete|done|positive|approved)\b/);
  signals.dangerKeywords = keywordScore(entry.occurrences, /\b(error|danger|failed|destructive|invalid|negative|critical|cancel)\b/);
  signals.warningKeywords = keywordScore(entry.occurrences, /\b(warning|pending|alert|caution|draft)\b/);
  signals.infoKeywords = keywordScore(entry.occurrences, /\b(info|notice|help|neutral|link)\b/);
  signals.textKeywords = keywordScore(entry.occurrences, /\b(text|label|heading|title|subtitle|caption)\b/);
  signals.surfaceKeywords = keywordScore(entry.occurrences, /\b(background|surface|card|modal|drawer|banner|panel|page|overlay)\b/);
  signals.borderKeywords = keywordScore(entry.occurrences, /\b(border|divider|separator|outline|ring)\b/);

  return signals;
}

function semanticHueMatch(role: Exclude<SemanticColorRole, 'text' | 'surface' | 'border' | 'brand'>, hue: number): boolean {
  if (role === 'success') return hue >= 95 && hue <= 170;
  if (role === 'danger') return hue <= 18 || hue >= 350;
  if (role === 'warning') return hue >= 28 && hue <= 72;
  return hue >= 185 && hue <= 250;
}

function inferColorRole(entry: RawIndexEntry): { role: SemanticColorRole; score: number } {
  const rgba = normalizeColor(entry.value);
  if (!rgba) return { role: 'brand', score: entry.confidence };

  const saturation = rgbSaturation(rgba);
  const luminance = rgbLuminance(rgba);
  const hue = rgbHue(rgba);
  const signals = collectColorSignals(entry);

  if (rgba.a === 0) {
    return { role: 'surface', score: 3 };
  }

  if (saturation < 0.08) {
    if (luminance < 135) return { role: 'text', score: 3.5 };
    if (luminance < 225) return { role: 'border', score: 3 };
    return { role: 'surface', score: 3.5 };
  }

  const roleScores = new Map<SemanticColorRole, number>([
    ['brand', 0],
    ['text', 0],
    ['surface', 0],
    ['border', 0],
    ['success', 0],
    ['danger', 0],
    ['warning', 0],
    ['info', 0],
  ]);

  roleScores.set(
    'text',
    signals.textHints * 3 +
      signals.textKeywords * 1.5 +
      (luminance < 150 ? 1.5 : 0) +
      (saturation < 0.18 ? 0.75 : saturation < 0.28 ? 0 : -2),
  );
  roleScores.set(
    'surface',
    signals.surfaceHints * 3 +
      signals.surfaceKeywords * 1.5 +
      (luminance >= 214 ? 2 : luminance >= 190 ? 1 : -1.5) +
      (saturation <= 0.18 ? 1.25 : saturation <= 0.35 ? 0.25 : -2),
  );
  roleScores.set(
    'border',
    signals.borderHints * 3 +
      signals.borderKeywords * 1.5 +
      (luminance >= 120 && luminance <= 235 ? 1.25 : -0.5) +
      (saturation <= 0.2 ? 1 : saturation <= 0.3 ? 0 : -1.75),
  );

  const semanticBase = saturation >= 0.32 ? 1 : saturation >= 0.2 ? 0.25 : -2.5;
  for (const role of ['success', 'danger', 'warning', 'info'] as const) {
    const keywordWeight =
      role === 'success'
        ? signals.successKeywords
        : role === 'danger'
          ? signals.dangerKeywords
          : role === 'warning'
            ? signals.warningKeywords
            : signals.infoKeywords;
    const hueWeight = semanticHueMatch(role, hue) ? 1.5 : -1.5;
    const lightPenalty = luminance > 236 ? -2 : luminance > 220 ? -1 : 0;
    roleScores.set(role, semanticBase + keywordWeight * 2.25 + hueWeight + lightPenalty);
  }

  roleScores.set(
    'brand',
    signals.brandKeywords * 2.5 +
      (saturation >= 0.3 ? 1.5 : saturation >= 0.2 ? 0.5 : -1.5) +
      (luminance >= 50 && luminance <= 225 ? 0.75 : -0.5) +
      (signals.surfaceHints > 0 && luminance > 220 ? -2 : 0),
  );

  const ordered = Array.from(roleScores.entries()).sort((a, b) => {
    return stableCompare(b[1], a[1]) || stableCompare(a[0], b[0]);
  });

  const [bestRole, bestScore] = ordered[0];
  const secondScore = ordered[1]?.[1] ?? Number.NEGATIVE_INFINITY;

  if (bestRole === 'surface' && saturation > 0.35 && luminance < 214) {
    return { role: 'brand', score: Math.max(bestScore - 0.25, 1) };
  }

  if (bestRole === 'text' && (saturation > 0.18 || luminance > 185)) {
    return { role: 'brand', score: Math.max(roleScores.get('brand') ?? 0, 1) };
  }

  if (bestRole === 'border' && saturation > 0.22) {
    if (luminance > 210) {
      return { role: 'surface', score: roleScores.get('surface') ?? bestScore };
    }
    return { role: 'brand', score: Math.max(roleScores.get('brand') ?? 0, 1) };
  }

  if (
    (bestRole === 'success' || bestRole === 'danger' || bestRole === 'warning' || bestRole === 'info') &&
    bestScore < 2.4
  ) {
    return { role: 'brand', score: roleScores.get('brand') ?? bestScore };
  }

  if (
    bestRole === 'brand' &&
    secondScore > bestScore - 0.4 &&
    (ordered[1]?.[0] === 'surface' || ordered[1]?.[0] === 'text' || ordered[1]?.[0] === 'border')
  ) {
    return { role: ordered[1][0], score: ordered[1][1] };
  }

  return { role: bestRole, score: bestScore };
}

function prioritizeColor(entry: RawIndexEntry, options: GroupOptions): boolean {
  const rgba = normalizeColor(entry.value);
  if (!rgba || rgba.a === 0) {
    return false;
  }

  if (rgba.a < 0.5) {
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
      stableCompare(b.roleScore, a.roleScore) ||
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
  const primaryPool = items.filter(
    (item) => item.hue >= 185 && item.hue <= 250 && item.sat >= 0.25 && item.lum >= 45 && item.lum <= 205,
  );
  const primaryAnchor = (primaryPool.length > 0 ? primaryPool : ordered).sort((a, b) => {
    const aKeyword = brandBucketKeywordScore(a, /\b(primary|brand|main|logo)\b/);
    const bKeyword = brandBucketKeywordScore(b, /\b(primary|brand|main|logo)\b/);
    return (
      stableCompare(bKeyword, aKeyword) ||
      stableCompare((b.hue >= 185 && b.hue <= 250) ? 0 : 1, (a.hue >= 185 && a.hue <= 250) ? 0 : 1) ||
      stableCompare(b.roleScore, a.roleScore) ||
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
        stableCompare((b.hue < 185 || b.hue > 250) ? 0 : 1, (a.hue < 185 || a.hue > 250) ? 0 : 1) ||
        stableCompare(bDistance, aDistance) ||
        stableCompare(b.roleScore, a.roleScore) ||
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
    const matchesPrimaryHue = item.hue >= 185 && item.hue <= 250 && item.sat >= 0.25;
    const matchesAccentHue = (item.hue < 185 || item.hue > 250) && item.sat >= 0.3;
    const anchorIsBlueLed = primaryAnchor.hue >= 185 && primaryAnchor.hue <= 250;

    if (item.entry.value === primaryAnchor.entry.value) {
      primary.push(item);
    } else if (item.entry.value === accentAnchor.entry.value) {
      accent.push(item);
    } else if (anchorIsBlueLed && matchesAccentHue) {
      accent.push(item);
    } else if (accentKeyword > primaryKeyword) {
      accent.push(item);
    } else if (primaryKeyword > accentKeyword) {
      primary.push(item);
    } else if (!matchesPrimaryHue && matchesAccentHue && primaryDistance > 24) {
      accent.push(item);
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

    const inferred = inferColorRole(entry);

    candidates.push({
      entry,
      role: inferred.role,
      lum: luminance,
      sat: saturation,
      hue,
      roleScore: inferred.score,
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
