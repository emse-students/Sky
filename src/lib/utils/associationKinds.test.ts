import { describe, it, expect } from 'vitest';
import { groupCanariAssociations, isPastCampaignList } from './associationKinds';
import type { CanariAssociation, CanariFormerAssociation } from '#lib/types/graph.js';

const cur = (o: Partial<CanariAssociation> & { name: string }): CanariAssociation => ({
  slug: o.name,
  role: 'Membre',
  logoUrl: null,
  ...o,
});
const past = (o: Partial<CanariFormerAssociation> & { name: string }): CanariFormerAssociation => ({
  role: 'Membre',
  logoUrl: null,
  startYear: null,
  endYear: null,
  ...o,
});
const group = (
  associations: CanariAssociation[],
  formerAssociations: CanariFormerAssociation[],
  now = new Date('2026-03-01T12:00:00Z')
) => groupCanariAssociations({ associations, formerAssociations }, now);

describe('isPastCampaignList (mirror of Canari)', () => {
  it('is active until 1 August of the promo year, UTC', () => {
    const l = { type: 'list', promo: 2026 };
    expect(isPastCampaignList(l, new Date('2026-07-31T23:59:59Z'))).toBe(false);
    expect(isPastCampaignList(l, new Date('2026-08-01T00:00:00Z'))).toBe(true);
  });
  it('never calls an association or a list without promo past', () => {
    expect(isPastCampaignList({ type: 'association', promo: 2000 })).toBe(false);
    expect(isPastCampaignList({ type: 'list', promo: null })).toBe(false);
  });
});

describe('groupCanariAssociations', () => {
  it('sorts the three kinds, and treats a missing type as an association', () => {
    const g = group(
      [
        cur({ name: 'BDE', type: 'association' }),
        cur({ name: 'Old API' }),
        cur({ name: 'Liste X', type: 'list', promo: 2026 }),
        cur({ name: 'Fondation', type: 'institution' }),
      ],
      []
    );
    expect(g.associations.map((a) => a.name)).toEqual(['BDE', 'Old API']);
    expect(g.lists.map((a) => a.name)).toEqual(['Liste X']);
    expect(g.institutions.map((a) => a.name)).toEqual(['Fondation']);
  });

  it('shows a list only during its campaign year', () => {
    const l = (promo: number) => cur({ name: `L${promo}`, type: 'list', promo });
    const g = group([l(2025), l(2026), l(2027)], []);
    expect(g.lists.map((a) => a.name)).toEqual(['L2026', 'L2027']);
  });

  it('never shows a list in the former section', () => {
    const g = group(
      [],
      [past({ name: "Ragn'art'ok", type: 'list', promo: 2025, role: '2A de liste (2025-2026)' })]
    );
    expect(g.former).toEqual([]);
  });

  it('drops a former list even when no mandate was recorded under a parent association (deliberate loss)', () => {
    const g = group(
      [cur({ name: 'BDE', role: 'Membre' })],
      [past({ name: 'Liste orpheline', type: 'list', promo: 2024, startYear: 2023, endYear: 2024 })]
    );
    expect(g.former).toEqual([]);
    expect(g.lists).toEqual([]);
  });

  it('drops a past mandate that repeats a current one (same association, same role)', () => {
    const g = group(
      [cur({ name: "T'art'garyen", role: 'Secrétaire', type: 'association' })],
      [past({ name: "T'art'garyen", role: 'Secrétaire', startYear: 2024, endYear: 2025 })]
    );
    expect(g.former).toEqual([]);
  });

  it('keeps a past mandate with a different role, or in another association', () => {
    const g = group(
      [cur({ name: 'BDE', role: 'Président' })],
      [
        past({ name: 'BDE', role: 'Trésorier', startYear: 2024, endYear: 2025 }),
        past({ name: 'BDS', role: 'Président', startYear: 2024, endYear: 2025 }),
      ]
    );
    expect(g.former.map((f) => f.name)).toEqual(['BDE', 'BDS']);
  });

  it('matches by slug when present: a renamed association is still the same one', () => {
    const g = group(
      [cur({ name: 'Nouveau nom', slug: 'bde', role: 'Secrétaire' })],
      [past({ name: 'Ancien nom', slug: 'bde', role: 'Secrétaire', startYear: 2024 })]
    );
    expect(g.former).toEqual([]);
  });

  it('does not match two associations that share a name but not a slug', () => {
    const g = group(
      [cur({ name: 'Club', slug: 'club-a', role: 'Secrétaire' })],
      [past({ name: 'Club', slug: 'club-b', role: 'Secrétaire', startYear: 2024 })]
    );
    expect(g.former).toHaveLength(1);
  });
});
