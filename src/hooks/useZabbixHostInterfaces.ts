import { useEffect, useMemo, useState } from 'react';
import { HostMetadataMap, TopologyNetworkInterface } from '../types';
import { createAsyncCache } from '../services/asyncCache';
import { InterfaceKeyParseOptions } from '../utils/zabbixAdapter/interfaceItemKeys';
import { groupInterfacesByHost } from '../utils/zabbixAdapter/parseInterfaceItems';
import { fetchZabbixHostInterfaceItems } from '../utils/zabbixApi';

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
}

type InterfacesByHost = Record<string, TopologyNetworkInterface[]>;

/** Inventário de interface muda pouco; o TTL cobre abrir e reabrir o modal do link. */
const INTERFACES_TTL_MS = 60_000;

const EMPTY_INTERFACES: InterfacesByHost = {};

const interfacesCache = createAsyncCache<InterfacesByHost>({
  ttlMs: INTERFACES_TTL_MS,
  isCacheable: (result) => Object.values(result).some((list) => list.length > 0),
});

const NO_API_ITEMS_ERROR =
  'Nenhuma métrica de interface encontrada no Zabbix para as chaves RX/TX/status/capacidade configuradas.';
const NO_KEYWORDS_ERROR =
  'Configure as palavras-chave RX, TX, status e capacidade da interface em Fonte de dados.';
const NO_DATASOURCE_ERROR = 'Configure o datasource Zabbix em Fonte de dados.';

function interfaceSearchKeys(keywords?: ZabbixInterfaceKeywordOptions): string[] {
  return [keywords?.rxKeyword, keywords?.txKeyword, keywords?.operStatusKeyword, keywords?.speedKeyword]
    .map((key) => key?.trim())
    .filter(Boolean) as string[];
}

function interfaceKeyParseOptions(keywords?: ZabbixInterfaceKeywordOptions): InterfaceKeyParseOptions | undefined {
  const rxKeyword = keywords?.rxKeyword?.trim();
  const txKeyword = keywords?.txKeyword?.trim();
  const operStatusKeyword = keywords?.operStatusKeyword?.trim();
  const speedKeyword = keywords?.speedKeyword?.trim();
  if (!rxKeyword && !txKeyword && !operStatusKeyword && !speedKeyword) {
    return undefined;
  }
  return { rxKeyword, txKeyword, operStatusKeyword, speedKeyword };
}

/**
 * Inventário de interfaces monitoradas — sempre via API Zabbix (`item.get`).
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
  ]);
  const keyParseOptions = useMemo(() => interfaceKeyParseOptions(interfaceKeywords), [
    interfaceKeywords?.rxKeyword,
    interfaceKeywords?.txKeyword,
    interfaceKeywords?.operStatusKeyword,
    interfaceKeywords?.speedKeyword,
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
        const entries = await fetchZabbixHostInterfaceItems(
          datasourceUid,
          hostKey.split('\0'),
          searchKeys,
          hostMetadata
        );
        return groupInterfacesByHost(entries, keyParseOptions);
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
  }, [shouldFetch, datasourceUid, hostKey, configKey, searchKeys, keyParseOptions, hostMetadata]);

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
    const hasInterfaces = Object.values(apiInterfaces).some((list) => list.length > 0);
    return loading || hasInterfaces ? undefined : NO_API_ITEMS_ERROR;
  }, [hostKey, datasourceUid, searchKeys, apiError, loading, apiInterfaces]);

  return { interfacesByHost: apiInterfaces, loading, loadError };
}
