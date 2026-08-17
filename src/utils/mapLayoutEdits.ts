/** Edições de layout do mapa — auto-organização de nós. */
import { TopologyMap } from '../types';
import { applyAutoLayout } from './autoLayout/applyAutoLayout';
import type { AutoLayoutApplyOptions, AutoLayoutApplyResult } from './autoLayout/types';

export type { AutoLayoutApplyOptions, AutoLayoutApplyResult, AutoLayoutMode } from './autoLayout/types';
export {
  applyAutoLayout,
  countAutoLayoutEligibleNodes,
  countManualLayoutNodes,
  previewAutoLayoutPositions,
} from './autoLayout/applyAutoLayout';
export { AUTO_LAYOUT_MODE_LABELS } from './autoLayout/types';

export function applyAutoLayoutToMap(
  map: TopologyMap,
  options: AutoLayoutApplyOptions
): { map: TopologyMap; result: AutoLayoutApplyResult } {
  return applyAutoLayout(map, options);
}
