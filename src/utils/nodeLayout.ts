import { TopologyHostIcon, TopologyPanelOptions } from '../types';
import { HOST_ICON_GAP, HOST_ICON_SIZE, hostIconRenderDimensions } from './hostIcons';
import { resolveNetworkFontSize } from './networkFontSize';

/** Medição de texto e caixa de cada tipo de nó (host, submapa, estático, rede). */

let measureCtx: CanvasRenderingContext2D | null = null;

/**
 * Cache de `measureTextWidth` por texto+fontSize — `nodeLayouts` (TopologyCanvas.tsx) recalcula
 * o layout de todos os nós em todo render (inclui drag/resize preview nas deps), então sem cache
 * o mesmo label/subtítulo é medido no canvas repetidamente a cada frame de arraste. Rótulos de
 * host/rede são um conjunto pequeno e estável por mapa, então um cap simples evita crescimento
 * ilimitado sem precisar de uma LRU real.
 */
const MEASURE_TEXT_CACHE_MAX = 4000;
const measureTextCache = new Map<string, number>();

export function measureTextWidth(text: string, fontSize: number): number {
  if (!text) {
    return 0;
  }
  const cacheKey = `${fontSize}\u0000${text}`;
  const cached = measureTextCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  const width = measureTextWidthUncached(text, fontSize);
  if (measureTextCache.size >= MEASURE_TEXT_CACHE_MAX) {
    const oldestKey = measureTextCache.keys().next().value;
    if (oldestKey !== undefined) {
      measureTextCache.delete(oldestKey);
    }
  }
  measureTextCache.set(cacheKey, width);
  return width;
}

function measureTextWidthUncached(text: string, fontSize: number): number {
  if (typeof document === 'undefined') {
    return text.length * fontSize * 0.55;
  }
  if (!measureCtx) {
    const canvas = document.createElement('canvas');
    measureCtx = canvas.getContext('2d');
  }
  if (!measureCtx) {
    return text.length * fontSize * 0.55;
  }
  measureCtx.font = `${fontSize}px Inter, Helvetica, Arial, sans-serif`;
  return measureCtx.measureText(text).width;
}

export interface NodeLayout {
  w: number;
  h: number;
  label: string;
  sub?: string;
  detailLines?: string[];
  labelFontSize: number;
  subFontSize: number;
  labelY: number;
  subY?: number;
  detailLineYs?: number[];
  /** Centro Y do ícone (relativo ao topo do nó) */
  iconCenterY?: number;
}

interface LayoutNodeRef {
  id: string;
  label?: string;
  subtitle?: string;
  detailLines?: string[];
  width?: number;
  height?: number;
  type?: string;
  icon?: TopologyHostIcon;
}

/** Largura do maior texto do nó (rótulo ou subtítulo). */
function widestText(label: string, sub: string | undefined, fontSize: number, subFontSize: number): number {
  return Math.max(measureTextWidth(label, fontSize), sub ? measureTextWidth(sub, subFontSize) : 0);
}

/** Caixa de submapa / seletor de dashboard — rótulo no topo e subtítulo colado na base. */
function computeBoxedLayout(
  node: LayoutNodeRef,
  fontSize: number,
  subFontSize: number
): NodeLayout {
  const pad = 8;
  const lineGap = 4;
  const label = (node.label ?? '').trim();
  const sub = node.subtitle?.trim();
  const hasTwoLines = Boolean(sub);
  const autoMinW = Math.max(Math.ceil(widestText(label, sub, fontSize, subFontSize) + pad * 2), 80);
  const w = node.width != null ? Math.max(node.width, autoMinW) : autoMinW;
  const autoMinH = hasTwoLines ? pad * 2 + fontSize + lineGap + subFontSize : pad * 2 + fontSize;
  const floorH = Math.max(autoMinH, hasTwoLines ? 44 : 28);
  const h = node.height != null ? Math.max(node.height, floorH) : floorH;

  if (!hasTwoLines) {
    return { w, h, label, labelFontSize: fontSize, subFontSize, labelY: h / 2 };
  }

  return {
    w,
    h,
    label,
    sub,
    labelFontSize: fontSize,
    subFontSize,
    labelY: pad + fontSize / 2,
    subY: h - pad - subFontSize / 2,
  };
}

/** Y do rótulo do host — abaixo do ícone, ou centralizado quando é a única linha. */
function hostLabelY(params: {
  showIcon: boolean;
  hasSub: boolean;
  padY: number;
  iconRowHeight: number;
  fontSize: number;
  h: number;
}): number {
  if (params.showIcon) {
    return params.padY + params.iconRowHeight + params.fontSize / 2;
  }
  if (params.hasSub) {
    return params.padY + params.fontSize / 2;
  }
  return params.h / 2;
}

