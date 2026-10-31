import type {
  CanariAssociation,
  CanariFormerAssociation,
  CanariProfile,
} from '#lib/types/graph.js';

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

/** Trimmed, lowercased, so a stray space or capital never hides a repeat. */
const norm = (v: string): string => v.trim().toLowerCase();

/**
 * The key under which a past mandate repeats a current one: association identity + role. The
 * identity is the `slug` when Canari sends it, else the name (an older Canari has no slug on
 * former rows, and a current row's slug cannot match a slug-less former row).
 */
function mandateKey(row: { name: string; slug?: string | null; role: string }, bySlug: boolean) {
  return `${bySlug ? norm(row.slug ?? '') : norm(row.name)}\u0000${norm(row.role)}`;
}

/**
 * Sorts a Canari profile's memberships into the three kinds and applies two de-duplication rules.
 *
 * - **A campaign list is shown only during its campaign** (`isPastCampaignList` is false), and
 *   never in the former section: after 1 August its mandate is recorded under the association
 *   that ran it, so a former list row would be a duplicate.
 * - **A past mandate that repeats a current one is dropped**: same association (by slug, by name for
 *   an old Canari) and same role as a current row means one continuous mandate (a person re-elected Secretary is not listed as
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

  const current = [...associations, ...lists, ...institutions];
  const heldBySlug = new Set(current.map((a) => mandateKey(a, true)));
  const heldByName = new Set(current.map((a) => mandateKey(a, false)));
  const former = (profile.formerAssociations ?? []).filter(
    (f) =>
      // DELIBERATE LOSS (owner: a past list is a "doublon"): a former list is dropped even when the
      // mandate was never recorded under its parent association, since the projection carries no parent.
      f.type !== 'list' &&
      !(f.slug ? heldBySlug.has(mandateKey(f, true)) : heldByName.has(mandateKey(f, false)))
  );

  return { associations, lists, institutions, former };
}
