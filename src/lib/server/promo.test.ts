import { describe, it, expect } from 'vitest';
import {
  isValidPromo,
  checkPromoPair,
  isPromoWarningCode,
  MIN_PROMO,
  MAX_PROMO_GAP,
} from './promo';

// These validators are pure (no DB access), so they import safely without a
// database connection. They back the parrainage promo rules enforced server-side
// at creation (isValidPromo) and when linking a godparent/godchild (checkPromoPair).

describe('isValidPromo', () => {
  it('accepts an unknown promo (null)', () => {
    expect(isValidPromo(null)).toBe(true);
  });

  it('accepts the founding year and later', () => {
    expect(isValidPromo(MIN_PROMO)).toBe(true);
    expect(isValidPromo(2024)).toBe(true);
  });

  it('rejects a year before the school existed', () => {
    expect(isValidPromo(MIN_PROMO - 1)).toBe(false);
    expect(isValidPromo(1000)).toBe(false);
  });

  it('rejects a non-integer year', () => {
    expect(isValidPromo(2024.5)).toBe(false);
  });
});

describe('checkPromoPair', () => {
  it('requires both promos to be known', () => {
    expect(checkPromoPair(null, 2024)).toBe('PROMO_UNKNOWN');
    expect(checkPromoPair(2020, null)).toBe('PROMO_UNKNOWN');
    expect(checkPromoPair(null, null)).toBe('PROMO_UNKNOWN');
  });

  it('accepts the same promotion (owner decision 2026-11-27)', () => {
    expect(checkPromoPair(2025, 2025)).toBeNull();
  });

  it('warns when the godchild is older than the godparent', () => {
    expect(checkPromoPair(2026, 2025)).toBe('PROMO_ORDER');
    expect(checkPromoPair(2024, 2020)).toBe('PROMO_ORDER');
  });

  it('warns on a gap larger than MAX_PROMO_GAP years', () => {
    expect(checkPromoPair(2022, 2026)).toBe('PROMO_GAP');
    expect(checkPromoPair(2020, 2020 + MAX_PROMO_GAP + 1)).toBe('PROMO_GAP');
  });

  it('accepts a godchild within [0, +MAX_PROMO_GAP] years', () => {
    expect(checkPromoPair(2020, 2021)).toBeNull();
    expect(checkPromoPair(2023, 2026)).toBeNull();
    expect(checkPromoPair(2020, 2020 + MAX_PROMO_GAP)).toBeNull();
  });
});

describe('isPromoWarningCode', () => {
  it('knows the two soft codes and nothing else', () => {
    expect(isPromoWarningCode('PROMO_ORDER')).toBe(true);
    expect(isPromoWarningCode('PROMO_GAP')).toBe(true);
    expect(isPromoWarningCode('PROMO_UNKNOWN')).toBe(false);
    expect(isPromoWarningCode('CYCLE')).toBe(false);
    expect(isPromoWarningCode(42)).toBe(false);
  });
});
