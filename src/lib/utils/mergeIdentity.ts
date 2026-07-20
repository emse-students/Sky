/**
 * Pure helpers for resolving an identity conflict when merging two fiches.
 * Shared by the admin merge UI (which fiche's data to keep) and the merge
 * endpoint (validate + apply the chosen values). No DB access, so unit-testable.
 */

/** The display identity of a fiche - the only fields a merge can conflict on. */
export interface MergeIdentity {
  prenom: string;
  nom: string;
  level: number | null;
}

/** The identity fields, in the order they should be presented. */
export type IdentityField = "nom" | "prenom" | "level";

/** One conflicting field: its two candidate values (from fiche A and fiche B). */
export interface IdentityFieldDiff {
  field: IdentityField;
  a: string | number | null;
  b: string | number | null;
}

/**
 * List the identity fields on which `a` and `b` disagree, in display order.
 * An empty array means the two fiches carry the same identity, so a merge needs
 * no resolution. Names compare case-sensitively (both are already stored in the
 * normalized "NOM"/"Prenom" form); promo compares by value (null = unknown).
 */
export function diffIdentity(
  a: MergeIdentity,
  b: MergeIdentity,
): IdentityFieldDiff[] {
  const diffs: IdentityFieldDiff[] = [];
  if (a.nom !== b.nom) {
    diffs.push({ field: "nom", a: a.nom, b: b.nom });
  }
  if (a.prenom !== b.prenom) {
    diffs.push({ field: "prenom", a: a.prenom, b: b.prenom });
  }
  if (a.level !== b.level) {
    diffs.push({ field: "level", a: a.level, b: b.level });
  }
  return diffs;
}

/** True when `a` and `b` share the same identity (no merge conflict to resolve). */
export function identityMatches(a: MergeIdentity, b: MergeIdentity): boolean {
  return diffIdentity(a, b).length === 0;
}
