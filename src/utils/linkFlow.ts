/** Animação contínua das faixas RX/TX — velocidade por elemento via data-link-flow-speed. */
export const LINK_FLOW_DASH = '8 22';
const LINK_FLOW_PERIOD = 30;

export type LinkFlowController = {
  stop: () => void;
  setPaused: (paused: boolean) => void;
};

function readFlowSpeed(el: Element): number {
  const raw = el.getAttribute('data-link-flow-speed');
  if (!raw) {
    return 0;
  }
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Deslocamento de cada faixa, fora do DOM.
 *
 * Guardar no atributo custava uma leitura e uma escrita de string por faixa em **cada** frame; o
 * valor só interessa à própria animação.
 */
const flowOffsets = new WeakMap<Element, number>();

/** Reconsulta o DOM no máximo a cada 250 ms — link novo entra na animação no fatiamento seguinte. */
const FLOW_QUERY_INTERVAL_MS = 250;

function writeFlowOffset(el: Element, offset: number): void {
  const normalized = ((offset % LINK_FLOW_PERIOD) + LINK_FLOW_PERIOD) % LINK_FLOW_PERIOD;
  flowOffsets.set(el, normalized);
  const direction = el.getAttribute('data-link-flow');
  const signed = direction === 'upload' ? -normalized : normalized;
  el.setAttribute('stroke-dashoffset', String(signed));
}

/** Atualiza stroke-dashoffset via rAF com velocidade individual por faixa. */
export function startLinkFlowAnimation(root: HTMLElement): LinkFlowController {
  let raf = 0;
  let paused = false;
  let lanes: Element[] = [];
  let lanesReadAt = 0;

  const tick = () => {
    const now = performance.now();
    if (now - lanesReadAt >= FLOW_QUERY_INTERVAL_MS) {
      lanes = Array.from(root.querySelectorAll('[data-link-flow]'));
      lanesReadAt = now;
    }
    for (const el of lanes) {
      if (el.getAttribute('data-link-flow-active') === 'false') {
        continue;
      }
      const speed = readFlowSpeed(el);
      if (speed <= 0) {
        continue;
      }
      writeFlowOffset(el, (flowOffsets.get(el) ?? 0) + speed);
    }
    raf = requestAnimationFrame(tick);
  };

  const start = () => {
    if (!raf && !paused) {
      raf = requestAnimationFrame(tick);
    }
  };

  start();

  return {
    stop: () => {
      cancelAnimationFrame(raf);
      raf = 0;
    },
    setPaused: (next) => {
      if (paused === next) {
        return;
      }
      paused = next;
      if (paused) {
        cancelAnimationFrame(raf);
        raf = 0;
      } else {
        start();
      }
    },
  };
}
