import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LoadingState, PanelProps } from '@grafana/data';
import { locationService } from '@grafana/runtime';
import { useTheme2 } from '@grafana/ui';
import { TopologyCanvas } from './TopologyCanvas';
import { HostDisplayMap, TopologyMap, TopologyPanelOptions, TopologyView, defaultOptions } from '../types';
import { enrichHostDisplayFromMap, enrichHostMetadataFromMap } from '../utils/hostLookup';
import { mergeMapWithQueryHosts, syncMapWithQueryMeta } from '../utils/mapSync';
import { applyTemplateRulesToMap } from '../utils/topologyTemplates/resolveTemplates';
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
import { useGrafanaPlaylistPlayback } from '../hooks/useGrafanaPlaylistPlayback';
import { useZabbixHostMetadata } from '../hooks/useZabbixHostMetadata';
import { useZabbixHostProblems } from '../hooks/useZabbixHostProblems';
import { useLinkMetricsRuntime } from '../hooks/useLinkMetricsRuntime';
import { normalizeStoredPanelColors, resolvePanelOptionsColors } from '../utils/panelColors';
import { CURRENT_MAP_SCHEMA_VERSION, migrateTopologyMap } from '../utils/mapMigration';
import { parseGrafanaRefreshSeconds, readDashboardRefreshSeconds } from '../utils/dashboardRefresh';
import { useTopologyMapNavigation } from '../hooks/useTopologyMapNavigation';
import {
  ROOT_MAP_ID,
  applyTopologyMapToPanelOptions,
  resolveTopologyMapById,
} from '../utils/topologyMapNavigation';
import { canPersistTopologyPanelOptions } from '../utils/grafanaDashboardEdit';

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
  const canPersistOptions = canPersistTopologyPanelOptions(onOptionsChange, dashboardEditing);
  const playlistPlayback = useGrafanaPlaylistPlayback();
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
    const rawMap = useIncomingMap ? ensureUniqueNodeIds(options.map as TopologyMap) : defaultOptions().map;
    const migratedMap =
      (rawMap.schemaVersion ?? 1) < CURRENT_MAP_SCHEMA_VERSION ? migrateTopologyMap(rawMap) : rawMap;
    const merged = {
      ...defaultOptions(),
      ...options,
      map: useIncomingMap ? migratedMap : defaultOptions().map,
    };
    const colored = resolvePanelOptionsColors(merged, theme);
    return {
      ...colored,
    };
  }, [options, theme, mapValidationErrors]);

  const handlePersistNavView = useCallback(
    (mapId: string, view: TopologyView) => {
      if (!canPersistOptions) {
        return;
      }
      if (mapId === ROOT_MAP_ID) {
        onOptionsChange({ ...latestOptionsRef.current, view });
        return;
      }
      onOptionsChange({
        ...latestOptionsRef.current,
        childMapViews: {
          ...(latestOptionsRef.current.childMapViews ?? {}),
          [mapId]: view,
        },
      });
    },
    [canPersistOptions, onOptionsChange]
  );

  const {
    currentMapId,
    breadcrumb,
    canGoBack,
    canGoForward,
    savedViewForCurrent,
    navigateToChild,
    navigateToMapId,
    navigateToHome,
    goBack,
    goForward,
  } = useTopologyMapNavigation({
    rootView: resolvedOptions.view,
    childMapViews: resolvedOptions.childMapViews,
    onPersistView: handlePersistNavView,
  });

  const activeStoredMap = useMemo(
    () => resolveTopologyMapById(resolvedOptions, currentMapId) ?? resolvedOptions.map,
    [resolvedOptions, currentMapId]
  );

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
    () => enrichHostMetadataFromMap({ ...queryMeta, ...apiHostMetadata }, activeStoredMap),
    [queryMeta, apiHostMetadata, activeStoredMap]
  );

  /**
   * Query em erro (datasource fora do ar, script quebrado, etc.) — não reaproveita o último
   * status bom indefinidamente. Sem isto, uma falha permanente na Query mascararia o problema
   * mostrando para sempre o último status visto (ver `no-fallbacks.mdc`).
   */
  const queryError = data.state === LoadingState.Error;

  const { metricsByLink: linkMetricsByLink } = useLinkMetricsRuntime(
    zabbixDatasourceUid,
    activeStoredMap,
    resolvedOptions,
    !queryError
  );

  const liveHostDisplayByRefId = useMemo(() => {
    const byRef = hostDisplayByRefIdFromIndex(queryIndex, statusColorOptions);
    const enriched: Record<string, HostDisplayMap> = {};
    for (const [refId, bucket] of Object.entries(byRef)) {
      enriched[refId] = enrichHostDisplayFromMap(bucket, activeStoredMap, dataMeta);
    }
    return enriched;
  }, [queryIndex, statusColorOptions, activeStoredMap, dataMeta]);

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
        activeStoredMap,
        dataMeta
      ),
    [hostDisplayByRefId, activeStoredMap, dataMeta]
  );

  const queryRefIdsAvailable = queryIndex.refIds;
  const queryRefInfosAvailable = queryIndex.refInfos;

  useEffect(() => {
    if (!canPersistOptions) {
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
  }, [canPersistOptions, onOptionsChange, queryRefIdsAvailable, queryRefInfosAvailable]);

  const submapQueryRefIds = useMemo(
    () => collectSubmapQueryRefIds(activeStoredMap),
    [activeStoredMap]
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
    () => mergeMapWithQueryHosts(activeStoredMap, displayQueryHosts, hostMetadata),
    [activeStoredMap, displayQueryHosts, hostMetadata]
  );

  const queryHostOptions = useMemo(() => {
    const enriched = enrichQueryHostOptionsFromMap(
      extractQueryHostOptions(data, hostMetadata),
      activeStoredMap
    );
    return filterQueryHostOptionsByDisplayHosts(enriched, displayQueryHosts, hostMetadata);
  }, [data, displayQueryHosts, hostMetadata, activeStoredMap]);

  const submapNodes = useMemo(() => {
    return activeStoredMap.nodes.filter(
      (n) =>
        n.type === 'submap' &&
        (n.submapUid?.trim() || n.queryRefId?.trim() || n.submapChildMapId?.trim())
    );
  }, [activeStoredMap.nodes]);

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
    if (!canPersistOptions) {
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
  }, [canPersistOptions, options, theme, onOptionsChange]);

  useEffect(() => {
    const syncInterval = () => {
      setRefreshIntervalSec(parseGrafanaRefreshSeconds(locationService.getSearchObject().refresh));
    };
    syncInterval();
    return locationService.getHistory().listen(syncInterval);
  }, []);

  useEffect(() => {
    if (!canPersistOptions || mapValidationErrors.length > 0) {
      return;
    }
    const currentMap = latestOptionsRef.current.map;
    if (!currentMap || !Array.isArray(currentMap.nodes)) {
      return;
    }
    if ((currentMap.schemaVersion ?? 1) < CURRENT_MAP_SCHEMA_VERSION) {
      onOptionsChange({
        ...latestOptionsRef.current,
        map: migrateTopologyMap(currentMap),
      });
      return;
    }
    const unique = ensureUniqueNodeIds(currentMap);
    const synced = Object.keys(dataMeta).length ? syncMapWithQueryMeta(unique, dataMeta) : null;
    let candidate = synced ?? (unique !== currentMap ? unique : null);
    if (candidate) {
      const templated = applyTemplateRulesToMap(candidate, latestOptionsRef.current, dataMeta);
      if (templated !== candidate) {
        candidate = templated;
      }
      onOptionsChange({ ...latestOptionsRef.current, map: candidate });
    }
  }, [canPersistOptions, dataMeta, mapValidationErrors, onOptionsChange]);

  const applyActiveMap = useCallback(
    (map: TopologyMap) => {
      if (!canPersistOptions || !onOptionsChange) {
        return;
      }
      onOptionsChange(applyTopologyMapToPanelOptions(latestOptionsRef.current, currentMapId, map));
    },
    [canPersistOptions, currentMapId, onOptionsChange]
  );

  const { commitChange, undo, redo, canUndo, canRedo } = useMapHistory(activeStoredMap, applyActiveMap);

  const { problems: hostProblems } = useZabbixHostProblems(
    zabbixDatasourceUid,
    hostMetadata,
    data
  );

  const handleNocModeChange = useCallback(
    (enabled: boolean) => {
      if (!canPersistOptions) {
        return;
      }
      onOptionsChange({ ...latestOptionsRef.current, nocMode: enabled });
    },
    [canPersistOptions, onOptionsChange]
  );

  const handleActiveViewChange = useCallback(
    (view: TopologyView) => {
      if (!canPersistOptions) {
        return;
      }
      if (currentMapId === ROOT_MAP_ID) {
        onOptionsChange({ ...latestOptionsRef.current, view });
        return;
      }
      onOptionsChange({
        ...latestOptionsRef.current,
        childMapViews: {
          ...(latestOptionsRef.current.childMapViews ?? {}),
          [currentMapId]: view,
        },
      });
    },
    [canPersistOptions, currentMapId, onOptionsChange]
  );

  const handleShowMinimapChange = useCallback(
    (show: boolean) => {
      if (!canPersistOptions) {
        return;
      }
      onOptionsChange({ ...latestOptionsRef.current, showMinimap: show });
    },
    [canPersistOptions, onOptionsChange]
  );

  const handleShowLegendChange = useCallback(
    (show: boolean) => {
      if (!canPersistOptions) {
        return;
      }
      onOptionsChange({ ...latestOptionsRef.current, showLegend: show });
    },
    [canPersistOptions, onOptionsChange]
  );

  const handleShowHostAlertListChange = useCallback(
    (show: boolean) => {
      if (!canPersistOptions) {
        return;
      }
      onOptionsChange({ ...latestOptionsRef.current, showHostAlertList: show });
    },
    [canPersistOptions, onOptionsChange]
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
        storedMap={currentMapId === ROOT_MAP_ID ? resolvedOptions.map : activeStoredMap}
        options={resolvedOptions}
        savedView={savedViewForCurrent}
        mapNavigationKey={currentMapId}
        mapNavigationBreadcrumb={breadcrumb}
        canMapNavigateBack={canGoBack}
        canMapNavigateForward={canGoForward}
        onMapNavigateBack={(view) => goBack(view)}
        onMapNavigateForward={(view) => goForward(view)}
        onMapNavigateHome={(view) => navigateToHome(view)}
        onNavigateToChildMap={navigateToChild}
        onNavigateToMapId={navigateToMapId}
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
        linkMetricsByLink={linkMetricsByLink}
        hostProblems={hostProblems}
        onNocModeChange={handleNocModeChange}
        onMapChange={canPersistOptions ? commitChange : undefined}
        onViewChange={canPersistOptions ? handleActiveViewChange : undefined}
        onShowMinimapChange={handleShowMinimapChange}
        onShowLegendChange={handleShowLegendChange}
        onShowHostAlertListChange={handleShowHostAlertListChange}
        onUndo={canPersistOptions ? undo : undefined}
        onRedo={canPersistOptions ? redo : undefined}
        canUndo={canPersistOptions && canUndo}
        canRedo={canPersistOptions && canRedo}
        hideOverlayControls={playlistPlayback}
      />
    </div>
  );
}
