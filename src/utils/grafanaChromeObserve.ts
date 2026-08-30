/**
 * Observer do chrome Grafana (toolbar / nav), não do SVG do mapa.
 *
 * `document.body` + `subtree` via a cada nó que o canvas insere. Sem filtrar, cada
 * `childList` no SVG dispara `querySelector` no documento inteiro — o painel fica preto
 * ao entrar em edição e ao remount do editor.
 */

/** True quando alguma mutação toca HTML fora do SVG (toolbar, nav, painel de opções). */
export function mutationsAffectHtmlChrome(mutations: ReadonlyArray<{ target: Node }>): boolean {
  for (const mutation of mutations) {
    if (!(mutation.target instanceof SVGElement)) {
      return true;
    }
  }
  return false;
}

/**
 * Observa o `document.body` e chama `onHtmlMutation` só para mutação HTML, agrupada num rAF.
 * Devolve o cancelador (disconnect + cancela o frame pendente).
 */
export function observeGrafanaChrome(onHtmlMutation: () => void): () => void {
  if (typeof document === 'undefined' || !document.body) {
    return () => {};
  }

  let rafId = 0;
  const observer = new MutationObserver((mutations) => {
    if (!mutationsAffectHtmlChrome(mutations)) {
      return;
    }
    if (rafId !== 0) {
      return;
    }
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      onHtmlMutation();
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });

  return () => {
    observer.disconnect();
    if (rafId !== 0) {
      cancelAnimationFrame(rafId);
    }
  };
}
