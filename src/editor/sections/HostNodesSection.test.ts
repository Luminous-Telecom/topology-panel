import { describe, expect, it } from 'vitest';
import { sameHostReadoutIdentity } from './HostNodesSection';
import { hostNode } from '../../utils/testMapFixtures';

describe('sameHostReadoutIdentity', () => {
  it('ignora só a posição: a lista do editor não remonta no arraste', () => {
    const a = [hostNode({ x: 10, y: 10, label: 'A', zabbixHost: '10.0.0.1' })];
    const b = [hostNode({ x: 90, y: 40, label: 'A', zabbixHost: '10.0.0.1' })];
    expect(sameHostReadoutIdentity(a, b)).toBe(true);
  });

  it('rótulo diferente invalida a lista', () => {
    const a = [hostNode({ label: 'A' })];
    const b = [hostNode({ label: 'B' })];
    expect(sameHostReadoutIdentity(a, b)).toBe(false);
  });
});
