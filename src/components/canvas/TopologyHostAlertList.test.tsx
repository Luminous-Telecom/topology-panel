import React, { useLayoutEffect, useRef, useState } from 'react';
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TopologyHostAlertList } from './TopologyHostAlertList';
import { HostAlertListEntry } from '../../utils/noc/topologyFilters';

const entry: HostAlertListEntry = {
  nodeId: 'n1',
  mapId: 'root',
  mapLabel: 'Início',
  label: 'host-a',
  reason: 'alert',
  problems: ['Status da PON 1/4'],
};

function CanvasStub({ width, children }: { width: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) {
      Object.defineProperty(el, 'clientWidth', { configurable: true, value: width });
    }
    setReady(true);
  }, [width]);
  return (
    <div data-topology-canvas ref={ref}>
      {ready ? children : null}
    </div>
  );
}

function renderList(canvasWidth: number, onFocusHost = vi.fn()) {
  const { getByLabelText, getByRole, queryByRole } = render(
    <CanvasStub width={canvasWidth}>
      <TopologyHostAlertList
        entries={[entry]}
        colorOffline="#c00"
        colorAlert="#f70"
        queryReady
        onFocusHost={onFocusHost}
      />
    </CanvasStub>
  );
  return { getByLabelText, getByRole, queryByRole, onFocusHost };
}

describe('TopologyHostAlertList', () => {
  it('no painel estreito o primeiro clique mostra o alerta e o segundo foca o host', () => {
    const { getByLabelText, getByRole, queryByRole, onFocusHost } = renderList(400);
    const row = getByLabelText(/Ir para host-a/);
    expect(row).not.toHaveTextContent('Status da PON 1/4');
    fireEvent.click(row);
    expect(onFocusHost).not.toHaveBeenCalled();
    expect(getByRole('tooltip')).toHaveTextContent('Status da PON 1/4');
    fireEvent.click(row);
    expect(onFocusHost).toHaveBeenCalledWith(entry);
    expect(queryByRole('tooltip')).toBeTruthy();
  });

  it('no painel largo o clique foca o host na hora', () => {
    const { getByLabelText, onFocusHost } = renderList(900);
    fireEvent.click(getByLabelText(/Ir para host-a/));
    expect(onFocusHost).toHaveBeenCalledWith(entry);
  });
});
