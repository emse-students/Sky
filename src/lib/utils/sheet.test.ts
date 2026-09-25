import { describe, expect, it } from 'vitest';
import { settleSheet, sheetHeight, stepSheet, SHEET_SNAPS } from './sheet';

const vh = 800;

describe('sheetHeight', () => {
  it('is the state share of the viewport', () => {
    expect(sheetHeight('peek', vh)).toBe(240);
    expect(sheetHeight('full', vh)).toBe(Math.round(SHEET_SNAPS.full * vh));
  });
});

describe('settleSheet', () => {
  it('settles a slow release on the nearest state', () => {
    expect(settleSheet(250, 0, vh)).toBe('peek');
    expect(settleSheet(470, 0, vh)).toBe('half');
    expect(settleSheet(700, 0, vh)).toBe('full');
  });

  it('carries a fling on to the next state', () => {
    // 300 px is nearer peek at rest, but a quick upward flick reaches half.
    expect(settleSheet(300, 0, vh)).toBe('peek');
    expect(settleSheet(300, 1.2, vh)).toBe('half');
    // And a quick downward flick from half drops to peek.
    expect(settleSheet(430, -1.2, vh)).toBe('peek');
  });

  it('dismisses a release well below the peek, or a hard downward fling from it', () => {
    expect(settleSheet(100, 0, vh)).toBe('dismissed');
    expect(settleSheet(240, -1, vh)).toBe('dismissed');
  });

  it('does not dismiss a peek nudged down a little', () => {
    expect(settleSheet(200, 0, vh)).toBe('peek');
  });
});

describe('stepSheet', () => {
  it('steps between states and stops at both ends', () => {
    expect(stepSheet('peek', 1)).toBe('half');
    expect(stepSheet('half', 1)).toBe('full');
    expect(stepSheet('full', 1)).toBe('full');
    expect(stepSheet('half', -1)).toBe('peek');
    expect(stepSheet('peek', -1)).toBe('peek');
  });
});
