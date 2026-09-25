import { describe, expect, it } from 'vitest';
import { cameraStore } from './cameraStore';

describe('cameraStore.updateSmooth', () => {
  it('eases toward the target, then settles on it exactly', () => {
    cameraStore.jumpTo({ x: 0, y: 0, zoom: 1 });
    cameraStore.setTarget(100, 0, 1);
    let frames = 0;
    while (cameraStore.updateSmooth()) frames++;
    expect(frames).toBeGreaterThan(1);
    let x = NaN;
    cameraStore.subscribe((s) => (x = s.x))();
    expect(x).toBe(100);
  });

  it('notifies nobody once settled - the canvas repaints on every notification', () => {
    cameraStore.jumpTo({ x: 5, y: 5, zoom: 1 });
    let notifications = 0;
    const stop = cameraStore.subscribe(() => notifications++);
    notifications = 0;
    expect(cameraStore.updateSmooth()).toBe(false);
    expect(cameraStore.updateSmooth()).toBe(false);
    expect(notifications).toBe(0);
    stop();
  });
});
