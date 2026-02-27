export interface RgbaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

const HEX_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB_PATTERN = /^rgba?\((.+)\)$/i;
const HSL_PATTERN = /^hsla?\((.+)\)$/i;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundAlpha(alpha: number): number {
  return Math.round(alpha * 1000) / 1000;
}

function parseNumber(value: string): number | null {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePercentOrNumber(value: string, max: number): number | null {
  const trimmed = value.trim();
  if (trimmed.includes('var(') || trimmed.includes('calc(')) {
    return null;
  }

  if (trimmed.endsWith('%')) {
    const parsed = parseNumber(trimmed.slice(0, -1));
    if (parsed === null) return null;
    return clamp((parsed / 100) * max, 0, max);
  }

  const parsed = parseNumber(trimmed);
  if (parsed === null) return null;
  return clamp(parsed, 0, max);
}

function parseAlpha(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.includes('var(') || trimmed.includes('calc(')) {
    return null;
  }

  if (trimmed.endsWith('%')) {
    const parsed = parseNumber(trimmed.slice(0, -1));
    if (parsed === null) return null;
    return clamp(parsed / 100, 0, 1);
  }

  const parsed = parseNumber(trimmed);
  if (parsed === null) return null;
  return clamp(parsed, 0, 1);
}

function parseHex(input: string): RgbaColor | null {
  const match = input.match(HEX_PATTERN);
  if (!match) return null;

  const raw = match[1];
  if (raw.length === 3 || raw.length === 4) {
    const r = parseInt(raw[0] + raw[0], 16);
    const g = parseInt(raw[1] + raw[1], 16);
    const b = parseInt(raw[2] + raw[2], 16);
    const a = raw.length === 4 ? parseInt(raw[3] + raw[3], 16) / 255 : 1;
    return { r, g, b, a: roundAlpha(a) };
  }

  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  const a = raw.length === 8 ? parseInt(raw.slice(6, 8), 16) / 255 : 1;
  return { r, g, b, a: roundAlpha(a) };
}

function splitFunctionArgs(input: string): string[] | null {
  const normalized = input.trim().replace(/\s*\/\s*/g, ' / ');
  if (normalized.includes(',')) {
    return normalized.split(',').map((part) => part.trim());
  }

  const parts = normalized.split(/\s+/).filter(Boolean);
  return parts.length > 0 ? parts : null;
}

function parseRgb(input: string): RgbaColor | null {
  const match = input.match(RGB_PATTERN);
  if (!match) return null;

  const parts = splitFunctionArgs(match[1]);
  if (!parts) return null;

  let alphaPart: string | undefined;
  let channels = parts;

  const slashIndex = parts.indexOf('/');
  if (slashIndex >= 0) {
    channels = parts.slice(0, slashIndex);
    alphaPart = parts[slashIndex + 1];
  } else if (parts.length === 4) {
    channels = parts.slice(0, 3);
    alphaPart = parts[3];
  }

  if (channels.length !== 3) return null;

  const r = parsePercentOrNumber(channels[0], 255);
  const g = parsePercentOrNumber(channels[1], 255);
  const b = parsePercentOrNumber(channels[2], 255);
  const a = alphaPart ? parseAlpha(alphaPart) : 1;

  if (r === null || g === null || b === null || a === null) {
    return null;
  }

  return {
    r: Math.round(r),
    g: Math.round(g),
    b: Math.round(b),
    a: roundAlpha(a),
  };
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const hue = ((h % 360) + 360) % 360;
  const sat = clamp(s, 0, 1);
  const light = clamp(l, 0, 1);

  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light - c / 2;

  let rPrime = 0;
  let gPrime = 0;
  let bPrime = 0;

  if (hue < 60) {
    rPrime = c;
    gPrime = x;
  } else if (hue < 120) {
    rPrime = x;
    gPrime = c;
  } else if (hue < 180) {
    gPrime = c;
    bPrime = x;
  } else if (hue < 240) {
    gPrime = x;
    bPrime = c;
  } else if (hue < 300) {
    rPrime = x;
    bPrime = c;
  } else {
    rPrime = c;
    bPrime = x;
  }

  return {
    r: Math.round((rPrime + m) * 255),
    g: Math.round((gPrime + m) * 255),
    b: Math.round((bPrime + m) * 255),
  };
}

function parseHsl(input: string): RgbaColor | null {
  const match = input.match(HSL_PATTERN);
  if (!match) return null;

  const parts = splitFunctionArgs(match[1]);
  if (!parts) return null;

  let alphaPart: string | undefined;
  let channels = parts;

  const slashIndex = parts.indexOf('/');
  if (slashIndex >= 0) {
    channels = parts.slice(0, slashIndex);
    alphaPart = parts[slashIndex + 1];
  } else if (parts.length === 4) {
    channels = parts.slice(0, 3);
    alphaPart = parts[3];
  }

  if (channels.length !== 3) return null;

  const h = parseNumber(channels[0]);
  const s = parsePercentOrNumber(channels[1], 100);
  const l = parsePercentOrNumber(channels[2], 100);
  const a = alphaPart ? parseAlpha(alphaPart) : 1;
  if (h === null || s === null || l === null || a === null) {
    return null;
  }

  const rgb = hslToRgb(h, s / 100, l / 100);
  return { ...rgb, a: roundAlpha(a) };
}

export function normalizeColor(input: string): RgbaColor | null {
  const value = input.trim().toLowerCase();
  return parseHex(value) ?? parseRgb(value) ?? parseHsl(value);
}

function toHex(value: number): string {
  return value.toString(16).padStart(2, '0');
}

export function toCanonicalColor(input: string): string | null {
  const color = normalizeColor(input);
  if (!color) return null;

  if (color.a === 1) {
    return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
  }

  return `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})`;
}

export function rgbLuminance({ r, g, b }: RgbaColor): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function rgbHue({ r, g, b }: RgbaColor): number {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  if (delta === 0) return 0;

  let hue = 0;
  if (max === rn) {
    hue = ((gn - bn) / delta) % 6;
  } else if (max === gn) {
    hue = (bn - rn) / delta + 2;
  } else {
    hue = (rn - gn) / delta + 4;
  }

  return Math.round(((hue * 60) + 360) % 360);
}

export function rgbSaturation({ r, g, b }: RgbaColor): number {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const light = (max + min) / 2;

  if (max === min) return 0;
  const delta = max - min;
  return delta / (1 - Math.abs(2 * light - 1));
}
