import { describe, expect, it, vi } from 'vitest';
import {
  canPersistTopologyPanelOptions,
  documentIndicatesDashboardEdit,
  searchIndicatesDashboardEdit,
} from './grafanaDashboardEdit';

describe('searchIndicatesDashboardEdit', () => {
  it('detecta editview=editable na URL', () => {
    expect(searchIndicatesDashboardEdit({ editview: 'editable' })).toBe(true);
  });

  it('detecta editPanel na URL', () => {
    expect(searchIndicatesDashboardEdit({ editPanel: '1' })).toBe(true);
  });

  it('retorna false fora do modo edição', () => {
    expect(searchIndicatesDashboardEdit({})).toBe(false);
  });
});

describe('documentIndicatesDashboardEdit', () => {
  it('detecta botão Salvar dashboard no DOM', () => {
    const root = document.createElement('div');
    const btn = document.createElement('button');
    btn.setAttribute('aria-label', 'Salvar dashboard');
    root.appendChild(btn);
    expect(documentIndicatesDashboardEdit(root)).toBe(true);
  });
});

describe('canPersistTopologyPanelOptions', () => {
  it('exige onOptionsChange e modo edição do dashboard', () => {
    const onChange = vi.fn();
    expect(canPersistTopologyPanelOptions(onChange, true)).toBe(true);
    expect(canPersistTopologyPanelOptions(onChange, false)).toBe(false);
    expect(canPersistTopologyPanelOptions(undefined, true)).toBe(false);
  });
});
