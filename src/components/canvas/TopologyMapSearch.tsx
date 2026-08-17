import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { css } from '@emotion/css';
import { TopologyNode, TopologyNodeType } from '../../types';

function nodeTypeLabel(type?: TopologyNodeType): string {
  switch (type) {
    case 'submap':
      return 'Submapa';
    case 'network':
      return 'Rede';
    case 'static':
      return 'Texto';
    case 'dashboard_picker':
      return 'Seletor';
    default:
      return 'Host';
  }
}

function nodeSearchText(node: TopologyNode): string {
  return [node.label, node.id, node.subtitle, node.zabbixHost].filter(Boolean).join(' ').toLowerCase();
}

/** Envolve o botão da toolbar e o painel, que é posicionado em relação a ele. */
export const searchWrapStyle = css`
  position: relative;
  display: flex;
  align-items: center;
`;

const searchPanelStyle = css`
  display: flex;
  flex-direction: column;
  gap: 0;
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  width: min(280px, 70vw);
  z-index: 5;
  background: rgba(0, 0, 0, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 4px;
  overflow: hidden;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
`;

const searchInputStyle = css`
  width: 100%;
  box-sizing: border-box;
  border: 0;
  outline: none;
  padding: 7px 10px;
  background: transparent;
  color: #fff;
  font-size: 12px;
  &::placeholder {
    color: rgba(255, 255, 255, 0.45);
  }
`;

const searchResultsStyle = css`
  max-height: 220px;
  overflow-y: auto;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
`;

const searchResultBtnStyle = css`
  display: flex;
  flex-direction: column;
  gap: 1px;
  width: 100%;
  border: 0;
  background: transparent;
  color: #fff;
  text-align: left;
  padding: 6px 10px;
  cursor: pointer;
  font-size: 12px;
  &:hover,
  &[data-active='true'] {
    background: rgba(79, 195, 247, 0.28);
  }
`;

const searchResultMetaStyle = css`
  font-size: 10px;
  color: rgba(255, 255, 255, 0.55);
`;

const searchEmptyStyle = css`
  padding: 8px 10px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
`;

/** Painel flutuante da pesquisa (o botão fica na toolbar). */
export function TopologySearch({
  nodes,
  open,
  onOpenChange,
  onFocusNode,
}: {
  nodes: TopologyNode[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFocusNode: (nodeId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return [];
    }
    return nodes.filter((n) => nodeSearchText(n).includes(q)).slice(0, 20);
  }, [nodes, query]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setQuery('');
    setActiveIndex(0);
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const selectResult = useCallback(
    (nodeId: string) => {
      onFocusNode(nodeId);
      onOpenChange(false);
    },
    [onFocusNode, onOpenChange]
  );

  if (!open) {
    return null;
  }

  return (
    <div className={searchPanelStyle} onPointerDown={(e) => e.stopPropagation()}>
      <input
        ref={inputRef}
        className={searchInputStyle}
        type="search"
        value={query}
        placeholder="Nome, IP ou host…"
        aria-label="Pesquisar no mapa"
        autoComplete="off"
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onOpenChange(false);
            return;
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (results.length === 0) {
              return;
            }
            setActiveIndex((i) => (i + 1) % results.length);
            return;
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (results.length === 0) {
              return;
            }
            setActiveIndex((i) => (i - 1 + results.length) % results.length);
            return;
          }
          if (e.key === 'Enter' && results.length > 0) {
            e.preventDefault();
            const pick = results[Math.min(activeIndex, results.length - 1)];
            if (pick) {
              selectResult(pick.id);
            }
          }
        }}
      />
      {query.trim() !== '' && (
        <div className={searchResultsStyle}>
          {results.length === 0 ? (
            <div className={searchEmptyStyle}>Nenhum resultado</div>
          ) : (
            results.map((node, idx) => {
              const title = (node.label ?? node.id).trim() || node.id;
              const metaParts = [nodeTypeLabel(node.type)];
              if (node.subtitle?.trim()) {
                metaParts.push(node.subtitle.trim());
              } else if (node.zabbixHost?.trim() && node.zabbixHost !== title) {
                metaParts.push(node.zabbixHost.trim());
              }
              return (
                <button
                  key={node.id}
                  type="button"
                  className={searchResultBtnStyle}
                  data-active={idx === activeIndex ? 'true' : 'false'}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => selectResult(node.id)}
                >
                  <span>{title}</span>
                  <span className={searchResultMetaStyle}>{metaParts.join(' · ')}</span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
