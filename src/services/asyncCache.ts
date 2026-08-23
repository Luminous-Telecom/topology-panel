/**
 * Cache com TTL e deduplicação de requisições em voo.
 *
 * Vários pontos do painel pedem o mesmo dado quase ao mesmo tempo: cada modal de submapa monta seu
 * próprio `useGrafanaDashboards` (uma chamada a `/api/search` por modal) e cada painel de topologia
 * do dashboard resolve metadata dos mesmos hosts no Zabbix. Sem dedupe, N consumidores viram N
 * requisições idênticas; com o TTL, remontar o mesmo picker logo em seguida não bate na rede de novo.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export interface AsyncCache<T> {
  /** Valor em cache, requisição já em voo, ou uma nova chamada a `load`. */
  get(key: string, load: () => Promise<T>): Promise<T>;
  /** Descarta a chave (ou o cache inteiro, sem argumento). Requisições em voo seguem válidas. */
  invalidate(key?: string): void;
}

export interface AsyncCacheOptions<T> {
  ttlMs: number;
  /**
   * Teto de entradas guardadas.
   *
   * Entrada expirada só saía quando a mesma chave era pedida de novo, e há chave que nunca se
   * repete — a série do hover inclui o intervalo do dashboard, que muda a cada refresh. Num painel
   * aberto o dia inteiro isso acumulava série antiga que ninguém mais lê.
   */
  maxEntries?: number;
  /**
   * Decide se o resultado merece ir para o cache. Sem isso, uma resposta vazia por falha de rede
   * ficaria congelada até o TTL expirar, escondendo a recuperação do serviço.
   */
  isCacheable?: (value: T) => boolean;
  /** Relógio injetável — os testes controlam a passagem do tempo sem timers reais. */
  now?: () => number;
}

const DEFAULT_MAX_ENTRIES = 50;

export function createAsyncCache<T>(options: AsyncCacheOptions<T>): AsyncCache<T> {
  const { ttlMs, isCacheable, now = Date.now, maxEntries = DEFAULT_MAX_ENTRIES } = options;
  const entries = new Map<string, CacheEntry<T>>();
  const inFlight = new Map<string, Promise<T>>();

  function store(key: string, value: T): void {
    const current = now();
    for (const [entryKey, entry] of entries) {
      if (entry.expiresAt <= current) {
        entries.delete(entryKey);
      }
    }
    entries.set(key, { value, expiresAt: current + ttlMs });
    // `Map` preserva a ordem de inserção, então a primeira chave é sempre a mais antiga.
    while (entries.size > maxEntries) {
      const oldest = entries.keys().next();
      if (oldest.done) {
        break;
      }
      entries.delete(oldest.value);
    }
  }

  function freshValue(key: string): CacheEntry<T> | undefined {
    const entry = entries.get(key);
    if (!entry) {
      return undefined;
    }
    if (entry.expiresAt <= now()) {
      entries.delete(key);
      return undefined;
    }
    return entry;
  }

  return {
    get(key, load) {
      const cached = freshValue(key);
      if (cached) {
        return Promise.resolve(cached.value);
      }
      const pending = inFlight.get(key);
      if (pending) {
        return pending;
      }

      const request = load()
        .then((value) => {
          if (!isCacheable || isCacheable(value)) {
            store(key, value);
          }
          return value;
        })
        .finally(() => {
          inFlight.delete(key);
        });

      inFlight.set(key, request);
      return request;
    },

    invalidate(key) {
      if (key === undefined) {
        entries.clear();
        return;
      }
      entries.delete(key);
    },
  };
}
