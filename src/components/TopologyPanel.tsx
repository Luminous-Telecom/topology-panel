import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LoadingState, PanelProps } from '@grafana/data';
import { locationService } from '@grafana/runtime';
import { useTheme2 } from '@grafana/ui';
import { TopologyCanvas } from './TopologyCanvas';
import { HostDisplayMap, TopologyMap, TopologyPanelOptions, TopologyView, defaultOptions } from '../types';
import { enrichHostDisplayFromMap, enrichHostMetadataFromMap } from '../utils/hostLookup';
import { mergeMapWithQueryHosts, syncMapWithQueryMeta } from '../utils/mapSync';
import { parentMapHostKeys, submapHostListForNode } from '../utils/submapHosts';
import { enrichQueryHostOptionsFromMap, extractQueryHostOptions, filterQueryHostOptionsByDisplayHosts } from '../utils/queryHostPicker';
import { collectSubmapQueryRefIds, extractDisplayQueryHosts, flattenHostDisplayByRefId, mergeHostDisplayByRefId, mergeQueryHostsByRefId, resolveDisplayQueryRefIds, sameQueryRefInfos, sameStringList } from '../utils/queryHosts';
import {
  buildQueryIndex,
  hostDisplayByRefIdFromIndex,
  queryHostsByRefIdFromIndex,
} from '../services/queryIndex';
import { ensureUniqueNodeIds } from '../utils/mapEdits';
import { validateTopologyMap } from '../utils/mapValidation';
import { useMapHistory } from '../hooks/useMapHistory';
import { useDashboardEditMode } from '../hooks/useDashboardEditMode';
import { useDashboardVariableNav } from '../hooks/useDashboardVariableNav';
import { useGrafanaPlaylistPlayback } from '../hooks/useGrafanaPlaylistPlayback';
import { useZabbixHostMetadata } from '../hooks/useZabbixHostMetadata';
import { normalizeStoredPanelColors, resolvePanelOptionsColors } from '../utils/panelColors';
import { parseGrafanaRefreshSeconds, readDashboardRefreshSeconds } from '../utils/dashboardRefresh';

export interface Props extends PanelProps<TopologyPanelOptions> {}

