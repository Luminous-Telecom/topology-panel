import { useMemo } from 'react';
import { TopologyLink, TopologyNode } from '../types';
import { linkKey } from '../utils/mapLinkEdits';
import { NodeLayout } from '../utils/nodeLayout';

export interface RenderLink {
  link: TopologyLink;
  /** Chave estável para o React — ver comentário da ordenação. */
  key: string;
}

/**
 * Links desenháveis, na ordem de pintura: o selecionado por último, para ficar por cima dos outros.
 *
 * A chave não pode ser o índice do array ordenado, porque selecionar um cabo reordena a lista e
 * faria o React remontar todos os `LinkLine` em vez de atualizar só o que mudou. Link com as duas
 * pontas iguais a outro ganha sufixo para não repetir chave.
 *
 * Link que aponta para uma caixa de rede não é desenhado: a linha ficaria por baixo da região.
 */
export function useRenderLinks(
  links: TopologyLink[],
  nodeLayouts: Map<string, NodeLayout & TopologyNode>,
  selectedLink: TopologyLink | null
): { validLinks: TopologyLink[]; renderLinks: RenderLink[] } {
  const validLinks = useMemo(() => {
    return links.filter((l) => {
      const from = nodeLayouts.get(l.from);
      const to = nodeLayouts.get(l.to);
      return from && to && from.type !== 'network' && to.type !== 'network';
    });
  }, [links, nodeLayouts]);

  const renderLinks = useMemo(() => {
    const occurrences = new Map<string, number>();
    const keyed = validLinks.map((link) => {
      const base = linkKey(link);
      const seen = occurrences.get(base) ?? 0;
      occurrences.set(base, seen + 1);
      return { link, key: seen === 0 ? base : `${base}#${seen}` };
    });
    const selectedKey = selectedLink ? linkKey(selectedLink) : null;
    return keyed.sort((a, b) => {
      const aActive = selectedKey === linkKey(a.link) ? 1 : 0;
      const bActive = selectedKey === linkKey(b.link) ? 1 : 0;
      return aActive - bActive;
    });
  }, [validLinks, selectedLink]);

  return { validLinks, renderLinks };
}
