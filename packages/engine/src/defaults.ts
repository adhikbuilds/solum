/**
 * Dubai default assumptions, taken verbatim from the prototype's `defaultState()`.
 *
 * Source: `git show prototype/main:solum.html`, function `defaultState()`, read 2026-08-11.
 *
 * These are the most valuable thing inherited from the prototype. They are not guesses — they are
 * decisions someone made about Dubai residential development and then demoed to a client, and the
 * commit history shows several of them being corrected in response to review ("Fix parking,
 * efficiency and fractional units before the demo", "BUA as a field on Plot Details, and
 * construction priced on it").
 *
 * They are still `[relayed]`: sourced from a working prototype rather than from a quantity
 * surveyor. Anything client-facing needs them confirmed against real Dubai project costs.
 */
import { aed, type Fils, type FilsPerSqft, type Rate } from './money.js';

/**
 * Built-up area is gross floor area times this factor.
 *
 * The distinction matters more than it looks. Construction is priced per sqft of BUA, revenue per
 * sqft of saleable, and land per sqft of plot — three different denominators, and the prototype's
 * client asked about exactly this ("are the per square foot numbers per square foot of developed
 * area?"). Pricing construction on GFA instead of BUA understates it by 45%.
 */
export const BUA_FACTOR = 1.45;

/** Saleable area as a share of BUA. Efficiency below this is worth flagging for review. */
export const BASE_EFFICIENCY = 0.82;

/** Profit on cost at or above which the prototype's client considers a deal worth pursuing. */
export const HURDLE = 0.2;

export const DUBAI_DEFAULT_COSTS = {
  /** AED 345 per sqft of BUA. */
  constructionPsf: 34_500n as FilsPerSqft,
  costBasis: 'bua' as const,
  buaFactor: BUA_FACTOR,

  /**
   * Architect's fees are split: design and supervision, 2.5% each on construction. Kept as two
   * lines rather than a single 5% because they are contracted and invoiced separately, and a
   * developer reviewing the appraisal expects to see both.
   */
  archDesignRate: 0.025 as Rate,
  archSuperRate: 0.025 as Rate,

  /** 10% contingency on construction. */
  contingencyRate: 0.1 as Rate,

  /** Authority fees, landscaping and miscellaneous are absolute, not rates. */
  authoritiesFixed: aed(2_000_000),
  landscapeFixed: aed(1_000_000),
  miscFixed: aed(500_000),

  /** Marketing and sales, 4% of gross development value. */
  marketingRate: 0.04 as Rate,

  /**
   * Parking. AED 55,000 per bay, with visitor bays added at 15% on top of resident bays.
   *
   * Dubai practice per the prototype: one bay for studio and 1BR, two for 2BR and above. That
   * provision lives on each unit type as `bays`, because it varies with the mix.
   */
  parkingBayCost: aed(55_000),
  visitorBayRate: 0.15 as Rate,

  /** DLD transfer duty on land acquisition. Verify against current regulation. */
  dldTransferRate: 0.04 as Rate,
} satisfies Record<string, unknown>;

/**
 * Timeline and payment plan.
 *
 * The 20/50/30 booking / construction / handover split with a 70% off-plan share is the buyer-funded
 * structure that makes Dubai different — see docs/domain-model.md. It is not yet wired into a
 * cashflow here; the prototype models it quarterly and this engine does not model timing at all.
 */
export const DUBAI_DEFAULT_TIMELINE = {
  months: 30,
  payBookingRate: 0.2 as Rate,
  payConstructionRate: 0.5 as Rate,
  payHandoverRate: 0.3 as Rate,
  costInflationRate: 0.035 as Rate,
  priceGrowthRate: 0.04 as Rate,
  offPlanShare: 0.7 as Rate,
} satisfies Record<string, unknown>;

/**
 * Default unit mix. Sizes in sqft, prices per sqft of saleable area, `bays` is parking provision
 * per unit, and min/max are the share-of-mix bands the optimiser is allowed to move within.
 */
export const DUBAI_DEFAULT_UNIT_TYPES = [
  { code: 'STUDIO', label: 'Studio', avgAreaSqft: 430, pricePsf: 155_000n, bays: 1, minShare: 0.1, maxShare: 0.3 },
  { code: '1BR', label: '1 bedroom', avgAreaSqft: 750, pricePsf: 146_000n, bays: 1, minShare: 0.2, maxShare: 0.5 },
  { code: '2BR', label: '2 bedroom', avgAreaSqft: 1150, pricePsf: 135_000n, bays: 2, minShare: 0.1, maxShare: 0.4 },
  { code: '3BR', label: '3 bedroom', avgAreaSqft: 1600, pricePsf: 128_000n, bays: 2, minShare: 0, maxShare: 0.3 },
] as const;

/**
 * Al Mizan asked for 4BR (feedback item 2). Not in the prototype's defaults; added here with sizes
 * and pricing extrapolated from the 3BR line, and flagged as our inference rather than theirs.
 */
export const UNIT_TYPE_4BR = {
  code: '4BR',
  label: '4 bedroom',
  avgAreaSqft: 2100,
  pricePsf: 122_000n as FilsPerSqft,
  bays: 2,
  minShare: 0,
  maxShare: 0.2,
} as const;

/** Bays required for a mix, including visitor provision, rounded up to whole bays. */
export function bayCount(
  units: readonly { enabled: boolean; unitCount: number; bays: number }[],
  visitorRate: Rate = DUBAI_DEFAULT_COSTS.visitorBayRate,
): number {
  const resident = units
    .filter((u) => u.enabled)
    .reduce((total, u) => total + u.unitCount * u.bays, 0);
  return resident + Math.ceil(resident * visitorRate);
}

export function parkingCost(bays: number, perBay: Fils = DUBAI_DEFAULT_COSTS.parkingBayCost): Fils {
  return BigInt(bays) * perBay;
}
