/**
 * Incrementa o patch em package.json e src/plugin.json.
 *
 * Usado em todo commit (ver `.cursor/rules/90-workflow.mdc`) e no deploy quando a versão
 * no working tree ainda é a do HEAD. O Grafana cacheia module.js pela query
 * `?_cache=<versão do plugin.json>`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkgPath = path.join(root, 'package.json');
const pluginPath = path.join(root, 'src/plugin.json');

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const plugin = JSON.parse(fs.readFileSync(pluginPath, 'utf8'));

const parts = String(pkg.version)
  .split('.')
  .map((segment) => Number.parseInt(segment, 10));

if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
  process.stderr.write(`Versão inválida em package.json: ${pkg.version}\n`);
  process.exit(1);
}

parts[2] += 1;
const next = parts.join('.');

pkg.version = next;
fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

plugin.info.version = next;
plugin.info.updated = new Date().toISOString().slice(0, 10);
fs.writeFileSync(pluginPath, `${JSON.stringify(plugin, null, 2)}\n`);

process.stdout.write(next);
