import { describe, expect, it } from 'vitest';
import { directLinks } from './graphStore';

describe('directLinks', () => {
  const rels = [
    { id1: 'p', id2: 'me', type: 'parrainage' },
    { id1: 'q', id2: 'me', type: 'adoption' },
    { id1: 'me', id2: 'f1', type: 'parrainage' },
    { id1: 'x', id2: 'y', type: 'parrainage' },
  ];

  it('splits the links of a star by direction: id1 is the parrain', () => {
    const links = directLinks('me', rels);
    expect(links.parrains.map((r) => r.id1)).toEqual(['p', 'q']);
    expect(links.fillots.map((r) => r.id2)).toEqual(['f1']);
  });

  it('is empty with no star', () => {
    expect(directLinks(null, rels)).toEqual({ parrains: [], fillots: [] });
  });
});
