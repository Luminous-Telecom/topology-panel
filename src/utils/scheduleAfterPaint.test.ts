import { describe, expect, it, vi } from 'vitest';
import { scheduleAfterPaint, scheduleWhenIdle } from './scheduleAfterPaint';

function waitAfterPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeout(resolve, 0);
      });
    });
  });
}

describe('scheduleAfterPaint', () => {
  it('não roda no mesmo turno — só depois de dois animation frames e um timeout', async () => {
    const run = vi.fn();
    scheduleAfterPaint(run);
    expect(run).not.toHaveBeenCalled();
    await waitAfterPaint();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('cancelar antes do paint impede a execução', async () => {
    const run = vi.fn();
    const cancel = scheduleAfterPaint(run);
    cancel();
    await waitAfterPaint();
    expect(run).not.toHaveBeenCalled();
  });
});

describe('scheduleWhenIdle', () => {
  it('não roda no mesmo turno', async () => {
    const run = vi.fn();
    scheduleWhenIdle(run);
    expect(run).not.toHaveBeenCalled();
    await new Promise<void>((resolve) => {
      setTimeout(() => resolve(), 150);
    });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('timeout customizado atrasa a execução', async () => {
    const run = vi.fn();
    scheduleWhenIdle(run, 40);
    await new Promise<void>((resolve) => {
      setTimeout(() => resolve(), 10);
    });
    expect(run).not.toHaveBeenCalled();
    await new Promise<void>((resolve) => {
      setTimeout(() => resolve(), 50);
    });
    expect(run).toHaveBeenCalledTimes(1);
  });
});
