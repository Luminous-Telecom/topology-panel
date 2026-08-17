import { css } from '@emotion/css';

/** Estilos do canvas: container, área de scroll, SVG e o piscar de host offline. */
export const canvasStyles = {
  wrap: css`
    width: 100%;
    height: 100%;
    overflow: hidden;
    position: relative;
    background: #111217;
    overscroll-behavior: none;
    touch-action: none;
    &:fullscreen {
      width: 100vw;
      height: 100vh;
      background: #111217;
    }
    &:-webkit-full-screen {
      width: 100vw;
      height: 100vh;
      background: #111217;
    }
  `,
  scrollPane: css`
    position: absolute;
    inset: 0;
    overflow: auto;
    z-index: 0;
    overscroll-behavior: contain;
    /* Deixa a faixa das barras clicável; o SVG cobre só a client area. */
    &::-webkit-scrollbar {
      width: 22px;
      height: 22px;
    }
    &::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.28);
      border-radius: 10px;
    }
    &::-webkit-scrollbar-thumb:hover {
      background: rgba(255, 255, 255, 0.42);
    }
    &::-webkit-scrollbar-corner {
      background: transparent;
    }
  `,
  scrollSizer: css`
    pointer-events: none;
  `,
  wrapSelect: css`
    cursor: default;
    &:active {
      cursor: default;
    }
  `,
  wrapPan: css`
    cursor: grab;
    &:active {
      cursor: grabbing;
    }
  `,
  svg: css`
    display: block;
    user-select: none;
    touch-action: none;
    position: absolute;
    left: 0;
    top: 0;
    z-index: 1;
  `,
  empty: css`
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #8e8e8e;
    font-size: 14px;
    padding: 16px;
    text-align: center;
  `,
  offlineBlink: css`
    animation: topology-offline-blink 1s ease-in-out infinite;
    @keyframes topology-offline-blink {
      0%,
      100% {
        opacity: 1;
      }
      50% {
        opacity: 0.28;
      }
    }
  `,
};
