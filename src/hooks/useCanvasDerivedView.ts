import { useMemo } from 'react';
import { useStableIdentity } from './useStableIdentity';
import { TopologyPanelOptions } from '../types';
import { buildLegendItems } from '../utils/legendItems';

interface Params {
  editable: boolean;
  effectiveNocMode: boolean;
  hideOverlayControls: boolean;
  options: TopologyPanelOptions;
}

/** Flags e listas derivadas da sessão + opções — sem estado próprio. */
export function useCanvasDerivedView({
  editable,
  effectiveNocMode,
  hideOverlayControls,
  options,
}: Params) {
  const viewEditable = editable && !effectiveNocMode && !hideOverlayControls;
  const legendItemsRaw = useMemo(
    () => buildLegendItems(options),
    [options]
  );
  const legendItems = useStableIdentity(legendItemsRaw);

  return { viewEditable, legendItems };
}
