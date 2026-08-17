import React from 'react';
import { CanvasTool, TopologyMap, TopologyPanelOptions } from '../../types';
import { DashboardNavButton } from '../DashboardNavButton';
import { TopologyQueryErrorBadge } from './TopologyQueryErrorBadge';
import { TopologyToolbar } from './TopologyToolbar';
import { canvasStyles } from './canvasStyles';

interface Props {
  hidden: boolean;
  map: TopologyMap;
  options: TopologyPanelOptions;
  tool: CanvasTool;
  setTool: (tool: CanvasTool) => void;
  networksLocked: boolean;
  canUndo: boolean;
  canRedo: boolean;
  canCopy: boolean;
  canPaste: boolean;
  canPersist: boolean;
  editable: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onToggleLock: () => void;
  onToggleNetworksLock: () => void;
  flowPaused: boolean;
  onToggleFlow: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  showMinimap: boolean;
  onToggleMinimap: () => void;
  showLegend: boolean;
  onToggleLegend: () => void;
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  onSearchFocusNode: (nodeId: string) => void;
  queryError: boolean;
}

/** Controles fixos sobre o mapa: barra de ferramentas, atalho de dashboards, aviso de erro da
 * Query e a dica que aparece no mapa vazio. */
export function CanvasControlsOverlay({
  hidden,
  map,
  options,
  tool,
  setTool,
  networksLocked,
  canUndo,
  canRedo,
  canCopy,
  canPaste,
  canPersist,
  editable,
  onUndo,
  onRedo,
  onCopy,
  onPaste,
  onToggleLock,
  onToggleNetworksLock,
  flowPaused,
  onToggleFlow,
  isFullscreen,
  onToggleFullscreen,
  showMinimap,
  onToggleMinimap,
  showLegend,
  onToggleLegend,
  searchOpen,
  setSearchOpen,
  onSearchFocusNode,
  queryError,
}: Props) {
  return (
    <>
      {!hidden && (
        <TopologyToolbar
          tool={tool}
          onToolChange={setTool}
          locked={Boolean(map.locked)}
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
          flowPaused={flowPaused}
          onToggleFlow={onToggleFlow}
          isFullscreen={isFullscreen}
          onToggleFullscreen={onToggleFullscreen}
          showMinimap={showMinimap}
          onToggleMinimap={onToggleMinimap}
          showLegend={showLegend}
          onToggleLegend={onToggleLegend}
          showEditControls={canPersist}
          searchNodes={map.nodes}
          searchOpen={searchOpen}
          onSearchOpenChange={setSearchOpen}
          onSearchFocusNode={onSearchFocusNode}
        />
      )}

      {!hidden && options.showDashboardNav !== false && (
        <DashboardNavButton
          label={options.dashboardNavLabel?.trim() || 'Dashboards'}
          choices={options.dashboardNavChoices ?? []}
        />
      )}

      <TopologyQueryErrorBadge visible={queryError} />

      {editable && map.nodes.length === 0 && (
        <div
          className={canvasStyles.empty}
          style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none' }}
        >
          Clique com o <strong>botão direito</strong> para adicionar dispositivos, redes, submapas,
          seletores e links. Hosts Zabbix vêm da aba <strong>Query</strong>.
        </div>
      )}
    </>
  );
}