export function TopologyPanel({
  options,
  data,
  width,
  height,
  onOptionsChange,
}: Props) {
  const theme = useTheme2();
  const dashboardEditing = useDashboardEditMode();
  const playlistPlayback = useGrafanaPlaylistPlayback();
  useDashboardVariableNav(options.dashboardNavVariable?.trim() || 'mapa');

  const [refreshIntervalSec, setRefreshIntervalSec] = useState<number | null>(() => readDashboardRefreshSeconds());

  const latestOptionsRef = useRef(options);
  latestOptionsRef.current = options;
  /** Último status da Query — evita flash no refresh (séries parciais por refId). */
  const lastGoodHostDisplayByRefIdRef = useRef<Record<string, HostDisplayMap>>({});
  const lastGoodQueryHostsByRefIdRef = useRef<Record<string, string[]>>({});

  /**
   * Erros estruturais em `options.map` (JSON editado à mão, fora do `TopologyEditor`) — `nodes`/
   * `links` não são arrays, ou `width`/`height` não são números positivos. Quando não vazio, o
   * painel mostra um erro explícito em vez de montar o canvas (ver `no-fallbacks.mdc`).
   */
  const mapValidationErrors = useMemo(
    () => (options.map ? validateTopologyMap(options.map) : []),
    [options.map]
  );

  const resolvedOptions = useMemo(() => {
    // Mapa malformado nunca é usado para renderizar — só evita que os hooks abaixo quebrem antes
    // do erro explícito (ver `mapValidationErrors`) ser mostrado.
    const useIncomingMap = Boolean(options.map) && mapValidationErrors.length === 0;
    const merged = {
      ...defaultOptions(),
      ...options,
      map: useIncomingMap ? ensureUniqueNodeIds(options.map as TopologyMap) : defaultOptions().map,
    };
    const colored = resolvePanelOptionsColors(merged, theme);
    return {
      ...colored,
    };
  }, [options, theme, mapValidationErrors]);

  const statusColorOptions = useMemo(
    () => ({
      colorOnline: resolvedOptions.colorOnline,
      colorOffline: resolvedOptions.colorOffline,
      colorAlert: resolvedOptions.colorAlert,
      statusValueMappings: resolvedOptions.statusValueMappings,
    }),
    [
      resolvedOptions.colorOnline,
      resolvedOptions.colorOffline,
      resolvedOptions.colorAlert,
      resolvedOptions.statusValueMappings,
    ]
  );

  /**
   * Leitura única das séries da Query. Metadata, hosts, refIds e status por refId saem todos
   * daqui — antes cada um percorria `data.series` por conta própria a cada refresh.
   */
  const queryIndex = useMemo(() => buildQueryIndex(data), [data]);
  const queryMeta = queryIndex.metadata;
  const queryHosts = queryIndex.hosts;
  const zabbixDatasourceUid = queryIndex.datasourceUid;

  const { metadata: apiHostMetadata, loading: zabbixMetadataLoading } = useZabbixHostMetadata(
    zabbixDatasourceUid,
    queryHosts
  );

  const dataMeta = useMemo(
    () => enrichHostMetadataFromMap({ ...queryMeta, ...apiHostMetadata }, resolvedOptions.map),
    [queryMeta, apiHostMetadata, resolvedOptions.map]
  );

  /**
   * Query em erro (datasource fora do ar, script quebrado, etc.) — não reaproveita o último
   * status bom indefinidamente. Sem isto, uma falha permanente na Query mascararia o problema
   * mostrando para sempre o último status visto (ver `no-fallbacks.mdc`).
   */
  const queryError = data.state === LoadingState.Error;

  const liveHostDisplayByRefId = useMemo(() => {
    const byRef = hostDisplayByRefIdFromIndex(queryIndex, statusColorOptions);
    const enriched: Record<string, HostDisplayMap> = {};
    for (const [refId, bucket] of Object.entries(byRef)) {
      enriched[refId] = enrichHostDisplayFromMap(bucket, resolvedOptions.map, dataMeta);
    }
    return enriched;
  }, [queryIndex, statusColorOptions, resolvedOptions.map, dataMeta]);

  const hostDisplayByRefId = useMemo(
    () =>
      queryError ? {} : mergeHostDisplayByRefId(liveHostDisplayByRefId, lastGoodHostDisplayByRefIdRef.current),
    [liveHostDisplayByRefId, queryError]
  );

  useEffect(() => {
    if (queryError) {
      lastGoodHostDisplayByRefIdRef.current = {};
      return;
    }
    if (Object.keys(hostDisplayByRefId).length > 0) {
      lastGoodHostDisplayByRefIdRef.current = hostDisplayByRefId;
    }
  }, [hostDisplayByRefId, queryError]);

  const hostDisplay = useMemo(
    () =>
      enrichHostDisplayFromMap(
        flattenHostDisplayByRefId(hostDisplayByRefId),
        resolvedOptions.map,
        dataMeta
      ),
    [hostDisplayByRefId, resolvedOptions.map, dataMeta]
  );

  const queryRefIdsAvailable = queryIndex.refIds;
  const queryRefInfosAvailable = queryIndex.refInfos;

  useEffect(() => {
    if (!onOptionsChange) {
      return;
    }
    const currentIds = latestOptionsRef.current.queryRefIdsAvailable ?? [];
    const currentInfos = latestOptionsRef.current.queryRefInfosAvailable ?? [];
    if (
      sameStringList(currentIds, queryRefIdsAvailable) &&
      sameQueryRefInfos(currentInfos, queryRefInfosAvailable)
    ) {
      return;
    }
    onOptionsChange({
      ...latestOptionsRef.current,
      queryRefIdsAvailable,
      queryRefInfosAvailable,
    });
  }, [onOptionsChange, queryRefIdsAvailable, queryRefInfosAvailable]);

  const submapQueryRefIds = useMemo(
    () => collectSubmapQueryRefIds(resolvedOptions.map),
    [resolvedOptions.map]
  );

  const displayQueryRefIds = useMemo(
    () => resolveDisplayQueryRefIds(resolvedOptions),
    [resolvedOptions.displayQueryRefIds]
  );

  const displayQueryHosts = useMemo(
    () => extractDisplayQueryHosts(data, submapQueryRefIds, displayQueryRefIds),
    [data, submapQueryRefIds, displayQueryRefIds]
  );

  const hostMetadata = dataMeta;

  const queryReady =
    data.state === LoadingState.Done ||
    data.state === LoadingState.Streaming ||
    (data.state === LoadingState.Loading && Object.keys(hostDisplay).length > 0);

  const displayMap = useMemo(
    () => mergeMapWithQueryHosts(resolvedOptions.map, displayQueryHosts, hostMetadata),
    [resolvedOptions.map, displayQueryHosts, hostMetadata]
  );

  const queryHostOptions = useMemo(() => {
    const enriched = enrichQueryHostOptionsFromMap(
      extractQueryHostOptions(data, hostMetadata),
      resolvedOptions.map
    );
    return filterQueryHostOptionsByDisplayHosts(enriched, displayQueryHosts, hostMetadata);
  }, [data, displayQueryHosts, hostMetadata, resolvedOptions.map]);

  const submapNodes = useMemo(() => {
    return resolvedOptions.map.nodes.filter(
      (n) => n.type === 'submap' && (n.submapUid?.trim() || n.queryRefId?.trim())
    );
  }, [resolvedOptions.map.nodes]);

  const liveQueryHostsByRefId = useMemo(() => queryHostsByRefIdFromIndex(queryIndex), [queryIndex]);

  const queryHostsByRefId = useMemo(
    () =>
      queryError ? {} : mergeQueryHostsByRefId(liveQueryHostsByRefId, lastGoodQueryHostsByRefIdRef.current),
    [liveQueryHostsByRefId, queryError]
  );

  useEffect(() => {
    if (queryError) {
      lastGoodQueryHostsByRefIdRef.current = {};
      return;
    }
    if (Object.keys(queryHostsByRefId).length > 0) {
      lastGoodQueryHostsByRefIdRef.current = queryHostsByRefId;
    }
  }, [queryHostsByRefId, queryError]);

  const parentHostKeys = useMemo(
    () => parentMapHostKeys(displayMap, hostMetadata),
    [displayMap, hostMetadata]
  );

  const submapHosts = useMemo(() => {
    const result: Record<string, string[] | null | undefined> = {};
    for (const node of submapNodes) {
      result[node.id] = submapHostListForNode(
        node,
        hostDisplayByRefId,
        queryHostsByRefId,
        queryReady,
        parentHostKeys,
        hostMetadata
      );
    }
    return result;
  }, [submapNodes, hostDisplayByRefId, queryHostsByRefId, queryReady, parentHostKeys, hostMetadata]);

  useEffect(() => {
    if (!onOptionsChange) {
      return;
    }
    const merged = {
      ...defaultOptions(),
      ...options,
      ...(options.map ? { map: options.map } : {}),
    };
    const { options: normalized, changed } = normalizeStoredPanelColors(merged, theme);
    if (changed) {
      onOptionsChange(normalized);
    }
  }, [options, theme, onOptionsChange]);

  useEffect(() => {
    const syncInterval = () => {
      setRefreshIntervalSec(parseGrafanaRefreshSeconds(locationService.getSearchObject().refresh));
    };
    syncInterval();
    return locationService.getHistory().listen(syncInterval);
  }, []);

  useEffect(() => {
    if (!onOptionsChange || mapValidationErrors.length > 0) {
      return;
    }
    const currentMap = latestOptionsRef.current.map;
    if (!currentMap || !Array.isArray(currentMap.nodes)) {
      return;
    }
    const unique = ensureUniqueNodeIds(currentMap);
    const synced = Object.keys(dataMeta).length ? syncMapWithQueryMeta(unique, dataMeta) : null;
    const next = synced ?? (unique !== currentMap ? unique : null);
    if (next) {
      onOptionsChange({ ...latestOptionsRef.current, map: next });
    }
  }, [dataMeta, mapValidationErrors, onOptionsChange]);

  const applyMap = useCallback(
    (map: TopologyMap) => {
      onOptionsChange({ ...latestOptionsRef.current, map });
    },
    [onOptionsChange]
  );

  const { commitChange, undo, redo, canUndo, canRedo } = useMapHistory(resolvedOptions.map, applyMap);

  const handleViewChange = useCallback(
    (view: TopologyView) => {
      onOptionsChange({ ...latestOptionsRef.current, view });
    },
    [onOptionsChange]
  );

  const handleShowMinimapChange = useCallback(
    (show: boolean) => {
      onOptionsChange({ ...latestOptionsRef.current, showMinimap: show });
    },
    [onOptionsChange]
  );

  const handleShowLegendChange = useCallback(
    (show: boolean) => {
      onOptionsChange({ ...latestOptionsRef.current, showLegend: show });
    },
    [onOptionsChange]
  );

  if (width < 1 || height < 1) {
    return null;
  }

  if (mapValidationErrors.length > 0) {
    return (
      <div
        style={{
          width,
          height,
          background: theme.colors.background.primary,
          color: theme.colors.error.text,
          overflow: 'auto',
          padding: 16,
          fontSize: 13,
          lineHeight: 1.5,
        }}
      >
        <strong>Mapa de topologia inválido (options.map)</strong>
        <ul style={{ marginTop: 8 }}>
          {mapValidationErrors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
        <div>Corrija o JSON do mapa no editor do painel (aba do plugin) e salve novamente.</div>
      </div>
    );
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
        queryHostOptions={queryHostOptions}
        hostDisplay={hostDisplay}
        hostDisplayByRefId={hostDisplayByRefId}
        queryReady={queryReady}
        queryError={queryError}
        hostMetadata={hostMetadata}
        submapHosts={submapHosts}
        refreshIntervalSec={refreshIntervalSec}
        queryData={data}
        zabbixDatasourceUid={zabbixDatasourceUid}
        zabbixMetadataLoading={zabbixMetadataLoading}
        onMapChange={dashboardEditing ? commitChange : undefined}
        onViewChange={dashboardEditing ? handleViewChange : undefined}
        onShowMinimapChange={handleShowMinimapChange}
        onShowLegendChange={handleShowLegendChange}
        onUndo={dashboardEditing ? undo : undefined}
        onRedo={dashboardEditing ? redo : undefined}
        canUndo={dashboardEditing && canUndo}
        canRedo={dashboardEditing && canRedo}
        hideOverlayControls={playlistPlayback}
      />
    </div>
  );
}
