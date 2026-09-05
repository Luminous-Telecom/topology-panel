import React, { MutableRefObject } from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { defaultOptions, TopologyLink, TopologyNode } from '../../types';
import { NodeLayout } from '../../utils/nodeLayout';
import { LinksLayer } from './LinksLayer';

const linkLineRenders = vi.hoisted(() => ({ n: 0 }));

vi.mock('./links/LinkLine', () => ({
  LinkLine: () => {
    linkLineRenders.n += 1;
    return null;
  },
}));

vi.mock('./links/LinkTrafficLabel', () => ({
  LinkTrafficOverlay: () => null,
}));

function layout(id: string, x: number, y: number): NodeLayout & TopologyNode {
  return {
    id,
    type: 'host',
    x,
    y,
    w: 48,
    h: 28,
    width: 48,
    height: 28,
    label: id,
    labelFontSize: 12,
    subFontSize: 10,
    labelY: 14,
  };
}

describe('LinksLayer', () => {
  const link: TopologyLink = { from: 'host-a', to: 'host-b' };
  const nodeLayouts = new Map<string, NodeLayout & TopologyNode>([
    ['host-a', layout('host-a', 80, 80)],
    ['host-b', layout('host-b', 400, 80)],
  ]);
  const interactionRef = { current: { editable: true, panTool: false } } as MutableRefObject<{
    editable: boolean;
    panTool: boolean;
  }>;

  const baseProps = {
    renderLinks: [{ link, key: 'host-a->host-b', bundleOffset: 0 }],
    nodeLayouts,
    options: defaultOptions(),
    interactionRef,
    selectedLink: null,
    hoveredLinkKey: null,
    setHoveredLinkKey: () => {},
    resolveLinkWaypoints: () => [],
    linkPaintMetricsByLink: {},
    onLinkSelect: () => {},
    onLinkContextMenu: () => {},
    beginPan: () => {},
    beginWaypointDragFromPath: () => {},
    removeWaypointNearPointer: () => {},
  };

  it('re-renderiza quando só dragPreview de waypoint muda', () => {
    const { rerender } = render(<LinksLayer {...baseProps} dragPreview={null} />);
    linkLineRenders.n = 0;
    rerender(
      <LinksLayer
        {...baseProps}
        dragPreview={{ linkWaypoints: { key: 'host-a->host-b', waypoints: [{ x: 240, y: 200 }] } }}
      />
    );
    expect(linkLineRenders.n).toBe(1);
  });

  it('re-renderiza quando nodeLayouts muda no arraste de nó', () => {
    const { rerender } = render(<LinksLayer {...baseProps} dragPreview={null} />);
    linkLineRenders.n = 0;
    const moved = new Map(nodeLayouts);
    moved.set('host-a', { ...layout('host-a', 80, 80), x: 120, y: 100 });
    rerender(<LinksLayer {...baseProps} nodeLayouts={moved} dragPreview={{ positions: { 'host-a': { x: 120, y: 100 } } }} />);
    expect(linkLineRenders.n).toBe(1);
  });
});