function computeHostLayout(
  node: LayoutNodeRef,
  options: Pick<TopologyPanelOptions, 'nodeFontSize' | 'showSubtitle'>,
  fontSize: number,
  subFontSize: number
): NodeLayout {
  const padX = 10;
  const padY = 6;
  const lineGap = 3;
  const label = (node.label ?? '').trim();
  const sub = options.showSubtitle && node.subtitle ? node.subtitle.trim() : undefined;
  const detailLines = (node.detailLines ?? []).filter((line) => line.trim()).slice(0, 3);
  const detailFontSize = Math.max(8, subFontSize - 1);
  const showIcon =
    node.type !== 'submap' &&
    node.type !== 'static' &&
    node.type !== 'network' &&
    node.type !== 'dashboard_picker' &&
    Boolean(node.icon);
  const iconDims =
    showIcon && node.icon ? hostIconRenderDimensions(node.icon) : { w: HOST_ICON_SIZE, h: HOST_ICON_SIZE };
  const iconSize = iconDims.h;
  const iconRowHeight = showIcon ? iconSize + HOST_ICON_GAP : 0;

  const contentW = Math.max(
    measureTextWidth(label, fontSize),
    sub ? measureTextWidth(sub, subFontSize) : 0,
    ...detailLines.map((line) => measureTextWidth(line, detailFontSize))
  );
  const w = Math.max(Math.ceil(contentW + padX * 2), showIcon ? iconDims.w + padX * 2 : 48);
  const detailBlockH =
    detailLines.length > 0 ? detailLines.length * detailFontSize + (detailLines.length - 1) * lineGap : 0;
  const textBlockH =
    fontSize + (sub ? lineGap + subFontSize : 0) + (detailBlockH ? lineGap + detailBlockH : 0);
  const h = Math.max(Math.ceil(padY * 2 + iconRowHeight + textBlockH), showIcon ? iconSize + 32 : 24);

  const iconCenterY = showIcon ? padY + iconSize / 2 : undefined;
  const labelY = hostLabelY({ showIcon, hasSub: Boolean(sub || detailLines.length), padY, iconRowHeight, fontSize, h });
  let cursorY = padY + iconRowHeight + fontSize / 2;
  if (showIcon) {
    cursorY = labelY;
  }
  const subY = sub
    ? (() => {
        const y = cursorY + fontSize / 2 + lineGap + subFontSize / 2;
        return y;
      })()
    : undefined;
  if (sub) {
    cursorY = (subY ?? cursorY) + subFontSize / 2;
  }
  const detailLineYs = detailLines.map((_, index) => {
    const y = cursorY + lineGap + detailFontSize / 2 + index * (detailFontSize + lineGap);
    return y;
  });

  return {
    w,
    h,
    label,
    sub,
    detailLines: detailLines.length ? detailLines : undefined,
    labelFontSize: fontSize,
    subFontSize,
    detailLineYs: detailLineYs.length ? detailLineYs : undefined,
    labelY,
    subY,
    iconCenterY,
  };
}

export function computeNodeLayout(
  node: LayoutNodeRef,
  options: Pick<TopologyPanelOptions, 'nodeFontSize' | 'showSubtitle'>
): NodeLayout {
  const fontSize = options.nodeFontSize;
  const subFontSize = Math.max(9, fontSize - 2);

  if (node.type === 'submap' || node.type === 'dashboard_picker') {
    return computeBoxedLayout(node, fontSize, subFontSize);
  }
  return computeHostLayout(node, options, fontSize, subFontSize);
}

export const DEFAULT_STATIC_WIDTH = 120;
export const DEFAULT_STATIC_HEIGHT = 36;

export function computeStaticLayout(
  node: {
    id: string;
    label?: string;
    subtitle?: string;
    width?: number;
    height?: number;
    fontSize?: number;
  },
  options: Pick<TopologyPanelOptions, 'nodeFontSize' | 'showSubtitle'>
): NodeLayout {
  const labelFontSize = node.fontSize ?? options.nodeFontSize;
  const subFontSize = Math.max(9, labelFontSize - 2);
  const padX = 10;
  const padY = 6;
  const lineGap = 3;
  const label = (node.label ?? '').trim();
  const sub = options.showSubtitle && node.subtitle ? node.subtitle.trim() : undefined;

  const contentW = widestText(label, sub, labelFontSize, subFontSize);
  const autoW = Math.max(Math.ceil(contentW + padX * 2), 48);
  const autoH = sub
    ? Math.max(Math.ceil(padY * 2 + labelFontSize + lineGap + subFontSize), 28)
    : Math.max(Math.ceil(padY * 2 + labelFontSize), 24);

  const w = node.width ?? autoW;
  const h = node.height ?? autoH;
  const labelY = sub ? padY + labelFontSize / 2 : h / 2;
  const subY = sub ? h - padY - subFontSize / 2 : undefined;

  return { w, h, label, sub, labelFontSize, subFontSize, labelY, subY };
}

export const DEFAULT_NETWORK_WIDTH = 220;
export const DEFAULT_NETWORK_HEIGHT = 140;

export function computeNetworkLayout(
  node: { id: string; label?: string; width?: number; height?: number },
  options: Pick<TopologyPanelOptions, 'networkFontSize' | 'nodeFontSize'>
): NodeLayout {
  const fontSize = resolveNetworkFontSize(options);
  const pad = 8;
  const w = node.width ?? DEFAULT_NETWORK_WIDTH;
  const h = node.height ?? DEFAULT_NETWORK_HEIGHT;
  const label = (node.label ?? '').trim();
  return {
    w,
    h,
    label,
    subFontSize: fontSize,
    labelFontSize: fontSize,
    labelY: pad + fontSize / 2,
  };
}
