import { useEffect, useMemo, useRef, useState } from 'react';
import { HostMetadataMap, TopologyNetworkInterface, TopologyPanelOptions } from '../types';
import { createAsyncCache } from '../services/asyncCache';
import { INTERFACE_SIGNAL_SEARCH_TERMS, InterfaceKeyParseOptions } from '../utils/zabbixAdapter/interfaceItemKeys';
import { groupInterfacesByHost } from '../utils/zabbixAdapter/parseInterfaceItems';
import { fetchZabbixHostInterfaceItemsViaQuery } from '../utils/zabbixDatasourceQuery';

export interface UseZabbixHostInterfacesResult {
  interfacesByHost: Record<string, TopologyNetworkInterface[]>;
  loading: boolean;
  loadError?: string;
}

export interface ZabbixInterfaceKeywordOptions {
  rxKeyword?: string;
  txKeyword?: string;
  operStatusKeyword?: string;
  speedKeyword?: string;
  rxPowerKeyword?: string;
  txPowerKeyword?: string;
}

type InterfacesByHost = Record<string, TopologyNetworkInterface[]>;

/** Inventário de interface muda pouco; o TTL cobre abrir e reabrir o modal do link. */
const INTERFACES_TTL_MS = 60_000;

const EMPTY_INTERFACES: InterfacesByHost = {};

const interfacesCache = createAsyncCache<InterfacesByHost>({
  ttlMs: INTERFACES_TTL_MS,
  isCacheable: (result) => Object.values(result).some((list) => list.length > 0),
});

export const NO_DATASOURCE_ERROR = 'Configure o datasource Zabbix em Fonte de dados.';
export const NO_KEYWORDS_ERROR =
  'Configure as palavras-chave RX, TX, status e capacidade da interface em Fonte de dados.';
export const NO_API_ITEMS_ERROR =
  'Nenhuma métrica de interface encontrada no Zabbix para as chaves RX/TX/status/capacidade configuradas.';

export function panelInterfaceKeywords(
  options: Pick<
    TopologyPanelOptions,
    | 'zabbixRxItemKeyword'
    | 'zabbixTxItemKeyword'
    | 'zabbixOperStatusItemKeyword'
    | 'zabbixSpeedItemKeyword'
    | 'zabbixRxPowerItemKeyword'
    | 'zabbixTxPowerItemKeyword'
  >
): ZabbixInterfaceKeywordOptions {
  return {
    rxKeyword: options.zabbixRxItemKeyword,
    txKeyword: options.zabbixTxItemKeyword,
    operStatusKeyword: options.zabbixOperStatusItemKeyword,
    speedKeyword: options.zabbixSpeedItemKeyword,
    rxPowerKeyword: options.zabbixRxPowerItemKeyword,
    txPowerKeyword: options.zabbixTxPowerItemKeyword,
  };
}

function interfaceSearchKeys(keywords?: ZabbixInterfaceKeywordOptions): string[] {
  const configured = [
    keywords?.rxKeyword,
    keywords?.txKeyword,
    keywords?.operStatusKeyword,
    keywords?.speedKeyword,
    keywords?.rxPowerKeyword,
    keywords?.txPowerKeyword,
  ]
    .map((key) => key?.trim())
    .filter(Boolean) as string[];
  if (!configured.length) {
    return [];
  }
  return [...new Set([...configured, ...INTERFACE_SIGNAL_SEARCH_TERMS])];
}

function interfaceKeyParseOptions(keywords?: ZabbixInterfaceKeywordOptions): InterfaceKeyParseOptions | undefined {
  const rxKeyword = keywords?.rxKeyword?.trim();
  const txKeyword = keywords?.txKeyword?.trim();
  const operStatusKeyword = keywords?.operStatusKeyword?.trim();
  const speedKeyword = keywords?.speedKeyword?.trim();
  const rxPowerKeyword = keywords?.rxPowerKeyword?.trim();
  const txPowerKeyword = keywords?.txPowerKeyword?.trim();
  if (!rxKeyword && !txKeyword && !operStatusKeyword && !speedKeyword && !rxPowerKeyword && !txPowerKeyword) {
    return undefined;
  }
  return { rxKeyword, txKeyword, operStatusKeyword, speedKeyword, rxPowerKeyword, txPowerKeyword };
}

