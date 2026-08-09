import { useEffect, useRef } from 'react';
import { locationService } from '@grafana/runtime';
import { openDashboardUrl } from '../components/DashboardPickerModal';

const DEFAULT_VAR = 'mapa';

function readVarValue(varName: string): string {
  try {
    const search = locationService.getSearchObject() as Record<string, unknown>;
    const raw = search[`var-${varName}`];
    if (Array.isArray(raw)) {
      return String(raw[0] ?? '').trim();
    }
    if (raw == null) {
      return '';
    }
    return String(raw).trim();
  } catch {
    return '';
  }
}

function currentDashboardUid(): string {
  const match = window.location.pathname.match(/\/d\/([^/]+)/);
  return match?.[1]?.trim() ?? '';
}

/**
 * Variável Grafana (ex.: $mapa) na barra do painel de controle.
 * Ao trocar o valor para outro UID, navega para esse dashboard.
 */
export function useDashboardVariableNav(varName: string = DEFAULT_VAR): void {
  const lastNavRef = useRef<string>('');

  useEffect(() => {
    const maybeNavigate = () => {
      const selected = readVarValue(varName);
      if (!selected) {
        return;
      }
      const current = currentDashboardUid();
      if (!current || selected === current) {
        return;
      }
      const key = `${current}->${selected}`;
      if (lastNavRef.current === key) {
        return;
      }
      lastNavRef.current = key;
      openDashboardUrl(selected);
    };

    maybeNavigate();

    let unlisten: (() => void) | undefined;
    try {
      unlisten = locationService.getHistory().listen(() => {
        maybeNavigate();
      });
    } catch {
      unlisten = undefined;
    }

    return () => {
      unlisten?.();
    };
  }, [varName]);
}
