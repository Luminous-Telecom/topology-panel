import { NodeEditSavePayload, TopologyMap, TopologyNode } from '../types';
import { resolveHostLayoutKey } from './hostLookup';
import { rebindZabbixHost, updateStoredNode } from './mapEdits';
import { upsertHostLayout } from './mapSync';
import { findNodeById, isHostNode } from './topologyNodes';

/**
 * Reencontra o nó salvo depois de um possível rebind.
 *
 * O id muda quando o host é reapontado, então caímos para o host Zabbix antigo e, por último, para
 * o IP novo — é o mesmo nó do ponto de vista do usuário.
 */
function findSavedNode(
  map: TopologyMap,
  editedNode: TopologyNode,
  payload: NodeEditSavePayload
): TopologyNode | undefined {
  const previousHost = editedNode.zabbixHost?.trim();
  const reboundIp = payload.rebind?.ip;
  return (
    findNodeById(map.nodes, editedNode.id) ??
    (previousHost
      ? map.nodes.find((n) => isHostNode(n) && n.zabbixHost?.trim() === previousHost)
      : undefined) ??
    (reboundIp
      ? map.nodes.find(
          (n) => isHostNode(n) && (n.subtitle?.trim() === reboundIp || n.zabbixHost?.trim() === reboundIp)
        )
      : undefined)
  );
}

/**
 * Aplica o que o modal de propriedades devolveu e retorna o novo mapa.
 *
 * Host que veio só da Query ainda não tem nó salvo: nesse caso gravamos primeiro o layout dele
 * (`upsertHostLayout`) para haver o que editar, senão a edição se perderia no próximo refresh.
 */
export function applyNodeEditSave(
  storedMap: TopologyMap,
  editedNode: TopologyNode,
  payload: NodeEditSavePayload
): TopologyMap {
  let next = storedMap;

  if (payload.rebind) {
    next = rebindZabbixHost(
      next,
      editedNode.id,
      payload.rebind.visibleName,
      payload.rebind.ip,
      payload.rebind.icon,
      editedNode
    );
  }

  let savedNode = findSavedNode(next, editedNode, payload);
  const hasPatch = Object.keys(payload.patch).length > 0;

  if (!savedNode && !payload.rebind && hasPatch) {
    const key = resolveHostLayoutKey(editedNode);
    if (key) {
      next = upsertHostLayout(next, key, {
        id: editedNode.id,
        x: editedNode.x,
        y: editedNode.y,
        width: editedNode.width,
        height: editedNode.height,
        label: editedNode.label,
        subtitle: editedNode.subtitle ?? key,
        type: 'host',
        ...payload.patch,
      });
      savedNode = findSavedNode(next, editedNode, payload);
    }
  }

  if (savedNode && hasPatch) {
    next = updateStoredNode(next, savedNode, payload.patch);
  }

  return next;
}
