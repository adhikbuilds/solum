import { describe, expect, it } from 'vitest';
import { irr, npv } from '../src/irr.js';

describe('irr', () => {
  it('solves a simple two-period cashflow exactly', () => {
    // -100 now, +110 in one period, is 10%.
    const result = irr([-100, 110]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.rate).toBeCloseTo(0.1, 9);
  });

  it('solves a development-shaped cashflow', () => {
    // Land, then build spend, then sales receipts.
    const result = irr([-83_000_000, -40_000_000, -60_000_000, 90_000_000, 140_000_000]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // The defining property: NPV at the returned rate is zero.
      expect(npv([-83_000_000, -40_000_000, -60_000_000, 90_000_000, 140_000_000], result.rate))
        .toBeCloseTo(0, 4);
    }
  });

  it('handles a large negative return without diverging', () => {
    const result = irr([-100, 10]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.rate).toBeCloseTo(-0.9, 6);
  });
});

describe('irr failure modes', () => {
  // The point of these: a degenerate cashflow must not yield a plausible-looking number. That is
  // the same class of defect as printing PASS on a loss.

  it('declines an all-negative cashflow', () => {
    const result = irr([-100, -50, -20]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('NO_SIGN_CHANGE');
  });

  it('declines an all-positive cashflow', () => {
    const result = irr([100, 50, 20]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('NO_SIGN_CHANGE');
  });

  it('declines a cashflow with multiple sign changes rather than picking a root', () => {
    const result = irr([-100, 260, -165]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('MULTIPLE_SIGN_CHANGES');
  });

  it('declines an empty cashflow', () => {
    const result = irr([]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('EMPTY_CASHFLOW');
  });

  it('cannot be consumed as a number without checking ok first', () => {
    const result = irr([-100, -50]);
    // @ts-expect-error — rate is not present on the failure branch, by design
    expect(result.rate).toBeUndefined();
  });
});

describe('npv', () => {
  it('discounts correctly', () => {
    // 100/1.1 + 121/1.21 = 90.909... + 100 = 190.909...
    expect(npv([0, 100, 121], 0.1)).toBeCloseTo(190.909, 3);
  });

  it('returns the undiscounted sum at a zero rate', () => {
    expect(npv([-100, 50, 60], 0)).toBeCloseTo(10, 9);
  });
});
