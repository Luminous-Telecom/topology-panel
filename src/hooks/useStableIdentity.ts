import { useRef } from 'react';
import { structuralShare } from '../utils/structuralIdentity';

/**
 * Mantém a identidade de um valor derivado da Query entre refreshes que não mudaram nada.
 *
 * Guardar o resultado anterior num ref e devolvê-lo quando o conteúdo é igual é seguro mesmo com
 * render duplo: `structuralShare` é determinística e idempotente — reaplicá-la sobre o próprio
 * resultado devolve o mesmo objeto.
 *
 * Só para dado JSON-like: mapa, metadata, hosts por refId, status por host. Ver
 * `utils/structuralIdentity.ts`.
 */
export function useStableIdentity<T>(next: T): T {
  const previous = useRef<T>();
  const stable = structuralShare(next, previous.current);
  previous.current = stable;
  return stable;
}
