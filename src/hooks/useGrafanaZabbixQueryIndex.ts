import { useEffect, useMemo, useState } from 'react';
import { EventBus, LoadingState, PanelData, TimeRange, TimeZone } from '@grafana/data';
import { RefreshEvent, createQueryRunner } from '@grafana/runtime';
import { ZABBIX_DIRECT_MIN_REFRESH_SEC } from '../types';
import { buildQueryIndex, QueryIndex } from '../services/queryIndex';
import { buildZabbixGrafanaQueries, ZABBIX_DATASOURCE_TYPE } from '../utils/zabbixGrafanaQuery';
import { POLL_WATCHDOG_MS, canStartPolledFetch } from '../utils/pollingGate';

/**
 * Status dos hosts via pipeline de query do Grafana (`/api/ds/query` → plugin Zabbix),
 * sem aba Query no painel (`skipDataQuery` permanece true).
 *
 * O polling usa `createQueryRunner` — mesma rota que o Grafana usa nos painéis com Query,
 * mas os targets são montados a partir das opções do painel (grupos + item de status).
 *
 * Sem cache nem reaproveitamento de índice anterior: `ready` só sobe com resposta completa.
 */

const EMPTY_INDEX = buildQueryIndex(undefined);

const GENERIC_ERROR = 'Falha ao consultar o Zabbix. Verifique o datasource e os grupos configurados.';
const NO_GROUPS_ERROR = 'Nenhum dos grupos configurados existe no Zabbix.';

function indexFromPanelData(data: PanelData): QueryIndex | undefined {
  if (data.state !== LoadingState.Done && data.state !== LoadingState.Streaming) {
    return undefined;
  }
  if (!data.series?.length) {
    return undefined;
  }
  const index = buildQueryIndex(data);
  return index.refIds.length > 0 || index.hosts.length > 0 ? index : undefined;
}

export interface UseGrafanaZabbixQueryIndexOptions {
  enabled: boolean;
  datasourceUid?: string;
  groupNames: string[];
  statusItemKey: string;
  refreshSec: number;
  timeRange: TimeRange;
  timeZone: TimeZone;
  eventBus?: EventBus;
}

export interface UseGrafanaZabbixQueryIndexResult {
  index: QueryIndex;
  ready: boolean;
  loading: boolean;
  error?: string;
}

interface QueryState {
  index: QueryIndex;
  ready: boolean;
  loading: boolean;
  error?: string;
}

const IDLE_STATE: QueryState = { index: EMPTY_INDEX, ready: false, loading: false };

export function useGrafanaZabbixQueryIndex({
  enabled,
  datasourceUid,
  groupNames,
  statusItemKey,
  refreshSec,
  timeRange,
  timeZone,
  eventBus,
}: UseGrafanaZabbixQueryIndexOptions): UseGrafanaZabbixQueryIndexResult {
  const groups = useMemo(
    () => [...new Set(groupNames.map((name) => name.trim()).filter(Boolean))],
    [groupNames]
  );
  const itemKey = statusItemKey.trim();
  const intervalSec = Math.max(ZABBIX_DIRECT_MIN_REFRESH_SEC, Math.floor(refreshSec));
  const configKey = `${datasourceUid ?? ''}\u0000${groups.join('\u0001')}\u0000${itemKey}\u0000${intervalSec}\u0000${timeRange.from.valueOf()}\u0000${timeRange.to.valueOf()}`;

  const queries = useMemo(
    () => (datasourceUid && itemKey ? buildZabbixGrafanaQueries(datasourceUid, groups, itemKey) : []),
    [datasourceUid, groups, itemKey]
  );

  const [state, setState] = useState<QueryState>(() =>
    !enabled || !datasourceUid || !groups.length || !itemKey
      ? IDLE_STATE
      : { ...IDLE_STATE, loading: true }
  );

  useEffect(() => {
    if (!enabled || !datasourceUid || !groups.length || !itemKey || !queries.length) {
      setState(IDLE_STATE);
      return;
    }

    setState({ ...IDLE_STATE, loading: true });

    let cancelled = false;
    let inFlight = false;
    let lastStartMs = 0;
    let fetchGeneration = 0;

    const runner = createQueryRunner();

    const applyPanelData = (panelData: PanelData, generation: number) => {
      if (cancelled || generation !== fetchGeneration) {
        return;
      }
      if (panelData.state !== LoadingState.Loading) {
        inFlight = false;
      }

      if (panelData.state === LoadingState.Error) {
        setState({
          index: EMPTY_INDEX,
          ready: false,
          loading: false,
          error: GENERIC_ERROR,
        });
        return;
      }

      if (panelData.state === LoadingState.Loading) {
        setState((prev) => ({
          ...prev,
          loading: true,
          error: undefined,
        }));
        return;
      }

      const index = indexFromPanelData(panelData) ?? buildQueryIndex(panelData);
      if (!index.refIds.length && !index.hosts.length) {
        setState({
          index: EMPTY_INDEX,
          ready: false,
          loading: false,
          error: NO_GROUPS_ERROR,
        });
        return;
      }

      setState({
        index,
        ready: true,
        loading: false,
        error: undefined,
      });
    };

    const sub = runner.get().subscribe((panelData) => {
      applyPanelData(panelData, fetchGeneration);
    });

    const runQuery = () => {
      if (cancelled) {
        return;
      }
      if (document.hidden && !inFlight && Date.now() - lastStartMs < POLL_WATCHDOG_MS) {
        return;
      }
      if (!canStartPolledFetch(Date.now(), lastStartMs, inFlight)) {
        return;
      }
      lastStartMs = Date.now();
      const generation = ++fetchGeneration;
      inFlight = true;
      runner.run({
        datasource: { uid: datasourceUid, type: ZABBIX_DATASOURCE_TYPE },
        queries,
        timezone: timeZone,
        timeRange,
        maxDataPoints: 2,
        minInterval: `${intervalSec}s`,
      });
    };

    runQuery();

    const timer = window.setInterval(runQuery, intervalSec * 1000);
    const handleVisibility = () => {
      if (!document.hidden) {
        runQuery();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    const refreshSub = eventBus?.getStream(RefreshEvent).subscribe(() => runQuery());

    return () => {
      cancelled = true;
      fetchGeneration += 1;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
      refreshSub?.unsubscribe();
      sub.unsubscribe();
      runner.cancel();
      runner.destroy();
    };
  }, [enabled, configKey, datasourceUid, queries, timeRange, timeZone, eventBus, groups, itemKey]);

  return state;
}
