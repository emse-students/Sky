import { describe, expect, it } from 'vitest';
import { decideLanding } from './landing';

const member = { signedIn: true, profileId: 'me', starPositioned: true, selectedId: null };

describe('decideLanding', () => {
  it('lands a signed-in member with a star on that star', () => {
    expect(decideLanding(member)).toEqual({ kind: 'own-star', id: 'me' });
  });

  it('changes nothing when signed out', () => {
    expect(decideLanding({ ...member, signedIn: false })).toEqual({
      kind: 'keep',
      reason: 'signed-out',
    });
  });

  it('lets a selection already made win over the own star', () => {
    expect(decideLanding({ ...member, selectedId: 'someone' })).toEqual({
      kind: 'keep',
      reason: 'selection-wins',
    });
  });

  it('keeps the overview with no linked star, or one the graph does not place', () => {
    expect(decideLanding({ ...member, profileId: null })).toEqual({
      kind: 'keep',
      reason: 'no-star',
    });
    expect(decideLanding({ ...member, profileId: undefined })).toEqual({
      kind: 'keep',
      reason: 'no-star',
    });
    expect(decideLanding({ ...member, starPositioned: false })).toEqual({
      kind: 'keep',
      reason: 'no-star',
    });
  });
});
