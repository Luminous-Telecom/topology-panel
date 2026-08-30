/**
 * Observer do chrome Grafana (toolbar / nav), não do SVG do mapa.
 *
 * `document.body` + `subtree` via a cada nó que o canvas insere. Sem filtrar, cada
 * `childList` no SVG dispara `querySelector` no documento inteiro — o painel fica preto
 * ao entrar em edição e ao remount do editor.
 *
 * Edição e playlist compartilham um observer: dois `MutationObserver` no `body` duplicavam
 * o `querySelector` no mesmo frame em que o Grafana reconstrói a toolbar.
 */

const TOPOLOGY_CANVAS_SELECTOR = '[data-topology-canvas]';

/** Toolbar / header do Grafana — sem o SVG do painel. */
const GRAFANA_CHROME_SCOPE_SELECTORS = [
  '[data-testid="data-testid Nav toolbar"]',
  '[data-testid="data-testid dashboard-controls"]',
  'header',
] as const;

function nodeInsideTopologyCanvas(node: Node): boolean {
  const el = node instanceof Element ? node : node.parentElement;
  return Boolean(el?.closest(TOPOLOGY_CANVAS_SELECTOR));
}

/** True quando alguma mutação toca HTML do chrome Grafana, não o SVG nem a UI do mapa. */
export function mutationsAffectHtmlChrome(mutations: ReadonlyArray<{ target: Node }>): boolean {
  for (const mutation of mutations) {
    const target = mutation.target;
    if (target instanceof SVGElement) {
      continue;
    }
    if (nodeInsideTopologyCanvas(target)) {
      continue;
    }
    return true;
  }
  return false;
}

/** Um `querySelector` só, em vez de um por seletor (fora do modo edição todos falhavam). */
export function matchesAnySelector(root: ParentNode | null | undefined, selectors: readonly string[]): boolean {
  if (!root || selectors.length === 0) {
    return false;
  }
  try {
    return Boolean(root.querySelector(selectors.join(',')));
  } catch {
    return selectors.some((sel) => Boolean(root.querySelector(sel)));
  }
}

function queryFirst(root: ParentNode, selectors: readonly string[]): Element | null {
  try {
    return root.querySelector(selectors.join(','));
  } catch {
    for (const sel of selectors) {
      const found = root.querySelector(sel);
      if (found) {
        return found;
      }
    }
    return null;
  }
}

/**
 * Procura os botões do chrome Grafana. Não limita a busca ao primeiro `header`/toolbar —
 * o Salvar/Sair do dashboard mora noutro bloco; se a toolbar existisse e a busca parasse
 * nela, o painel nunca entrava em modo edição (travar/destravar mapa mortos).
 */
export function chromeContainsSelector(
  root: ParentNode | null | undefined,
  selectors: readonly string[]
): boolean {
  if (!root || selectors.length === 0) {
    return false;
  }
  if (root instanceof Element) {
    return matchesAnySelector(root, selectors);
  }
  const doc = root instanceof Document ? root : document;
  for (const scopeSel of GRAFANA_CHROME_SCOPE_SELECTORS) {
    const scope = doc.querySelector(scopeSel);
    if (scope && queryFirst(scope, selectors)) {
      return true;
    }
  }
  const hit = queryFirst(doc, selectors);
  if (!hit) {
    return false;
  }
  return !hit.closest(TOPOLOGY_CANVAS_SELECTOR);
}

const listeners = new Set<() => void>();
let stopShared: (() => void) | undefined;
let rafId = 0;

function notifyChromeListeners(): void {
  rafId = 0;
  for (const listener of listeners) {
    listener();
  }
}

function startSharedObserver(): () => void {
  if (typeof document === 'undefined' || !document.body) {
    return () => {};
  }
  const observer = new MutationObserver((mutations) => {
    if (!mutationsAffectHtmlChrome(mutations)) {
      return;
    }
    if (rafId !== 0) {
      return;
    }
    rafId = requestAnimationFrame(notifyChromeListeners);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  return () => {
    observer.disconnect();
    if (rafId !== 0) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  };
}

/**
 * Observa o `document.body` e chama `onHtmlMutation` só para mutação HTML, agrupada num rAF.
 * Devolve o cancelador (disconnect + cancela o frame pendente).
 */
export function observeGrafanaChrome(onHtmlMutation: () => void): () => void {
  listeners.add(onHtmlMutation);
  if (!stopShared) {
    stopShared = startSharedObserver();
  }
  return () => {
    listeners.delete(onHtmlMutation);
    if (listeners.size === 0) {
      stopShared?.();
      stopShared = undefined;
    }
  };
}
