import React, { ComponentProps, lazy, Suspense } from 'react';

/**
 * Modais carregados sob demanda.
 *
 * Nenhum deles aparece ao abrir o dashboard — só depois de um clique explícito (propriedades,
 * edição em lote, ping, adicionar host). Mantê-los fora do `module.js` tira do caminho crítico
 * também o `zabbixApi.ts` (via PingModal) e o `HostIconPicker` (via NodeEditModal).
 *
 * Cada modal ganha seu **próprio** limite de `Suspense`: um limite único mais acima faria o canvas
 * inteiro sumir enquanto o chunk carrega. O `fallback` é `null` de propósito — o carregamento
 * acontece entre o clique e a abertura, e um spinner piscando ali seria pior que nada.
 */

const LazyNodeEditModal = lazy(() =>
  import('./NodeEditModal').then((m) => ({ default: m.NodeEditModal }))
);
const LazyBulkHostIconModal = lazy(() =>
  import('./BulkHostIconModal').then((m) => ({ default: m.BulkHostIconModal }))
);
const LazyBulkHostCredentialsModal = lazy(() =>
  import('./BulkHostCredentialsModal').then((m) => ({ default: m.BulkHostCredentialsModal }))
);
const LazyBulkSubmapEditModal = lazy(() =>
  import('./BulkSubmapEditModal').then((m) => ({ default: m.BulkSubmapEditModal }))
);
const LazyZabbixHostPickerModal = lazy(() =>
  import('./AddZabbixHostModal').then((m) => ({ default: m.ZabbixHostPickerModal }))
);
const LazyPingModal = lazy(() => import('./PingModal').then((m) => ({ default: m.PingModal })));
const LazyLinkEditModal = lazy(() =>
  import('./LinkEditModal').then((m) => ({ default: m.LinkEditModal }))
);
const LazyLinkInterfaceSelectModal = lazy(() =>
  import('./LinkInterfaceSelectModal').then((m) => ({ default: m.LinkInterfaceSelectModal }))
);
const LazyTopologyBlueprintModal = lazy(() =>
  import('./TopologyBlueprintModal').then((m) => ({ default: m.TopologyBlueprintModal }))
);

export function NodeEditModal(props: ComponentProps<typeof LazyNodeEditModal>): JSX.Element {
  return (
    <Suspense fallback={null}>
      <LazyNodeEditModal {...props} />
    </Suspense>
  );
}

export function BulkHostIconModal(props: ComponentProps<typeof LazyBulkHostIconModal>): JSX.Element {
  return (
    <Suspense fallback={null}>
      <LazyBulkHostIconModal {...props} />
    </Suspense>
  );
}

export function BulkHostCredentialsModal(
  props: ComponentProps<typeof LazyBulkHostCredentialsModal>
): JSX.Element {
  return (
    <Suspense fallback={null}>
      <LazyBulkHostCredentialsModal {...props} />
    </Suspense>
  );
}

export function BulkSubmapEditModal(props: ComponentProps<typeof LazyBulkSubmapEditModal>): JSX.Element {
  return (
    <Suspense fallback={null}>
      <LazyBulkSubmapEditModal {...props} />
    </Suspense>
  );
}

export function ZabbixHostPickerModal(
  props: ComponentProps<typeof LazyZabbixHostPickerModal>
): JSX.Element {
  return (
    <Suspense fallback={null}>
      <LazyZabbixHostPickerModal {...props} />
    </Suspense>
  );
}

export function PingModal(props: ComponentProps<typeof LazyPingModal>): JSX.Element {
  return (
    <Suspense fallback={null}>
      <LazyPingModal {...props} />
    </Suspense>
  );
}

export function LinkEditModal(props: ComponentProps<typeof LazyLinkEditModal>): JSX.Element {
  return (
    <Suspense fallback={null}>
      <LazyLinkEditModal {...props} />
    </Suspense>
  );
}

export function LinkInterfaceSelectModal(
  props: ComponentProps<typeof LazyLinkInterfaceSelectModal>
): JSX.Element {
  return (
    <Suspense fallback={null}>
      <LazyLinkInterfaceSelectModal {...props} />
    </Suspense>
  );
}

export function TopologyBlueprintModal(
  props: ComponentProps<typeof LazyTopologyBlueprintModal>
): JSX.Element {
  return (
    <Suspense fallback={null}>
      <LazyTopologyBlueprintModal {...props} />
    </Suspense>
  );
}
