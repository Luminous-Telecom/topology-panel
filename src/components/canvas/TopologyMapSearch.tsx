import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TopologyNode, TopologyNodeType, HostMetadataMap } from '../../types';
import { overlayCardStyle } from '../chrome/overlayChrome';
import { resolveHostDescription } from '../../utils/mapSync';
import styles from './TopologyMapSearch.module.scss';

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

/** Envolve o botão da toolbar e o painel, que é posicionado em relação a ele. */
export const searchWrapStyle = styles.wrap;

/** Painel flutuante da pesquisa (o botão fica na toolbar). */
export function TopologySearch({
  nodes,
  hostMetadata,
  open,
  onOpenChange,
  onFocusNode,
}: {
  nodes: TopologyNode[];
  hostMetadata?: HostMetadataMap;
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
    return nodes
      .filter((node) => {
        const description = resolveHostDescription(node, hostMetadata);
        const hay = [node.label, node.id, node.subtitle, node.zabbixHost, description]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 20);
  }, [nodes, hostMetadata, query]);

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
    <div
      className={`${overlayCardStyle} ${styles.panel}`}
      data-map-wheel-overlay
      onPointerDown={(e) => e.stopPropagation()}
    >
      <input
        ref={inputRef}
        className={styles.input}
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
        <div className={styles.results}>
          {results.length === 0 ? (
            <div className={styles.empty}>Nenhum resultado</div>
          ) : (
            results.map((node, idx) => {
              const title = (node.label ?? node.id).trim() || node.id;
              const metaParts = [nodeTypeLabel(node.type)];
              const description = resolveHostDescription(node, hostMetadata);
              if (description) {
                metaParts.push(description);
              } else if (node.subtitle?.trim()) {
                metaParts.push(node.subtitle.trim());
              } else if (node.zabbixHost?.trim() && node.zabbixHost !== title) {
                metaParts.push(node.zabbixHost.trim());
              }
              return (
                <button
                  key={node.id}
                  type="button"
                  className={styles.resultBtn}
                  data-active={idx === activeIndex ? 'true' : 'false'}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => selectResult(node.id)}
                >
                  <span>{title}</span>
                  <span className={styles.resultMeta}>{metaParts.join(' · ')}</span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
