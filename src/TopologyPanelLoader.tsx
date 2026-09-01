import React, { lazy, Suspense } from 'react';
import { PanelProps } from '@grafana/data';
import { TopologyPanelOptions } from './types';

const TopologyPanel = lazy(() =>
  import(/* webpackPrefetch: true */ './components/TopologyPanel').then((m) => ({
    default: m.TopologyPanel,
  }))
);

function TopologyPanelFallback() {
  return (
    <div
      className="luminous-topology-panel-fallback"
      style={{
        width: '100%',
        height: '100%',
        minHeight: 120,
        background: 'var(--background-canvas, #111)',
      }}
    />
  );
}

export function TopologyPanelLoader(props: PanelProps<TopologyPanelOptions>) {
  return (
    <Suspense fallback={<TopologyPanelFallback />}>
      <TopologyPanel {...props} />
    </Suspense>
  );
}
