import { locationService } from '@grafana/runtime';
import {
  documentIndicatesDashboardEdit,
  searchIndicatesDashboardEdit,
} from '../utils/grafanaDashboardEdit';
import { useGrafanaChromeFlag } from './useGrafanaChromeFlag';

function readDashboardEditMode(): boolean {
  try {
    if (searchIndicatesDashboardEdit(locationService.getSearchObject())) {
      return true;
    }
  } catch {
    // locationService pode falhar fora do Grafana.
  }
  if (typeof document === 'undefined') {
    return false;
  }
  return documentIndicatesDashboardEdit(document);
}

/**
 * Heurística de edição do dashboard (URL + chrome do Grafana).
 * Use com `canPersistTopologyPanelOptions` — `onOptionsChange` sozinho não basta.
 */
export function useDashboardEditMode(): boolean {
  return useGrafanaChromeFlag(readDashboardEditMode);
}
