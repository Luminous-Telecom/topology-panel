/**
 * Barril dos helpers puros do plugin.
 *
 * A implementação vive em `src/utils/*` por tema; este arquivo só reexporta para que os imports
 * existentes (`from '../utils'`) continuem válidos. Ao adicionar helper novo, crie/estenda o módulo
 * temático correspondente em vez de escrever a função aqui.
 *
 * | Tema | Módulo |
 * |---|---|
 * | Guards de nó do mapa | `utils/topologyNodes.ts` |
 * | Casamento host do mapa ↔ host da Query | `utils/hostLookup.ts` |
 * | Leitura da aba Query (status, refIds, metadata) | `utils/queryHosts.ts` |
 * | Lista de hosts dos pickers | `utils/queryHostPicker.ts` |
 * | Sincronizar mapa salvo com a Query | `utils/mapSync.ts` |
 * | Medição de texto e caixa dos nós | `utils/nodeLayout.ts` |
 * | Coordenadas, clamp e snap de grade | `utils/mapCoords.ts` |
 * | Meio do link (fibra/rádio) | `utils/linkMedium.ts` |
 * | Scroll parents do dashboard | `utils/domScroll.ts` |
 */

export { isIpv4 } from './utils/ipv4';
export * from './utils/topologyNodes';
export * from './utils/hostLookup';
export * from './utils/queryHosts';
export * from './utils/queryHostPicker';
export * from './utils/mapSync';
export * from './utils/nodeLayout';
export * from './utils/linkMedium';
export * from './utils/domScroll';
export { clamp, snapToGrid, snapNodeCenterToGrid } from './utils/mapCoords';
