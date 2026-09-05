import React from 'react';
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

describe('TopologyHostAlertList', () => {
  it('mostra só o host na linha e o problema no hover; o clique foca o host', () => {
    const onFocusHost = vi.fn();
    const { getByLabelText, getByRole } = render(
      <TopologyHostAlertList
        entries={[entry]}
        colorOffline="#c00"
        colorAlert="#f70"
        queryReady
        onFocusHost={onFocusHost}
      />
    );
    const row = getByLabelText(/Ir para host-a/);
    expect(row).toHaveTextContent('host-a');
    expect(row).not.toHaveTextContent('Status da PON 1/4');
    fireEvent.mouseEnter(row);
    expect(getByRole('tooltip')).toHaveTextContent('Status da PON 1/4');
    fireEvent.click(row);
    expect(onFocusHost).toHaveBeenCalledWith(entry);
  });
});
