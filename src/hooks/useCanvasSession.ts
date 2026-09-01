import { useRef, useState } from 'react';
import { CanvasTool, TopologyLink, TopologyNode } from '../types';

export type CanvasPendingLink = {
  from: string;
  to: string;
  fromNode: TopologyNode;
  toNode: TopologyNode;
};

export type PingTarget = {
  label: string;
  ip: string;
  zabbixHostId?: string;
};

/**
 * Estado de sessão do canvas: ferramenta, busca, cabo em edição, ping e blueprint.
 *
 * Fica fora do `TopologyCanvas` para o orquestrador só compor. `toolRef` alimenta o drag
 * (a view muda a cada frame; a ferramenta não pode recriar o controller).
 */
export function useCanvasSession(canEditCanvas: boolean) {
  const [tool, setTool] = useState<CanvasTool>(() => (canEditCanvas ? 'select' : 'pan'));
  const [searchOpen, setSearchOpen] = useState(false);
  const [linkFromId, setLinkFromId] = useState<string | null>(null);
  const [pendingLink, setPendingLink] = useState<CanvasPendingLink | null>(null);
  const [detailsLink, setDetailsLink] = useState<TopologyLink | null>(null);
  const [blueprintOpen, setBlueprintOpen] = useState(false);
  const [pingTarget, setPingTarget] = useState<PingTarget | null>(null);
  const toolRef = useRef<CanvasTool>(canEditCanvas ? 'select' : 'pan');

  // Persistir pan no estado (ao destravar não volta a seta) e já devolver pan neste render
  // — um effect pintava um frame com a seta ainda ativa.
  if (!canEditCanvas && tool !== 'pan') {
    setTool('pan');
  }
  const effectiveTool: CanvasTool = canEditCanvas ? tool : 'pan';
  const panTool = effectiveTool === 'pan';
  toolRef.current = effectiveTool;

  return {
    tool: effectiveTool,
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
