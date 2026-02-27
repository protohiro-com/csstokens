export function stableCompare(a: string | number, b: string | number): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function sortObjectDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => sortObjectDeep(item)) as T;
  }

  if (value !== null && typeof value === 'object') {
    const sortedEntries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => stableCompare(a, b))
      .map(([key, val]) => [key, sortObjectDeep(val)]);

    return Object.fromEntries(sortedEntries) as T;
  }

  return value;
}

export function toPosixPath(path: string): string {
  return path.replace(/\\/g, '/');
}
