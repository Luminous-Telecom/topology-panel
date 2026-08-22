import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { PanelProps } from '@grafana/data';
import { useTheme2 } from '@grafana/ui';
import { TopologyCanvas } from './TopologyCanvas';
import {
  HostDisplayMap,
  TopologyMap,
  TopologyPanelOptions,
  TopologyView,
  ZABBIX_DIRECT_DEFAULT_REFRESH_SEC,
  ZABBIX_DIRECT_DEFAULT_STATUS_ITEM_KEY,
  defaultOptions,
} from '../types';
import { collectHostMetadataForMaps, enrichHostDisplayFromMap, enrichHostMetadataFromMap } from '../utils/hostLookup';
import { activeChildMaps } from '../utils/childMapEdits';
import { mergeMapWithQueryHosts } from '../utils/mapSync';
import { parentMapHostKeys, submapHostListForNode } from '../utils/submapHosts';
import { enrichQueryHostOptionsFromMap, extractQueryHostOptions, filterQueryHostOptionsByDisplayHosts } from '../utils/queryHostPicker';
import { collectSubmapQueryRefIds, extractDisplayQueryHosts, flattenHostDisplayByRefId, resolveDisplayQueryRefIds, sameQueryRefInfos, sameStringList } from '../utils/queryHosts';
import {
  hostDisplayByRefIdFromIndex,
  queryHostsByRefIdFromIndex,
} from '../services/queryIndex';
import { ensureUniqueNodeIds } from '../utils/mapEdits';
import { useStableIdentity } from '../hooks/useStableIdentity';
import { validateTopologyMap } from '../utils/mapValidation';
import { useMapHistory } from '../hooks/useMapHistory';
import { useDashboardEditMode } from '../hooks/useDashboardEditMode';
import { useGrafanaPlaylistPlayback } from '../hooks/useGrafanaPlaylistPlayback';
import { useZabbixDirectIndex } from '../hooks/useZabbixDirectIndex';
import { useZabbixHostMetadata } from '../hooks/useZabbixHostMetadata';
import { useZabbixHostProblems } from '../hooks/useZabbixHostProblems';
import { useLinkMetricsRuntime } from '../hooks/useLinkMetricsRuntime';
import { normalizeStoredPanelColors, resolvePanelOptionsColors } from '../utils/panelColors';
import { CURRENT_MAP_SCHEMA_VERSION, migrateTopologyMap } from '../utils/mapMigration';
import { useTopologyMapNavigation } from '../hooks/useTopologyMapNavigation';
import {
  ROOT_MAP_ID,
  applyTopologyMapToPanelOptions,
  resolveTopologyMapById,
} from '../utils/topologyMapNavigation';
import { canPersistTopologyPanelOptions } from '../utils/grafanaDashboardEdit';

const NO_METADATA_HOSTS: string[] = [];

export interface Props extends PanelProps<TopologyPanelOptions> {}

