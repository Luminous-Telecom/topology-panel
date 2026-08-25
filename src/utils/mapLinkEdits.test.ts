import { describe, expect, it } from 'vitest';
import {
  addLinkToMap,
  addLinkWithInterfaces,
  linkKey,
  linksMatchEndpoints,
  linksMatchIdentity,
  removeLink,
  updateLinkProps,
  upsertLinkWithInterfaces,
} from './mapLinkEdits';
import { emptyMap, hostNode } from './testMapFixtures';

describe('linksMatchEndpoints', () => {
  it('considera a→b igual a b→a', () => {
    expect(linksMatchEndpoints({ from: 'a', to: 'b' }, { from: 'b', to: 'a' })).toBe(true);
  });

  it('não confunde links sem relação', () => {
    expect(linksMatchEndpoints({ from: 'a', to: 'b' }, { from: 'a', to: 'c' })).toBe(false);
  });
});

describe('linkKey', () => {
  it('distingue cabos paralelos pelas interfaces', () => {
    const a = { from: 'ha', to: 'sm', fromInterface: { name: 'eth-a' }, toInterface: { name: 'eth-b' } };
    const b = { from: 'ha', to: 'sm', fromInterface: { name: 'eth-c' }, toInterface: { name: 'eth-d' } };
    expect(linkKey(a)).not.toBe(linkKey(b));
  });
});

describe('addLinkToMap', () => {
  it('ignora link para o próprio nó', () => {
    const map = emptyMap({ nodes: [hostNode()] });
    expect(addLinkToMap(map, 'a', 'a')).toBe(map);
  });

  it('não duplica link já existente em qualquer direção', () => {
    const map = emptyMap({
      nodes: [hostNode(), hostNode({ id: 'b' })],
      links: [{ from: 'a', to: 'b' }],
    });
    const next = addLinkToMap(map, 'b', 'a');
    expect(next.links).toHaveLength(1);
  });

  it('adiciona link novo entre dois nós existentes', () => {
    const map = emptyMap({ nodes: [hostNode(), hostNode({ id: 'b' })] });
    const next = addLinkToMap(map, 'a', 'b');
    expect(next.links).toEqual([
      {
        from: 'a',
        to: 'b',
        medium: expect.any(String),
        discovery: { source: 'manual', state: 'confirmed', confirmed: true },
      },
    ]);
  });

  it('permite link manual sem interfaces (sem monitoramento de tráfego)', () => {
    const map = emptyMap({ nodes: [hostNode(), hostNode({ id: 'b' })] });
    const next = addLinkWithInterfaces(map, 'a', 'b');
    expect(next.links[0]?.fromInterface).toBeUndefined();
    expect(next.links[0]?.toInterface).toBeUndefined();
  });

  it('grava o host interno quando o extremo visual é um submapa', () => {
    const map = emptyMap({ nodes: [hostNode(), hostNode({ id: 'sm', type: 'submap' })] });
    const next = addLinkWithInterfaces(map, 'a', 'sm', {
      toPeerHost: { nodeId: 'ha', zabbixHost: '10.0.0.1', label: 'host-a' },
    });
    expect(next.links[0]?.toPeerHost).toEqual({
      nodeId: 'ha',
      zabbixHost: '10.0.0.1',
      label: 'host-a',
    });
  });

  it('cria segundo cabo entre o mesmo par quando as interfaces diferem', () => {
    const map = emptyMap({
      nodes: [hostNode(), hostNode({ id: 'sm', type: 'submap' })],
      links: [
        {
          from: 'a',
          to: 'sm',
          fromInterface: { name: 'eth-a' },
          toInterface: { name: 'eth-b' },
          toPeerHost: { nodeId: 'hb', zabbixHost: '10.0.0.2', label: 'host-b' },
        },
      ],
    });
    const next = addLinkWithInterfaces(map, 'a', 'sm', {
      fromInterface: { name: 'eth-c' },
      toInterface: { name: 'eth-d' },
      toPeerHost: { nodeId: 'hb', zabbixHost: '10.0.0.2', label: 'host-b' },
    });
    expect(next.links).toHaveLength(2);
    expect(next.links[1]?.fromInterface).toEqual({ name: 'eth-c' });
    expect(next.links[1]?.toInterface).toEqual({ name: 'eth-d' });
  });

  it('não duplica o cabo com as mesmas interfaces', () => {
    const map = emptyMap({
      nodes: [hostNode(), hostNode({ id: 'sm', type: 'submap' })],
      links: [
        {
          from: 'a',
          to: 'sm',
          fromInterface: { name: 'eth-a' },
          toInterface: { name: 'eth-b' },
        },
      ],
    });
    const next = addLinkWithInterfaces(map, 'a', 'sm', {
      fromInterface: { name: 'eth-a' },
      toInterface: { name: 'eth-b' },
    });
    expect(next.links).toHaveLength(1);
  });
});

