import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LinkTrafficFlow } from './LinkTrafficFlow';
import type { LinkAnimationEffect } from '../../../utils/linkAnimationStyle';

function renderFlow(effect: LinkAnimationEffect) {
  const { container } = render(
    <svg>
      <LinkTrafficFlow
        d="M 0 0 L 80 0"
        reverseD="M 80 0 L 0 0"
        length={80}
        uploadColor="#FADE2A"
        downloadColor="#C0D8FF"
        linkId="a->b"
        effect={effect}
      />
    </svg>
  );
  return container;
}

describe('LinkTrafficFlow', () => {
  it('traço nos dois sentidos desenha upload e download', () => {
    const container = renderFlow('dualDash');
    expect(container.querySelectorAll('[data-link-flow="upload"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-link-flow="download"]')).toHaveLength(1);
  });

  it('cápsulas e cometa usam o traço de upload', () => {
    expect(renderFlow('capsules').querySelector('[data-link-flow="upload"]')).toBeTruthy();
    expect(renderFlow('comet').querySelector('[data-link-flow="upload"]')).toBeTruthy();
    expect(renderFlow('dash').querySelector('[data-link-flow="upload"]')).toBeTruthy();
  });
});
