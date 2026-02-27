export function toPosix(value: string): string {
  return value.replace(/\\/g, '/');
}
