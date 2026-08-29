import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TopologyToast } from './TopologyToast';

describe('TopologyToast', () => {
  it('não renderiza nada sem mensagem', () => {
    const { container } = render(<TopologyToast message={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('mostra o texto da mensagem', () => {
    render(<TopologyToast message="Copiado" />);
    expect(screen.getByText('Copiado')).toBeInTheDocument();
  });
});
