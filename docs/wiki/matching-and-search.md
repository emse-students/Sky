# Matching and search

Sky matches people by name in two places: **linking** an SSO identity to an
existing record at login, and **searching** for people (nav search, self-service
relink, admin). Both share the tolerant primitives in `src/lib/utils/format.ts`,
so a typo or a swapped first/last name behaves consistently everywhere.

## Normalization

`normalizeName(value)` is the common ground: lowercase, accent-free (NFD +
combining-mark strip), hyphens/underscores turned into spaces, whitespace
collapsed. This neutralizes case/accent/punctuation differences between the SSO,
the database and a user's query.

## Edit distance

`levenshtein(a, b)` is a standard two-row Levenshtein (insertions, deletions,
substitutions). `nameDistance(lastA, firstA, lastB, firstB)` builds on it: it
normalizes each part, sorts the tokens, and joins them before measuring distance.
Sorting the tokens makes the distance **inversion-tolerant** - "Jean Dupont" and
"Dupont Jean" collapse to the same string and score 0.

`NAME_MATCH_MAX_DISTANCE = 2` is the largest distance still treated as the same
person (e.g. "Dupont"/"Dupond"). It is deliberately small so genuine homonyms are
not merged.

## Where matching is used

- **Login linking** (`resolveLogin`, see [identity-model.md](identity-model.md)):
  exact normalized last+first name plus matching promo auto-links; otherwise
  `findUnlinkedFuzzyByName` offers resembling records for confirmation. Sky never
  auto-links on a fuzzy match alone.
- **Merge suggestions** (`getMergeSuggestions`, see
  [sponsorship-graph.md](sponsorship-graph.md)): pairs within
  `NAME_MATCH_MAX_DISTANCE` and a 3-year promo tolerance are proposed as likely
  duplicates.

## Search ranking

`personMatchScore(nom, prenom, level, query)` is the tolerant search scorer.
It returns a rank where **lower is a better match**, or `null` when the person
does not match at all (an empty query returns 0 - matches everything, neutral
rank). The query is normalized, then scored against:

1. a normalized substring of "nom prenom" - the earlier the substring position,
   the better the rank (returns the index);
2. the reversed "prenom nom" order (rank 2), so word inversion still hits;
3. the promo year as a string (rank 5);
4. a per-token edit-distance fallback: every query token must match some name
   token, either as a substring or within a small edit distance (tolerance 1 for
   tokens up to 4 chars, else 2). If any query token matches nothing, the person
   is rejected (`null`); otherwise the token distances accumulate into the score.

This scorer powers `GET /api/search` and the client-side filtering on the map.
The FTS5 table (`people_fts`) exists in the schema but the user-facing search
path uses this scorer, not FTS.

> Cross-repo note: this tolerant behavior (typos + word inversion + distance) is
> the same standard applied across the EMSE apps. Sky implements it here; the
> goal is to keep search forgiving everywhere.
