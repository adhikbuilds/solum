export { appraise, ENGINE_VERSION } from './appraise.js';
export { computeUnitMix } from './unitMix.js';
export {
  BUA_FACTOR,
  BASE_EFFICIENCY,
  HURDLE,
  DUBAI_DEFAULT_COSTS,
  DUBAI_DEFAULT_TIMELINE,
  DUBAI_DEFAULT_UNIT_TYPES,
  UNIT_TYPE_4BR,
  bayCount,
  parkingCost,
} from './defaults.js';
export {
  impliedFar,
  requiredBays,
  generateCandidates,
  capacityFlags,
  type Provenance,
  type Sourced,
  type RegulatoryEnvelope,
  type Candidate,
} from './capacity.js';
export { decideVerdict } from './verdict.js';
export { suggestRemedies, type Remedy, type RemedyLever } from './remedy.js';
export { irr, npv, type IrrResult, type IrrFailure } from './irr.js';
export { Trace, type CalculationStep } from './trace.js';
export {
  isBlocking,
  blockers,
  type Flag,
  type FlagCode,
  type Severity,
} from './flags.js';
export {
  aed,
  toAed,
  formatAed,
  mulByArea,
  mulByRate,
  divByArea,
  sum,
  ratio,
  type Fils,
  type FilsPerSqft,
  type Rate,
} from './money.js';
export type * from './types.js';
