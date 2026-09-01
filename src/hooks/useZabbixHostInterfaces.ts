import { useEffect, useMemo, useRef, useState } from 'react';
import { createAsyncCache } from '../services/asyncCache';
import { HostMetadataMap, TopologyNetworkInterface, TopologyPanelOptions } from '../types';
import { hostidFromLookupKey } from '../utils/hostLookup';
import { INTERFACE_SIGNAL_SEARCH_TERMS, InterfaceKeyParseOptions } from '../utils/zabbixAdapter/interfaceItemKeys';
import { groupInterfacesByHost } from '../utils/zabbixAdapter/parseInterfaceItems';
import { fetchHostInterfaceItems } from '../services/zabbixQuery';

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
export const NO_HOST_FOUND_ERROR =
  'Não foi possível localizar o hostid deste nó no Zabbix.';

function aliasInterfacesToLookupKeys(
  byHost: InterfacesByHost,
  keys: string[]
): InterfacesByHost {
  const filled = Object.values(byHost).find((list) => list.length);
  if (!filled) {
    return byHost;
  }
  const next: InterfacesByHost = { ...byHost };
  for (const key of keys) {
    if (!next[key]?.length) {
      next[key] = filled;
    }
  }
  return next;
}

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
 * Inventário de interfaces — `item.get` no datasource Zabbix, autenticado no browser.
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
    () => keys.map((key) => hostidFromLookupKey(key, hostMetadata) ?? '').join('\u0001'),
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
        const lookupKeys = hostKey.split('\0').filter(Boolean);
        const entries = await fetchHostInterfaceItems(
          datasourceUid,
          lookupKeys.map((key) => ({
            hostKey: key,
            hostid: hostidFromLookupKey(key, hostMetadataRef.current),
          })),
          searchKeysRef.current
        );
        return aliasInterfacesToLookupKeys(
          groupInterfacesByHost(entries, keyParseOptionsRef.current),
          lookupKeys
        );
      })
      .then((result) => {
        if (!cancelled) {
          setApiInterfaces(result);
          setLoading(false);
          if (hostKey && Object.keys(result).length === 0) {
            setApiError(NO_HOST_FOUND_ERROR);
          }
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
