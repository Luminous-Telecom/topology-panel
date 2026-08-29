import { useEffect, useRef, useState } from 'react';
import { CanvasTool, TopologyLink, TopologyNode } from '../types';

export type CanvasPendingLink = {
  from: string;
  to: string;
  fromNode: TopologyNode;
  toNode: TopologyNode;
};

export type CanvasPingTarget = {
  label: string;
  ip: string;
  zabbixHost?: string;
};

/**
 * Estado de sessão do canvas: ferramenta, busca, cabo em edição, ping e blueprint.
 *
 * Fica fora do `TopologyCanvas` para o orquestrador só compor. `toolRef` alimenta o drag
 * (a view muda a cada frame; a ferramenta não pode recriar o controller).
 */
export function useCanvasSession(canEditCanvas: boolean) {
  const [tool, setTool] = useState<CanvasTool>(() => (canEditCanvas ? 'select' : 'pan'));
  const panTool = tool === 'pan';
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const [searchOpen, setSearchOpen] = useState(false);
  const [linkFromId, setLinkFromId] = useState<string | null>(null);
  const [pendingLink, setPendingLink] = useState<CanvasPendingLink | null>(null);
  const [detailsLink, setDetailsLink] = useState<TopologyLink | null>(null);
  const [blueprintOpen, setBlueprintOpen] = useState(false);
  const [pingTarget, setPingTarget] = useState<CanvasPingTarget | null>(null);

  useEffect(() => {
    setTool(canEditCanvas ? 'select' : 'pan');
  }, [canEditCanvas]);

  return {
    tool,
    setTool,
    toolRef,
    panTool,
    searchOpen,
    setSearchOpen,
    linkFromId,
    setLinkFromId,
    pendingLink,
    setPendingLink,
    detailsLink,
    setDetailsLink,
    blueprintOpen,
    setBlueprintOpen,
    pingTarget,
    setPingTarget,
  };
}
