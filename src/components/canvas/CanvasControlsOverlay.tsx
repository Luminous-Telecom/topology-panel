import React from 'react';
import { CanvasTool, HostMetadataMap, TopologyMap } from '../../types';
import { TopologyBreadcrumbItem } from '../../utils/topologyMapNavigation';
import { MapNavigationControls } from './MapNavigationControls';
import { TopologyQueryErrorBadge } from './TopologyQueryErrorBadge';
import { TopologyQueryLoadingBadge } from './TopologyQueryLoadingBadge';
import { TopologyToolbar } from './TopologyToolbar';
import { canvasStyles } from './canvasStyles';

interface Props {
  hidden: boolean;
  map: TopologyMap;
  tool: CanvasTool;
  setTool: (tool: CanvasTool) => void;
  networksLocked: boolean;
  canUndo: boolean;
  canRedo: boolean;
  canCopy: boolean;
  canPaste: boolean;
  canPersist: boolean;
  editable: boolean;
  locked: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onToggleLock: () => void;
  onToggleNetworksLock: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  showMinimap: boolean;
  onToggleMinimap: () => void;
  showLegend: boolean;
  onToggleLegend?: () => void;
  showHostAlertList?: boolean;
  onToggleHostAlertList?: () => void;
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  onSearchFocusNode: (nodeId: string) => void;
  hostMetadata?: HostMetadataMap;
  queryError: boolean;
  queryLoading?: boolean;
  onInsertBlueprint?: () => void;
  nocModeActive?: boolean;
  onToggleNocMode?: () => void;
  mapNavigationBreadcrumb?: TopologyBreadcrumbItem[];
  canMapNavigateBack?: boolean;
  canMapNavigateForward?: boolean;
  onMapNavigateBack?: () => void;
  onMapNavigateForward?: () => void;
  onMapNavigateHome?: () => void;
}

/** Controles fixos sobre o mapa: barra de ferramentas, navegação hierárquica, aviso de erro da
 * Query e a dica que aparece no mapa vazio. */
export function CanvasControlsOverlay({
  hidden,
  map,
  tool,
  setTool,
  networksLocked,
  canUndo,
  canRedo,
  canCopy,
  canPaste,
  canPersist,
  editable,
  locked,
  onUndo,
  onRedo,
  onCopy,
  onPaste,
  onToggleLock,
  onToggleNetworksLock,
  isFullscreen,
  onToggleFullscreen,
  showMinimap,
  onToggleMinimap,
  showLegend,
  onToggleLegend,
  showHostAlertList = true,
  onToggleHostAlertList,
  searchOpen,
  setSearchOpen,
  onSearchFocusNode,
  hostMetadata,
  queryError,
  queryLoading = false,
  onInsertBlueprint,
  nocModeActive = false,
  onToggleNocMode,
  mapNavigationBreadcrumb = [] as TopologyBreadcrumbItem[],
  canMapNavigateBack = false,
  canMapNavigateForward = false,
  onMapNavigateBack,
  onMapNavigateForward,
  onMapNavigateHome,
}: Props) {
  return (
    <>
      {onMapNavigateBack && onMapNavigateForward ? (
        <MapNavigationControls
          breadcrumb={mapNavigationBreadcrumb}
          canGoBack={canMapNavigateBack}
          canGoForward={canMapNavigateForward}
          onBack={onMapNavigateBack}
          onForward={onMapNavigateForward}
          onHomeClick={onMapNavigateHome}
          compactBelowToolbar={!hidden}
        />
      ) : null}

      {!hidden && (
        <TopologyToolbar
          tool={tool}
          onToolChange={setTool}
          locked={locked}
          networksLocked={networksLocked}
          canUndo={canUndo}
          canRedo={canRedo}
          canCopy={canCopy}
          canPaste={canPaste}
          onUndo={onUndo}
          onRedo={onRedo}
          onCopy={onCopy}
          onPaste={onPaste}
          onToggleLock={onToggleLock}
          onToggleNetworksLock={onToggleNetworksLock}
          isFullscreen={isFullscreen}
          onToggleFullscreen={onToggleFullscreen}
          showMinimap={showMinimap}
          onToggleMinimap={onToggleMinimap}
          showLegend={showLegend}
          onToggleLegend={onToggleLegend}
          showHostAlertList={showHostAlertList}
          onToggleHostAlertList={onToggleHostAlertList}
          showEditControls={canPersist && !nocModeActive}
          searchNodes={map.nodes}
          hostMetadata={hostMetadata}
          searchOpen={searchOpen}
          onSearchOpenChange={setSearchOpen}
          onSearchFocusNode={onSearchFocusNode}
          onInsertBlueprint={onInsertBlueprint}
          nocModeActive={nocModeActive}
          onToggleNocMode={onToggleNocMode}
        />
      )}

      <TopologyQueryErrorBadge visible={queryError} />
      <TopologyQueryLoadingBadge visible={queryLoading} />

      {editable && map.nodes.length === 0 && (
        <div
          className={canvasStyles.empty}
          style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none' }}
        >
          Clique com o <strong>botão direito</strong> para adicionar dispositivos, redes, submapas,
          seletores e links. Hosts Zabbix vêm dos grupos configurados em Fonte de dados.
        </div>
      )}
    </>
  );
}
