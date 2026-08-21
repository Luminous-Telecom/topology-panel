import React, { RefObject, useCallback, useRef, useState } from 'react';
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
  /**
   * A view entra por ref porque muda a cada frame de pan/zoom. Com ela nas dependências, o
   * `handleContextMenu` (e o `handleNodeContextMenu` derivado) ganhava identidade nova em todo
   * frame do gesto e derrubava a memoização das camadas de nó e da grade.
   */
  const viewRef = useRef(view);
  viewRef.current = view;

  const openContextMenuAt = useCallback(
    (
      screenX: number,
      screenY: number,
      target?: { node?: TopologyNode; link?: TopologyLink },
      modifiers?: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }
    ) => {
      const rawNode = target?.node;
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
        const additive = modifiers?.shiftKey || modifiers?.ctrlKey || modifiers?.metaKey;
        if (selectedNodeIds.length === 0 || !additive) {
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
      const { x: mapX, y: mapY } = clientToMapCoords(screenX, screenY, rect, viewRef.current);
      setContextMenu({
        screenX,
        screenY,
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
      wrapRef,
    ]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, target?: { node?: TopologyNode; link?: TopologyLink }) => {
      e.preventDefault();
      e.stopPropagation();
      openContextMenuAt(e.clientX, e.clientY, target, {
        shiftKey: e.shiftKey,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
      });
    },
    [openContextMenuAt]
  );

  /**
   * Handlers por nó ficam aqui e recebem o nó como argumento: se fossem criados dentro do `.map()`
   * do render, cada nó ganharia uma função nova a cada render e a memoização das formas cairia.
   */
  const handleNodeContextMenu = useCallback(
    (e: React.MouseEvent, node: TopologyNode) => handleContextMenu(e, { node }),
    [handleContextMenu]
  );

  return { contextMenu, closeContextMenu, handleContextMenu, handleNodeContextMenu, openContextMenuAt };
}
