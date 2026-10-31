import type { CanariAssociation, CanariFormerAssociation, CanariProfile } from '$lib/types/graph';

/**
 * A promo list is "campaigning for" the mandate that starts the summer of its `promo` year, so its
 * active window ends on 1 August of that year. MIRRORED from Canari
 * (`frontend/src/lib/associations/campaign.ts`, `isPastCampaignList`) - the rule is Canari's and
 * must not be reinvented here. A list with no `promo` is never "past" (same as Canari).
 */
export function isPastCampaignList(
  entity: { type?: string | null; promo?: number | null },
  now: Date = new Date()
): boolean {
  if (entity.type !== 'list' || entity.promo == null) return false;
  return now.getTime() >= Date.UTC(entity.promo, 7, 1);
}

/** What a profile panel draws, once the three kinds are told apart. */
export interface GroupedAssociations {
  associations: CanariAssociation[];
  lists: CanariAssociation[];
  institutions: CanariAssociation[];
  former: CanariFormerAssociation[];
}

/** Name + role, normalised, the key under which a past mandate repeats a current one. */
function mandateKey(name: string, role: string): string {
  return `${name.trim().toLowerCase()}\u0000${role.trim().toLowerCase()}`;
}

/**
 * Sorts a Canari profile's memberships into the three kinds and applies two de-duplication rules.
 *
 * - **A campaign list is shown only during its campaign** (`isPastCampaignList` is false), and
 *   never in the former section: after 1 August its mandate is recorded under the association
 *   that ran it, so a former list row would be a duplicate.
 * - **A past mandate that repeats a current one is dropped**: same association and same role as a
 *   current row means one continuous mandate (a person re-elected Secretary is not listed as
 *   Secretary twice). A DIFFERENT former role is kept - it is history, not a duplicate.
 *
 * A row with no `type` (an older Canari) is an association: the answer is unchanged until Canari
 * sends the field.
 */
export function groupCanariAssociations(
  profile: Pick<CanariProfile, 'associations' | 'formerAssociations'>,
  now: Date = new Date()
): GroupedAssociations {
  const associations: CanariAssociation[] = [];
  const lists: CanariAssociation[] = [];
  const institutions: CanariAssociation[] = [];

  for (const a of profile.associations ?? []) {
    if (a.type === 'list') {
      if (!isPastCampaignList(a, now)) lists.push(a);
    } else if (a.type === 'institution') {
      institutions.push(a);
    } else {
      associations.push(a);
    }
  }

  const held = new Set(
    [...associations, ...lists, ...institutions].map((a) => mandateKey(a.name, a.role))
  );
  const former = (profile.formerAssociations ?? []).filter(
    (f) => f.type !== 'list' && !held.has(mandateKey(f.name, f.role))
  );

  return { associations, lists, institutions, former };
}
