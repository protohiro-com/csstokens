function escapeRegex(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

export function globToRegExp(pattern: string): RegExp {
  let out = '^';

  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i];

    if (char === '*') {
      if (pattern[i + 1] === '*') {
        out += '.*';
        i += 1;
      } else {
        out += '[^/]*';
      }
      continue;
    }

    if (char === '?') {
      out += '.';
      continue;
    }

    out += escapeRegex(char);
  }

  out += '$';
  return new RegExp(out, 'i');
}

export function matchAnyPattern(value: string, patterns: string[]): boolean {
  return patterns.some((pattern) => globToRegExp(pattern).test(value));
}
