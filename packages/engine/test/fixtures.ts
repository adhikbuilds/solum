import { aed } from '../src/money.js';
import type { AppraisalInput, ComparablesBand, UnitType } from '../src/types.js';

/**
 * The beta's own numbers, reproduced.
 *
 * Observed on the deployed prototype: 1BR priced at AED 2,000/sqft against a comparables band of
 * AED 1,640–1,910, with 1BR carrying 79,392 of 158,370 saleable sqft — 50.1% of the scheme. The
 * blended figure the beta displayed was AED 1,890/sqft, and it printed a PASS verdict.
 *
 * These tests exist so that specific combination can never ship again.
 */

export const BETA_COMPS: ComparablesBand = {
  snapshotId: 'snap-test-0001',
  asOf: '2026-07-12',
  community: 'Wadi Al Safa 3',
  lowPsf: 164_000n, // AED 1,640
  medianPsf: 177_700n, // AED 1,777
  highPsf: 191_000n, // AED 1,910
  sampleSize: 41,
};

/** 79,392 + 46,470 + 32,508 = 158,370 sqft saleable. */
export function betaUnits(oneBedPricePsf = 200_000n): UnitType[] {
  return [
    {
      code: 'STUDIO',
      label: 'Studio',
      enabled: false, // muted in the beta's unit matrix
      unitCount: 40,
      avgAreaSqft: 480,
      pricePsf: 167_500n,
    },
    {
      code: '1BR',
      label: '1 bedroom',
      enabled: true,
      unitCount: 96,
      avgAreaSqft: 827, // 96 × 827 = 79,392
      pricePsf: oneBedPricePsf,
    },
    {
      code: '2BR',
      label: '2 bedroom',
      enabled: true,
      unitCount: 30,
      avgAreaSqft: 1549, // 30 × 1,549 = 46,470
      pricePsf: 180_000n,
    },
    {
      code: '3BR',
      label: '3 bedroom',
      enabled: true,
      unitCount: 21,
      avgAreaSqft: 1548, // 21 × 1,548 = 32,508
      pricePsf: 175_000n,
    },
  ];
}

export function betaAppraisal(overrides: Partial<AppraisalInput> = {}): AppraisalInput {
  return {
    plot: {
      plotId: 'plot-test-0001',
      community: 'Wadi Al Safa 3',
      landAreaSqft: 62_000,
      gfaSqft: 198_000,
      saleableAreaSqft: 158_370,
      landCost: aed(83_000_000),
    },
    units: betaUnits(),
    costs: {
      constructionPsfGfa: 65_000n, // AED 650/sqft GFA
      professionalFeesRate: 0.07,
      contingencyRate: 0.05,
      marketingRate: 0.03,
      dldTransferRate: 0.04, // [relayed] verify against current DLD regulation
      otherFixed: aed(12_000_000),
    },
    comparables: BETA_COMPS,
    scenarios: [
      { name: 'Base', salePriceDelta: 0, constructionCostDelta: 0 },
      { name: 'Downside', salePriceDelta: -0.1, constructionCostDelta: 0.1 },
      { name: 'Upside', salePriceDelta: 0.08, constructionCostDelta: -0.03 },
    ],
    targetProfitOnCost: 0.2,
    passThreshold: 0.2,
    marginalThreshold: 0.12,
    ...overrides,
  };
}
