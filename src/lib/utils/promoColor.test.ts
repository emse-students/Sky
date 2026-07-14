import { describe, it, expect } from "vitest";
import { computePromoBounds, promoColor } from "./promoColor";

describe("computePromoBounds", () => {
  it("returns null when no promo is known", () => {
    expect(computePromoBounds([])).toBeNull();
    expect(computePromoBounds([null, null])).toBeNull();
  });

  it("ignores null promos and returns inclusive min/max", () => {
    expect(computePromoBounds([2020, null, 2016, 2024])).toEqual({
      min: 2016,
      max: 2024,
    });
  });

  it("handles a single known promo", () => {
    expect(computePromoBounds([2021])).toEqual({ min: 2021, max: 2021 });
  });
});

describe("promoColor", () => {
  const bounds = { min: 2016, max: 2024 };

  it("falls back to the neutral tint for unknown promo or bounds", () => {
    expect(promoColor(null, bounds)).toBe("hsl(217, 12%, 55%)");
    expect(promoColor(2020, null)).toBe("hsl(217, 12%, 55%)");
  });

  it("maps the oldest promo to the darkest tone and newest to the lightest", () => {
    expect(promoColor(2016, bounds)).toBe("hsl(217, 85%, 42.0%)");
    expect(promoColor(2024, bounds)).toBe("hsl(217, 85%, 72.0%)");
  });

  it("is monotonic: a more recent promo is lighter", () => {
    const light = (p: number) =>
      Number(promoColor(p, bounds).match(/(\d+\.\d+)%\)$/)![1]);
    expect(light(2016)).toBeLessThan(light(2020));
    expect(light(2020)).toBeLessThan(light(2024));
  });

  it("uses the mid tone when every node shares one promo", () => {
    expect(promoColor(2021, { min: 2021, max: 2021 })).toBe(
      "hsl(217, 85%, 57.0%)",
    );
  });
});
