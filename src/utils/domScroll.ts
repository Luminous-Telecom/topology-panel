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
