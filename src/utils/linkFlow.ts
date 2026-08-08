/** Animação contínua das faixas RX/TX — período = soma do stroke-dasharray. */
export const LINK_FLOW_DASH = '8 22';
export const LINK_FLOW_PERIOD = 30;
export const LINK_FLOW_SPEED = 0.55;

/** Atualiza stroke-dashoffset via rAF (não reinicia com re-render React). */
export function startLinkFlowAnimation(root: HTMLElement): () => void {
  let offset = 0;
  let raf = 0;

  const tick = () => {
    offset = (offset + LINK_FLOW_SPEED) % LINK_FLOW_PERIOD;
    const downloadOffset = String(-offset);
    const uploadOffset = String(offset);

    root.querySelectorAll('[data-link-flow="download"]').forEach((el) => {
      el.setAttribute('stroke-dashoffset', downloadOffset);
    });
    root.querySelectorAll('[data-link-flow="upload"]').forEach((el) => {
      el.setAttribute('stroke-dashoffset', uploadOffset);
    });

    raf = requestAnimationFrame(tick);
  };

  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}
