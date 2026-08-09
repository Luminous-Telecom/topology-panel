import { describe, expect, it } from 'vitest';
import { clientToMapCoords } from './mapCoords';

function rect(left: number, top: number, width: number, height: number) {
  return { left, top, width, height, right: left + width, bottom: top + height };
}

describe('clientToMapCoords', () => {
  const panel = rect(100, 50, 800, 600);

  it('converte com zoom 1 e pan zero', () => {
    expect(clientToMapCoords(300, 250, panel, { x: 0, y: 0, scale: 1 })).toEqual({ x: 200, y: 200 });
  });

  it('compensa pan do viewport', () => {
    expect(clientToMapCoords(300, 250, panel, { x: 40, y: -20, scale: 1 })).toEqual({ x: 160, y: 220 });
  });

  it('converte com zoom 0.5', () => {
    expect(clientToMapCoords(300, 250, panel, { x: 0, y: 0, scale: 0.5 })).toEqual({ x: 400, y: 400 });
  });

  it('converte com zoom 2', () => {
    expect(clientToMapCoords(300, 250, panel, { x: 0, y: 0, scale: 2 })).toEqual({ x: 100, y: 100 });
  });

  it('preserva offset de agarre após pan do viewport', () => {
    const grabView = { x: 0, y: 0, scale: 1 };
    const node = { x: 200, y: 150 };
    const grab = clientToMapCoords(280, 200, panel, grabView);
    const grabOffset = { x: grab.x - node.x, y: grab.y - node.y };
    const pannedView = { x: -100, y: 0, scale: 1 };
    const pointer = clientToMapCoords(480, 200, panel, pannedView);
    expect({ x: pointer.x - grabOffset.x, y: pointer.y - grabOffset.y }).toEqual({ x: 500, y: 150 });
  });
});
