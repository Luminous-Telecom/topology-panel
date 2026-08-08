import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PanelProps } from '@grafana/data';
import { useTheme2 } from '@grafana/ui';
import { TopologyCanvas } from './TopologyCanvas';
import { HostMetadataMap, TopologyMap, TopologyPanelOptions, defaultOptions } from '../types';
import {
  extractHostMetadataFromData,
  extractHostStatus,
  extractQueryHosts,
  mergeMapWithQueryHosts,
} from '../utils';
import { fetchZabbixHostMetadata } from '../utils/zabbixApi';

export interface Props extends PanelProps<TopologyPanelOptions> {}

export function TopologyPanel({ options, data, width, height, onOptionsChange }: Props) {
  const theme = useTheme2();
  const [fetchedMeta, setFetchedMeta] = useState<HostMetadataMap>({});

  const resolvedOptions = useMemo(() => {
    return {
      ...defaultOptions(),
      ...options,
      map: options.map ?? { width: 1200, height: 800, nodes: [], links: [] },
    };
  }, [options]);

  const queryHosts = useMemo(
    () => extractQueryHosts(data, resolvedOptions),
    [data, resolvedOptions]
  );

  const dataMeta = useMemo(
    () => extractHostMetadataFromData(data, resolvedOptions),
    [data, resolvedOptions]
  );

  useEffect(() => {
    const uid = resolvedOptions.zabbixDatasourceUid;
    if (!uid || !queryHosts.length) {
      setFetchedMeta({});
      return;
    }

    let cancelled = false;
    fetchZabbixHostMetadata(uid, resolvedOptions.zabbixGroupFilter, queryHosts).then((meta) => {
      if (!cancelled) {
        setFetchedMeta(meta);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [queryHosts, resolvedOptions.zabbixDatasourceUid, resolvedOptions.zabbixGroupFilter]);

  const hostMetadata = useMemo(
    () => ({ ...dataMeta, ...fetchedMeta }),
    [dataMeta, fetchedMeta]
  );

  const displayMap = useMemo(() => {
    return mergeMapWithQueryHosts(resolvedOptions.map, queryHosts, hostMetadata);
  }, [resolvedOptions.map, queryHosts, hostMetadata]);

  const statusMap = useMemo(() => extractHostStatus(data, resolvedOptions), [data, resolvedOptions]);

  const handleMapChange = useCallback(
    (map: TopologyMap) => {
      onOptionsChange({ ...options, map });
    },
    [onOptionsChange, options]
  );

  if (width < 1 || height < 1) {
    return null;
  }

  return (
    <div
      style={{
        width,
        height,
        background: theme.colors.background.primary,
        overflow: 'hidden',
        overscrollBehavior: 'none',
      }}
    >
      <TopologyCanvas
        map={displayMap}
        storedMap={resolvedOptions.map}
        options={resolvedOptions}
        statusMap={statusMap}
        onMapChange={handleMapChange}
      />
    </div>
  );
}
