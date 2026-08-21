/**
 * Compartilhamento estrutural entre dois refreshes.
 *
 * O Grafana entrega um `PanelData` novo a cada refresh, então tudo que é derivado dele (mapa
 * mesclado, metadata, hosts por refId, status por host) é remontado do zero mesmo quando nenhum
 * valor mudou. Como esses objetos são dependência de `useMemo` e prop de componente memoizado, um
 * poll sem mudança nenhuma invalidava o mapa inteiro.
 *
 * `structuralShare` devolve o valor anterior sempre que o conteúdo é igual, e — quando só parte
 * mudou — devolve um valor novo que reaproveita a identidade de cada galho que não mudou. Assim a
 * comparação por identidade volta a valer rio abaixo, por nó.
 *
 * Só entende dado JSON-like (objeto literal, array e primitivo), que é o formato de `TopologyMap`,
 * `HostMetadataMap` e `HostDisplayMap`. Qualquer outra coisa (`Date`, `Map`, `DataFrame`, função)
 * é comparada por identidade e devolvida como veio — nunca passe `PanelData` por aqui.
 */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function shareArray(next: unknown[], previous: unknown[]): unknown[] {
  if (next.length !== previous.length) {
    return next.map((item, index) => structuralShare(item, previous[index]));
  }
  const merged: unknown[] = new Array(next.length);
  let reusedAll = true;
  for (let i = 0; i < next.length; i += 1) {
    merged[i] = structuralShare(next[i], previous[i]);
    if (merged[i] !== previous[i]) {
      reusedAll = false;
    }
  }
  return reusedAll ? previous : merged;
}

function shareObject(
  next: Record<string, unknown>,
  previous: Record<string, unknown>
): Record<string, unknown> {
  const nextKeys = Object.keys(next);
  const merged: Record<string, unknown> = {};
  let reusedAll = nextKeys.length === Object.keys(previous).length;
  for (const key of nextKeys) {
    const shared = structuralShare(next[key], previous[key]);
    merged[key] = shared;
    // `in` distingue "chave ausente" de "chave presente com undefined".
    if (shared !== previous[key] || !(key in previous)) {
      reusedAll = false;
    }
  }
  return reusedAll ? previous : merged;
}

/**
 * Devolve `previous` quando `next` tem exatamente o mesmo conteúdo; senão devolve um valor novo
 * que reaproveita a identidade das partes iguais.
 */
export function structuralShare<T>(next: T, previous: unknown): T {
  if (Object.is(next, previous)) {
    return previous as T;
  }
  if (Array.isArray(next) && Array.isArray(previous)) {
    return shareArray(next, previous) as T;
  }
  if (isPlainObject(next) && isPlainObject(previous)) {
    return shareObject(next, previous) as T;
  }
  return next;
}

/** `true` quando os dois valores têm exatamente o mesmo conteúdo. */
export function sameStructure(next: unknown, previous: unknown): boolean {
  return structuralShare(next, previous) === previous;
}

/**
 * Mesma ideia para `Map` de valor JSON-like — o formato de `nodeLayouts`, `regionStats` e dos
 * badges por nó. Quando só um host muda, os outros mantêm a identidade do valor e o `React.memo`
 * da forma continua valendo.
 */
export function structuralShareMap<K, V>(next: Map<K, V>, previous: Map<K, V> | undefined): Map<K, V> {
  if (!previous || previous === next) {
    return next;
  }
  const merged = new Map<K, V>();
  let reusedAll = next.size === previous.size;
  for (const [key, value] of next) {
    const shared = structuralShare(value, previous.get(key));
    merged.set(key, shared);
    if (!previous.has(key) || shared !== previous.get(key)) {
      reusedAll = false;
    }
  }
  return reusedAll ? previous : merged;
}
