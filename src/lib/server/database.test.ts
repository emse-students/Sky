import { describe, it, expect } from "vitest";
import {
  isValidPromo,
  checkPromoPair,
  MIN_PROMO,
  MAX_PROMO_GAP,
} from "./database";

// These validators are pure (no DB access), so they import safely without a
// database connection. They back the parrainage promo rules enforced server-side
// at creation (isValidPromo) and when linking a godparent/godchild (checkPromoPair).

describe("isValidPromo", () => {
  it("accepts an unknown promo (null)", () => {
    expect(isValidPromo(null)).toBe(true);
  });

  it("accepts the founding year and later", () => {
    expect(isValidPromo(MIN_PROMO)).toBe(true);
    expect(isValidPromo(2024)).toBe(true);
  });

  it("rejects a year before the school existed", () => {
    expect(isValidPromo(MIN_PROMO - 1)).toBe(false);
    expect(isValidPromo(1000)).toBe(false);
  });

  it("rejects a non-integer year", () => {
    expect(isValidPromo(2024.5)).toBe(false);
  });
});

describe("checkPromoPair", () => {
  it("requires both promos to be known", () => {
    expect(checkPromoPair(null, 2024)).toBe("PROMO_UNKNOWN");
    expect(checkPromoPair(2020, null)).toBe("PROMO_UNKNOWN");
    expect(checkPromoPair(null, null)).toBe("PROMO_UNKNOWN");
  });

  it("requires the godchild to be a strictly more recent promotion", () => {
    // Older godchild.
    expect(checkPromoPair(2024, 2020)).toBe("PROMO_ORDER");
    // Same promotion is not strictly more recent.
    expect(checkPromoPair(2020, 2020)).toBe("PROMO_ORDER");
  });

  it("rejects a gap larger than MAX_PROMO_GAP years", () => {
    expect(checkPromoPair(2020, 2020 + MAX_PROMO_GAP + 1)).toBe("PROMO_GAP");
  });

  it("accepts a godchild within [+1, +MAX_PROMO_GAP] years", () => {
    expect(checkPromoPair(2020, 2021)).toBeNull();
    expect(checkPromoPair(2020, 2020 + MAX_PROMO_GAP)).toBeNull();
  });
});
