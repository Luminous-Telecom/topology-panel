import { describe, expect, it, vi } from 'vitest';
import { createAsyncCache } from './asyncCache';

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (e: Error) => void } {
  let resolve!: (value: T) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('createAsyncCache', () => {
  it('reaproveita o valor enquanto o TTL não expira', async () => {
    let clock = 0;
    const load = vi.fn(async () => 'valor');
    const cache = createAsyncCache<string>({ ttlMs: 1000, now: () => clock });

    expect(await cache.get('k', load)).toBe('valor');
    clock = 999;
    expect(await cache.get('k', load)).toBe('valor');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('busca de novo depois que o TTL expira', async () => {
    let clock = 0;
    const load = vi.fn(async () => 'valor');
    const cache = createAsyncCache<string>({ ttlMs: 1000, now: () => clock });

    await cache.get('k', load);
    clock = 1000;
    await cache.get('k', load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('chamadas simultâneas na mesma chave compartilham uma requisição', async () => {
    const pending = deferred<string>();
    const load = vi.fn(() => pending.promise);
    const cache = createAsyncCache<string>({ ttlMs: 1000 });

    const first = cache.get('k', load);
    const second = cache.get('k', load);
    pending.resolve('valor');

    expect(await first).toBe('valor');
    expect(await second).toBe('valor');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('chaves diferentes não compartilham requisição', async () => {
    const load = vi.fn(async () => 'valor');
    const cache = createAsyncCache<string>({ ttlMs: 1000 });

    await Promise.all([cache.get('a', load), cache.get('b', load)]);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('falha não fica em cache e a próxima chamada tenta de novo', async () => {
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('rede fora'))
      .mockResolvedValueOnce('valor');
    const cache = createAsyncCache<string>({ ttlMs: 1000 });

    await expect(cache.get('k', load)).rejects.toThrow('rede fora');
    expect(await cache.get('k', load)).toBe('valor');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('resultado reprovado por isCacheable não congela o cache', async () => {
    const load = vi
      .fn<() => Promise<string[]>>()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(['a']);
    const cache = createAsyncCache<string[]>({ ttlMs: 1000, isCacheable: (v) => v.length > 0 });

    expect(await cache.get('k', load)).toEqual([]);
    expect(await cache.get('k', load)).toEqual(['a']);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('descarta entrada expirada de chave que nunca mais é pedida', async () => {
    let clock = 0;
    const load = vi.fn(async () => 'valor');
    const cache = createAsyncCache<string>({ ttlMs: 1000, now: () => clock });

    // Chave com intervalo variável, como a série do hover: nunca se repete.
    await cache.get('serie\u00000-100', load);
    clock = 2000;
    await cache.get('serie\u00002000-2100', load);

    expect(await cache.get('serie\u00000-100', load)).toBe('valor');
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('respeita o teto de entradas descartando a mais antiga', async () => {
    const load = vi.fn(async () => 'valor');
    const cache = createAsyncCache<string>({ ttlMs: 10_000, maxEntries: 2 });

    await cache.get('a', load);
    await cache.get('b', load);
    await cache.get('c', load);

    expect(await cache.get('b', load)).toBe('valor');
    expect(load).toHaveBeenCalledTimes(3);

    await cache.get('a', load);
    expect(load).toHaveBeenCalledTimes(4);
  });

  it('respeita o teto também nas requisições em voo', async () => {
    const pending = deferred<string>();
    const load = vi.fn(() => pending.promise);
    const cache = createAsyncCache<string>({ ttlMs: 10_000, maxEntries: 2 });

    // Três chaves que nunca repetem e nenhuma resolveu ainda — o teto só valia para o concluído.
    const inFlight = [cache.get('a', load), cache.get('b', load), cache.get('c', load)];

    // 'a' já saiu do mapa de em-voo, então é pedida de novo em vez de reusar a promise presa.
    inFlight.push(cache.get('a', load));
    expect(load).toHaveBeenCalledTimes(4);

    pending.resolve('valor');
    expect(await Promise.all(inFlight)).toEqual(['valor', 'valor', 'valor', 'valor']);
  });

  it('invalidate força nova busca antes do TTL', async () => {
    const load = vi.fn(async () => 'valor');
    const cache = createAsyncCache<string>({ ttlMs: 10_000 });

    await cache.get('k', load);
    cache.invalidate('k');
    await cache.get('k', load);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
