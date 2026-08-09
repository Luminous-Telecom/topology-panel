import { describe, expect, it } from 'vitest';
import { computeEdgePanVelocity, edgeAxisVelocityForTest } from './edgePan';

function rect(width: number, height: number) {
  return { left: 0, top: 0, width, height, right: width, bottom: height };
}

const panel = rect(800, 600);
const threshold = 64;
const maxSpeed = 720;

describe('edgeAxisVelocityForTest', () => {
  it('retorna zero fora da zona ativa', () => {
    expect(edgeAxisVelocityForTest(400, 0, 800, threshold, maxSpeed)).toBe(0);
  });

  it('borda esquerda → vx positivo', () => {
    expect(edgeAxisVelocityForTest(20, 0, 800, threshold, maxSpeed)).toBeGreaterThan(0);
  });

  it('borda direita → vx negativo', () => {
    expect(edgeAxisVelocityForTest(790, 0, 800, threshold, maxSpeed)).toBeLessThan(0);
  });

  it('intensidade aumenta perto da borda', () => {
    const near = Math.abs(edgeAxisVelocityForTest(790, 0, 800, threshold, maxSpeed));
    const far = Math.abs(edgeAxisVelocityForTest(750, 0, 800, threshold, maxSpeed));
    expect(near).toBeGreaterThan(far);
  });

  it('cursor além do container → velocidade máxima', () => {
    expect(edgeAxisVelocityForTest(900, 0, 800, threshold, maxSpeed)).toBe(-maxSpeed);
  });
});

describe('computeEdgePanVelocity', () => {
  it('centro do painel não produz pan', () => {
    expect(computeEdgePanVelocity(400, 300, panel, threshold, maxSpeed)).toEqual({ vx: 0, vy: 0 });
  });

  it('combina cantos em diagonal', () => {
    const v = computeEdgePanVelocity(10, 10, panel, threshold, maxSpeed);
    expect(v.vx).toBeGreaterThan(0);
    expect(v.vy).toBeGreaterThan(0);
  });

  it('auto-pan acumula deslocamento de view na borda direita', () => {
    let viewX = 0;
    for (let i = 0; i < 120; i += 1) {
      const { vx } = computeEdgePanVelocity(790, 300, panel, threshold, maxSpeed);
      viewX += vx / 60;
    }
    expect(viewX).toBeLessThan(0);
  });
});
