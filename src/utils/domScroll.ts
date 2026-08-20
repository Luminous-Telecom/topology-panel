/** Ancestors with overflow auto/scroll (Grafana dashboard/panel scroll containers). */
export function findScrollParents(el: HTMLElement | null): HTMLElement[] {
  const result: HTMLElement[] = [];
  let node = el?.parentElement ?? null;
  while (node) {
    const { overflowY, overflow } = getComputedStyle(node);
    if (/(auto|scroll)/.test(overflowY) || /(auto|scroll)/.test(overflow)) {
      result.push(node);
    }
    node = node.parentElement;
  }
  return result;
}

export function eventTargetsElement(e: Event, target: HTMLElement): boolean {
  return e.composedPath().includes(target);
}

function isScrollableAxis(el: HTMLElement, axis: 'x' | 'y'): boolean {
  const style = getComputedStyle(el);
  const axisOverflow = axis === 'y' ? style.overflowY : style.overflowX;
  const scrollableOverflow =
    axisOverflow === 'auto' ||
    axisOverflow === 'scroll' ||
    style.overflow === 'auto' ||
    style.overflow === 'scroll';
  if (!scrollableOverflow) {
    return false;
  }
  return axis === 'y' ? el.scrollHeight > el.clientHeight : el.scrollWidth > el.clientWidth;
}

function canScrollInDirection(el: HTMLElement, deltaX: number, deltaY: number): boolean {
  const epsilon = 1;
  if (deltaY !== 0 && isScrollableAxis(el, 'y')) {
    if (deltaY < 0 && el.scrollTop > 0) {
      return true;
    }
    if (deltaY > 0 && el.scrollTop + el.clientHeight < el.scrollHeight - epsilon) {
      return true;
    }
  }
  if (deltaX !== 0 && isScrollableAxis(el, 'x')) {
    if (deltaX < 0 && el.scrollLeft > 0) {
      return true;
    }
    if (deltaX > 0 && el.scrollLeft + el.clientWidth < el.scrollWidth - epsilon) {
      return true;
    }
  }
  return false;
}

/** Wheel sobre overlay do mapa (lista de alertas, painel NOC): nunca dar zoom. */
const MAP_WHEEL_OVERLAY_ATTR = 'data-map-wheel-overlay';

/** Wheel sobre lista ou outro overlay rolável: deixa o navegador rolar em vez de dar zoom no mapa. */
export function wheelTargetsScrollableDescendant(e: WheelEvent, boundary: HTMLElement): boolean {
  for (const node of e.composedPath()) {
    if (node === boundary) {
      break;
    }
    if (!(node instanceof HTMLElement)) {
      continue;
    }
    if (node.hasAttribute(MAP_WHEEL_OVERLAY_ATTR)) {
      return true;
    }
    if (canScrollInDirection(node, e.deltaX, e.deltaY)) {
      return true;
    }
  }
  return false;
}
