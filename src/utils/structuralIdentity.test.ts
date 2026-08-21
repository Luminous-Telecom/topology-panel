import { describe, expect, it } from 'vitest';
import { sameStructure, structuralShare, structuralShareMap } from './structuralIdentity';

describe('structuralShare', () => {
  it('devolve o objeto anterior quando o conteúdo é idêntico', () => {
    const previous = { a: 1, b: { c: 2 } };
    const next = { a: 1, b: { c: 2 } };
    expect(structuralShare(next, previous)).toBe(previous);
  });

  it('reaproveita a identidade dos galhos que não mudaram', () => {
    const previous = { host1: { status: 'online' }, host2: { status: 'online' } };
    const next = { host1: { status: 'online' }, host2: { status: 'offline' } };

    const shared = structuralShare(next, previous);

    expect(shared).not.toBe(previous);
    expect(shared.host1).toBe(previous.host1);
    expect(shared.host2).toEqual({ status: 'offline' });
  });

  it('trata chave removida como mudança', () => {
    const previous = { a: 1, b: 2 };
    const next = { a: 1 };
    const shared = structuralShare(next, previous);
    expect(shared).not.toBe(previous);
    expect(shared).toEqual({ a: 1 });
  });

  it('distingue chave ausente de chave presente com undefined', () => {
    const previous: Record<string, number | undefined> = { a: 1 };
    const next: Record<string, number | undefined> = { a: 1, b: undefined };
    expect(structuralShare(next, previous)).not.toBe(previous);
  });

  it('reaproveita array igual e compartilha itens quando só um mudou', () => {
    const previous = [{ id: 'a' }, { id: 'b' }];
    expect(structuralShare([{ id: 'a' }, { id: 'b' }], previous)).toBe(previous);

    const shared = structuralShare([{ id: 'a' }, { id: 'c' }], previous);
    expect(shared).not.toBe(previous);
    expect(shared[0]).toBe(previous[0]);
  });

  it('array de tamanho diferente devolve valor novo', () => {
    const previous = [{ id: 'a' }];
    const shared = structuralShare([{ id: 'a' }, { id: 'b' }], previous);
    expect(shared).not.toBe(previous);
    expect(shared[0]).toBe(previous[0]);
    expect(shared).toHaveLength(2);
  });

  it('não recursa em objeto que não é literal (Date) — compara por identidade', () => {
    const previous = { at: new Date(0) };
    const next = { at: new Date(0) };

    const shared = structuralShare(next, previous);

    // Mesmo instante, mas instâncias diferentes: não pode virar falso positivo de igualdade.
    expect(shared).not.toBe(previous);
    expect(shared.at).toBe(next.at);
  });

  it('sem valor anterior devolve o valor novo', () => {
    const next = { a: 1 };
    expect(structuralShare(next, undefined)).toBe(next);
  });

  it('é idempotente: reaplicar sobre o próprio resultado devolve o mesmo objeto', () => {
    const previous = { a: 1, b: { c: 2 } };
    const first = structuralShare({ a: 1, b: { c: 3 } }, previous);
    expect(structuralShare({ a: 1, b: { c: 3 } }, first)).toBe(first);
  });
});

describe('sameStructure', () => {
  it('compara conteúdo e não identidade', () => {
    expect(sameStructure({ value: 1 }, { value: 1 })).toBe(true);
    expect(sameStructure({ value: 1 }, { value: 2 })).toBe(false);
  });

  it('dois ausentes são iguais; um ausente e um presente não', () => {
    expect(sameStructure(undefined, undefined)).toBe(true);
    expect(sameStructure({ value: 1 }, undefined)).toBe(false);
    expect(sameStructure(undefined, { value: 1 })).toBe(false);
  });
});

describe('structuralShareMap', () => {
  it('devolve o Map anterior quando nenhum valor mudou', () => {
    const previous = new Map([['a', { x: 1 }]]);
    const next = new Map([['a', { x: 1 }]]);
    expect(structuralShareMap(next, previous)).toBe(previous);
  });

  it('só o valor que mudou perde a identidade', () => {
    const previous = new Map([
      ['a', { x: 1 }],
      ['b', { x: 1 }],
    ]);
    const next = new Map([
      ['a', { x: 1 }],
      ['b', { x: 2 }],
    ]);

    const shared = structuralShareMap(next, previous);

    expect(shared).not.toBe(previous);
    expect(shared.get('a')).toBe(previous.get('a'));
    expect(shared.get('b')).toEqual({ x: 2 });
  });

  it('chave removida devolve Map novo com o tamanho certo', () => {
    const previous = new Map([
      ['a', { x: 1 }],
      ['b', { x: 1 }],
    ]);
    const shared = structuralShareMap(new Map([['a', { x: 1 }]]), previous);
    expect(shared).not.toBe(previous);
    expect(shared.size).toBe(1);
    expect(shared.get('a')).toBe(previous.get('a'));
  });

  it('sem Map anterior devolve o novo', () => {
    const next = new Map([['a', { x: 1 }]]);
    expect(structuralShareMap(next, undefined)).toBe(next);
  });
});
