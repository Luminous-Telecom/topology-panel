import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TopologyNocPanel } from './TopologyNocPanel';

describe('TopologyNocPanel', () => {
  it('abre o filtro Status com Offline, Online e Alerta', () => {
    const onToggle = vi.fn();
    const { getByLabelText, getByRole, queryByRole } = render(
      <TopologyNocPanel
        entries={[]}
        filterIds={['offline', 'online', 'alert', 'nodata', 'congestedLinks', 'camera']}
        activeFilters={new Set()}
        queryReady
        onToggleFilter={onToggle}
        onSelectHost={() => undefined}
      />
    );

    expect(queryByRole('listbox', { name: 'Status' })).toBeNull();
    fireEvent.click(getByLabelText('Filtro Status'));
    const menu = getByRole('listbox', { name: 'Status' });
    expect(menu).toHaveTextContent('Offline');
    expect(menu).toHaveTextContent('Online');
    expect(menu).toHaveTextContent('Alerta');
    expect(menu).toHaveTextContent('Sem dados');
    expect(menu).not.toHaveTextContent('DOWN');

    fireEvent.click(getByRole('button', { name: 'Offline' }));
    expect(onToggle).toHaveBeenCalledWith('offline');
  });

  it('lista capacidades no menu Links', () => {
    const { getByLabelText, getByRole } = render(
      <TopologyNocPanel
        entries={[]}
        filterIds={['congestedLinks', 'link1g', 'link10g', 'link40g', 'link100g']}
        activeFilters={new Set()}
        queryReady
        onToggleFilter={() => undefined}
        onSelectHost={() => undefined}
      />
    );

    fireEvent.click(getByLabelText('Filtro Links'));
    const menu = getByRole('listbox', { name: 'Links' });
    expect(menu).toHaveTextContent('Congestionados');
    expect(menu).toHaveTextContent('1 Gb');
    expect(menu).toHaveTextContent('10 Gb');
    expect(menu).toHaveTextContent('40 Gb');
    expect(menu).toHaveTextContent('100 Gb');
  });

  it('lista os submapas no menu Submapa', () => {
    const onToggle = vi.fn();
    const { getByLabelText, getByRole } = render(
      <TopologyNocPanel
        entries={[]}
        filterIds={['offline', 'submap:filial', 'submap:root']}
        activeFilters={new Set()}
        queryReady
        onToggleFilter={onToggle}
        onSelectHost={() => undefined}
        filterLabels={{ 'submap:filial': 'Filial', 'submap:root': 'Início' }}
      />
    );

    fireEvent.click(getByLabelText('Filtro Submapa'));
    const menu = getByRole('listbox', { name: 'Submapa' });
    expect(menu).toHaveTextContent('Filial');
    expect(menu).toHaveTextContent('Início');
    fireEvent.click(getByRole('button', { name: 'Filial' }));
    expect(onToggle).toHaveBeenCalledWith('submap:filial');
  });

  it('fecha o menu de filtro ao clicar fora', () => {
    const { getByLabelText, getByRole, queryByRole } = render(
      <TopologyNocPanel
        entries={[]}
        filterIds={['offline', 'online', 'alert']}
        activeFilters={new Set()}
        queryReady
        onToggleFilter={() => undefined}
        onSelectHost={() => undefined}
      />
    );

    fireEvent.click(getByLabelText('Filtro Status'));
    expect(getByRole('listbox', { name: 'Status' })).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(queryByRole('listbox', { name: 'Status' })).toBeNull();
  });

  it('mostra o rótulo da opção ativa no botão do filtro', () => {
    const { getByLabelText } = render(
      <TopologyNocPanel
        entries={[]}
        filterIds={['offline', 'online', 'alert']}
        activeFilters={new Set(['alert'])}
        queryReady
        onToggleFilter={() => undefined}
        onSelectHost={() => undefined}
      />
    );

    expect(getByLabelText('Filtro Status')).toHaveTextContent('Alerta');
  });
});
