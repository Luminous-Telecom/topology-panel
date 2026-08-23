import { useEffect, useMemo, useState } from 'react';
import { HostMetadataMap } from '../types';
import { HostProblemsMap } from '../utils/noc/types';
import { fetchZabbixHostProblemsViaQuery } from '../utils/zabbixDatasourceQuery';
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

/** Problemas Zabbix (Warning+) do mapa visível — badges, lista, cor e hover. */
export function useZabbixHostProblems(
  datasourceUid: string | undefined,
  hostMetadata: HostMetadataMap,
  groupNames: readonly string[]
): { problems: HostProblemsMap; loading: boolean } {
  const hostIds = useMemo(() => collectHostIds(hostMetadata), [hostMetadata]);
  const hostKey = useMemo(() => hostIds.sort().join('\0'), [hostIds]);
  const groupsKey = useMemo(
    () => [...new Set(groupNames.map((name) => name.trim()).filter(Boolean))].join('\0'),
    [groupNames]
  );
  const cacheKey = useMemo(
    () =>
      datasourceUid && hostKey && groupsKey
        ? `${datasourceUid}\u0000problems\u0000${hostKey}\u0000${groupsKey}`
        : '',
    [datasourceUid, hostKey, groupsKey]
  );
  const [problems, setProblems] = useState<HostProblemsMap>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!datasourceUid || !hostKey || !groupsKey || !cacheKey) {
      setProblems({});
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void problemsCache
      .get(cacheKey, () =>
        fetchZabbixHostProblemsViaQuery(datasourceUid, hostKey.split('\0'), groupsKey.split('\0'))
      )
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
  }, [datasourceUid, hostKey, groupsKey, cacheKey]);

  return { problems, loading };
}
