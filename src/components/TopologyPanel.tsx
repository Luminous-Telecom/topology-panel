import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanelProps } from '@grafana/data';
import { useTheme2 } from '@grafana/ui';
import { TopologyCanvas } from './TopologyCanvas';
import {
  HostDisplayMap,
  HostMetadataMap,
  TopologyLink,
  TopologyMap,
  TopologyPanelOptions,
  TopologyView,
  ZABBIX_DIRECT_DEFAULT_REFRESH_SEC,
  ZABBIX_DIRECT_DEFAULT_STATUS_ITEM_KEY,
  defaultOptions,
} from '../types';
import { enrichHostDisplayFromMaps, enrichHostMetadataFromMaps } from '../utils/hostLookup';
import { activeChildMaps } from '../utils/childMapEdits';
import { mergeMapWithQueryHosts, patchDisplayMapPositions } from '../utils/mapSync';
import { isPositionOnlyMapChange, reuseMapsIfOnlyMoved, reuseResolvedOptionsIfOnlyMoved, sameMapDocumentFlags, sameNodeGeometry } from '../utils/mapRevision';
import { parentMapHostKeys, submapHostListForNode } from '../utils/submapHosts';
import { enrichQueryHostOptionsFromMap, extractQueryHostOptions, filterQueryHostOptionsByDisplayHosts } from '../utils/queryHostPicker';
import { collectAllSubmapGroups, collectSubmapQueryRefIds, extractDisplayQueryHosts, flattenHostDisplayByRefId, resolveDisplayQueryRefIds } from '../utils/queryHosts';
import { sameTopologyView } from '../utils/zoomMath';
import {
  hostDisplayByRefIdFromIndex,
  queryHostsByRefIdFromIndex,
} from '../services/queryIndex';
import { ensureUniqueNodeIds } from '../utils/mapEdits';
import { applyResolvedMetricItemIds } from '../utils/mapLinkEdits';
import { useStableIdentity } from '../hooks/useStableIdentity';
import { shareHostDisplayByRefId, shareHostDisplayMap } from '../utils/structuralIdentity';
import { isUninitializedTopologyMap, validateTopologyMap } from '../utils/mapValidation';
import { useMapHistory } from '../hooks/useMapHistory';
import { useDashboardEditMode } from '../hooks/useDashboardEditMode';
import { useGrafanaDashboardFlush } from '../hooks/useGrafanaDashboardFlush';
import { useGrafanaPlaylistPlayback } from '../hooks/useGrafanaPlaylistPlayback';
import { useTopologyQueryIndex } from '../hooks/useTopologyQueryIndex';
import { useLinkMetricsRuntime } from '../hooks/useLinkMetricsRuntime';
import { itemIdByKeyFromLastValues, mergeItemIdByKey, ZabbixInterfaceItem, ZabbixItemLastValue } from '../utils/zabbixApi';
import { normalizeStoredPanelColors, resolvePanelOptionsColors } from '../utils/panelColors';
import { CURRENT_MAP_SCHEMA_VERSION, migrateTopologyMap } from '../utils/mapMigration';
import { useTopologyMapNavigation } from '../hooks/useTopologyMapNavigation';
import {
  ROOT_MAP_ID,
  applyTopologyMapToPanelOptions,
  resolveTopologyMapById,
} from '../utils/topologyMapNavigation';
import { canPersistTopologyPanelOptions } from '../utils/grafanaDashboardEdit';
import {
  collectLinkMetricItemIds,
  collectLinkMetricKeys,
  collectMapsLinks,
} from '../utils/linkMetricsRuntime';
import { removeMissingInterSubmapCounterparts, syncInterSubmapCounterpartLinks } from '../utils/interSubmapLinks';
import { scheduleWhenIdle } from '../utils/scheduleAfterPaint';
import { useLicenseValidation } from '../hooks/useLicenseValidation';
import { LicenseGate } from './LicenseGate';

