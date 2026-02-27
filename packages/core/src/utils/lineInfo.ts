export function getLineAndColumn(content: string, index: number): { line: number; column: number } {
  const start = Math.max(0, Math.min(index, content.length));
  const chunk = content.slice(0, start);
  const lines = chunk.split(/\r?\n/);
  const line = lines.length;
  const column = lines[lines.length - 1].length + 1;
  return { line, column };
}

export function getLineSnippet(content: string, line: number): string {
  const lines = content.split(/\r?\n/);
  return (lines[line - 1] ?? '').trim();
}
