import { useEffect, useMemo, useState } from 'react';
import { TopologyNetworkInterface } from '../types';
import { createAsyncCache } from '../services/asyncCache';
import { fetchZabbixHostInterfaceItems } from '../utils/zabbixApi';
import { groupInterfacesByHost } from '../utils/zabbixAdapter/parseInterfaceItems';

const INTERFACE_INVENTORY_TTL_MS = 60_000;

const interfaceCache = createAsyncCache<Record<string, TopologyNetworkInterface[]>>({
  ttlMs: INTERFACE_INVENTORY_TTL_MS,
  isCacheable: (map) => Object.keys(map).length > 0,
});

export interface UseZabbixHostInterfacesResult {
  interfacesByHost: Record<string, TopologyNetworkInterface[]>;
  loading: boolean;
  loadError?: string;
}

/**
 * Descobre interfaces monitoradas no Zabbix para um ou mais hosts.
 * Cache de inventário: 60s (interfaces mudam raramente).
 */
export function useZabbixHostInterfaces(
  datasourceUid: string | undefined,
  hostKeys: string[]
): UseZabbixHostInterfacesResult {
  const hostKey = useMemo(
    () => [...new Set(hostKeys.map((name) => name.trim()).filter(Boolean))].sort().join('\0'),
    [hostKeys]
  );
  const [interfacesByHost, setInterfacesByHost] = useState<Record<string, TopologyNetworkInterface[]>>({});
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | undefined>();

  useEffect(() => {
    if (!datasourceUid || !hostKey) {
      setInterfacesByHost({});
      setLoading(false);
      setLoadError(undefined);
      return;
    }

    const keys = hostKey.split('\0');
    let cancelled = false;
    setLoading(true);
    setLoadError(undefined);

    void interfaceCache
      .get(`${datasourceUid}\u0000ifaces\u0000${hostKey}`, async () => {
        const entries = await fetchZabbixHostInterfaceItems(datasourceUid, keys);
        return groupInterfacesByHost(
          entries.map((e) => ({ hostKey: e.hostKey, hostid: e.hostid, items: e.items }))
        );
      })
      .then((next) => {
        if (!cancelled) {
          setInterfacesByHost(next);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setInterfacesByHost({});
          setLoading(false);
          setLoadError('Não foi possível carregar interfaces do Zabbix');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [datasourceUid, hostKey]);

  return { interfacesByHost, loading, loadError };
}
