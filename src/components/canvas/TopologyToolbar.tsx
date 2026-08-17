import React from 'react';
import { css } from '@emotion/css';
import { Icon } from '@grafana/ui';
import { FaArrowPointer, FaCopy, FaHand, FaListUl, FaMap, FaPaste } from 'react-icons/fa6';
import { CanvasTool, TopologyNode } from '../../types';
import { searchWrapStyle, TopologySearch } from './TopologyMapSearch';

const toolbarStyle = css`
  position: absolute;
  top: 8px;
  right: 36px;
  z-index: 4;
  display: flex;
  align-items: center;
  gap: 6px;
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
  flowPaused,
  onToggleFlow,
  isFullscreen,
  onToggleFullscreen,
  showMinimap = true,
  onToggleMinimap,
  showLegend = true,
  onToggleLegend,
  showEditControls = true,
  searchNodes,
  searchOpen,
  onSearchOpenChange,
  onSearchFocusNode,
  onDiscoverNeighbors,
  discoveringNeighbors = false,
  suggestedLinksCount = 0,
  onReviewSuggestedLinks,
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
  flowPaused: boolean;
  onToggleFlow: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  showMinimap?: boolean;
  onToggleMinimap?: () => void;
  showLegend?: boolean;
  onToggleLegend?: () => void;
  showEditControls?: boolean;
  searchNodes: TopologyNode[];
  searchOpen: boolean;
  onSearchOpenChange: (open: boolean) => void;
  onSearchFocusNode: (nodeId: string) => void;
  onDiscoverNeighbors?: () => void;
  discoveringNeighbors?: boolean;
  suggestedLinksCount?: number;
  onReviewSuggestedLinks?: () => void;
  onInsertBlueprint?: () => void;
  onToggleNocMode?: () => void;
  nocModeActive?: boolean;
}) {
  const btnStyle = (active: boolean, warn = false, disabled = false): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 10px',
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
    <div className={toolbarStyle}>
      {!isFullscreen && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            type="button"
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
            onClick={() => onToolChange('pan')}
            title="Arrastar mapa (mão)"
            aria-label="Arrastar mapa"
            aria-pressed={tool === 'pan'}
            style={toolBtnStyle(tool === 'pan')}
          >
            <FaHand size={13} />
          </button>
        </div>
      )}
      {onToggleNocMode ? (
        <button
          type="button"
          onClick={onToggleNocMode}
          title={nocModeActive ? 'Sair do modo NOC' : 'Modo NOC — filtros, badges e visão para telas grandes'}
          aria-pressed={nocModeActive}
          style={btnStyle(nocModeActive)}
        >
          <Icon name="monitor" size="sm" />
          NOC
        </button>
      ) : null}
      {showEditControls && (
        <>
          <button
            type="button"
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
            onClick={onToggleLock}
            title={locked ? 'Destravar edição no mapa' : 'Travar edição no mapa'}
            style={btnStyle(!locked, Boolean(locked))}
          >
            <Icon name={locked ? 'lock' : 'unlock'} size="sm" />
            {locked ? 'Mapa travado' : 'Mapa editável'}
          </button>
          <button
            type="button"
            onClick={onToggleNetworksLock}
            title={
              networksLocked
                ? 'Destravar caixas de rede para arrastar'
                : 'Travar caixas de rede (só mover o mapa)'
            }
            style={btnStyle(!networksLocked, Boolean(networksLocked))}
          >
            <Icon name={networksLocked ? 'lock' : 'unlock'} size="sm" />
            {networksLocked ? 'Redes travadas' : 'Redes livres'}
          </button>
          {onDiscoverNeighbors ? (
            <button
              type="button"
              onClick={onDiscoverNeighbors}
              disabled={discoveringNeighbors}
              title="Descobrir vizinhos LLDP/CDP via itens Zabbix dos templates"
              style={btnStyle(false, false, discoveringNeighbors)}
            >
              <Icon name="channel-add" size="sm" />
              {discoveringNeighbors ? 'Descobrindo…' : 'Descobrir vizinhos'}
            </button>
          ) : null}
          {suggestedLinksCount > 0 && onReviewSuggestedLinks ? (
            <button
              type="button"
              onClick={onReviewSuggestedLinks}
              title="Revisar links sugeridos"
              style={btnStyle(true)}
            >
              Sugestões ({suggestedLinksCount})
            </button>
          ) : null}
          {onInsertBlueprint ? (
            <button
              type="button"
              onClick={onInsertBlueprint}
              title="Inserir modelo de topologia (POP, backbone, FTTH)"
              style={btnStyle(false)}
            >
              <Icon name="copy" size="sm" />
              Modelo
            </button>
          ) : null}
          <button
            type="button"
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
      {!isFullscreen && (
        <>
          <button
            type="button"
            onClick={onToggleFlow}
            title={
              flowPaused
                ? 'Retomar animação de tráfego nas linhas'
                : 'Pausar animação de tráfego nas linhas'
            }
            aria-label={flowPaused ? 'Retomar tráfego' : 'Pausar tráfego'}
            style={toolBtnStyle(!flowPaused)}
          >
            <Icon name={flowPaused ? 'play' : 'pause'} size="sm" />
          </button>
          <div className={searchWrapStyle}>
            <button
              type="button"
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
              open={searchOpen}
              onOpenChange={onSearchOpenChange}
              onFocusNode={onSearchFocusNode}
            />
          </div>
          <button
            type="button"
            onClick={onToggleLegend}
            title={showLegend ? 'Ocultar legenda' : 'Mostrar legenda'}
            aria-label={showLegend ? 'Ocultar legenda' : 'Mostrar legenda'}
            aria-pressed={showLegend}
            style={toolBtnStyle(showLegend)}
          >
            <FaListUl size={13} />
          </button>
          <button
            type="button"
            onClick={onToggleFullscreen}
            title="Abrir mapa em tela cheia"
            aria-label="Tela cheia"
            style={toolBtnStyle(false)}
          >
            <Icon name="expand-arrows-alt" size="sm" />
          </button>
        </>
      )}
    </div>
  );
}
