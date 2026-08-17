import React, { ComponentProps, lazy, Suspense } from 'react';

/**
 * Editores da aba de opções do painel, carregados sob demanda.
 *
 * Quem só visualiza o dashboard nunca abre o painel lateral de opções, então nada disso precisa
 * estar no `module.js`. Cada editor tem seu próprio limite de `Suspense` para o carregamento de um
 * não apagar a seção inteira de opções; o `fallback` é um texto curto porque o painel lateral já
 * mostra o rótulo do campo e um espaço vazio pareceria erro.
 */

const loading = <span>Carregando…</span>;

const LazyTopologyEditor = lazy(() =>
  import('./TopologyEditor').then((m) => ({ default: m.TopologyEditor }))
);
const LazyDashboardNavChoicesEditor = lazy(() =>
  import('../components/DashboardNavChoicesEditor').then((m) => ({
    default: m.DashboardNavChoicesEditor,
  }))
);
const LazyQueryDisplayRefIdsEditor = lazy(() =>
  import('../components/QueryDisplayRefIdsEditor').then((m) => ({
    default: m.QueryDisplayRefIdsEditor,
  }))
);
const LazyHostTypeColorsEditor = lazy(() =>
  import('../components/HostTypeColorsEditor').then((m) => ({ default: m.HostTypeColorsEditor }))
);
const LazyStatusValueMappingsEditor = lazy(() =>
  import('../components/StatusValueMappingsEditor').then((m) => ({
    default: m.StatusValueMappingsEditor,
  }))
);

export function TopologyEditor(props: ComponentProps<typeof LazyTopologyEditor>): JSX.Element {
  return (
    <Suspense fallback={loading}>
      <LazyTopologyEditor {...props} />
    </Suspense>
  );
}

export function DashboardNavChoicesEditor(
  props: ComponentProps<typeof LazyDashboardNavChoicesEditor>
): JSX.Element {
  return (
    <Suspense fallback={loading}>
      <LazyDashboardNavChoicesEditor {...props} />
    </Suspense>
  );
}

export function QueryDisplayRefIdsEditor(
  props: ComponentProps<typeof LazyQueryDisplayRefIdsEditor>
): JSX.Element {
  return (
    <Suspense fallback={loading}>
      <LazyQueryDisplayRefIdsEditor {...props} />
    </Suspense>
  );
}

export function HostTypeColorsEditor(
  props: ComponentProps<typeof LazyHostTypeColorsEditor>
): JSX.Element {
  return (
    <Suspense fallback={loading}>
      <LazyHostTypeColorsEditor {...props} />
    </Suspense>
  );
}

export function StatusValueMappingsEditor(
  props: ComponentProps<typeof LazyStatusValueMappingsEditor>
): JSX.Element {
  return (
    <Suspense fallback={loading}>
      <LazyStatusValueMappingsEditor {...props} />
    </Suspense>
  );
}
