import { useEffect, useState } from 'react';
import { fetchGrafanaDashboards, GrafanaDashboardOption } from '../utils/grafanaDashboards';
import { createAsyncCache } from '../services/asyncCache';

/**
 * A lista de dashboards muda com pouca frequência e cada picker aberto disparava seu próprio
 * `/api/search`. Um minuto de TTL cobre a sessão de edição sem esconder um dashboard recém-criado
 * por muito tempo. Lista vazia não entra no cache: é o que `fetchGrafanaDashboards` devolve quando a
 * chamada falha, e congelar isso deixaria o picker vazio mesmo depois do Grafana responder.
 */
const DASHBOARDS_TTL_MS = 60_000;
const CACHE_KEY = 'dash-db';

const dashboardsCache = createAsyncCache<GrafanaDashboardOption[]>({
  ttlMs: DASHBOARDS_TTL_MS,
  isCacheable: (list) => list.length > 0,
});

/** Dashboards Grafana (dash-db) com estado de carregamento — usado pelos pickers de submapa/seletor. */
export function useGrafanaDashboards(): { dashboards: GrafanaDashboardOption[]; loading: boolean } {
  const [dashboards, setDashboards] = useState<GrafanaDashboardOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void dashboardsCache.get(CACHE_KEY, fetchGrafanaDashboards).then((list) => {
      if (!cancelled) {
        setDashboards(list);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { dashboards, loading };
}
