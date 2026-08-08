export type AlignGuideKind = 'align' | 'center';

export interface AlignGuideLine {
  orientation: 'h' | 'v';
  /** Posição fixa: y para horizontal, x para vertical */
  position: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kind: AlignGuideKind;
}

export interface AlignGuideNode {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  type?: string;
}

interface ComputeAlignGuidesInput {
  dragged: AlignGuideNode;
  others: AlignGuideNode[];
  bounds: { x0: number; y0: number; x1: number; y1: number };
  threshold?: number;
}

function anchors(n: Pick<AlignGuideNode, 'x' | 'y' | 'w' | 'h'>) {
  return {
    left: n.x,
    hCenter: n.x + n.w / 2,
    right: n.x + n.w,
    top: n.y,
    vCenter: n.y + n.h / 2,
    bottom: n.y + n.h,
  };
}

function near(a: number, b: number, threshold: number): boolean {
  return Math.abs(a - b) <= threshold;
}

function pushVertical(
  guides: AlignGuideLine[],
  seen: Set<string>,
  bounds: ComputeAlignGuidesInput['bounds'],
  x: number,
  kind: AlignGuideKind
) {
  const key = `v:${Math.round(x * 10)}:${kind}`;
  if (seen.has(key)) {
    return;
  }
  seen.add(key);
  guides.push({
    orientation: 'v',
    position: x,
    x1: x,
    y1: bounds.y0,
    x2: x,
    y2: bounds.y1,
    kind,
  });
}

function pushHorizontal(
  guides: AlignGuideLine[],
  seen: Set<string>,
  bounds: ComputeAlignGuidesInput['bounds'],
  y: number,
  kind: AlignGuideKind
) {
  const key = `h:${Math.round(y * 10)}:${kind}`;
  if (seen.has(key)) {
    return;
  }
  seen.add(key);
  guides.push({
    orientation: 'h',
    position: y,
    x1: bounds.x0,
    y1: y,
    x2: bounds.x1,
    y2: y,
    kind,
  });
}

/** Guias estilo Photoshop — alinhamento entre nós e centro de redes. */
export function computeAlignGuides(input: ComputeAlignGuidesInput): AlignGuideLine[] {
  const { dragged, others, bounds, threshold = 8 } = input;
  const d = anchors(dragged);
  const guides: AlignGuideLine[] = [];
  const seenV = new Set<string>();
  const seenH = new Set<string>();

  for (const other of others) {
    if (other.id === dragged.id) {
      continue;
    }
    const o = anchors(other);
    const isNetwork = other.type === 'network';
    const centerKind: AlignGuideKind = isNetwork ? 'center' : 'align';

    if (near(d.hCenter, o.hCenter, threshold)) {
      pushVertical(guides, seenV, bounds, (d.hCenter + o.hCenter) / 2, centerKind);
    }
    if (near(d.vCenter, o.vCenter, threshold)) {
      pushHorizontal(guides, seenH, bounds, (d.vCenter + o.vCenter) / 2, centerKind);
    }

    if (!isNetwork) {
      if (near(d.left, o.left, threshold)) {
        pushVertical(guides, seenV, bounds, (d.left + o.left) / 2, 'align');
      }
      if (near(d.right, o.right, threshold)) {
        pushVertical(guides, seenV, bounds, (d.right + o.right) / 2, 'align');
      }
      if (near(d.top, o.top, threshold)) {
        pushHorizontal(guides, seenH, bounds, (d.top + o.top) / 2, 'align');
      }
      if (near(d.bottom, o.bottom, threshold)) {
        pushHorizontal(guides, seenH, bounds, (d.bottom + o.bottom) / 2, 'align');
      }
      if (near(d.left, o.right, threshold)) {
        pushVertical(guides, seenV, bounds, (d.left + o.right) / 2, 'align');
      }
      if (near(d.right, o.left, threshold)) {
        pushVertical(guides, seenV, bounds, (d.right + o.left) / 2, 'align');
      }
      if (near(d.top, o.bottom, threshold)) {
        pushHorizontal(guides, seenH, bounds, (d.top + o.bottom) / 2, 'align');
      }
      if (near(d.bottom, o.top, threshold)) {
        pushHorizontal(guides, seenH, bounds, (d.bottom + o.top) / 2, 'align');
      }
    }
  }

  return guides;
}
