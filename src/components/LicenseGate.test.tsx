import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LicenseGate } from './LicenseGate';

describe('LicenseGate', () => {
  it('mostra o mapa quando a licença é válida', () => {
    render(
      <LicenseGate state={{ status: 'valid' }} width={400} height={300}>
        <div>mapa</div>
      </LicenseGate>
    );
    expect(screen.getByText('mapa')).toBeInTheDocument();
    expect(screen.queryByText('Licença necessária')).not.toBeInTheDocument();
  });

  it('centraliza o aviso quando o IP não está na licença', () => {
    render(
      <LicenseGate
        state={{
          status: 'blocked',
          message: 'O IP deste Grafana (45.179.224.55) não está na licença. Cadastre esse IP em Minha conta.',
        }}
        width={400}
        height={300}
      >
        <div>mapa</div>
      </LicenseGate>
    );
    expect(screen.queryByText('mapa')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Licença necessária')).toBeInTheDocument();
    expect(screen.getByText(/45\.179\.224\.55/)).toBeInTheDocument();
  });
});
