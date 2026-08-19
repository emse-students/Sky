import { describe, it, expect } from "vitest";
import {
  editDistance,
  levenshtein,
  nameDistance,
  personMatchScore,
  tokenTolerance,
} from "./format";

/**
 * The ecosystem search contract, pinned here in Sky's own code. The numbers, the
 * measurement that produced them and what every other repository owes are in
 * canari at `docs/wiki/search-contract.md`. A contract nothing executes is a
 * comment, which is how the four implementations drifted apart in the first
 * place.
 */
describe("the search contract", () => {
  describe("a transposition costs one edit", () => {
    it("charges the swap of two adjacent characters once, not twice", () => {
      expect(editDistance("jaen", "jean")).toBe(1);
      expect(editDistance("dupnot", "dupont")).toBe(1);
    });

    it("still charges everything else the same as Levenshtein", () => {
      expect(editDistance("dupond", "dupont")).toBe(1); // substitution
      expect(editDistance("dupon", "dupont")).toBe(1); // deletion
      expect(editDistance("dupontt", "dupont")).toBe(1); // insertion
      expect(editDistance("dupand", "dupont")).toBe(2);
    });

    it("finds the transposed first name a plain Levenshtein would miss", () => {
      // The whole point: at a tolerance of 1, "jaen" reaches "jean" only here.
      expect(personMatchScore("Dupont", "Jean", 2024, "jaen")).not.toBeNull();
    });
  });

  describe("the tolerance ladder", () => {
    it("sits at 0 up to three characters, 1 to seven, 2 from eight", () => {
      expect(tokenTolerance(1)).toBe(0);
      expect(tokenTolerance(3)).toBe(0);
      expect(tokenTolerance(4)).toBe(1);
      expect(tokenTolerance(7)).toBe(1);
      expect(tokenTolerance(8)).toBe(2);
      expect(tokenTolerance(20)).toBe(2);
    });

    it("gives a token of three characters no edit at all", () => {
      // "jan" is "jean" with a deletion, and three letters carry no information:
      // at a tolerance of 1 they reach nearly one extra wrong name per query.
      expect(personMatchScore("Dupont", "Jean", 2024, "jan")).toBeNull();
    });

    it("still answers a three-character PREFIX, through the substring branch", () => {
      // Which is why the 0 rung is survivable: somebody who typed "dup" has not
      // made a mistake, they have stopped typing.
      expect(personMatchScore("Dupont", "Jean", 2024, "dup")).not.toBeNull();
    });

    it("refuses a second edit below eight characters", () => {
      expect(personMatchScore("Dupont", "Jean", 2024, "dupand")).toBeNull();
      expect(personMatchScore("Dupont", "Jean", 2024, "dupond")).not.toBeNull();
    });

    it("allows a second edit from eight characters", () => {
      expect(
        personMatchScore("Dupontier", "Jean", 2024, "dupontlar"),
      ).not.toBeNull();
    });
  });

  describe("the tolerance comes from the SHORTER of the two tokens", () => {
    it("does not let a short query buy edits against a long name", () => {
      // "jen" is one edit from "jean", but three characters tolerate none.
      expect(personMatchScore("Dupont", "Jean", 2024, "jen")).toBeNull();
      // "dupontr" is two edits from "dupontier", and seven characters allow one.
      expect(personMatchScore("Dupontier", "Jean", 2024, "dupontr")).toBeNull();
    });
  });

  describe("every typed word must match something", () => {
    it("rejects a person who answers only half the query", () => {
      expect(
        personMatchScore("Dupont", "Jean", 2024, "jean dupont"),
      ).not.toBeNull();
      expect(
        personMatchScore("Dupont", "Jean", 2024, "jean martin"),
      ).toBeNull();
    });

    it("does not care about word order", () => {
      expect(
        personMatchScore("Dupont", "Jean", 2024, "dupont jean"),
      ).not.toBeNull();
    });
  });

  describe("the answers are ranked, not filtered", () => {
    it("ranks fewer typos above more", () => {
      const one = personMatchScore("Dupontier", "Jean", 2024, "dupontler");
      const two = personMatchScore("Dupontier", "Jean", 2024, "dupontlar");
      expect(one).not.toBeNull();
      expect(two).not.toBeNull();
      expect(one as number).toBeLessThan(two as number);
    });
  });
});

/**
 * Identity is a different question and keeps a different metric on purpose:
 * merging two people who are not the same person is destructive and cannot be
 * undone, whereas a search row that should not be in the list costs a glance.
 */
describe("identity matching stays strict", () => {
  it("charges a transposition twice, unlike search", () => {
    expect(levenshtein("jaen", "jean")).toBe(2);
    expect(editDistance("jaen", "jean")).toBe(1);
  });

  it("measures identities on the strict metric, order-insensitively", () => {
    expect(nameDistance("Dupont", "Jean", "Jean", "Dupont")).toBe(0);
    expect(nameDistance("Dupont", "Jean", "Dupont", "Jaen")).toBe(2);
  });
});
