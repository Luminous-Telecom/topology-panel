import { useEffect, useMemo, useState } from 'react';
import { HostMetadataMap } from '../types';
import { fetchZabbixHostMetadata } from '../utils/zabbixApi';
import { createAsyncCache } from '../services/asyncCache';

/**
 * IP e nome de interface mudam raramente no Zabbix, mas o conjunto de hosts da Query oscila entre
 * refreshes e cada painel de topologia do dashboard pede a mesma lista. O cache evita repetir a
 * chamada a cada oscilação e o dedupe faz N painéis compartilharem uma requisição só.
 */
const METADATA_TTL_MS = 60_000;

const metadataCache = createAsyncCache<HostMetadataMap>({
  ttlMs: METADATA_TTL_MS,
  isCacheable: (map) => Object.keys(map).length > 0,
});

/** Busca IP/nome da interface principal no Zabbix quando a Query não traz esses dados. */
export function useZabbixHostMetadata(
  datasourceUid: string | undefined,
  hostNames: string[]
): { metadata: HostMetadataMap; loading: boolean } {
  const hostKey = useMemo(
    () => [...new Set(hostNames.map((name) => name.trim()).filter(Boolean))].sort().join('\0'),
    [hostNames]
  );
  const [metadata, setMetadata] = useState<HostMetadataMap>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!datasourceUid || !hostKey) {
      setMetadata({});
      setLoading(false);
      return;
    }

    const names = hostKey.split('\0');
    let cancelled = false;
    setLoading(true);

    void metadataCache
      .get(`${datasourceUid}\u0000${hostKey}`, () => fetchZabbixHostMetadata(datasourceUid, names))
      .then((next) => {
        if (!cancelled) {
          setMetadata(next);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMetadata({});
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [datasourceUid, hostKey]);

  return { metadata, loading };
}
