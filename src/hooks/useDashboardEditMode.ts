import { useEffect, useState } from 'react';

/** Botões do chrome Grafana quando o dashboard está em modo edição (ícone lápis). */
const EDIT_MODE_SELECTORS = [
  '[data-testid="data-testid Save dashboard button"]',
  '[data-testid="data-testid Exit edit mode button"]',
  'button[aria-label="Save dashboard"]',
  'button[aria-label="Exit edit mode"]',
  'button[aria-label="Exit edit"]',
  'button[aria-label="Salvar dashboard"]',
  'button[aria-label="Sair do modo de edição"]',
];

function detectDashboardEditMode(): boolean {
  if (typeof document === 'undefined') {
    return false;
  }

  return EDIT_MODE_SELECTORS.some((sel) => Boolean(document.querySelector(sel)));
}

/** True quando o dashboard Grafana está em modo edição (ícone lápis — não confundir com ?editPanel). */
export function useDashboardEditMode(): boolean {
  const [editing, setEditing] = useState(() => detectDashboardEditMode());

  useEffect(() => {
    const sync = () => {
      setEditing(detectDashboardEditMode());
    };

    sync();

    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });

    // Reforço periódico — MutationObserver cobre a maioria dos casos
    const interval = window.setInterval(sync, 1500);

    return () => {
      observer.disconnect();
      window.clearInterval(interval);
    };
  }, []);

  return editing;
}
