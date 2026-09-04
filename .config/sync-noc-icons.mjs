#!/usr/bin/env node
/**
 * Copia ícones estilo NOC (pack Cisco do marrow-cli, Apache-2.0) para src/img/topology/.
 * Rode após atualizar marrow-cli: npm run icons:sync
 */
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const packRoot = join(root, 'node_modules/marrow-cli/icon-packs/cisco/svg');
const destRoot = join(root, 'src/img/topology');

/** Destino no painel → arquivo no pack Cisco (draw.io / estilo topologia). */
const ICON_MAP = {
  'router.svg': 'RoutingWan/router.svg',
  'switch.svg': 'Switches/layer_3_switch.svg',
  'switch_unmanaged.svg': 'Switches/layer_2_remote_switch.svg',
  'firewall.svg': 'SafeArchitecture/firewall.svg',
  'vpn_server.svg': 'Capability/virtual_private_network.svg',
  'server.svg': 'Tech/server-tower.svg',
  'cloud.svg': 'SafeSecurity/cloud.svg',
  'ap.svg': 'SafeArchitecture/wireless_access_point.svg',
  'camera.svg': 'Tech/cctv-camera.svg',
  'dvr.svg': 'Servers/storage_server.svg',
  'bridge.svg': 'Misc/bridge.svg',
  'power.svg': 'Datacenter/ups.svg',
  'olts.svg': 'Routers/optical_services_router.svg',
  'laptop.svg': 'Endpoints/laptop.svg',
};

mkdirSync(destRoot, { recursive: true });

for (const [destName, relSrc] of Object.entries(ICON_MAP)) {
  const src = join(packRoot, relSrc);
  const dest = join(destRoot, destName);
  copyFileSync(src, dest);
  process.stdout.write(`  ${destName} ← ${relSrc}\n`);
}

process.stdout.write(`\n${Object.keys(ICON_MAP).length} ícones sincronizados em src/img/topology/\n`);
