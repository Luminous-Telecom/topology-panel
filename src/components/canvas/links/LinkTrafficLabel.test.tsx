import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LinkTrafficLabel } from './LinkTrafficLabel';

describe('LinkTrafficLabel', () => {
  it('mantém o grupo no DOM sem lastvalue para o sync na troca de mapa', () => {
    const { container } = render(
      <svg>
        <LinkTrafficLabel pillId="a->b" x={0} y={0} uploadColor="#fff" downloadColor="#fff" />
      </svg>
    );
    const group = container.querySelector('[data-link-pill="a->b"]');
    expect(group).not.toBeNull();
    expect((group as HTMLElement | SVGGElement).style.display).toBe('none');
  });
});
