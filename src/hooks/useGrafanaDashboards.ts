import { useEffect, useState } from 'react';
import { fetchGrafanaDashboards, GrafanaDashboardOption } from '../utils/grafanaDashboards';

/** Dashboards Grafana (dash-db) com estado de carregamento — usado pelos pickers de submapa/seletor. */
export function useGrafanaDashboards(): { dashboards: GrafanaDashboardOption[]; loading: boolean } {
  const [dashboards, setDashboards] = useState<GrafanaDashboardOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchGrafanaDashboards().then((list) => {
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
