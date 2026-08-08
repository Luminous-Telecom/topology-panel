import { useEffect, useState } from 'react';
import { locationService } from '@grafana/runtime';

/** Botões do chrome Grafana quando o dashboard está em modo edição (lápis). */
const EDIT_MODE_SELECTORS = [
  '[data-testid="data-testid Save dashboard button"]',
  '[data-testid="data-testid Exit edit mode button"]',
  'button[aria-label="Save dashboard"]',
  'button[aria-label="Exit edit mode"]',
  'button[aria-label="Exit edit"]',
];

function detectDashboardEditMode(): boolean {
  try {
    const search = locationService.getSearchObject();
    if (search.editPanel != null || search.editview != null) {
      return true;
    }
  } catch {
    /* locationService pode falhar fora do Grafana */
  }

  if (typeof document === 'undefined') {
    return false;
  }

  return EDIT_MODE_SELECTORS.some((sel) => Boolean(document.querySelector(sel)));
}

/** True quando o dashboard Grafana está em modo edição (ícone lápis / editPanel). */
export function useDashboardEditMode(): boolean {
  const [editing, setEditing] = useState(() => detectDashboardEditMode());

  useEffect(() => {
    const sync = () => {
      setEditing(detectDashboardEditMode());
    };

    sync();

    let unlisten: (() => void) | undefined;
    try {
      unlisten = locationService.getHistory().listen(sync);
    } catch {
      unlisten = undefined;
    }

    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });

    // Fallback leve — MutationObserver cobre a maioria dos casos
    const interval = window.setInterval(sync, 1500);

    return () => {
      unlisten?.();
      observer.disconnect();
      window.clearInterval(interval);
    };
  }, []);

  return editing;
}