export interface Props extends PanelProps<TopologyPanelOptions> {}

/** Grava itemid de tráfego só quando o mapa já vai para o Grafana — não no poll nem ao entrar em edição. */
function bindTrafficItemIdsOnOptions(
  options: TopologyPanelOptions,
  lastValues: Record<string, ZabbixItemLastValue>,
  interfaceItems: ZabbixInterfaceItem[],
  hostMetadata: HostMetadataMap
): TopologyPanelOptions {
  const itemIdByKey = itemIdByKeyFromLastValues(lastValues);
  mergeItemIdByKey(itemIdByKey, interfaceItems);
  if (!itemIdByKey.size) {
    return options;
  }
  const nextMap = options.map
    ? applyResolvedMetricItemIds(options.map, itemIdByKey, hostMetadata)
    : options.map;
  let childChanged = false;
  let nextChildMaps = options.childMaps;
  if (options.childMaps) {
    const updated = { ...options.childMaps };
    for (const [id, child] of Object.entries(activeChildMaps(options.childMaps))) {
      const next = applyResolvedMetricItemIds(child, itemIdByKey, hostMetadata);
      if (next !== child) {
        updated[id] = next;
        childChanged = true;
      }
    }
    if (childChanged) {
      nextChildMaps = updated;
    }
  }
  if (nextMap === options.map && !childChanged) {
    return options;
  }
  return {
    ...options,
    ...(nextMap ? { map: nextMap } : {}),
    ...(childChanged ? { childMaps: nextChildMaps } : {}),
  };
}

