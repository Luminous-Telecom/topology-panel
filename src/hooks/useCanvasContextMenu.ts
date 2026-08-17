import React, { RefObject, useCallback, useState } from 'react';
import {
  HostMetadataMap,
  TopologyLink,
  TopologyMap,
  TopologyNode,
  TopologyView,
} from '../types';
import { resolveHostIp } from '../utils/hostLookup';
import { areNetworksLocked } from '../utils/mapEdits';
import { clientToMapCoords } from '../utils/mapCoords';
import { isHostNode } from '../utils/topologyNodes';

/** Onde o menu abriu: posição na tela, ponto correspondente no mapa e o alvo clicado. */
export interface ContextMenuAnchor {
  screenX: number;
  screenY: number;
  mapX: number;
  mapY: number;
  node?: TopologyNode;
  link?: TopologyLink;
}

interface UseCanvasContextMenuParams {
  wrapRef: RefObject<HTMLElement>;
  map: TopologyMap;
  storedMap: TopologyMap;
  view: TopologyView;
  canEditCanvas: boolean;
  canPersist: boolean;
  hostMetadata?: HostMetadataMap;
  selectedNodeIds: string[];
  setSelectedNodeIds: React.Dispatch<React.SetStateAction<string[]>>;
  showToast: (message: string) => void;
}

/**
 * Menu de contexto do canvas.
 *
 * Quem só visualiza ainda abre o menu sobre um host com IP (as ferramentas de acesso remoto
 * continuam disponíveis); nos demais alvos, sem permissão de edição não há menu — e no clique
 * direito no vazio explicamos por quê.
 */
export function useCanvasContextMenu({
  wrapRef,
  map,
  storedMap,
  view,
  canEditCanvas,
  canPersist,
  hostMetadata,
  selectedNodeIds,
  setSelectedNodeIds,
  showToast,
}: UseCanvasContextMenuParams) {
  const [contextMenu, setContextMenu] = useState<ContextMenuAnchor | null>(null);
  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, target?: { node?: TopologyNode; link?: TopologyLink }) => {
      e.preventDefault();
      e.stopPropagation();

      const rawNode = target?.node;
      // Rede travada não é alvo: o menu cai no canvas, como se o clique fosse no fundo.
      const node = rawNode?.type === 'network' && areNetworksLocked(storedMap) ? undefined : rawNode;
      const isCanvas = !node && !target?.link;
      const hasTools = Boolean(node && isHostNode(node) && resolveHostIp(node, hostMetadata));

      if (isCanvas) {
        if (!canEditCanvas) {
          if (map.locked) {
            showToast('Destrave o mapa (cadeado) para adicionar dispositivos, redes e submapas');
          } else if (!canPersist) {
            showToast('Entre no modo edição do dashboard (ícone lápis) para editar o mapa');
          }
          return;
        }
      } else if (target?.link) {
        if (!canEditCanvas) {
          return;
        }
      } else if (node && !hasTools && !canEditCanvas) {
        return;
      }

      if (node && !selectedNodeIds.includes(node.id)) {
        if (selectedNodeIds.length === 0 || !(e.shiftKey || e.ctrlKey || e.metaKey)) {
          setSelectedNodeIds([node.id]);
        } else {
          setSelectedNodeIds((prev) => (prev.includes(node.id) ? prev : [...prev, node.id]));
        }
      }

      const el = wrapRef.current;
      if (!el) {
        return;
      }
      const rect = el.getBoundingClientRect();
      const { x: mapX, y: mapY } = clientToMapCoords(e.clientX, e.clientY, rect, view);
      setContextMenu({
        screenX: e.clientX,
        screenY: e.clientY,
        mapX,
        mapY,
        node,
        link: target?.link,
      });
    },
    [
      canEditCanvas,
      canPersist,
      hostMetadata,
      map.locked,
      selectedNodeIds,
      setSelectedNodeIds,
      showToast,
      storedMap,
      view,
      wrapRef,
    ]
  );

  /**
   * Handlers por nó ficam aqui e recebem o nó como argumento: se fossem criados dentro do `.map()`
   * do render, cada nó ganharia uma função nova a cada render e a memoização das formas cairia.
   */
  const handleNodeContextMenu = useCallback(
    (e: React.MouseEvent, node: TopologyNode) => handleContextMenu(e, { node }),
    [handleContextMenu]
  );

  return { contextMenu, closeContextMenu, handleContextMenu, handleNodeContextMenu };
}
