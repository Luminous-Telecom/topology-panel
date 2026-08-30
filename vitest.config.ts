import { defineConfig } from 'vitest/config';

export default defineConfig({
  css: {
    modules: {
      generateScopedName: 'luminous-topology__[local]__[hash:base64:6]',
    },
    preprocessorOptions: {
      scss: {
        api: 'modern-compiler',
      },
    },
  },
  test: {
    // jsdom para todos os testes: @grafana/data acessa `window` no import (mesmo em
    // utils "puros" que só usam tipos/enums do pacote), então mesmo os testes de
    // src/utils/*.test.ts que importam de utils.ts/mapEdits.ts precisam de DOM.
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', '.config/**/*.test.ts'],
    // @grafana/data (ESM) importa alguns módulos internos do react-use sem extensão —
    // falha na resolução ESM estrita do Node. Processar via transform do Vite (como um
    // bundler) resolve normalmente, em vez de deixar o Node carregar o pacote "cru".
    server: {
      deps: {
        inline: [/@grafana\//, /react-use/],
      },
    },
  },
});
