import { mulByArea, mulByRate, ratio, type Fils } from './money.js';
import { bayCount, parkingCost } from './defaults.js';
import type { Flag } from './flags.js';
import { Trace } from './trace.js';
import { computeUnitMix } from './unitMix.js';
import { decideVerdict } from './verdict.js';
import type {
  AppraisalInput,
  AppraisalResult,
  CostInputs,
  ScenarioResult,
} from './types.js';

/**
 * Bumped on every formula change. Stored on each result; results are never silently recomputed
 * when this moves, because quietly changing a number a client already acted on is worse than
 * being wrong in the first place.
 */
export const ENGINE_VERSION = '0.1.0';

/**
 * The entry point. Pure: no network, no database, no clock, no randomness.
 *
 * Not yet modelled — each needs the DLD transaction store that does not exist:
 *   - finance (debt sizing, drawn-balance interest)
 *   - cashflow and the S-curve cost distribution
 *   - the Dubai off-plan collection curve, which is the actual wedge
 *   - absorption, and uncertainty propagation
 * Residual land value here is therefore a static rather than a time-weighted figure, and does not
 * yet account for the cost of capital. That is stated in the trace rather than hidden.
 */
export function appraise(input: AppraisalInput): AppraisalResult {
  const trace = new Trace();
  const { plot, costs, comparables } = input;

  const mix = computeUnitMix(input.units, comparables, trace);
  const flags: Flag[] = [...mix.flags];

  const areaFlag = checkAreaReconciliation(mix.saleableAreaSqft, plot.saleableAreaSqft);
  if (areaFlag) flags.push(areaFlag);

  // Construction is priced on BUA, not GFA. BUA = GFA × buaFactor (1.45 by Dubai default).
  // Pricing on GFA understates construction by 45%, which is the single largest correctness risk
  // in the whole appraisal.
  const constructionAreaSqft =
    costs.costBasis === 'bua' ? plot.gfaSqft * costs.buaFactor : plot.gfaSqft;
  const construction = mulByArea(costs.constructionPsf, constructionAreaSqft);

  trace.record({
    id: 'cost.construction',
    label: 'Construction',
    rule:
      costs.costBasis === 'bua'
        ? 'GFA × buaFactor × cost per sqft of BUA'
        : 'GFA × cost per sqft of GFA',
    inputs: {
      gfaSqft: plot.gfaSqft,
      buaFactor: costs.costBasis === 'bua' ? costs.buaFactor : null,
      constructionAreaSqft,
      basis: costs.costBasis,
      denominator: costs.costBasis === 'bua' ? 'per sqft of built-up area' : 'per sqft of GFA',
      costPsf: Number(costs.constructionPsf),
    },
    output: Number(construction),
  });

  const bays = bayCount(input.units, costs.visitorBayRate);
  const base = buildCosts(construction, mix.grossDevelopmentValue, bays, costs, trace);

  // Residual land value: what the land can be worth and still return the target profit.
  //   GDV = costs(excluding land) + land + DLD duty on land + target profit on total cost
  // Solved for land, treating duty as a rate on the land price itself.
  const targetMultiple = 1 + input.targetProfitOnCost;
  const landCoefficient = (1 + costs.dldTransferRate) * targetMultiple;
  const residualNumerator = Number(mix.grossDevelopmentValue) - Number(base) * targetMultiple;
  const residualLandValue = BigInt(Math.round(residualNumerator / landCoefficient));

  trace.record({
    id: 'land.residual',
    label: 'Residual land value',
    rule: '(GDV − nonLandCost × (1 + targetProfit)) / ((1 + dldRate) × (1 + targetProfit))',
    inputs: {
      gdv: Number(mix.grossDevelopmentValue),
      nonLandCost: Number(base),
      targetProfitOnCost: input.targetProfitOnCost,
      dldTransferRate: costs.dldTransferRate,
      caveat:
        'Static residual. Not time-weighted and excludes finance cost — the cashflow and ' +
        'collection-curve modules are not built yet.',
    },
    output: Number(residualLandValue),
  });

  const landCost = plot.landCost;
  const dldDuty = landCost === undefined ? 0n : mulByRate(landCost, costs.dldTransferRate);
  const totalCost = landCost === undefined ? base : base + landCost + dldDuty;
  const netProfit = landCost === undefined ? null : mix.grossDevelopmentValue - totalCost;
  const profitOnCost = netProfit === null ? null : ratio(netProfit, totalCost);

  if (landCost !== undefined) {
    trace.record({
      id: 'profit.net',
      label: 'Net profit',
      rule: 'GDV − (nonLandCost + land + DLD duty)',
      inputs: {
        gdv: Number(mix.grossDevelopmentValue),
        nonLandCost: Number(base),
        landCost: Number(landCost),
        dldDuty: Number(dldDuty),
        totalCost: Number(totalCost),
      },
      output: Number(netProfit),
    });
  }

  const scenarios = input.scenarios.map((s) =>
    runScenario(s, input, mix.grossDevelopmentValue, construction, bays, landCost, dldDuty),
  );

  trace.record({
    id: 'scenarios',
    label: 'Scenario results',
    rule: 'base case re-run with sale price and construction cost deltas applied',
    inputs: {
      scenarios: input.scenarios.map((s) => ({
        name: s.name,
        salePriceDelta: s.salePriceDelta,
        constructionCostDelta: s.constructionCostDelta,
      })),
    },
    output: scenarios.map((s) => ({ name: s.name, profitOnCost: s.profitOnCost })),
  });

  const outcome = decideVerdict(
    profitOnCost,
    scenarios,
    flags,
    input.passThreshold,
    input.marginalThreshold,
    trace,
  );

  return {
    engineVersion: ENGINE_VERSION,
    comparablesSnapshotId: comparables.snapshotId,
    verdict: outcome.verdict,
    verdictReason: outcome.reason,
    outputs: {
      blendedPricePsf: mix.blendedPricePsf,
      grossDevelopmentValue: mix.grossDevelopmentValue,
      constructionCost: construction,
      totalDevelopmentCost: totalCost,
      residualLandValue,
      netProfit,
      profitOnCost,
      scenarios,
    },
    flags: [...flags, ...outcome.flags],
    trace: [...trace.allSteps],
  };
}

