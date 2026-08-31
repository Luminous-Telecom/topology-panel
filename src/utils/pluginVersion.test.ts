import { describe, expect, it } from 'vitest';
import { PLUGIN_VERSION, parsePluginVersion, pluginVersionIsNewer } from './pluginVersion';

describe('PLUGIN_VERSION', () => {
  it('é a versão X.Y.Z do plugin.json', () => {
    expect(parsePluginVersion(PLUGIN_VERSION)).toBeDefined();
  });
});

describe('pluginVersionIsNewer', () => {
  it('detecta patch, minor e major mais novos', () => {
    expect(pluginVersionIsNewer('1.4.394', '1.4.393')).toBe(true);
    expect(pluginVersionIsNewer('1.5.0', '1.4.393')).toBe(true);
    expect(pluginVersionIsNewer('2.0.0', '1.9.9')).toBe(true);
  });

  it('não marca iguais nem mais antigos', () => {
    expect(pluginVersionIsNewer('1.4.393', '1.4.393')).toBe(false);
    expect(pluginVersionIsNewer('1.4.392', '1.4.393')).toBe(false);
  });

  it('aceita prefixo v', () => {
    expect(pluginVersionIsNewer('v1.4.394', 'v1.4.393')).toBe(true);
  });
});
