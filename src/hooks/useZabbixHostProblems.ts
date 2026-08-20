import { useEffect, useMemo, useState } from 'react';
import { PanelData } from '@grafana/data';
import { HostMetadataMap } from '../types';
import { HostProblemsMap } from '../utils/noc/types';
import { fetchZabbixHostProblems } from '../utils/zabbixApi';
import { createAsyncCache } from '../services/asyncCache';

const PROBLEMS_TTL_MS = 30_000;

const problemsCache = createAsyncCache<HostProblemsMap>({
  ttlMs: PROBLEMS_TTL_MS,
  isCacheable: (map) => Object.keys(map).length >= 0,
});

function collectHostIds(metadata: HostMetadataMap): string[] {
  const ids = new Set<string>();
  for (const entry of Object.values(metadata)) {
    if (entry.hostid?.trim()) {
      ids.add(entry.hostid.trim());
    }
  }
  return [...ids];
}

/** Problemas Zabbix (Warning+) para badges e filtro NOC — não altera lista ALERTA nem cor do mapa. */
export function useZabbixHostProblems(
  datasourceUid: string | undefined,
  hostMetadata: HostMetadataMap,
  /** Novo objeto a cada refresh da Query — invalida o TTL e busca problemas atuais. */
  queryData?: PanelData
): { problems: HostProblemsMap; loading: boolean } {
  const hostIds = useMemo(() => collectHostIds(hostMetadata), [hostMetadata]);
  const hostKey = useMemo(() => hostIds.sort().join('\0'), [hostIds]);
  const cacheKey = useMemo(
    () => (datasourceUid && hostKey ? `${datasourceUid}\u0000problems\u0000${hostKey}` : ''),
    [datasourceUid, hostKey]
  );
  const [problems, setProblems] = useState<HostProblemsMap>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!datasourceUid || !hostKey || !cacheKey) {
      setProblems({});
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    problemsCache.invalidate(cacheKey);

    void problemsCache
      .get(cacheKey, () => fetchZabbixHostProblems(datasourceUid, hostKey.split('\0')))
      .then((next) => {
        if (!cancelled) {
          setProblems(next);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProblems({});
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [datasourceUid, hostKey, cacheKey, queryData]);

  return { problems, loading };
}