/** All development cost except land and the duty on it. */
function buildCosts(
  construction: Fils,
  gdv: Fils,
  bays: number,
  costs: CostInputs,
  trace?: Trace,
): Fils {
  const archDesign = mulByRate(construction, costs.archDesignRate);
  const archSuper = mulByRate(construction, costs.archSuperRate);
  const contingency = mulByRate(construction, costs.contingencyRate);
  const marketing = mulByRate(gdv, costs.marketingRate);
  const parking = parkingCost(bays, costs.parkingBayCost);
  const total =
    construction +
    archDesign +
    archSuper +
    contingency +
    costs.authoritiesFixed +
    costs.landscapeFixed +
    costs.miscFixed +
    marketing +
    parking;

  trace?.record({
    id: 'cost.non_land',
    label: 'Development cost excluding land',
    rule:
      'construction + architect (design + supervision) + contingency + authorities + ' +
      'landscaping + miscellaneous + marketing + parking',
    inputs: {
      construction: Number(construction),
      architectDesign: Number(archDesign),
      architectSupervision: Number(archSuper),
      contingency: Number(contingency),
      authorities: Number(costs.authoritiesFixed),
      landscaping: Number(costs.landscapeFixed),
      miscellaneous: Number(costs.miscFixed),
      marketing: Number(marketing),
      parkingBays: bays,
      parking: Number(parking),
    },
    output: Number(total),
  });

  return total;
}

function runScenario(
  scenario: AppraisalInput['scenarios'][number],
  input: AppraisalInput,
  baseGdv: Fils,
  baseConstruction: Fils,
  bays: number,
  landCost: Fils | undefined,
  dldDuty: Fils,
): ScenarioResult {
  const gdv = mulByRate(baseGdv, 1 + scenario.salePriceDelta);
  const construction = mulByRate(baseConstruction, 1 + scenario.constructionCostDelta);
  const nonLand = buildCosts(construction, gdv, bays, input.costs);
  const totalCost = landCost === undefined ? nonLand : nonLand + landCost + dldDuty;
  const netProfit = gdv - totalCost;

  return {
    name: scenario.name,
    grossDevelopmentValue: gdv,
    totalCost,
    netProfit,
    profitOnCost: ratio(netProfit, totalCost),
  };
}

function checkAreaReconciliation(computed: number, stated: number): Flag | null {
  if (stated <= 0) return null;
  const drift = Math.abs(computed - stated) / stated;
  if (drift <= 0.01) return null;

  return {
    code: 'AREA_RECONCILIATION_FAILED',
    severity: 'warn',
    message:
      `The unit mix totals ${fmtArea(computed)} sqft but the plot states ` +
      `${fmtArea(stated)} sqft saleable — a ${(drift * 100).toFixed(1)}% difference. ` +
      `One of the two is wrong, and every per-sqft figure depends on which.`,
    evidence: { computedAreaSqft: computed, statedAreaSqft: stated, drift },
    stepId: 'gdv.total',
  };
}

/**
 * Thousands grouping, pinned.
 *
 * `toLocaleString()` without an explicit locale reads the host machine's settings — on an
 * Indian-locale machine 158,370 renders as 1,58,370. Engine output must be identical everywhere,
 * or two people reading the same appraisal see different documents.
 */
function fmtArea(sqft: number): string {
  return Math.round(sqft)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
