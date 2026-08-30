import { describe, expect, it, vi } from 'vitest';
import {
  canPersistTopologyPanelOptions,
  documentIndicatesDashboardEdit,
  eventTargetRequestsDashboardFlush,
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

describe('eventTargetRequestsDashboardFlush', () => {
  it('detecta Salvar dashboard e ignora descarte', () => {
    const save = document.createElement('button');
    save.setAttribute('aria-label', 'Salvar dashboard');
    expect(eventTargetRequestsDashboardFlush(save)).toBe(true);

    const discard = document.createElement('button');
    discard.setAttribute('aria-label', 'Descartar alterações do painel');
    expect(eventTargetRequestsDashboardFlush(discard)).toBe(false);

    expect(eventTargetRequestsDashboardFlush(null)).toBe(false);
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
