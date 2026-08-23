import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const sourcePath = join(dirname(fileURLToPath(import.meta.url)), 'useGrafanaZabbixQueryIndex.ts');

describe('useGrafanaZabbixQueryIndex', () => {
  it('não reintroduz cache de índice em memória no fonte', () => {
    const source = readFileSync(sourcePath, 'utf8');
    expect(source).not.toMatch(/lastGoodIndexByKey/);
    expect(source).not.toMatch(/sessionStorage/);
    expect(source).not.toMatch(/localStorage/);
    expect(source).not.toMatch(/resolveCachedQueryIndex/);
  });

  it('não reaproveita índice anterior em erro — zera ready e index', () => {
    const source = readFileSync(sourcePath, 'utf8');
    expect(source).toMatch(/index: EMPTY_INDEX,\s*\n\s*ready: false/);
    expect(source).not.toMatch(/fromData \?\? prev\.index/);
    expect(source).not.toMatch(/Boolean\(fromData\) \|\| prev\.ready/);
  });
});