/**
 * Inventário de interfaces — ds.query() Metrics (um host, qualquer item).
 * O grafana-zabbix só filtra o campo Item pelo nome; as palavras-chave da key
 * entram no parse das frames.
 */
export function useZabbixHostInterfaces(
  hostKeys: string[],
  datasourceUid?: string,
  interfaceKeywords?: ZabbixInterfaceKeywordOptions,
  hostMetadata?: HostMetadataMap
): UseZabbixHostInterfacesResult {
  const keys = useMemo(
    () => [...new Set(hostKeys.map((name) => name.trim()).filter(Boolean))],
    [hostKeys]
  );
  const hostKey = useMemo(() => [...keys].sort().join('\0'), [keys]);
  const searchKeys = useMemo(() => interfaceSearchKeys(interfaceKeywords), [
    interfaceKeywords?.rxKeyword,
    interfaceKeywords?.txKeyword,
    interfaceKeywords?.operStatusKeyword,
    interfaceKeywords?.speedKeyword,
    interfaceKeywords?.rxPowerKeyword,
    interfaceKeywords?.txPowerKeyword,
  ]);
  const keyParseOptions = useMemo(() => interfaceKeyParseOptions(interfaceKeywords), [
    interfaceKeywords?.rxKeyword,
    interfaceKeywords?.txKeyword,
    interfaceKeywords?.operStatusKeyword,
    interfaceKeywords?.speedKeyword,
    interfaceKeywords?.rxPowerKeyword,
    interfaceKeywords?.txPowerKeyword,
  ]);
  const metadataHostIds = useMemo(
    () => keys.map((key) => hostMetadata?.[key]?.hostid?.trim() ?? '').join('\u0001'),
    [keys, hostMetadata]
  );
  const configKey = `${searchKeys.join('\u0001')}\u0000${metadataHostIds}`;

  const [apiInterfaces, setApiInterfaces] = useState<InterfacesByHost>(EMPTY_INTERFACES);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | undefined>(undefined);

  const shouldFetch = Boolean(hostKey) && Boolean(datasourceUid) && searchKeys.length > 0;
  const hostMetadataRef = useRef(hostMetadata);
  hostMetadataRef.current = hostMetadata;
  const searchKeysRef = useRef(searchKeys);
  searchKeysRef.current = searchKeys;
  const keyParseOptionsRef = useRef(keyParseOptions);
  keyParseOptionsRef.current = keyParseOptions;

  useEffect(() => {
    if (!shouldFetch || !datasourceUid) {
      setApiInterfaces(EMPTY_INTERFACES);
      setLoading(false);
      setApiError(undefined);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setApiError(undefined);

    const cacheKey = `${datasourceUid}\u0000${hostKey}\u0000${configKey}`;

    interfacesCache
      .get(cacheKey, async () => {
        const entries = await fetchZabbixHostInterfaceItemsViaQuery(
          datasourceUid,
          hostKey.split('\0'),
          searchKeysRef.current,
          hostMetadataRef.current
        );
        return groupInterfacesByHost(entries, keyParseOptionsRef.current);
      })
      .then((result) => {
        if (!cancelled) {
          setApiInterfaces(result);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setApiInterfaces(EMPTY_INTERFACES);
          setLoading(false);
          setApiError('Não foi possível consultar as interfaces deste host no Zabbix.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [shouldFetch, datasourceUid, hostKey, configKey]);

  const loadError = useMemo(() => {
    if (!hostKey) {
      return undefined;
    }
    if (!datasourceUid) {
      return NO_DATASOURCE_ERROR;
    }
    if (!searchKeys.length) {
      return NO_KEYWORDS_ERROR;
    }
    if (apiError) {
      return apiError;
    }
    return undefined;
  }, [hostKey, datasourceUid, searchKeys, apiError]);

  return { interfacesByHost: apiInterfaces, loading, loadError };
}
