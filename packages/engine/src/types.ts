import type { Fils, FilsPerSqft, Rate } from './money.js';
import type { Flag } from './flags.js';
import type { CalculationStep } from './trace.js';

/**
 * A comparables band resolved from a market-data snapshot.
 *
 * The engine never fetches this. The caller resolves it from a pinned, immutable snapshot and
 * passes it in, so an appraisal reopened in six months produces identical numbers. When the price
 * model exists it will produce this same shape, with a fitted band instead of an observed one.
 */
export interface ComparablesBand {
  /** Snapshot this came from. Recorded on the result so the appraisal is reproducible. */
  snapshotId: string;
  /** ISO date the underlying data was current as of. Supplied, never read from a clock. */
  asOf: string;
  community: string;
  lowPsf: FilsPerSqft;
  medianPsf: FilsPerSqft;
  highPsf: FilsPerSqft;
  /** Number of underlying transactions. A band from three marketing brochures is not a band. */
  sampleSize: number;
}

export interface UnitType {
  /** Stable code, e.g. '1BR'. */
  code: string;
  label: string;
  /** Excluded types stay in the input so the mix decision is visible in the trace. */
  enabled: boolean;
  unitCount: number;
  avgAreaSqft: number;
  pricePsf: FilsPerSqft;
}

export interface CostInputs {
  /** Construction cost per sqft of gross floor area. */
  constructionPsfGfa: FilsPerSqft;
  /** Professional fees, as a rate on construction cost. */
  professionalFeesRate: Rate;
  /** Contingency, as a rate on construction cost. */
  contingencyRate: Rate;
  /** Marketing and sales, as a rate on gross development value. */
  marketingRate: Rate;
  /** DLD transfer duty on land acquisition. Verify against current regulation before relying on it. */
  dldTransferRate: Rate;
  /** Anything not covered above, as an absolute amount. */
  otherFixed: Fils;
}

export interface PlotInput {
  plotId: string;
  community: string;
  landAreaSqft: number;
  gfaSqft: number;
  saleableAreaSqft: number;
  /** Known acquisition price. Omit to solve for residual land value only. */
  landCost?: Fils;
}

/**
 * A named variation on the base case.
 *
 * Deltas are decimal: -0.10 is a 10% reduction. These are deliberately crude — real uncertainty
 * work means propagating distributions and reporting P10/P50/P90, which needs the DLD transaction
 * store that does not exist yet.
 */
export interface Scenario {
  name: string;
  salePriceDelta: Rate;
  constructionCostDelta: Rate;
}

export interface AppraisalInput {
  plot: PlotInput;
  units: UnitType[];
  costs: CostInputs;
  comparables: ComparablesBand;
  scenarios: Scenario[];
  /** Target profit on cost used to solve residual land value. */
  targetProfitOnCost: Rate;
  /** Margin at or above which a deal passes. */
  passThreshold: Rate;
  /** Margin at or above which a deal is marginal rather than a fail. */
  marginalThreshold: Rate;
}

export type Verdict = 'PASS' | 'MARGINAL' | 'FAIL' | 'NO_VERDICT';

export interface ScenarioResult {
  name: string;
  grossDevelopmentValue: Fils;
  totalCost: Fils;
  netProfit: Fils;
  /** Profit on total cost. Null when total cost is zero. */
  profitOnCost: Rate | null;
}

export interface AppraisalOutputs {
  blendedPricePsf: FilsPerSqft | null;
  grossDevelopmentValue: Fils;
  constructionCost: Fils;
  totalDevelopmentCost: Fils;
  /** What you could pay for the land and still hit the target profit. */
  residualLandValue: Fils;
  /** Present only when landCost was supplied. */
  netProfit: Fils | null;
  profitOnCost: Rate | null;
  scenarios: ScenarioResult[];
}

export interface AppraisalResult {
  engineVersion: string;
  /** Snapshot the comparables came from, carried through for reproducibility. */
  comparablesSnapshotId: string;
  verdict: Verdict;
  /** Why the verdict is what it is, in plain English. Shown next to it. */
  verdictReason: string;
  outputs: AppraisalOutputs;
  flags: Flag[];
  trace: CalculationStep[];
}
