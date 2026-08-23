import { useEffect, useState } from 'react';
import { createAsyncCache } from '../services/asyncCache';
import { fetchZabbixHostGroupNamesViaQuery } from '../utils/zabbixDatasourceQuery';

/** Lista de grupos muda pouco; o TTL evita uma chamada por remontagem do painel de opções. */
const GROUPS_TTL_MS = 60_000;

const groupsCache = createAsyncCache<string[]>({
  ttlMs: GROUPS_TTL_MS,
  isCacheable: (groups) => groups.length > 0,
});

export interface UseZabbixHostGroupsResult {
  groups: string[];
  loading: boolean;
  loadError?: string;
}

/** Grupos de host do Zabbix — alimenta o MultiSelect do submapa e o item de status. */
export function useZabbixHostGroups(datasourceUid?: string): UseZabbixHostGroupsResult {
  const [groups, setGroups] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!datasourceUid) {
      setGroups([]);
      setLoading(false);
      setLoadError(undefined);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoadError(undefined);

    groupsCache
      .get(datasourceUid, () => fetchZabbixHostGroupNamesViaQuery(datasourceUid))
      .then((result) => {
        if (!cancelled) {
          setGroups(result);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setGroups([]);
          setLoading(false);
          setLoadError('Não foi possível listar os grupos deste datasource Zabbix.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [datasourceUid]);

  return { groups, loading, loadError };
}