export function TopologyPanel({
  options,
  width,
  height,
  onOptionsChange,
  timeRange,
  data,
}: Props) {
  const theme = useTheme2();
  const dashboardEditing = useDashboardEditMode();
  const canPersistOptions = canPersistTopologyPanelOptions(onOptionsChange, dashboardEditing);
  const playlistPlayback = useGrafanaPlaylistPlayback();
  const licenseCheck = useLicenseValidation();

  const latestOptionsRef = useRef(options);
  const pendingNocModeRef = useRef<boolean | undefined>(undefined);
  /** O Grafana passa 0×0 na transição de edição — sem isto o canvas desmontava e remontava. */
  const lastGoodPanelSizeRef = useRef({ width, height });
  latestOptionsRef.current =
    pendingNocModeRef.current === undefined
      ? options
      : { ...options, nocMode: pendingNocModeRef.current };

  /**
   * Erros estruturais em `options.map` (JSON editado à mão). `map: {}` do Grafana (painel novo)
   * não entra aqui — é `isUninitializedTopologyMap`, e o canvas usa o mapa padrão.
   */
  const mapUninitialized = isUninitializedTopologyMap(options.map);
  const mapValidationErrors = useMemo(
    () => (mapUninitialized || !options.map ? [] : validateTopologyMap(options.map)),
    [mapUninitialized, options.map]
  );

  const resolvedOptionsRaw = useMemo(() => {
    // Mapa malformado nunca é usado para renderizar — só evita que os hooks abaixo quebrem antes
    // do erro explícito (ver `mapValidationErrors`) ser mostrado.
    const useIncomingMap = Boolean(options.map) && !mapUninitialized && mapValidationErrors.length === 0;
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
  }, [options, theme, mapUninitialized, mapValidationErrors]);
  const resolvedOptionsPrevRef = useRef<TopologyPanelOptions>();
  const resolvedOptions = reuseResolvedOptionsIfOnlyMoved(resolvedOptionsPrevRef.current, resolvedOptionsRaw);
  resolvedOptionsPrevRef.current = resolvedOptions;

  const handlePersistNavView = useCallback(
    (mapId: string, view: TopologyView) => {
      if (!canPersistOptions) {
        return;
      }
      if (mapId === ROOT_MAP_ID) {
        if (sameTopologyView(latestOptionsRef.current.view, view)) {
          return;
        }
        onOptionsChange({ ...latestOptionsRef.current, view });
        return;
      }
      const current = latestOptionsRef.current.childMapViews?.[mapId];
      if (sameTopologyView(current, view)) {
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
  const [localMap, setLocalMap] = useState<TopologyMap | null>(null);
  const storedForUi = localMap ?? activeStoredMap;
  const persistTargetMapIdRef = useRef(currentMapId);

  const statusColorOptions = useMemo(
    () => ({
      colorOnline: resolvedOptions.colorOnline,
      colorOffline: resolvedOptions.colorOffline,
      colorAlert: resolvedOptions.colorAlert,
    }),
    [resolvedOptions.colorOnline, resolvedOptions.colorOffline, resolvedOptions.colorAlert]
  );

  const statusGroupNamesRaw = useMemo(
    () => collectAllSubmapGroups(resolvedOptions),
    [resolvedOptions.map, resolvedOptions.childMaps]
  );
  const statusGroupNames = useStableIdentity(statusGroupNamesRaw);

  const mapsForPollRaw = useMemo(
    () => [resolvedOptions.map, ...Object.values(activeChildMaps(resolvedOptions.childMaps))],
    [resolvedOptions.map, resolvedOptions.childMaps]
  );
  const mapsForPollPrevRef = useRef<TopologyMap[]>();
  const mapsForPoll = useMemo(() => {
    const reused = reuseMapsIfOnlyMoved(mapsForPollPrevRef.current, mapsForPollRaw);
    mapsForPollPrevRef.current = reused;
    return reused;
  }, [mapsForPollRaw]);
  const allMapLinks = useMemo(() => collectMapsLinks(mapsForPoll), [mapsForPoll]);
  const trafficItemIds = useMemo(() => collectLinkMetricItemIds(allMapLinks), [allMapLinks]);
  const trafficKeys = useMemo(() => collectLinkMetricKeys(allMapLinks), [allMapLinks]);

  /** Status e lastvalue dos cabos no mesmo ciclo. */
  const querySource = useTopologyQueryIndex({
    enabled: licenseCheck.status !== 'blocked',
    datasourceUid: resolvedOptions.zabbixDatasourceUid,
    groupNames: statusGroupNames,
    statusItemKey: ZABBIX_DIRECT_DEFAULT_STATUS_ITEM_KEY,
    refreshSec: resolvedOptions.zabbixRefreshSec ?? ZABBIX_DIRECT_DEFAULT_REFRESH_SEC,
    trafficItemIds,
    trafficKeys,
  });

  const queryIndex = querySource.index;
  const queryMeta = queryIndex.metadata;
  const zabbixDatasourceUid = resolvedOptions.zabbixDatasourceUid;
  const queryReady = querySource.ready;
  const queryError = Boolean(querySource.error);
  const queryLoading = querySource.loading && !queryReady && !queryError;
  const hostProblems = useStableIdentity(querySource.problems);

  const dataMetaRaw = useMemo(
    () => enrichHostMetadataFromMaps(queryMeta, mapsForPoll),
    [queryMeta, mapsForPoll]
  );

  /**
   * Raiz da estabilidade de identidade do painel: quase tudo que desce para o canvas (mapa
   * mesclado, opções de host, hosts de submapa) deriva da metadata. Sem reaproveitar a identidade
   * anterior, um refresh sem mudança nenhuma remedia todos os nós.
   */
  const dataMeta = useStableIdentity(dataMetaRaw);
  const trafficBindRef = useRef({
    lastValues: querySource.lastValues,
    interfaceItems: querySource.interfaceItems,
    dataMeta,
  });
  trafficBindRef.current = {
    lastValues: querySource.lastValues,
    interfaceItems: querySource.interfaceItems,
    dataMeta,
  };

  /**
   * Lastvalue e tráfego já pintados continuam no mapa se o poll falhar — o badge avisa.
   * Na abertura sem índice (`!ready`) a tela fica vazia; não inventa status.
   */
  const { metricsByLink: linkMetricsByLink } = useLinkMetricsRuntime(
    activeStoredMap,
    resolvedOptions,
    querySource.lastValues,
    dataMeta,
    querySource.interfaceItems ?? []
  );

  const hostDisplayBucketsRef = useRef<{
    index: typeof queryIndex;
    display: Record<string, HostDisplayMap>;
    statusColorOptions: typeof statusColorOptions;
  }>();

  const liveHostDisplayByRefId = useMemo(() => {
    const prev = hostDisplayBucketsRef.current;
    const display = hostDisplayByRefIdFromIndex(
      queryIndex,
      statusColorOptions,
      prev && prev.statusColorOptions === statusColorOptions
        ? { index: prev.index, display: prev.display }
        : undefined
    );
    hostDisplayBucketsRef.current = { index: queryIndex, display, statusColorOptions };
    return display;
  }, [queryIndex, statusColorOptions]);

  const hostDisplayByRefIdRaw = useMemo(() => {
    if (!querySource.ready) {
      return {};
    }
    return liveHostDisplayByRefId;
  }, [liveHostDisplayByRefId, querySource.ready]);

  /**
   * O refresh entrega objetos novos mesmo para host que não mudou de valor. Sem reaproveitar a
   * identidade anterior, `useNodeLayouts` remedia todos os nós e o `React.memo` de cada forma
   * falha. Lastclock entra em `shareHostDisplay*` e não conta como mudança.
   */
  const hostDisplayByRefId = useStableIdentity(hostDisplayByRefIdRaw, shareHostDisplayByRefId);

  const hostDisplayRaw = useMemo(
    () =>
      enrichHostDisplayFromMaps(
        flattenHostDisplayByRefId(hostDisplayByRefId),
        mapsForPoll,
        dataMeta
      ),
    [hostDisplayByRefId, mapsForPoll, dataMeta]
  );

  const hostDisplay = useStableIdentity(hostDisplayRaw, shareHostDisplayMap);

  const submapQueryRefIds = useMemo(
    () => collectSubmapQueryRefIds(activeStoredMap),
    [activeStoredMap]
  );

  const displayQueryRefIds = useMemo(
    () => resolveDisplayQueryRefIds(resolvedOptions),
    [resolvedOptions.displayQueryRefIds]
  );

  const queryHosts = queryIndex.hosts;

  const displayQueryHostsRaw = useMemo(
    () =>
      currentMapId === ROOT_MAP_ID
        ? extractDisplayQueryHosts(queryIndex, submapQueryRefIds, displayQueryRefIds)
        : [],
    [queryHosts, submapQueryRefIds, displayQueryRefIds, currentMapId]
  );

  const displayQueryHosts = useStableIdentity(displayQueryHostsRaw);

  const hostMetadata = dataMeta;

  const mergeCacheRef = useRef<{
    stored: TopologyMap;
    display: TopologyMap;
    queryHosts: string[];
    hostMetadata: HostMetadataMap;
  }>();

  const displayMap = useMemo(() => {
    const cache = mergeCacheRef.current;
    if (
      cache &&
      cache.queryHosts === displayQueryHosts &&
      cache.hostMetadata === hostMetadata &&
      isPositionOnlyMapChange(cache.stored, storedForUi)
    ) {
      const patched = patchDisplayMapPositions(cache.display, storedForUi);
      if (patched) {
        mergeCacheRef.current = {
          stored: storedForUi,
          display: patched,
          queryHosts: displayQueryHosts,
          hostMetadata,
        };
        return patched;
      }
    }
    const merged = mergeMapWithQueryHosts(storedForUi, displayQueryHosts, hostMetadata);
    mergeCacheRef.current = {
      stored: storedForUi,
      display: merged,
      queryHosts: displayQueryHosts,
      hostMetadata,
    };
    return merged;
  }, [storedForUi, displayQueryHosts, hostMetadata]);

  const queryHostOptionsRaw = useMemo(() => {
    const enriched = enrichQueryHostOptionsFromMap(
      extractQueryHostOptions(queryIndex, hostMetadata),
      activeStoredMap
    );
    return filterQueryHostOptionsByDisplayHosts(enriched, displayQueryHosts, hostMetadata);
  }, [queryHosts, displayQueryHosts, hostMetadata, activeStoredMap]);

  const queryHostOptions = useStableIdentity(queryHostOptionsRaw);

  const submapNodes = useMemo(() => {
    return activeStoredMap.nodes.filter(
      (n) =>
        n.type === 'submap' &&
        (n.submapUid?.trim() || Boolean(n.queryRefIds?.length) || n.queryRefId?.trim() || n.submapChildMapId?.trim())
    );
  }, [activeStoredMap.nodes]);

  const liveQueryHostsByRefId = useMemo(() => queryHostsByRefIdFromIndex(queryIndex), [queryHosts]);

  const queryHostsByRefIdRaw = useMemo(
    () => (!querySource.ready ? {} : liveQueryHostsByRefId),
    [liveQueryHostsByRefId, querySource.ready]
  );

  const queryHostsByRefId = useStableIdentity(queryHostsByRefIdRaw);

  const parentHostKeys = useMemo(
    () => parentMapHostKeys(displayMap, hostMetadata),
    [displayMap, hostMetadata]
  );

  const submapHostsRaw = useMemo(() => {
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
  const submapHosts = useStableIdentity(submapHostsRaw);

  useEffect(() => {
    if (!canPersistOptions) {
      return;
    }
    return scheduleWhenIdle(() => {
      const current = latestOptionsRef.current;
      const merged = {
        ...defaultOptions(),
        ...current,
        ...(current.map ? { map: current.map } : {}),
      };
      const { options: normalized, changed } = normalizeStoredPanelColors(merged, theme);
      if (changed) {
        onOptionsChange(normalized);
      }
    }, 400);
  }, [canPersistOptions, theme, onOptionsChange]);


  const pendingInterSubmapLinkRef = useRef<TopologyLink | undefined>();

  const applyActiveMap = useCallback(
    (map: TopologyMap) => {
      if (!canPersistOptions || !onOptionsChange) {
        return;
      }
      const mapId = persistTargetMapIdRef.current;
      const previous = resolveTopologyMapById(latestOptionsRef.current, mapId);
      const base = applyTopologyMapToPanelOptions(latestOptionsRef.current, mapId, map);
      const hop = pendingInterSubmapLinkRef.current;
      pendingInterSubmapLinkRef.current = undefined;
      let next = hop ? syncInterSubmapCounterpartLinks(base, mapId, hop) : base;
      if (previous && previous.links !== map.links) {
        next = removeMissingInterSubmapCounterparts(next, mapId, previous, map);
      }
      const traffic = trafficBindRef.current;
      onOptionsChange(
        bindTrafficItemIdsOnOptions(next, traffic.lastValues, traffic.interfaceItems, traffic.dataMeta)
      );
    },
    [canPersistOptions, onOptionsChange]
  );

  const applyLocalMap = useCallback(
    (map: TopologyMap) => {
      persistTargetMapIdRef.current = currentMapId;
      setLocalMap(map);
    },
    [currentMapId]
  );

  const { commitChange, undo, redo, flushRemote, canUndo, canRedo } = useMapHistory(
    storedForUi,
    applyLocalMap,
    applyActiveMap
  );

  useEffect(() => {
    if (!localMap || !sameNodeGeometry(localMap, activeStoredMap)) {
      return;
    }
    if (!sameMapDocumentFlags(localMap, activeStoredMap)) {
      return;
    }
    const cache = mergeCacheRef.current;
    if (cache && cache.stored === localMap) {
      const patched = patchDisplayMapPositions(cache.display, activeStoredMap);
      mergeCacheRef.current = {
        stored: activeStoredMap,
        display: patched ?? cache.display,
        queryHosts: cache.queryHosts,
        hostMetadata: cache.hostMetadata,
      };
    }
    setLocalMap(null);
  }, [activeStoredMap, localMap]);

  const currentMapIdRef = useRef(currentMapId);
  useEffect(() => {
    if (currentMapIdRef.current === currentMapId) {
      return;
    }
    currentMapIdRef.current = currentMapId;
    flushRemote();
    persistTargetMapIdRef.current = currentMapId;
    setLocalMap(null);
  }, [currentMapId, flushRemote]);

  const handleMapChange = useCallback(
    (map: TopologyMap, context?: { interSubmapLink?: TopologyLink }) => {
      pendingInterSubmapLinkRef.current = context?.interSubmapLink;
      commitChange(map);
    },
    [commitChange]
  );

  const handleNocModeChange = useCallback((enabled: boolean) => {
    pendingNocModeRef.current = enabled;
    latestOptionsRef.current = { ...latestOptionsRef.current, nocMode: enabled };
  }, []);

  const flushPendingNocMode = useCallback(() => {
    if (!canPersistOptions || !onOptionsChange) {
      return;
    }
    const pending = pendingNocModeRef.current;
    if (pending === undefined) {
      return;
    }
    pendingNocModeRef.current = undefined;
    if (Boolean(options.nocMode) === pending) {
      return;
    }
    onOptionsChange({ ...latestOptionsRef.current, nocMode: pending });
  }, [canPersistOptions, onOptionsChange, options.nocMode]);

  useGrafanaDashboardFlush(flushPendingNocMode);
  useEffect(
    () => () => {
      flushPendingNocMode();
    },
    [flushPendingNocMode]
  );

  const handleActiveViewChange = useCallback(
    (view: TopologyView) => {
      if (!canPersistOptions) {
        return;
      }
      if (currentMapId === ROOT_MAP_ID) {
        if (sameTopologyView(latestOptionsRef.current.view, view)) {
          return;
        }
        onOptionsChange({ ...latestOptionsRef.current, view });
        return;
      }
      const current = latestOptionsRef.current.childMapViews?.[currentMapId];
      if (sameTopologyView(current, view)) {
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

  if (width >= 1 && height >= 1) {
    lastGoodPanelSizeRef.current = { width, height };
  }
  const panelWidth = width >= 1 ? width : lastGoodPanelSizeRef.current.width;
  const panelHeight = height >= 1 ? height : lastGoodPanelSizeRef.current.height;

  if (panelWidth < 1 || panelHeight < 1) {
    return null;
  }

  const canvas = mapValidationErrors.length > 0 ? (
      <div
        style={{
          width: panelWidth,
          height: panelHeight,
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
    ) : (
    <div
      style={{
        position: 'relative',
        width: panelWidth,
        height: panelHeight,
        background: theme.colors.background.primary,
        overflow: 'hidden',
        overscrollBehavior: 'none',
      }}
    >
      <TopologyCanvas
        map={displayMap}
        storedMap={storedForUi}
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
        queryLoading={queryLoading}
        hostMetadata={hostMetadata}
        submapHosts={submapHosts}
        refreshIntervalSec={resolvedOptions.zabbixRefreshSec ?? ZABBIX_DIRECT_DEFAULT_REFRESH_SEC}
        zabbixDatasourceUid={zabbixDatasourceUid}
        linkMetricsByLink={linkMetricsByLink}
        hostProblems={hostProblems}
        onNocModeChange={handleNocModeChange}
        onMapChange={canPersistOptions ? handleMapChange : undefined}
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

  return (
    <LicenseGate state={licenseCheck} width={panelWidth} height={panelHeight}>
      {canvas}
    </LicenseGate>
  );
}
