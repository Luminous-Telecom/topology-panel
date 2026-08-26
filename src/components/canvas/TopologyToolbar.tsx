import React from 'react';
import { css } from '@emotion/css';
import { Icon } from '@grafana/ui';
import { FaArrowPointer, FaCopy, FaHand, FaListUl, FaMap, FaPaste, FaTriangleExclamation } from 'react-icons/fa6';
import { CanvasTool, HostMetadataMap, TopologyNode } from '../../types';
import { CANVAS_EDGE_GAP, GRAFANA_PANEL_MENU_RESERVE, MEDIA_COMPACT, MEDIA_MEDIUM } from '../../utils/canvasOverlayLayout';
import { toolbarLabelStyle, toolbarOverlayButtonStyle, toolbarToolGroupStyle } from './canvasOverlayStyles';
import { searchWrapStyle, TopologySearch } from './TopologyMapSearch';

const toolbarStyle = css`
  position: absolute;
  top: ${CANVAS_EDGE_GAP}px;
  left: ${CANVAS_EDGE_GAP}px;
  right: ${CANVAS_EDGE_GAP + GRAFANA_PANEL_MENU_RESERVE}px;
  z-index: 4;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 6px;
  pointer-events: none;

  ${MEDIA_MEDIUM} {
    gap: 4px;
  }

  ${MEDIA_COMPACT} {
    justify-content: flex-start;
    gap: 4px;
  }
`;

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
  const btnStyle = (active: boolean, warn = false, disabled = false): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 10px',
    lineHeight: 1,
    borderRadius: 4,
    border: '1px solid rgba(255,255,255,0.25)',
    background: warn ? 'rgba(0,0,0,0.55)' : active ? 'rgba(46,125,50,0.85)' : 'rgba(0,0,0,0.45)',
    color: disabled ? 'rgba(255,255,255,0.35)' : warn ? '#ffb74d' : '#fff',
    fontSize: 11,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : 1,
  });

  const iconBtnStyle = (disabled = false): React.CSSProperties => ({
    ...btnStyle(false, false, disabled),
    padding: '4px 8px',
    minWidth: 30,
    justifyContent: 'center',
  });

  const toolBtnStyle = (active: boolean): React.CSSProperties => ({
    ...btnStyle(active),
    padding: '4px 8px',
    minWidth: 30,
    justifyContent: 'center',
  });

  return (
    <div className={toolbarStyle} data-topology-chrome>
      <div className={toolbarToolGroupStyle}>
        <button
          type="button"
          className={toolbarOverlayButtonStyle}
          onClick={() => onToolChange('select')}
          title="Selecionar (seta)"
          aria-label="Selecionar"
          aria-pressed={tool === 'select'}
          style={toolBtnStyle(tool === 'select')}
        >
          <FaArrowPointer size={13} />
        </button>
        <button
          type="button"
          className={toolbarOverlayButtonStyle}
          onClick={() => onToolChange('pan')}
          title="Arrastar mapa (mão)"
          aria-label="Arrastar mapa"
          aria-pressed={tool === 'pan'}
          style={toolBtnStyle(tool === 'pan')}
        >
          <FaHand size={13} />
        </button>
      </div>
      {onToggleNocMode ? (
        <button
          type="button"
          className={toolbarOverlayButtonStyle}
          onClick={onToggleNocMode}
          title={nocModeActive ? 'Sair do modo NOC' : 'Modo NOC — filtros e lista de equipamentos'}
          aria-pressed={nocModeActive}
          style={btnStyle(nocModeActive)}
        >
          <Icon name="monitor" size="sm" />
          <span className={toolbarLabelStyle}>NOC</span>
        </button>
      ) : null}
      {showEditControls && (
        <>
          <button
            type="button"
            className={toolbarOverlayButtonStyle}
            disabled={!canUndo}
            onClick={onUndo}
            title="Desfazer (Ctrl+Z)"
            aria-label="Desfazer"
            style={iconBtnStyle(!canUndo)}
          >
            <Icon name="arrow-left" size="sm" />
          </button>
          <button
            type="button"
            className={toolbarOverlayButtonStyle}
            disabled={!canRedo}
            onClick={onRedo}
            title="Refazer (Ctrl+Shift+Z)"
            aria-label="Refazer"
            style={iconBtnStyle(!canRedo)}
          >
            <Icon name="arrow-right" size="sm" />
          </button>
          <button
            type="button"
            className={toolbarOverlayButtonStyle}
            disabled={!canCopy}
            onClick={onCopy}
            title="Copiar seleção (Ctrl+C)"
            aria-label="Copiar seleção"
            style={iconBtnStyle(!canCopy)}
          >
            <FaCopy size={13} />
          </button>
          <button
            type="button"
            className={toolbarOverlayButtonStyle}
            disabled={!canPaste}
            onClick={onPaste}
            title="Colar (Ctrl+V)"
            aria-label="Colar"
            style={iconBtnStyle(!canPaste)}
          >
            <FaPaste size={13} />
          </button>
          <button
            type="button"
            className={toolbarOverlayButtonStyle}
            onClick={onToggleLock}
            title={locked ? 'Destravar edição no mapa' : 'Travar edição no mapa'}
            style={btnStyle(!locked, Boolean(locked))}
          >
            <Icon name={locked ? 'lock' : 'unlock'} size="sm" />
            <span className={toolbarLabelStyle}>{locked ? 'Mapa travado' : 'Mapa editável'}</span>
          </button>
          <button
            type="button"
            className={toolbarOverlayButtonStyle}
            onClick={onToggleNetworksLock}
            title={
              networksLocked
                ? 'Destravar caixas de rede para arrastar'
                : 'Travar caixas de rede (só mover o mapa)'
            }
            style={btnStyle(!networksLocked, Boolean(networksLocked))}
          >
            <Icon name={networksLocked ? 'lock' : 'unlock'} size="sm" />
            <span className={toolbarLabelStyle}>
              {networksLocked ? 'Redes travadas' : 'Redes livres'}
            </span>
          </button>
          {onInsertBlueprint ? (
            <button
              type="button"
              className={toolbarOverlayButtonStyle}
              onClick={onInsertBlueprint}
              title="Inserir modelo de topologia (POP, backbone, FTTH)"
              style={btnStyle(false)}
            >
              <Icon name="copy" size="sm" />
              <span className={toolbarLabelStyle}>Modelo</span>
            </button>
          ) : null}
          <button
            type="button"
            className={toolbarOverlayButtonStyle}
            onClick={onToggleMinimap}
            title={showMinimap ? 'Ocultar mini mapa' : 'Mostrar mini mapa'}
            aria-label={showMinimap ? 'Ocultar mini mapa' : 'Mostrar mini mapa'}
            aria-pressed={showMinimap}
            style={toolBtnStyle(showMinimap)}
          >
            <FaMap size={13} />
          </button>
        </>
      )}
      <div className={searchWrapStyle}>
        <button
          type="button"
          className={toolbarOverlayButtonStyle}
          onClick={() => onSearchOpenChange(!searchOpen)}
          title="Pesquisar no mapa (Ctrl+F)"
          aria-label="Pesquisar no mapa"
          aria-pressed={searchOpen}
          style={toolBtnStyle(searchOpen)}
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
      <button
        type="button"
        className={toolbarOverlayButtonStyle}
        onClick={onToggleLegend}
        title={showLegend ? 'Ocultar legenda' : 'Mostrar legenda'}
        aria-label={showLegend ? 'Ocultar legenda' : 'Mostrar legenda'}
        aria-pressed={showLegend}
        style={toolBtnStyle(showLegend)}
      >
        <FaListUl size={13} />
      </button>
      {onToggleHostAlertList ? (
        <button
          type="button"
          className={toolbarOverlayButtonStyle}
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
          style={toolBtnStyle(showHostAlertList)}
        >
          <FaTriangleExclamation size={13} />
        </button>
      ) : null}
      <button
        type="button"
        className={toolbarOverlayButtonStyle}
        onClick={onToggleFullscreen}
        title={isFullscreen ? 'Sair da tela cheia' : 'Abrir mapa em tela cheia'}
        aria-label={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
        style={toolBtnStyle(isFullscreen)}
      >
        <Icon name={isFullscreen ? 'compress-arrows' : 'expand-arrows-alt'} size="sm" />
      </button>
    </div>
  );
}
