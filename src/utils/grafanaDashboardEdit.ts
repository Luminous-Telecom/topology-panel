import { UrlQueryMap } from '@grafana/data';

/** Query params que indicam edição de dashboard ou painel no Grafana. */
export function searchIndicatesDashboardEdit(search: UrlQueryMap): boolean {
  const editview = search.editview;
  if (typeof editview === 'string' && editview.toLowerCase() === 'editable') {
    return true;
  }
  if (editview === true) {
    return true;
  }
  const editPanel = search.editPanel;
  if (editPanel != null && String(editPanel).trim() !== '') {
    return true;
  }
  return false;
}

/** Botões do chrome Grafana quando o dashboard está em modo edição. */
export const DASHBOARD_EDIT_MODE_SELECTORS = [
  '[data-testid="data-testid Save dashboard button"]',
  '[data-testid="data-testid Exit edit mode button"]',
  'button[aria-label="Save dashboard"]',
  'button[aria-label="Exit edit mode"]',
  'button[aria-label="Exit edit"]',
  'button[aria-label="Salvar dashboard"]',
  'button[aria-label="Sair do modo de edição"]',
  'button[aria-label="Save dashboard button"]',
  'button[aria-label="Discard panel changes button"]',
  'button[aria-label="Descartar alterações do painel"]',
] as const;

export function documentIndicatesDashboardEdit(root?: ParentNode | null): boolean {
  if (!root) {
    return false;
  }
  return DASHBOARD_EDIT_MODE_SELECTORS.some((sel) => Boolean(root.querySelector(sel)));
}

/** True quando o painel pode gravar opções no dashboard (API + modo edição ativo). */
export function canPersistTopologyPanelOptions(
  onOptionsChange: unknown,
  dashboardEditing: boolean
): boolean {
  return Boolean(onOptionsChange) && dashboardEditing;
}
