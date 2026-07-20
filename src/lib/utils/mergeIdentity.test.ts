import { describe, it, expect } from "vitest";
import { diffIdentity, identityMatches } from "./mergeIdentity";

// diffIdentity backs the admin merge conflict resolver: an empty diff merges
// straight away, a non-empty one drives the "which value to keep" chooser.

describe("diffIdentity", () => {
  it("returns no diff for identical fiches", () => {
    const p = { prenom: "Marie", nom: "DUPONT", level: 2021 };
    expect(diffIdentity(p, { ...p })).toEqual([]);
    expect(identityMatches(p, { ...p })).toBe(true);
  });

  it("treats a matching unknown promo (null) as equal", () => {
    const a = { prenom: "Marie", nom: "DUPONT", level: null };
    const b = { prenom: "Marie", nom: "DUPONT", level: null };
    expect(diffIdentity(a, b)).toEqual([]);
  });

  it("reports each differing field with both candidate values", () => {
    const a = { prenom: "Marie", nom: "DUPOND", level: 2021 };
    const b = { prenom: "Marie", nom: "DUPONT", level: 2022 };
    expect(diffIdentity(a, b)).toEqual([
      { field: "nom", a: "DUPOND", b: "DUPONT" },
      { field: "level", a: 2021, b: 2022 },
    ]);
    expect(identityMatches(a, b)).toBe(false);
  });

  it("reports a known-vs-unknown promo as a diff", () => {
    const a = { prenom: "Jean", nom: "MARTIN", level: 2020 };
    const b = { prenom: "Jean", nom: "MARTIN", level: null };
    expect(diffIdentity(a, b)).toEqual([{ field: "level", a: 2020, b: null }]);
  });

  it("keeps the display order nom, prenom, level", () => {
    const a = { prenom: "Marie", nom: "DUPOND", level: 2021 };
    const b = { prenom: "Marion", nom: "DUPONT", level: 2022 };
    expect(diffIdentity(a, b).map((d) => d.field)).toEqual([
      "nom",
      "prenom",
      "level",
    ]);
  });
});
