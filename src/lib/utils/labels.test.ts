import { describe, expect, it } from 'vitest';
import {
  labelPriority,
  placeLabels,
  stepLabelOpacity,
  LABEL_FADE_STEP,
  LabelFader,
  TextWidthCache,
  linkDegree,
  directNeighbours,
  type LabelCandidate,
} from './labels';

const base = { selected: false, hovered: false, neighbourOfSelected: false, degree: 0 };

function label(id: string, left: number, top: number, priority = 0, width = 80): LabelCandidate {
  return { id, left, top, width, height: 14, priority };
}

describe('labelPriority', () => {
  it('ranks selected > hovered > neighbour > the rest, whatever the degree', () => {
    const selected = labelPriority({ ...base, selected: true });
    const hovered = labelPriority({ ...base, hovered: true, degree: 500 });
    const neighbour = labelPriority({ ...base, neighbourOfSelected: true, degree: 900 });
    const hub = labelPriority({ ...base, degree: 999 });
    expect(selected).toBeGreaterThan(hovered);
    expect(hovered).toBeGreaterThan(neighbour);
    expect(neighbour).toBeGreaterThan(hub);
  });

  it('ranks the better-connected star first within a tier', () => {
    expect(labelPriority({ ...base, degree: 5 })).toBeGreaterThan(
      labelPriority({ ...base, degree: 2 })
    );
  });
});

describe('placeLabels', () => {
  it('keeps every label when none overlap', () => {
    const placed = placeLabels([label('a', 0, 0), label('b', 200, 0), label('c', 0, 100)]);
    expect([...placed].sort()).toEqual(['a', 'b', 'c']);
  });

  it('drops the lower-ranked of two overlapping labels', () => {
    const placed = placeLabels([label('low', 10, 5, 1), label('high', 0, 0, 2)]);
    expect([...placed]).toEqual(['high']);
  });

  it('never places two labels whose boxes overlap, on a dense random scene', () => {
    let seed = 42;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 400;
    const candidates = Array.from({ length: 300 }, (_, i) =>
      label(`n${i}`, rand(), rand(), Math.floor(rand()), 40 + (i % 5) * 20)
    );
    const placed = candidates.filter((c) => placeLabels(candidates).has(c.id));
    expect(placed.length).toBeGreaterThan(10);
    for (const a of placed) {
      for (const b of placed) {
        if (a === b) continue;
        const disjoint =
          a.left + a.width <= b.left ||
          b.left + b.width <= a.left ||
          a.top + a.height <= b.top ||
          b.top + b.height <= a.top;
        expect(disjoint).toBe(true);
      }
    }
  });

  it('keeps labels apart by the padding, not merely disjoint', () => {
    // 2 px apart: disjoint, but inside the 3 px padding.
    const placed = placeLabels([label('a', 0, 0, 2), label('b', 82, 0, 1)]);
    expect([...placed]).toEqual(['a']);
  });

  it('is deterministic on equal priorities (ties broken by id, not input order)', () => {
    const one = placeLabels([label('b', 0, 0), label('a', 5, 0)]);
    const two = placeLabels([label('a', 5, 0), label('b', 0, 0)]);
    expect([...one]).toEqual(['a']);
    expect([...two]).toEqual(['a']);
  });

  it('always places the top-ranked label, and finds collisions across grid cells', () => {
    // A long label spanning several 64 px cells, and a short one in its last cell.
    const placed = placeLabels([label('long', 0, 0, 5, 300), label('short', 250, 2, 1, 30)]);
    expect([...placed]).toEqual(['long']);
  });

  it('handles negative coordinates (labels partly off the top-left edge)', () => {
    const placed = placeLabels([label('a', -50, -10, 2), label('b', -20, -5, 1)]);
    expect([...placed]).toEqual(['a']);
  });
});

describe('stepLabelOpacity', () => {
  it('fades a newly placed label in, and stops animating once it is opaque', () => {
    let state = new Map<string, number>();
    let animating = true;
    let frames = 0;
    while (animating) {
      ({ opacity: state, animating } = stepLabelOpacity(state, new Set(['a'])));
      frames++;
    }
    expect(state.get('a')).toBe(1);
    expect(frames).toBe(Math.ceil(1 / LABEL_FADE_STEP));
  });

  it('fades a label that lost its place out, then forgets it', () => {
    let state = new Map([['a', 1]]);
    let animating = true;
    while (animating) {
      ({ opacity: state, animating } = stepLabelOpacity(state, new Set()));
    }
    expect(state.has('a')).toBe(false);
  });

  it('reports a settled scene as not animating', () => {
    const { opacity, animating } = stepLabelOpacity(new Map([['a', 1]]), new Set(['a']));
    expect(opacity.get('a')).toBe(1);
    expect(animating).toBe(false);
  });
});

describe('LabelFader', () => {
  it('asks for frames while a label fades, and stops once settled', () => {
    const fader = new LabelFader();
    expect(fader.step(new Set(['a']))).toBe(true);
    let frames = 1;
    while (fader.step(new Set(['a']))) frames++;
    expect(fader.opacity.get('a')).toBe(1);
    expect(frames).toBeLessThan(12);
  });
});

describe('TextWidthCache', () => {
  it('measures each text once, and again after clear', () => {
    let calls = 0;
    const cache = new TextWidthCache((t) => (calls++, t.length * 7));
    expect(cache.get('abc')).toBe(21);
    expect(cache.get('abc')).toBe(21);
    expect(calls).toBe(1);
    cache.clear();
    cache.get('abc');
    expect(calls).toBe(2);
  });
});

describe('linkDegree / directNeighbours', () => {
  const rels = [
    { id1: 'a', id2: 'b' },
    { id1: 'a', id2: 'c' },
    { id1: 'd', id2: 'a' },
    { id1: 'b', id2: 'c' },
  ];

  it('counts links from both ends', () => {
    const degree = linkDegree(rels);
    expect(degree.get('a')).toBe(3);
    expect(degree.get('b')).toBe(2);
    expect(degree.get('d')).toBe(1);
    expect(degree.has('z')).toBe(false);
  });

  it('finds the stars one link away, whichever end the star is on', () => {
    expect([...directNeighbours('a', rels)].sort()).toEqual(['b', 'c', 'd']);
    expect(directNeighbours(null, rels).size).toBe(0);
  });
});
