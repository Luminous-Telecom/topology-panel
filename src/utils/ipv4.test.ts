import { describe, expect, it } from 'vitest';
import { isIpv4 } from './ipv4';

describe('isIpv4', () => {
  it('aceita endereço válido e ignora espaço em volta', () => {
    expect(isIpv4('10.0.0.1')).toBe(true);
    expect(isIpv4('  10.0.0.1  ')).toBe(true);
  });

  it('aceita os extremos de cada octeto', () => {
    expect(isIpv4('0.0.0.0')).toBe(true);
    expect(isIpv4('255.255.255.255')).toBe(true);
  });

  it('recusa octeto acima de 255, que só o formato deixava passar', () => {
    expect(isIpv4('999.1.1.1')).toBe(false);
    expect(isIpv4('10.0.0.256')).toBe(false);
    expect(isIpv4('300.300.300.300')).toBe(false);
  });

  it('recusa contagem de octetos diferente de quatro', () => {
    expect(isIpv4('10.0.0')).toBe(false);
    expect(isIpv4('10.0.0.1.5')).toBe(false);
  });

  it('recusa texto que não é endereço', () => {
    expect(isIpv4('')).toBe(false);
    expect(isIpv4('host-a')).toBe(false);
    expect(isIpv4('10.0.0.a')).toBe(false);
  });
});
