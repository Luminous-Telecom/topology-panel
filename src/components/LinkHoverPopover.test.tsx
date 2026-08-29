import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LinkHoverPopover } from './LinkHoverPopover';

describe('LinkHoverPopover', () => {
  it('mostra pontas, métricas e status no chrome do overlay', () => {
    render(
      <LinkHoverPopover
        model={{
          fromLabel: 'RFF',
          toLabel: 'PTZ',
          capacity: '10 Gb',
          upload: '683.4 Mbps',
          download: '37.1 Mbps',
          utilTx: '6.8%',
          utilRx: '0.4%',
          signalTx: '-2 dBm',
          signalRx: '-8.54 dBm',
          errors: '3',
          status: 'UP',
        }}
        screenX={40}
        screenY={40}
        uploadColor="#FFD54F"
        downloadColor="#4FC3F7"
        statusColor="#81C784"
      />
    );

    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent('RFF');
    expect(tip).toHaveTextContent('PTZ');
    expect(tip).toHaveTextContent('Capacidade');
    expect(tip).toHaveTextContent('Upload');
    expect(tip).toHaveTextContent('Download');
    expect(tip).toHaveTextContent('Sinal TX');
    expect(tip).toHaveTextContent('-2 dBm');
    expect(tip).toHaveTextContent('Sinal RX');
    expect(tip).toHaveTextContent('Erros');
    expect(tip).toHaveTextContent('Status');
    expect(tip).toHaveTextContent('UP');
  });
});