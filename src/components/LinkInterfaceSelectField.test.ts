import { describe, expect, it } from 'vitest';
import { interfaceOptionValue } from './LinkInterfaceSelectField';

describe('interfaceOptionValue', () => {
  it('distingue interfaces com o mesmo nome pelo índice SNMP', () => {
    expect(interfaceOptionValue({ name: 'eth0', snmpIndex: '1' })).not.toBe(
      interfaceOptionValue({ name: 'eth0', snmpIndex: '2' })
    );
  });

  it('trata índice ausente como vazio', () => {
    expect(interfaceOptionValue({ name: 'lo' })).toBe(interfaceOptionValue({ name: 'lo', snmpIndex: '' }));
  });
});
