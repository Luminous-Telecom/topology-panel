import { useEffect, useState } from 'react';
import { createAsyncCache } from '../services/asyncCache';
import { fetchItemNames } from '../services/zabbixQuery';

/** A lista de itens muda pouco; o TTL evita uma chamada por remontagem do painel de opções. */
const ITEMS_TTL_MS = 60_000;

const itemsCache = createAsyncCache<string[]>({
  ttlMs: ITEMS_TTL_MS,
  isCacheable: (items) => items.length > 0,
});

export interface UseZabbixItemNamesResult {
  items: string[];
  loading: boolean;
  loadError?: string;
}

/** Nomes de item nos grupos selecionados — alimenta o seletor de status. */
export function useZabbixItemNames(
  datasourceUid?: string,
  groupNames?: string[]
): UseZabbixItemNamesResult {
  const groupsKey = [...new Set((groupNames ?? []).map((name) => name.trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))
    .join('\u0000');
  const cacheKey = datasourceUid && groupsKey ? `${datasourceUid}\u0000${groupsKey}` : '';
  const [items, setItems] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!datasourceUid || !groupsKey || !cacheKey) {
      setItems([]);
      setLoading(false);
      setLoadError(undefined);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoadError(undefined);

    itemsCache
      .get(cacheKey, () => fetchItemNames(datasourceUid, groupsKey.split('\u0000')))
      .then((result) => {
        if (!cancelled) {
          setItems(result);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setItems([]);
          setLoading(false);
          setLoadError('Não foi possível listar os itens deste datasource Zabbix.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [datasourceUid, groupsKey, cacheKey]);

  return { items, loading, loadError };
}
