import { useEffect, useMemo, useState } from 'react';
import { HostMetadataMap } from '../types';
import { fetchZabbixHostMetadata } from '../utils/zabbixApi';

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

    void fetchZabbixHostMetadata(datasourceUid, names)
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
