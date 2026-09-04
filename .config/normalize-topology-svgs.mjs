#!/usr/bin/env node
/**
 * Remove atribuição Noun Project e renomeia SVGs para o padrão de src/img/topology/.
 * Uso: node .config/normalize-topology-svgs.mjs
 */
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const DIR = new URL('../src/img/topology/', import.meta.url).pathname;

const RENAME = {
  'noun_access_point_7203789.svg': 'ap.svg',
  'noun_bridge_8409256.svg': 'bridge.svg',
  'noun_Camera_2338149.svg': 'camera.svg',
  'noun_Cloud_8309561.svg': 'cloud.svg',
  'noun_DVRpause_1125858.svg': 'dvr.svg',
  'noun_Energy_8432382.svg': 'power.svg',
  'noun_firewall_8435208.svg': 'firewall.svg',
  'noun_olt_5223300.svg': 'olts.svg',
  'noun_Server_7906152.svg': 'server.svg',
  'noun_switch_7972487.svg': 'switch.svg',
  'noun_VPN_6833586.svg': 'vpn_server.svg',
  'noun_broadcast_405147.svg': 'bridge.svg',
};

function normalizeSvg(raw) {
  let svg = raw
    .replace(/<title>[\s\S]*?<\/title>/gi, '')
    .replace(/<text\b[^>]*>[\s\S]*?<\/text>/gi, (block) =>
      /created by|noun project/i.test(block) ? '' : block
    )
    .replace(/\sdata-name="[^"]*"/gi, '')
    .replace(/<svg\b([^>]*)>/i, (_match, attrs) => {
      const viewBoxMatch = attrs.match(/viewBox="([^"]+)"/i);
      if (!viewBoxMatch) {
        return `<svg${attrs}>`;
      }
      const parts = viewBoxMatch[1].trim().split(/\s+/).map(Number);
      if (parts.length !== 4) {
        return `<svg${attrs}>`;
      }
      const [x, y, w, h] = parts;
      let nextH = h;
      // Noun Project free SVGs reservam ~25px no rodapé para atribuição.
      if (h >= 130 && h <= 140 && w >= 100 && w <= 120) {
        nextH = 110;
      } else if (h >= 630 && h <= 650) {
        nextH = 520;
      } else if (h >= 78 && h <= 82 && w >= 60 && w <= 68) {
        nextH = 74;
      } else if (h >= 73 && h <= 77 && w >= 58 && w <= 62) {
        nextH = 72;
      } else if (h >= 120 && h <= 130 && w >= 95 && w <= 105) {
        nextH = 105;
      }
      const nextViewBox = `${x} ${y} ${w} ${nextH}`;
      const cleanedAttrs = attrs.replace(/viewBox="[^"]*"/i, `viewBox="${nextViewBox}"`);
      return `<svg${cleanedAttrs}>`;
    });

  if (!/xmlns=/.test(svg)) {
    svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  }

  return `${svg.trim()}\n`;
}

for (const [source, target] of Object.entries(RENAME)) {
  const sourcePath = join(DIR, source);
  const targetPath = join(DIR, target);
  const normalized = normalizeSvg(readFileSync(sourcePath, 'utf8'));
  writeFileSync(targetPath, normalized, 'utf8');
  unlinkSync(sourcePath);
  console.log(`${source} -> ${target}`);
}
