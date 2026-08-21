import { useEffect, useMemo, useState } from 'react';
import { PanelData } from '@grafana/data';
import { HostMetadataMap, TopologyPanelOptions } from '../types';
import { HostLookupRef } from '../utils/hostLookup';
import { extractHostHoverSeries, HostHoverSeries } from '../utils/hostTimeSeries';
import { resolveDisplayQueryRefIds } from '../utils/queryHosts';
import { StatusColorOptions } from '../utils/statusMapping';
import { fetchHostHoverSeriesFromZabbix, isBenignZabbixFetchError } from '../utils/zabbixApi';
import { ZABBIX_DIRECT_DEFAULT_STATUS_ITEM_KEY } from '../types';

interface UseHostHoverSeriesParams {
  enabled: boolean;
  dataMode: TopologyPanelOptions['dataMode'];
  queryData?: PanelData;
  lookupRef: HostLookupRef;
  hostMetadata?: HostMetadataMap;
  options: TopologyPanelOptions;
  queryReady?: boolean;
  zabbixDatasourceUid?: string;
}

interface UseHostHoverSeriesResult {
  series: HostHoverSeries | undefined;
  loading: boolean;
  directMode: boolean;
}

export function useHostHoverSeries({
  enabled,
  dataMode,
  queryData,
  lookupRef,
  hostMetadata,
  options,
  queryReady,
  zabbixDatasourceUid,
}: UseHostHoverSeriesParams): UseHostHoverSeriesResult {
  const directMode = dataMode === 'zabbix';

  const displayQueryRefIds = useMemo(
    () => resolveDisplayQueryRefIds(options),
    [options.displayQueryRefIds]
  );

  const statusOptions = useMemo<StatusColorOptions>(
    () => ({
      colorOnline: options.colorOnline,
      colorOffline: options.colorOffline,
      colorAlert: options.colorAlert,
      statusValueMappings: options.statusValueMappings,
    }),
    [options.colorAlert, options.colorOffline, options.colorOnline, options.statusValueMappings]
  );

  const querySeries = useMemo(() => {
    if (directMode) {
      return undefined;
    }
    return extractHostHoverSeries(
      queryData,
      lookupRef,
      hostMetadata,
      displayQueryRefIds,
      statusOptions
    );
  }, [directMode, displayQueryRefIds, hostMetadata, lookupRef, queryData, statusOptions]);

  const statusItemKey = options.zabbixStatusItemKey?.trim() || ZABBIX_DIRECT_DEFAULT_STATUS_ITEM_KEY;
  const lookupKey = useMemo(
    () =>
      [
        lookupRef.zabbixHost ?? '',
        lookupRef.label ?? '',
        lookupRef.subtitle ?? '',
        lookupRef.zabbixHostId ?? '',
      ].join('\u0000'),
    [lookupRef.label, lookupRef.subtitle, lookupRef.zabbixHost, lookupRef.zabbixHostId]
  );
  const timeRangeKey = queryData?.timeRange
    ? `${queryData.timeRange.from.valueOf()}-${queryData.timeRange.to.valueOf()}`
    : '';

  const [directSeries, setDirectSeries] = useState<HostHoverSeries | undefined>();
  const [directLoading, setDirectLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !directMode || !queryReady || !zabbixDatasourceUid) {
      setDirectSeries(undefined);
      setDirectLoading(false);
      return;
    }

    let cancelled = false;
    setDirectLoading(true);

    fetchHostHoverSeriesFromZabbix(
      zabbixDatasourceUid,
      lookupRef,
      hostMetadata,
      queryData?.timeRange,
      statusItemKey,
      statusOptions
    )
      .then((series) => {
        if (!cancelled) {
          setDirectSeries(series);
        }
      })
      .catch((err) => {
        if (!cancelled && !isBenignZabbixFetchError(err)) {
          setDirectSeries(undefined);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setDirectLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    directMode,
    enabled,
    hostMetadata,
    lookupKey,
    lookupRef,
    queryData?.timeRange,
    queryReady,
    statusItemKey,
    statusOptions,
    timeRangeKey,
    zabbixDatasourceUid,
  ]);

  if (directMode) {
    return { series: directSeries, loading: directLoading, directMode: true };
  }

  return {
    series: querySeries,
    loading: !queryReady,
    directMode: false,
  };
}
