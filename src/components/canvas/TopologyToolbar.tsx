import React from 'react';
import { Icon } from '@grafana/ui';
import { FaArrowPointer, FaCopy, FaHand, FaListUl, FaLock, FaMap, FaPaste, FaTriangleExclamation } from 'react-icons/fa6';
import { CanvasTool, HostMetadataMap, TopologyNode } from '../../types';
import { toolbarLabelStyle, toolbarOverlayButtonStyle, toolbarToolGroupStyle } from './canvasOverlayStyles';
import { searchWrapStyle, TopologySearch } from './TopologyMapSearch';
import styles from './TopologyToolbar.module.scss';

function toolbarClass(
  kind: 'text' | 'icon',
  opts?: { active?: boolean; disabled?: boolean }
): string {
  const parts = [toolbarOverlayButtonStyle, styles.btn];
  if (kind === 'icon') {
    parts.push(styles.iconBtn);
  }
  if (opts?.active) {
    parts.push(styles.btnActive);
  }
  if (opts?.disabled) {
    parts.push(styles.btnDisabled);
  }
  return parts.join(' ');
}

export function TopologyToolbar({
  tool,
  onToolChange,
  locked,
  networksLocked,
  canUndo,
  canRedo,
  canCopy,
  canPaste,
  onUndo,
  onRedo,
  onCopy,
  onPaste,
  onToggleLock,
  onToggleNetworksLock,
  isFullscreen,
  onToggleFullscreen,
  showMinimap = true,
  onToggleMinimap,
  showLegend = true,
  onToggleLegend,
  showHostAlertList = true,
  onToggleHostAlertList,
  showEditControls = true,
  searchNodes,
  hostMetadata,
  searchOpen,
  onSearchOpenChange,
  onSearchFocusNode,
  onInsertBlueprint,
  onToggleNocMode,
  nocModeActive = false,
}: {
  tool: CanvasTool;
  onToolChange: (tool: CanvasTool) => void;
  locked?: boolean;
  networksLocked?: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
  canCopy?: boolean;
  canPaste?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  onCopy?: () => void;
  onPaste?: () => void;
  onToggleLock?: () => void;
  onToggleNetworksLock?: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  showMinimap?: boolean;
  onToggleMinimap?: () => void;
  showLegend?: boolean;
  onToggleLegend?: () => void;
  showHostAlertList?: boolean;
  onToggleHostAlertList?: () => void;
  showEditControls?: boolean;
  searchNodes: TopologyNode[];
  hostMetadata?: HostMetadataMap;
  searchOpen: boolean;
  onSearchOpenChange: (open: boolean) => void;
  onSearchFocusNode: (nodeId: string) => void;
  onInsertBlueprint?: () => void;
  onToggleNocMode?: () => void;
  nocModeActive?: boolean;
}) {
  return (
    <div className={styles.toolbar} data-topology-chrome>
      <div className={toolbarToolGroupStyle}>
        <button
          type="button"
          className={toolbarClass('icon', { active: tool === 'select' })}
          onClick={() => onToolChange('select')}
          title="Selecionar (seta)"
          aria-label="Selecionar"
          aria-pressed={tool === 'select'}
        >
          <FaArrowPointer size={13} />
        </button>
        <button
          type="button"
          className={toolbarClass('icon', { active: tool === 'pan' })}
          onClick={() => onToolChange('pan')}
          title="Arrastar mapa (mão)"
          aria-label="Arrastar mapa"
          aria-pressed={tool === 'pan'}
        >
          <FaHand size={13} />
        </button>
      </div>
      {onToggleNocMode ? (
        <button
          type="button"
          className={toolbarClass('text', { active: nocModeActive })}
          onClick={onToggleNocMode}
          title={nocModeActive ? 'Sair do modo NOC' : 'Modo NOC — filtros e lista de equipamentos'}
          aria-pressed={nocModeActive}
        >
          <Icon name="monitor" size="sm" />
          <span className={toolbarLabelStyle}>NOC</span>
        </button>
      ) : null}
      {showEditControls && (
        <>
          <button
            type="button"
            className={toolbarClass('icon', { disabled: !canUndo })}
            disabled={!canUndo}
            onClick={onUndo}
            title="Desfazer (Ctrl+Z)"
            aria-label="Desfazer"
          >
            <Icon name="arrow-left" size="sm" />
          </button>
          <button
            type="button"
            className={toolbarClass('icon', { disabled: !canRedo })}
            disabled={!canRedo}
            onClick={onRedo}
            title="Refazer (Ctrl+Shift+Z)"
            aria-label="Refazer"
          >
            <Icon name="arrow-right" size="sm" />
          </button>
          <button
            type="button"
            className={toolbarClass('icon', { disabled: !canCopy })}
            disabled={!canCopy}
            onClick={onCopy}
            title="Copiar seleção (Ctrl+C)"
            aria-label="Copiar seleção"
          >
            <FaCopy size={13} />
          </button>
          <button
            type="button"
            className={toolbarClass('icon', { disabled: !canPaste })}
            disabled={!canPaste}
            onClick={onPaste}
            title="Colar (Ctrl+V)"
            aria-label="Colar"
          >
            <FaPaste size={13} />
          </button>
          <button
            type="button"
            className={toolbarClass('text', { active: !locked })}
            onClick={onToggleLock}
            title={locked ? 'Destravar edição no mapa' : 'Travar edição no mapa'}
            aria-label={locked ? 'Mapa travado' : 'Mapa editável'}
            aria-pressed={!locked}
          >
            <span className={styles.lockIcon} aria-hidden>
              <FaLock size={13} />
            </span>
            <span className={toolbarLabelStyle}>Mapa</span>
          </button>
          <button
            type="button"
            className={toolbarClass('text', { active: !networksLocked })}
            onClick={onToggleNetworksLock}
            title={
              networksLocked
                ? 'Destravar caixas de rede para arrastar'
                : 'Travar caixas de rede (só mover o mapa)'
            }
            aria-label={networksLocked ? 'Redes travadas' : 'Redes livres'}
            aria-pressed={!networksLocked}
          >
            <span className={styles.lockIcon} aria-hidden>
              <FaLock size={13} />
            </span>
            <span className={toolbarLabelStyle}>Redes</span>
          </button>
          {onInsertBlueprint ? (
            <button
              type="button"
              className={toolbarClass('text', { disabled: Boolean(locked) })}
              disabled={Boolean(locked)}
              onClick={onInsertBlueprint}
              title="Inserir modelo de topologia (POP, backbone, FTTH)"
            >
              <Icon name="copy" size="sm" />
              <span className={toolbarLabelStyle}>Modelo</span>
            </button>
          ) : null}
          <button
            type="button"
            className={toolbarClass('icon', { active: showMinimap })}
            onClick={onToggleMinimap}
            title={showMinimap ? 'Ocultar mini mapa' : 'Mostrar mini mapa'}
            aria-label={showMinimap ? 'Ocultar mini mapa' : 'Mostrar mini mapa'}
            aria-pressed={showMinimap}
          >
            <FaMap size={13} />
          </button>
        </>
      )}
      <div className={searchWrapStyle}>
        <button
          type="button"
          className={toolbarClass('icon', { active: searchOpen })}
          onClick={() => onSearchOpenChange(!searchOpen)}
          title="Pesquisar no mapa (Ctrl+F)"
          aria-label="Pesquisar no mapa"
          aria-pressed={searchOpen}
        >
          <Icon name="search" size="sm" />
        </button>
        <TopologySearch
          nodes={searchNodes}
          hostMetadata={hostMetadata}
          open={searchOpen}
          onOpenChange={onSearchOpenChange}
          onFocusNode={onSearchFocusNode}
        />
      </div>
      {onToggleLegend ? (
        <button
          type="button"
          className={toolbarClass('icon', { active: showLegend })}
          onClick={onToggleLegend}
          title={showLegend ? 'Ocultar legenda' : 'Mostrar legenda'}
          aria-label={showLegend ? 'Ocultar legenda' : 'Mostrar legenda'}
          aria-pressed={showLegend}
        >
          <FaListUl size={13} />
        </button>
      ) : null}
      {onToggleHostAlertList ? (
        <button
          type="button"
          className={toolbarClass('icon', { active: showHostAlertList })}
          onClick={onToggleHostAlertList}
          title={
            showHostAlertList
              ? 'Ocultar lista de hosts com alerta'
              : 'Mostrar lista de hosts com alerta'
          }
          aria-label={
            showHostAlertList
              ? 'Ocultar lista de hosts com alerta'
              : 'Mostrar lista de hosts com alerta'
          }
          aria-pressed={showHostAlertList}
        >
          <FaTriangleExclamation size={13} />
        </button>
      ) : null}
      <button
        type="button"
        className={toolbarClass('icon', { active: isFullscreen })}
        onClick={onToggleFullscreen}
        title={isFullscreen ? 'Sair da tela cheia' : 'Abrir mapa em tela cheia'}
        aria-label={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
      >
        <Icon name={isFullscreen ? 'compress-arrows' : 'expand-arrows-alt'} size="sm" />
      </button>
    </div>
  );
}
