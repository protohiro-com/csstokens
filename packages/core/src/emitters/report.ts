import { RawIndex, RawIndexEntry, TokenSet } from '../model/types';
import { normalizeColor } from '../utils/normalizeColor';
import { stableCompare } from '../utils/sortStable';

interface ColorCluster {
  anchor: string;
  members: string[];
  totalCount: number;
}

function topValues(entries: RawIndexEntry[], type: RawIndexEntry['type']): RawIndexEntry[] {
  return entries
    .filter((entry) => entry.type === type)
    .sort((a, b) => {
      return (
        stableCompare(b.confidence, a.confidence) ||
        b.count - a.count ||
        b.fileCount - a.fileCount ||
        stableCompare(a.value, b.value)
      );
    })
    .slice(0, 10);
}

function colorDistance(a: string, b: string): number | null {
  const left = normalizeColor(a);
  const right = normalizeColor(b);
  if (!left || !right) return null;

  return (
    Math.abs(left.r - right.r) +
    Math.abs(left.g - right.g) +
    Math.abs(left.b - right.b) +
    Math.abs(left.a - right.a) * 255
  );
}

function clusterNearDuplicateColors(rawIndex: RawIndex): ColorCluster[] {
  const colorEntries = rawIndex.entries
    .filter((entry) => entry.type === 'color' && entry.confidence >= 0.18)
    .sort((a, b) => b.count - a.count || stableCompare(a.value, b.value));

  const visited = new Set<string>();
  const clusters: ColorCluster[] = [];

  for (const entry of colorEntries) {
    if (visited.has(entry.value)) {
      continue;
    }

    const members = [entry.value];
    let totalCount = entry.count;
    visited.add(entry.value);

    for (const candidate of colorEntries) {
      if (visited.has(candidate.value) || candidate.value === entry.value) {
        continue;
      }

      const distance = colorDistance(entry.value, candidate.value);
      if (distance !== null && distance <= 22) {
        members.push(candidate.value);
        totalCount += candidate.count;
        visited.add(candidate.value);
      }
    }

    if (members.length > 1) {
      clusters.push({
        anchor: entry.value,
        members: members.sort(stableCompare),
        totalCount,
      });
    }
  }

  return clusters.sort((a, b) => b.totalCount - a.totalCount || stableCompare(a.anchor, b.anchor));
}

function countByType(rawIndex: RawIndex): Record<string, number> {
  const out: Record<string, number> = {};

  for (const entry of rawIndex.entries) {
    out[entry.type] = (out[entry.type] ?? 0) + entry.count;
  }

  return out;
}

function renderTop(entries: RawIndexEntry[], type: RawIndexEntry['type']): string {
  const list = topValues(entries, type);
  if (list.length === 0) return '- none';

  return list
    .map((entry) => {
      return `- \`${entry.value}\` (count: ${entry.count}, files: ${entry.fileCount}, confidence: ${entry.confidence.toFixed(2)})`;
    })
    .join('\n');
}

function tokenSummary(tokens?: TokenSet): string[] {
  if (!tokens) return [];

  const lines = ['## Token candidates'];
  lines.push(`- Color groups: ${Object.keys(tokens.color).length}`);
  lines.push(`- Space tokens: ${Object.keys(tokens.space).length}`);
  lines.push(`- Radius tokens: ${Object.keys(tokens.radius).length}`);
  lines.push(`- Shadow tokens: ${Object.keys(tokens.shadow).length}`);
  if (tokens.font) {
    lines.push(`- Font token sections: ${Object.keys(tokens.font).length}`);
  }
  return lines;
}

export function emitReport(rawIndex: RawIndex, tokens?: TokenSet): string {
  const counts = countByType(rawIndex);
  const clusters = clusterNearDuplicateColors(rawIndex);
  const uniqueColors = rawIndex.entries.filter((entry) => entry.type === 'color').length;

  const lines: string[] = [
    '# csstokens report',
    '',
    '## Summary',
    `- Files scanned: ${rawIndex.filesScanned}`,
    `- Files analyzed: ${rawIndex.filesAnalyzed}`,
    `- Files matched by ranking ignore rules: ${rawIndex.filesIgnored}`,
    `- Entries: ${rawIndex.entries.length}`,
    `- Color occurrences: ${counts['color'] ?? 0}`,
    `- Length occurrences: ${counts['length'] ?? 0}`,
    `- Shadow occurrences: ${counts['shadow'] ?? 0}`,
    `- CSS var definition occurrences: ${counts['css-var-def'] ?? 0}`,
    `- CSS var usage occurrences: ${counts['css-var-use'] ?? 0}`,
    '',
    '## Top 10 by type',
    '',
    '### color',
    renderTop(rawIndex.entries, 'color'),
    '',
    '### length',
    renderTop(rawIndex.entries, 'length'),
    '',
    '### shadow',
    renderTop(rawIndex.entries, 'shadow'),
    '',
    '## Near-duplicate color clusters',
  ];

  if (clusters.length === 0) {
    lines.push('- none');
  } else {
    for (const cluster of clusters.slice(0, 10)) {
      const preview = cluster.members.slice(0, 6).join(' / ');
      const suffix = cluster.members.length > 6 ? ` / ... +${cluster.members.length - 6} more` : '';
      lines.push(`- ${preview}${suffix} (combined count: ${cluster.totalCount})`);
    }
  }

  lines.push('', '## Recommendations');
  lines.push(`- Detected ${uniqueColors} unique normalized colors in analyzed files.`);
  if (clusters.length > 0) {
    lines.push(`- Found ${clusters.length} color clusters that look mergeable.`);
  }
  if (rawIndex.filesIgnored > 0) {
    lines.push('- Ranking ignore rules affected token candidate selection, but raw analysis still includes those files.');
  }
  if (!tokens?.font) {
    lines.push('- Typography tokens were omitted or not detected in this run.');
  }

  const tokenLines = tokenSummary(tokens);
  if (tokenLines.length > 0) {
    lines.push('', ...tokenLines);
  }

  return `${lines.join('\n')}\n`;
}
