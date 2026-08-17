import { describe, expect, it, vi } from 'vitest';
import { TopologyLink, TopologyMap, TopologyNode } from '../types';
import {
  buildLinkMenuItems,
  bulkHostItems,
  copySelectionItem,
  deleteNodeMenuLabel,
  deleteSelectionItem,
} from './contextMenuItems';

describe('rótulos por quantidade', () => {
  it('singular sem contagem, plural com contagem', () => {
    expect(copySelectionItem(1, () => {}).label).toBe('Copiar seleção');
    expect(copySelectionItem(3, () => {}).label).toBe('Copiar seleção (3)');
    expect(deleteSelectionItem(2, () => {}).label).toBe('Excluir seleção (2)');
  });

  it('exclusão de um nó nomeia o tipo', () => {
    const node = (type: TopologyNode['type']): TopologyNode => ({ id: 'n', type, x: 0, y: 0 });
    expect(deleteNodeMenuLabel(node('submap'))).toBe('Excluir submapa');
    expect(deleteNodeMenuLabel(node('dashboard_picker'))).toBe('Excluir seletor');
    expect(deleteNodeMenuLabel(node('static'))).toBe('Excluir estático');
    expect(deleteNodeMenuLabel(node('network'))).toBe('Excluir rede');
    expect(deleteNodeMenuLabel(node('host'))).toBe('Excluir host');
  });

  it('itens em massa dizem quantos hosts serão afetados', () => {
    expect(bulkHostItems(4, () => {}, () => {}).map((i) => i.label)).toEqual([
      'Alterar tipo / ícone (4 hosts)',
      'Usuário / senha Tools (4 hosts)',
    ]);
  });
});

describe('buildLinkMenuItems', () => {
  const link: TopologyLink = { from: 'a', to: 'b' };
  const storedMap: TopologyMap = { width: 800, height: 600, nodes: [], links: [link] };

  function menu(target: TopologyLink, persist = vi.fn()) {
    return {
      persist,
      items: buildLinkMenuItems({
        link: target,
        storedMap,
        persist,
        closeMenu: () => {},
        openLinkEdit: () => {},
        openLinkDetails: () => {},
        resetLinkRoute: () => {},
      }),
    };
  }

  it('oferece editar, endireitar, meio físico e excluir', () => {
    expect(menu(link).items.map((i) => i.id)).toEqual([
      'link-details',
      'link-edit',
      'link-straight',
      'link-fiber',
      'link-radio',
      'delete-link',
    ]);
  });

  it('marca com ✓ o meio físico atual do cabo', () => {
    const labels = menu({ ...link, medium: 'radio' }).items.map((i) => i.label);
    expect(labels).toContain('✓ Rádio (linha tracejada)');
    expect(labels).toContain('Marcar como fibra');
  });

  it('excluir remove o cabo do mapa salvo', () => {
    const { persist, items } = menu(link);
    items.find((i) => i.id === 'delete-link')?.onClick?.();
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist.mock.calls[0][0].links).toEqual([]);
  });
});
