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

function readFlowOffset(el: Element): number {
  const raw = el.getAttribute('data-link-flow-offset');
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function writeFlowOffset(el: Element, offset: number): void {
  const normalized = ((offset % LINK_FLOW_PERIOD) + LINK_FLOW_PERIOD) % LINK_FLOW_PERIOD;
  el.setAttribute('data-link-flow-offset', String(normalized));
  const direction = el.getAttribute('data-link-flow');
  const signed = direction === 'upload' ? -normalized : normalized;
  el.setAttribute('stroke-dashoffset', String(signed));
}

/** Atualiza stroke-dashoffset via rAF com velocidade individual por faixa. */
export function startLinkFlowAnimation(root: HTMLElement): LinkFlowController {
  let raf = 0;
  let paused = false;

  const tick = () => {
    root.querySelectorAll('[data-link-flow]').forEach((el) => {
      if (el.getAttribute('data-link-flow-active') === 'false') {
        return;
      }
      const speed = readFlowSpeed(el);
      if (speed <= 0) {
        return;
      }
      const next = readFlowOffset(el) + speed;
      writeFlowOffset(el, next);
    });
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
