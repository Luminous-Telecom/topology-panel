import { useEffect, useMemo, useState } from 'react';
import { PanelData } from '@grafana/data';
import { HostMetadataMap, TopologyPanelOptions } from '../types';
import { HostLookupRef } from '../utils/hostLookup';
import { HostHoverSeries } from '../utils/hostTimeSeries';
import { StatusColorOptions } from '../utils/statusMapping';
import { fetchHostHoverSeriesFromZabbix, isBenignZabbixFetchError } from '../utils/zabbixApi';
import { ZABBIX_DIRECT_DEFAULT_STATUS_ITEM_KEY } from '../types';

interface UseHostHoverSeriesParams {
  enabled: boolean;
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
}

export function useHostHoverSeries({
  enabled,
  queryData,
  lookupRef,
  hostMetadata,
  options,
  queryReady,
  zabbixDatasourceUid,
}: UseHostHoverSeriesParams): UseHostHoverSeriesResult {
  const statusOptions = useMemo<StatusColorOptions>(
    () => ({
      colorOnline: options.colorOnline,
      colorOffline: options.colorOffline,
      colorAlert: options.colorAlert,
      statusValueMappings: options.statusValueMappings,
    }),
    [options.colorAlert, options.colorOffline, options.colorOnline, options.statusValueMappings]
  );

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

  const [series, setSeries] = useState<HostHoverSeries | undefined>();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !queryReady || !zabbixDatasourceUid) {
      setSeries(undefined);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetchHostHoverSeriesFromZabbix(
      zabbixDatasourceUid,
      lookupRef,
      hostMetadata,
      queryData?.timeRange,
      statusItemKey,
      statusOptions
    )
      .then((next) => {
        if (!cancelled) {
          setSeries(next);
        }
      })
      .catch((err) => {
        if (!cancelled && !isBenignZabbixFetchError(err)) {
          setSeries(undefined);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
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

  return { series, loading };
}
