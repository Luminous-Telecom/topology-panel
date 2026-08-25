import { describe, expect, it } from 'vitest';
import { hostIp } from './hostTools';

describe('hostIp', () => {
  it('devolve o subtitle quando ele já é o endereço', () => {
    expect(hostIp({ subtitle: '10.0.0.1' })).toBe('10.0.0.1');
    expect(hostIp({ subtitle: '  10.0.0.1  ' })).toBe('10.0.0.1');
  });

  it('extrai o endereço de texto livre', () => {
    expect(hostIp({ subtitle: '10.0.0.5 - uplink' })).toBe('10.0.0.5');
    expect(hostIp({ subtitle: 'uplink 10.0.0.5' })).toBe('10.0.0.5');
  });

  it('sem subtitle não devolve endereço', () => {
    expect(hostIp({})).toBeUndefined();
    expect(hostIp({ subtitle: '   ' })).toBeUndefined();
  });

  it('texto sem endereço não devolve nada', () => {
    expect(hostIp({ subtitle: 'sem ip aqui' })).toBeUndefined();
  });

  it('descarta octeto fora da faixa achado no texto livre', () => {
    expect(hostIp({ subtitle: '999.999.999.999' })).toBeUndefined();
    expect(hostIp({ subtitle: 'uplink 300.1.1.1' })).toBeUndefined();
  });
});
