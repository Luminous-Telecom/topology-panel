import { useEffect, useState } from 'react';
import { locationService } from '@grafana/runtime';
import {
  documentIndicatesDashboardEdit,
  searchIndicatesDashboardEdit,
} from '../utils/grafanaDashboardEdit';

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
  const [editing, setEditing] = useState(() => readDashboardEditMode());

  useEffect(() => {
    const sync = () => {
      setEditing(readDashboardEditMode());
    };

    sync();

    let unlisten: (() => void) | undefined;
    try {
      unlisten = locationService.getHistory().listen(sync);
    } catch {
      unlisten = undefined;
    }

    if (typeof document !== 'undefined') {
      const observer = new MutationObserver(sync);
      observer.observe(document.body, { childList: true, subtree: true });

      return () => {
        unlisten?.();
        observer.disconnect();
      };
    }

    return () => {
      unlisten?.();
    };
  }, []);

  return editing;
}
