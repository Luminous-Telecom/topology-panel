/** Animação contínua das faixas RX/TX — período = soma do stroke-dasharray. */
export const LINK_FLOW_DASH = '8 22';
export const LINK_FLOW_PERIOD = 30;
export const LINK_FLOW_SPEED = 0.55;

export type LinkFlowController = {
  stop: () => void;
  setPaused: (paused: boolean) => void;
};

/** Atualiza stroke-dashoffset via rAF (não reinicia com re-render React). */
export function startLinkFlowAnimation(root: HTMLElement): LinkFlowController {
  let offset = 0;
  let raf = 0;
  let paused = false;

  const apply = () => {
    // Path vai origem → destino: offset positivo sobe no path (→ destino / upload),
    // negativo desce (→ origem / download).
    const downloadOffset = String(offset);
    const uploadOffset = String(-offset);
    root.querySelectorAll('[data-link-flow="download"]').forEach((el) => {
      el.setAttribute('stroke-dashoffset', downloadOffset);
    });
    root.querySelectorAll('[data-link-flow="upload"]').forEach((el) => {
      el.setAttribute('stroke-dashoffset', uploadOffset);
    });
  };

  const tick = () => {
    offset = (offset + LINK_FLOW_SPEED) % LINK_FLOW_PERIOD;
    apply();
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
