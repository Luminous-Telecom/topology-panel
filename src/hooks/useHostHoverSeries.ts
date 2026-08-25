import { useMemo } from 'react';
import { HostMetadataMap } from '../types';
import { HostLookupRef } from '../utils/hostLookup';
import { HostHoverSeries, HostHoverSeriesMap, lookupHostHoverSeries } from '../utils/hostTimeSeries';

interface UseHostHoverSeriesParams {
  enabled: boolean;
  lookupRef: HostLookupRef;
  hostMetadata?: HostMetadataMap;
  hoverByHost?: HostHoverSeriesMap;
  queryReady?: boolean;
}

interface UseHostHoverSeriesResult {
  series: HostHoverSeries | undefined;
  loading: boolean;
}

export function useHostHoverSeries({
  enabled,
  lookupRef,
  hostMetadata,
  hoverByHost,
  queryReady,
}: UseHostHoverSeriesParams): UseHostHoverSeriesResult {
  const series = useMemo(() => {
    if (!enabled || !queryReady) {
      return undefined;
    }
    return lookupHostHoverSeries(hoverByHost, lookupRef, hostMetadata);
  }, [enabled, hoverByHost, hostMetadata, lookupRef, queryReady]);

  return { series, loading: Boolean(enabled && !queryReady) };
}