export function TopologyPanel({
  options,
  data,
  width,
  height,
  eventBus,
  onOptionsChange,
}: Props) {
  const theme = useTheme2();
  const dashboardEditing = useDashboardEditMode();
  const canPersistOptions = canPersistTopologyPanelOptions(onOptionsChange, dashboardEditing);
  const playlistPlayback = useGrafanaPlaylistPlayback();

  const latestOptionsRef = useRef(options);
  latestOptionsRef.current = options;

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
   * Status, hosts, grupos (refIds virtuais) e metadata vêm da API Zabbix. O índice tem o mesmo
   * formato que o painel já consome rio abaixo.
   */
  const direct = useZabbixDirectIndex({
    enabled: true,
    datasourceUid: resolvedOptions.zabbixDatasourceUid,
    groupNames: resolvedOptions.zabbixHostGroups ?? [],
    statusItemKey: resolvedOptions.zabbixStatusItemKey ?? ZABBIX_DIRECT_DEFAULT_STATUS_ITEM_KEY,
    refreshSec: resolvedOptions.zabbixRefreshSec ?? ZABBIX_DIRECT_DEFAULT_REFRESH_SEC,
    eventBus,
  });

  const queryIndex = direct.index;
  const queryMeta = queryIndex.metadata;
  const zabbixDatasourceUid = resolvedOptions.zabbixDatasourceUid;

  /**
   * O `host.get` do snapshot já traz nome, IP, descrição, grupos e tags — buscar metadata de novo
   * seria uma segunda volta na API pelo mesmo dado.
   */
  const metadataHostNames = NO_METADATA_HOSTS;

  const { metadata: apiHostMetadata, loading: zabbixMetadataLoading } = useZabbixHostMetadata(
    zabbixDatasourceUid,
    metadataHostNames
  );

  const dataMetaRaw = useMemo(
    () => enrichHostMetadataFromMap({ ...queryMeta, ...apiHostMetadata }, activeStoredMap),
    [queryMeta, apiHostMetadata, activeStoredMap]
  );

  /**
   * Raiz da estabilidade de identidade do painel: quase tudo que desce para o canvas (mapa
   * mesclado, opções de host, hosts de submapa) deriva da metadata. Sem reaproveitar a identidade
   * anterior, um refresh sem mudança nenhuma remedia todos os nós.
   */
  const dataMeta = useStableIdentity(dataMetaRaw);

  /**
   * Fonte de dados em erro (datasource fora do ar, script quebrado, etc.) — não reaproveita o
   * último status bom indefinidamente. Sem isto, uma falha permanente mascararia o problema
   * mostrando para sempre o último status visto (ver `no-fallbacks.mdc`).
   */
  const queryError = Boolean(direct.error);

  const { metricsByLink: linkMetricsByLink, fetchedAtMs: linkMetricsFetchedAtMs } = useLinkMetricsRuntime(
    zabbixDatasourceUid,
    activeStoredMap,
    resolvedOptions,
    !queryError,
    {
      refreshSec: resolvedOptions.zabbixRefreshSec ?? ZABBIX_DIRECT_DEFAULT_REFRESH_SEC,
      eventBus,
    }
  );

  const liveHostDisplayByRefId = useMemo(() => {
    const byRef = hostDisplayByRefIdFromIndex(queryIndex, statusColorOptions);
    const enriched: Record<string, HostDisplayMap> = {};
    for (const [refId, bucket] of Object.entries(byRef)) {
      enriched[refId] = enrichHostDisplayFromMap(bucket, activeStoredMap, dataMeta);
    }
    return enriched;
  }, [queryIndex, statusColorOptions, activeStoredMap, dataMeta]);

  const hostDisplayByRefIdRaw = useMemo(() => {
    if (queryError || !direct.ready) {
      return {};
    }
    return liveHostDisplayByRefId;
  }, [liveHostDisplayByRefId, queryError, direct.ready]);

  /**
   * O refresh entrega objetos novos mesmo para host que não mudou de valor. Sem reaproveitar a
   * identidade anterior, `useNodeLayouts` remedia todos os nós e o `React.memo` de cada forma
   * falha — um poll sem mudança nenhuma redesenhava o mapa inteiro.
   */
  const hostDisplayByRefId = useStableIdentity(hostDisplayByRefIdRaw);

  const hostDisplayRaw = useMemo(
    () =>
      enrichHostDisplayFromMap(
        flattenHostDisplayByRefId(hostDisplayByRefId),
        activeStoredMap,
        dataMeta
      ),
    [hostDisplayByRefId, activeStoredMap, dataMeta]
  );

  const hostDisplay = useStableIdentity(hostDisplayRaw);

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

  const displayQueryHostsRaw = useMemo(
    () => extractDisplayQueryHosts(queryIndex, submapQueryRefIds, displayQueryRefIds),
    [queryIndex, submapQueryRefIds, displayQueryRefIds]
  );

  const displayQueryHosts = useStableIdentity(displayQueryHostsRaw);

  const hostMetadata = dataMeta;

  const queryReady = direct.ready;

  const displayMap = useMemo(
    () => mergeMapWithQueryHosts(activeStoredMap, displayQueryHosts, hostMetadata),
    [activeStoredMap, displayQueryHosts, hostMetadata]
  );

  const queryHostOptionsRaw = useMemo(() => {
    const enriched = enrichQueryHostOptionsFromMap(
      extractQueryHostOptions(queryIndex, hostMetadata),
      activeStoredMap
    );
    return filterQueryHostOptionsByDisplayHosts(enriched, displayQueryHosts, hostMetadata);
  }, [queryIndex, displayQueryHosts, hostMetadata, activeStoredMap]);

  const queryHostOptions = useStableIdentity(queryHostOptionsRaw);

  const submapNodes = useMemo(() => {
    return activeStoredMap.nodes.filter(
      (n) =>
        n.type === 'submap' &&
        (n.submapUid?.trim() || n.queryRefId?.trim() || n.submapChildMapId?.trim())
    );
  }, [activeStoredMap.nodes]);

  const liveQueryHostsByRefId = useMemo(() => queryHostsByRefIdFromIndex(queryIndex), [queryIndex]);

  const queryHostsByRefIdRaw = useMemo(
    () => (queryError || !direct.ready ? {} : liveQueryHostsByRefId),
    [liveQueryHostsByRefId, queryError, direct.ready]
  );

  const queryHostsByRefId = useStableIdentity(queryHostsByRefIdRaw);

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


  const problemsHostMetadata = useMemo(() => {
    if (!queryReady) {
      return {};
    }
    const maps = [resolvedOptions.map, ...Object.values(activeChildMaps(resolvedOptions.childMaps))];
    return collectHostMetadataForMaps(maps, hostMetadata);
  }, [queryReady, resolvedOptions.map, resolvedOptions.childMaps, hostMetadata]);

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

  const { problems: hostProblemsRaw } = useZabbixHostProblems(
    queryReady ? zabbixDatasourceUid : undefined,
    problemsHostMetadata
  );

  const hostProblems = useStableIdentity(hostProblemsRaw);

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
        refreshIntervalSec={resolvedOptions.zabbixRefreshSec ?? ZABBIX_DIRECT_DEFAULT_REFRESH_SEC}
        queryData={data}
        zabbixDatasourceUid={zabbixDatasourceUid}
        zabbixMetadataLoading={zabbixMetadataLoading}
        linkMetricsByLink={linkMetricsByLink}
        linkMetricsFetchedAtMs={linkMetricsFetchedAtMs}
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
