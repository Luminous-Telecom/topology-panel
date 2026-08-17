import { describe, expect, it } from 'vitest';
import { CURRENT_MAP_SCHEMA_VERSION, migrateTopologyMap } from './mapMigration';
import { emptyMap } from './testMapFixtures';

describe('migrateTopologyMap', () => {
  it('migra mapa sem schemaVersion para v2', () => {
    const migrated = migrateTopologyMap(emptyMap());
    expect(migrated.schemaVersion).toBe(CURRENT_MAP_SCHEMA_VERSION);
    expect(migrated.links).toEqual([]);
  });

  it('preserva links existentes na migração', () => {
    const map = {
      ...emptyMap(),
      links: [{ from: 'a', to: 'b', bandwidthMbps: 1000 }],
    };
    const migrated = migrateTopologyMap(map);
    expect(migrated.links).toHaveLength(1);
    expect(migrated.links[0].from).toBe('a');
    expect(migrated.schemaVersion).toBe(2);
  });
});
