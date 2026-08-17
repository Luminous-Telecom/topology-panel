import { describe, expect, it } from 'vitest';
import { confirmSuggestedLink, mergeSuggestedLinks } from './mapSuggestedLinkEdits';
import { emptyMap, hostNode } from './testMapFixtures';

describe('mapSuggestedLinkEdits', () => {
  it('confirma sugestão criando link confirmado', () => {
    const map = emptyMap({
      nodes: [hostNode({ id: 'a' }), hostNode({ id: 'b' })],
      suggestedLinks: [
        {
          id: 'sugg-a-b--',
          fromNodeId: 'a',
          toNodeId: 'b',
          source: 'lldp',
          state: 'suggested',
          confidence: 'high',
          localPort: 'eth0',
          remotePort: 'eth1',
        },
      ],
    });
    const next = confirmSuggestedLink(map, 'sugg-a-b--');
    expect(next.links).toHaveLength(1);
    expect(next.links[0].discovery?.source).toBe('lldp');
    expect(next.suggestedLinks).toBeUndefined();
  });

  it('merge preserva sugestões ignoradas', () => {
    const map = emptyMap({
      suggestedLinks: [
        {
          id: 's1',
          fromNodeId: 'a',
          toNodeId: 'b',
          source: 'lldp',
          state: 'ignored',
          confidence: 'low',
        },
      ],
    });
    const next = mergeSuggestedLinks(map, [
      {
        id: 's1',
        fromNodeId: 'a',
        toNodeId: 'b',
        source: 'lldp',
        state: 'suggested',
        confidence: 'high',
      },
    ]);
    expect(next.suggestedLinks?.[0].state).toBe('ignored');
  });
});
