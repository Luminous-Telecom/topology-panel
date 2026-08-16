/** Luminância relativa (0–1) para contraste de texto sobre o fundo do card. */
function channel(value: number): number {
  const v = value / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function luminance(r: number, g: number, b: number): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function parseHex(hex: string): [number, number, number] | null {
  const m = hex.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) {
    return null;
  }
  let h = m[1];
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  }
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function parseRgb(value: string): [number, number, number] | null {
  const m = value
    .trim()
    .match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (!m) {
    return null;
  }
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function parseCssColor(value: string): [number, number, number] | null {
  if (!value?.trim()) {
    return null;
  }
  return parseHex(value) ?? parseRgb(value);
}

/** Texto branco vs preto: mesmo contraste em luminância ≈ 0.179 (WCAG). */
export function isDarkBackground(fill: string): boolean {
  const rgb = parseCssColor(fill);
  if (!rgb) {
    return true;
  }
  return luminance(...rgb) < 0.179;
}

export function textOnBackground(fill: string): string {
  return isDarkBackground(fill) ? '#ffffff' : '#1a1a1a';
}
