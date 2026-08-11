import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Sem globals do Vitest habilitado, @testing-library/react não registra o cleanup
// automático entre testes — sem isso, o DOM de um teste de componente vaza pro próximo.
afterEach(() => {
  cleanup();
});

// jsdom não implementa matchMedia — @grafana/ui/uplot (gráficos) chamam isso no import
// de módulo. Sem isso, qualquer teste que toque @grafana/runtime (mesmo indiretamente,
// via panelColors.ts → @grafana/runtime → @grafana/ui) falha antes de rodar.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

// jsdom também não implementa ResizeObserver (usado pelo TopologyCanvas para acompanhar
// o tamanho do painel) — stub inócuo o suficiente para montar o componente em teste.
if (typeof window !== 'undefined' && !window.ResizeObserver) {
  window.ResizeObserver = class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}

// jsdom não implementa CanvasRenderingContext2D — measureTextWidth (utils.ts) já cai num
// fallback estimado quando getContext() retorna null, mas isso ainda loga um erro "not
// implemented" ruidoso no jsdom para cada nó medido. Stub mínimo com measureText evita o
// ruído e dá uma medida determinística (largura ≈ nº de chars) nos testes de componente.
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = (() => ({
    font: '',
    measureText: (text: string) => ({ width: text.length * 6 }) as TextMetrics,
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
}
