/**
 * Utility functions for formatting and displaying data
 */

import type { Person } from "$types/graph";

/**
 * Generate full name from first_name and last_name
 * Format: "LAST_NAME First_name"
 */
export function getPersonName(person: Person): string {
  const nom = (person.nom ?? "").trim();
  const prenom = (person.prenom ?? "").trim();
  if (nom && prenom) {
    return `${nom.toUpperCase()} ${prenom}`;
  }
  // Never a raw id on screen: show whatever we have, else a neutral label.
  return nom.toUpperCase() || prenom || "Sans nom";
}

/**
 * Short EMSE promotion label: "E" followed by the year. Promotions from 2000 on
 * keep the full year ("E2023"); earlier ones use the two-digit form ("E99").
 * A missing promo yields "E?".
 */
export function formatPromoShort(level: number | null | undefined): string {
  if (level === null || level === undefined) {
    return "E?";
  }
  if (level >= 2000) {
    return `E${level}`;
  }
  return `E${String(level % 100).padStart(2, "0")}`;
}

/**
 * Generate initials from person's name
 */
export function getPersonInitials(person: Person): string {
  if (!person.nom || !person.prenom) {
    return "?";
  }
  return `${person.prenom.charAt(0)}${person.nom.charAt(0)}`.toUpperCase();
}

/**
 * Normalize a last/first name for tolerant comparison: lowercase, accent-free,
 * hyphens/underscores turned into spaces, whitespace collapsed.
 *
 * Used to link an Authentik identity to an existing `people` record via the
 * quasi-unique key (last name, first name, promotion) despite case/accent
 * variations between the SSO and the database.
 */
export function normalizeName(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Stable 32-bit hash of a string (FNV-1a), for deterministic scatter placement. */
export function hashString(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Levenshtein edit distance between two strings: the minimum number of
 * single-character insertions, deletions or substitutions to turn `a` into `b`.
 * Iterative two-row implementation (O(a*b) time, O(min) space).
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  if (a.length === 0) {
    return b.length;
  }
  if (b.length === 0) {
    return a.length;
  }

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1, // insertion
        prev[j] + 1, // suppression
        prev[j - 1] + cost, // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/**
 * Fuzzy distance between two identities (last + first name), tolerant to typos
 * AND to last/first-name inversion. Both identities are normalized (lowercase,
 * accent-free) and their tokens sorted, so "Jean Dupont" and "Dupont Jean" yield
 * a zero distance. Lower means more similar; 0 = identical (up to accents/case).
 */
export function nameDistance(
  lastA: string | null | undefined,
  firstA: string | null | undefined,
  lastB: string | null | undefined,
  firstB: string | null | undefined,
): number {
  const a = [normalizeName(lastA), normalizeName(firstA)]
    .filter((t) => t.length > 0)
    .sort()
    .join(" ");
  const b = [normalizeName(lastB), normalizeName(firstB)]
    .filter((t) => t.length > 0)
    .sort()
    .join(" ");
  return levenshtein(a, b);
}

/**
 * Maximum edit distance still tolerated to treat two identities as the same
 * person despite a typo (e.g. "Dupont"/"Dupond"; a missing accent is already
 * neutralized by normalization). Deliberately small so distinct homonyms are not
 * merged together.
 */
export const NAME_MATCH_MAX_DISTANCE = 2;

/**
 * Tolerant person-search ranking used across Sky (nav search, self-service
 * relink, admin). Matches a free-text query against a person on:
 *   - a normalized substring of "nom prenom" (and the reversed order, so word
 *     inversion still hits),
 *   - the promotion year,
 *   - a per-token edit-distance fallback (typos: distance <= 1 for short tokens,
 *     <= 2 for longer ones).
 * Returns a rank score where LOWER is a better match, or null when it does not
 * match at all. An empty query returns 0 (matches everything, neutral rank).
 */
export function personMatchScore(
  nom: string | null | undefined,
  prenom: string | null | undefined,
  level: number | null | undefined,
  query: string,
): number | null {
  const q = normalizeName(query);
  if (!q) {
    return 0;
  }
  const name = normalizeName(`${nom ?? ""} ${prenom ?? ""}`);
  const nameReversed = normalizeName(`${prenom ?? ""} ${nom ?? ""}`);

  const idx = name.indexOf(q);
  if (idx >= 0) {
    return idx; // earlier substring position ranks higher
  }
  if (nameReversed.includes(q)) {
    return 2;
  }
  const lvl = level !== null && level !== undefined ? String(level) : "";
  if (lvl && lvl.includes(q)) {
    return 5;
  }

  // Token fuzzy: every query token must match some name token (substring or a
  // small edit distance), which tolerates typos and word inversion.
  const nameTokens = name.split(" ").filter((t) => t.length > 0);
  const queryTokens = q.split(" ").filter((t) => t.length > 0);
  let total = 0;
  for (const qt of queryTokens) {
    let best = Infinity;
    for (const nt of nameTokens) {
      if (nt.includes(qt)) {
        best = 0;
        break;
      }
      const tolerance = qt.length <= 4 ? 1 : 2;
      const d = levenshtein(qt, nt);
      if (d <= tolerance && d < best) {
        best = d;
      }
    }
    if (best === Infinity) {
      return null; // a query token matched nothing -> reject this person
    }
    total += 10 + best;
  }
  return total;
}

/**
 * Format a last name for display as "NOM" (uppercase, accents kept, whitespace
 * collapsed).
 */
export function formatLastName(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim().toUpperCase();
}

/**
 * Format a first name for display as "Prenom": each part separated by a space or
 * hyphen gets an initial capital, the rest lowercased.
 */
export function formatFirstName(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(
      /(^|[\s-])([\p{L}])/gu,
      (_m: string, sep: string, ch: string) => sep + ch.toUpperCase(),
    );
}
