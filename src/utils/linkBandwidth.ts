/** Capacidade do link em Mbps → rótulo e espessura da linha. */

export type LinkBandwidthUnit = 'mbps' | 'gbps';

function mbpsFromValue(value: number, unit: LinkBandwidthUnit): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return unit === 'gbps' ? value * 1000 : value;
}

export function parseBandwidthInput(value: string, unit: LinkBandwidthUnit): number | undefined {
  const n = Number(value.replace(',', '.').trim());
  if (!Number.isFinite(n) || n <= 0) {
    return undefined;
  }
  return mbpsFromValue(n, unit);
}

export function bandwidthToInput(mbps?: number): { value: string; unit: LinkBandwidthUnit } {
  if (!mbps || mbps <= 0) {
    return { value: '', unit: 'gbps' };
  }
  if (mbps >= 1000 && mbps % 1000 === 0) {
    return { value: String(mbps / 1000), unit: 'gbps' };
  }
  if (mbps >= 1000) {
    const gbps = mbps / 1000;
    return { value: String(Number(gbps.toFixed(2))), unit: 'gbps' };
  }
  return { value: String(Math.round(mbps)), unit: 'mbps' };
}

export function formatLinkBandwidth(mbps?: number): string | undefined {
  if (!mbps || mbps <= 0) {
    return undefined;
  }
  if (mbps >= 1000) {
    const gbps = mbps / 1000;
    const rounded = gbps >= 10 ? Math.round(gbps) : Math.round(gbps * 10) / 10;
    return `${rounded} Gb`;
  }
  return `${Math.round(mbps)} Mb`;
}

/** Espessura sutil em escala log: 1 Gb ≈ base, 10 Gb +~0,6 px, 100 Gb +~1,2 px. */
export function linkStrokeWidth(
  bandwidthMbps: number | undefined,
  baseWidth: number,
  selected: boolean,
  hovered: boolean
): number {
  let width = baseWidth;
  if (bandwidthMbps && bandwidthMbps > 0) {
    const gbps = bandwidthMbps / 1000;
    const extra = Math.log10(Math.max(1, gbps)) * 0.6;
    width = baseWidth + extra;
  }
  if (selected) {
    return width + 1;
  }
  if (hovered) {
    return width + 0.5;
  }
  return width;
}

