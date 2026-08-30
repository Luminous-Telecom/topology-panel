/**
 * Imprime as notas da versão no CHANGELOG.md (GitHub Release).
 * Uso: node .config/changelog-notes.mjs [X.Y.Z]
 * Sem argumento, usa a versão de package.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function changelogNotesFor(changelogText, version) {
  const heading = `## [${version}]`;
  const start = changelogText.indexOf(heading);
  if (start < 0) {
    return undefined;
  }
  const fromHeading = changelogText.slice(start);
  const next = fromHeading.indexOf('\n## [', heading.length);
  const section = (next < 0 ? fromHeading : fromHeading.slice(0, next)).trim();
  const withoutHeading = section.replace(/^[^\n]*\n+/, '').trim();
  return withoutHeading.length > 0 ? withoutHeading : undefined;
}

const runningAsCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (runningAsCli) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const version = process.argv[2] ?? pkg.version;
  const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
  const notes = changelogNotesFor(changelog, version);
  if (!notes) {
    process.stderr.write(`CHANGELOG.md não tem notas para ${version}\n`);
    process.exit(1);
  }
  process.stdout.write(`${notes}\n`);
}
