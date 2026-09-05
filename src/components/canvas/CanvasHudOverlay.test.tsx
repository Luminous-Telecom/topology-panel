import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CanvasHudOverlay } from './CanvasHudOverlay';
import { emptyMap } from '../../utils/testMapFixtures';

vi.mock('../TopologyMinimap', () => ({
  TopologyMinimap: () => <div data-testid="topology-minimap">mini mapa</div>,
}));

vi.mock('./TopologyColorLegend', () => ({
  TopologyColorLegend: () => null,
}));

describe('CanvasHudOverlay', () => {
  it('coloca o mini mapa acima da lista de hosts com alerta', () => {
    const { getByTestId, getByText } = render(
      <CanvasHudOverlay
        showMinimap
        map={emptyMap()}
        links={[]}
        nodeLayouts={new Map()}
        view={{ scale: 1, x: 0, y: 0 }}
        viewport={{ w: 800, h: 600 }}
        onViewChange={() => undefined}
        resolveNodeFill={() => '#000'}
        resolveNetworkStroke={() => '#000'}
        linkColor="#888"
        showLegend={false}
        legendItems={[]}
        contextMenu={null}
        onCloseContextMenu={() => undefined}
        canvasMenuItems={() => []}
        nodeMenuItems={() => []}
        linkMenuItems={() => []}
        alertList={<div>Hosts com alerta (1)</div>}
      />
    );

    const dock = getByTestId('topology-minimap').parentElement;
    expect(dock).not.toBeNull();
    const children = Array.from(dock!.children);
    expect(children[0]).toBe(getByTestId('topology-minimap'));
    expect(children[1]).toBe(getByText('Hosts com alerta (1)'));
  });
});
