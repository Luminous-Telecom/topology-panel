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

const LazyChildMapsEditor = lazy(() =>
  import('./ChildMapsEditor').then((m) => ({ default: m.ChildMapsEditor }))
);
const LazyTopologyLayoutEditor = lazy(() =>
  import('./TopologyLayoutEditor').then((m) => ({ default: m.TopologyLayoutEditor }))
);
const LazyTopologyHostsEditor = lazy(() =>
  import('./TopologyHostsEditor').then((m) => ({ default: m.TopologyHostsEditor }))
);
const LazyTopologySubmapsEditor = lazy(() =>
  import('./TopologySubmapsEditor').then((m) => ({ default: m.TopologySubmapsEditor }))
);
const LazyTopologyLinksEditor = lazy(() =>
  import('./TopologyLinksEditor').then((m) => ({ default: m.TopologyLinksEditor }))
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
const LazyTopologyTemplatesEditor = lazy(() =>
  import('../components/TopologyTemplatesEditor').then((m) => ({
    default: m.TopologyTemplatesEditor,
  }))
);

export function TopologyLayoutEditor(
  props: ComponentProps<typeof LazyTopologyLayoutEditor>
): JSX.Element {
  return (
    <Suspense fallback={loading}>
      <LazyTopologyLayoutEditor {...props} />
    </Suspense>
  );
}

export function TopologyHostsEditor(
  props: ComponentProps<typeof LazyTopologyHostsEditor>
): JSX.Element {
  return (
    <Suspense fallback={loading}>
      <LazyTopologyHostsEditor {...props} />
    </Suspense>
  );
}

export function TopologySubmapsEditor(
  props: ComponentProps<typeof LazyTopologySubmapsEditor>
): JSX.Element {
  return (
    <Suspense fallback={loading}>
      <LazyTopologySubmapsEditor {...props} />
    </Suspense>
  );
}

export function TopologyLinksEditor(
  props: ComponentProps<typeof LazyTopologyLinksEditor>
): JSX.Element {
  return (
    <Suspense fallback={loading}>
      <LazyTopologyLinksEditor {...props} />
    </Suspense>
  );
}

export function ChildMapsEditor(props: ComponentProps<typeof LazyChildMapsEditor>): JSX.Element {
  return (
    <Suspense fallback={loading}>
      <LazyChildMapsEditor {...props} />
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

export function TopologyTemplatesEditor(
  props: ComponentProps<typeof LazyTopologyTemplatesEditor>
): JSX.Element {
  return (
    <Suspense fallback={loading}>
      <LazyTopologyTemplatesEditor {...props} />
    </Suspense>
  );
}