describe('upsertLinkWithInterfaces', () => {
  it('atualiza o cabo existente na direção invertida sem duplicar', () => {
    const map = emptyMap({
      nodes: [hostNode(), hostNode({ id: 'b' })],
      links: [{ from: 'b', to: 'a' }],
    });
    const next = upsertLinkWithInterfaces(map, 'a', 'b', {
      fromInterface: { name: 'eth-a' },
      toInterface: { name: 'eth-b' },
    });
    expect(next.links).toHaveLength(1);
    expect(next.links[0]?.from).toBe('b');
    expect(next.links[0]?.fromInterface).toEqual({ name: 'eth-b' });
    expect(next.links[0]?.toInterface).toEqual({ name: 'eth-a' });
  });

  it('cria cabo paralelo quando as interfaces não coincidem', () => {
    const map = emptyMap({
      nodes: [hostNode(), hostNode({ id: 'sm', type: 'submap' })],
      links: [
        {
          from: 'a',
          to: 'sm',
          fromInterface: { name: 'eth-a' },
          toInterface: { name: 'eth-b' },
        },
      ],
    });
    const next = upsertLinkWithInterfaces(map, 'a', 'sm', {
      fromInterface: { name: 'eth-c' },
      toInterface: { name: 'eth-d' },
    });
    expect(next.links).toHaveLength(2);
  });
});

describe('removeLink / updateLinkProps', () => {
  it('exclui só o cabo da mesma identidade', () => {
    const first = {
      from: 'a',
      to: 'sm',
      fromInterface: { name: 'eth-a' },
      toInterface: { name: 'eth-b' },
    };
    const second = {
      from: 'a',
      to: 'sm',
      fromInterface: { name: 'eth-c' },
      toInterface: { name: 'eth-d' },
    };
    const map = emptyMap({
      nodes: [hostNode(), hostNode({ id: 'sm', type: 'submap' })],
      links: [first, second],
    });
    const next = removeLink(map, first);
    expect(next.links).toHaveLength(1);
    expect(next.links[0]?.fromInterface).toEqual({ name: 'eth-c' });
  });

  it('atualiza só o cabo clicado quando há paralelos', () => {
    const first = {
      from: 'a',
      to: 'sm',
      fromInterface: { name: 'eth-a' },
      toInterface: { name: 'eth-b' },
    };
    const second = {
      from: 'a',
      to: 'sm',
      fromInterface: { name: 'eth-c' },
      toInterface: { name: 'eth-d' },
    };
    const map = emptyMap({
      nodes: [hostNode(), hostNode({ id: 'sm', type: 'submap' })],
      links: [first, second],
    });
    const next = updateLinkProps(map, first, { medium: 'radio' });
    expect(next.links[0]?.medium).toBe('radio');
    expect(next.links[1]?.medium).toBeUndefined();
  });

  it('linksMatchIdentity considera a direção invertida com interfaces trocadas', () => {
    expect(
      linksMatchIdentity(
        { from: 'a', to: 'b', fromInterface: { name: 'eth-a' }, toInterface: { name: 'eth-b' } },
        { from: 'b', to: 'a', fromInterface: { name: 'eth-b' }, toInterface: { name: 'eth-a' } }
      )
    ).toBe(true);
  });
});
