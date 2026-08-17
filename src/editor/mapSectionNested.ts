import { PanelOptionsEditorBuilder, StandardEditorContext } from '@grafana/data';
import { TopologyMap, TopologyPanelOptions } from '../types';

/** Caminho interno do editor aninhado que aponta para o mapa inteiro (`options.map`). */
export const MAP_SECTION_ROOT = '$root';

interface NestedValueAccess {
  getValue: (path: string) => unknown;
  onChange: (path: string, value: unknown) => void;
}

function mapSectionAccess(parent: NestedValueAccess): NestedValueAccess & {
  getContext: (parentCtx: StandardEditorContext<TopologyPanelOptions>) => StandardEditorContext<TopologyPanelOptions>;
} {
  return {
    getValue: (subPath: string) =>
      subPath === MAP_SECTION_ROOT ? parent.getValue('map') : parent.getValue(`map.${subPath}`),
    onChange: (subPath: string, value: unknown) =>
      subPath === MAP_SECTION_ROOT
        ? parent.onChange('map', value)
        : parent.onChange(`map.${subPath}`, value),
    getContext: (parentCtx: StandardEditorContext<TopologyPanelOptions>) => ({
      ...parentCtx,
      options: {
        ...(parentCtx.options as TopologyPanelOptions),
        map: parent.getValue('map') as TopologyMap,
      },
    }),
  };
}

/** Registra uma seção do editor do mapa em uma categoria do painel lateral (sem duplicar `path: map`). */
export function addMapSection(
  builder: PanelOptionsEditorBuilder<TopologyPanelOptions>,
  category: string[],
  sectionBuild: (section: PanelOptionsEditorBuilder<TopologyMap>) => void
): void {
  builder.addNestedOptions({
    path: 'map',
    category,
    values: mapSectionAccess,
    build: sectionBuild,
  });
}
