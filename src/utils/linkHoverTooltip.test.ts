import { describe, expect, it } from 'vitest';
import { buildLinkHoverTooltip } from './linkHoverTooltip';

describe('buildLinkHoverTooltip', () => {
  it('monta pontas, capacidade, tráfego e status traduzido', () => {
    expect(
      buildLinkHoverTooltip({
        fromLabel: 'RFF',
        toLabel: 'PTZ',
        fromInterfaceName: 'sfp1',
        toInterfaceName: 'ether1',
        capacityLabel: '10 Gb',
        uploadLabel: '683.4 Mbps',
        downloadLabel: '37.1 Mbps',
        txUtilizationPct: 6.8,
        rxUtilizationPct: 0.4,
        txPowerDbm: -2,
        rxPowerDbm: -8.54,
        errors: 3.2,
        drops: 1,
        status: 'up',
      })
    ).toEqual({
      fromLabel: 'RFF',
      toLabel: 'PTZ',
      interfaces: 'sfp1 ↔ ether1',
      capacity: '10 Gb',
      upload: '683.4 Mbps',
      download: '37.1 Mbps',
      utilTx: '6.8%',
      utilRx: '0.4%',
      signalTx: '-2 dBm',
      signalRx: '-8.54 dBm',
      errors: '3',
      drops: '1',
      status: 'UP',
    });
  });

  it('omite campos sem valor — não inventa tráfego nem interface', () => {
    expect(buildLinkHoverTooltip({ fromLabel: 'A', toLabel: 'B' })).toEqual({
      fromLabel: 'A',
      toLabel: 'B',
    });
  });
});