/**
 * Regulatory capacity: what a plot permits, and what a scheme may therefore build.
 *
 * This is the massing half of the engine, and it deliberately does no geometry. Polygon offset
 * — insetting a 37-vertex parcel by its setbacks — is done by the geometry service, which returns
 * an already-solved buildable area. Everything here is arithmetic over that number, which keeps
 * this module pure, integer-exact and testable without a geometry library.
 *
 * The finding this is built on: for DDA-governed plots Dubai *publishes* the development control
 * per plot — permitted GFA, storey limit, all four setbacks, plot coverage and the parking rule.
 * So permitted GFA is a hard ceiling handed to us, not a maximum we search for. That collapses
 * the massing problem: for any storey count the optimal plate is determined, not discovered.
 */

import type { Flag } from './flags.js';
import type { Trace } from './trace.js';

/** Where a figure came from. `authority` is the only tier permitted to drive a headline unflagged. */
export type Provenance = 'authority' | 'derived' | 'assumption' | 'deferred';

export interface Sourced<T> {
  value: T;
  provenance: Provenance;
  /** Required. A figure whose basis cannot be stated should not exist. */
  basis: string;
}

export interface RegulatoryEnvelope {
  plotNumber: string;
  landuse: string | null;
  plotAreaSqft: Sourced<number>;
  permittedGfaSqft: Sourced<number>;
  maxFloors: Sourced<number | null>;
  /** Buildable footprint, already solved by the geometry service. */
  buildableSqft: Sourced<number>;
  /** Widest footprint the setbacks allow — the podium and basements may use it. */
  envelopeSqft: number;
  /** Square metres of GFA per required bay, when the authority published a rule. */
  parkingRuleSqmPerBay: Sourced<number | null>;
  /** False when a setback was deferred to another document: the envelope is then not a bound. */
  bounded: boolean;
}

export interface Candidate {
  floors: number;
  footprintSqft: number;
  gfaSqft: number;
  /** Achieved GFA as a share of what the authority permits. */
  gfaUtilisation: number;
  coverage: number;
  bays: number | null;
  bindingConstraint: 'permitted GFA' | 'height' | 'envelope' | 'plot coverage';
}

const SQFT_PER_SQM = 10.763910416709722;

/**
 * FAR is not published; it is the ratio of two figures that are.
 *
 * Every competing tool asks a user to type a plot ratio, which makes the most load-bearing input
 * in the whole model an unverified guess. Deriving it removes that class of error entirely.
 */
export function impliedFar(env: RegulatoryEnvelope, trace: Trace): Sourced<number | null> {
  const gfa = env.permittedGfaSqft.value;
  const area = env.plotAreaSqft.value;
  if (!area) {
    return { value: null, provenance: 'deferred', basis: 'plot area is zero or absent' };
  }
  const far = gfa / area;
  trace.record({
    id: 'capacity.implied_far',
    label: 'Implied plot ratio',
    rule: 'permitted GFA ÷ plot area',
    inputs: { permittedGfaSqft: gfa, plotAreaSqft: area },
    output: Number(far.toFixed(4)),
  });
  return {
    value: Number(far.toFixed(4)),
    provenance: 'derived',
    basis: `permitted GFA ${Math.round(gfa).toLocaleString()} sqft ÷ plot area ${Math.round(area).toLocaleString()} sqft, both DDA-published`,
  };
}

/**
 * Bays required, from the authority's own rule.
 *
 * Returns null rather than a guess when DDA stated no rule for this plot. A bay count invented at
 * one-per-unit moves construction cost by millions and never raises an error.
 */
export function requiredBays(gfaSqft: number, env: RegulatoryEnvelope): number | null {
  const rule = env.parkingRuleSqmPerBay.value;
  if (!rule) return null;
  return Math.ceil(gfaSqft / SQFT_PER_SQM / rule);
}

/**
 * One optimal candidate per storey count.
 *
 * Storeys — not footprint — is the natural parameter, because for a given height the best plate is
 * determined: exactly `permitted GFA / floors`, capped by what the setbacks leave. Sweeping
 * footprint on a grid instead misses the ceiling by the grid resolution, which reads to a
 * developer as "this plot cannot be fully used" when in fact it can.
 */
export function generateCandidates(env: RegulatoryEnvelope, trace: Trace): Candidate[] {
  const maxFloors = env.maxFloors.value;
  const permitted = env.permittedGfaSqft.value;
  const cap = env.buildableSqft.value;
  const plotArea = env.plotAreaSqft.value;

  if (!maxFloors || !permitted || !cap) {
    trace.record({
      id: 'capacity.candidates',
      label: 'Massing candidates',
      rule: 'requires permitted GFA, storey limit and a buildable footprint',
      inputs: { maxFloors, permittedGfaSqft: permitted, buildableSqft: cap },
      output: 0,
    });
    return [];
  }

  const out: Candidate[] = [];
  for (let floors = 1; floors <= maxFloors; floors++) {
    const wanted = permitted / floors;
    const footprint = Math.min(wanted, cap);
    const gfa = footprint * floors;

    let binding: Candidate['bindingConstraint'];
    if (footprint >= cap && wanted > cap) binding = 'envelope';
    else if (floors === maxFloors && gfa < permitted) binding = 'height';
    else binding = 'permitted GFA';

    out.push({
      floors,
      footprintSqft: footprint,
      gfaSqft: gfa,
      gfaUtilisation: gfa / permitted,
      coverage: plotArea ? footprint / plotArea : 0,
      bays: requiredBays(gfa, env),
      bindingConstraint: binding,
    });
  }

  trace.record({
    id: 'capacity.candidates',
    label: 'Massing candidates',
    rule: 'for each storey count n ≤ max: plate = min(permitted GFA ÷ n, buildable)',
    inputs: {
      maxFloors,
      permittedGfaSqft: permitted,
      buildableSqft: Math.round(cap),
      caveat: env.bounded
        ? undefined
        : 'A setback was deferred by the authority to another document, so the buildable footprint is not a bound.',
    },
    output: out.length,
  });

  return out.sort((a, b) => b.gfaSqft - a.gfaSqft || a.floors - b.floors);
}

/**
 * Capacity flags. These are the massing equivalents of the appraisal's refusals.
 */
export function capacityFlags(env: RegulatoryEnvelope, candidates: readonly Candidate[]): Flag[] {
  const flags: Flag[] = [];

  if (!env.bounded) {
    flags.push({
      code: 'SETBACK_DEFERRED',
      severity: 'blocker',
      message:
        'The authority deferred at least one setback to a document we do not hold, so the buildable ' +
        'envelope is not a bound and no capacity figure can be relied on.',
      evidence: {
        plotNumber: env.plotNumber,
        buildableSqft: Math.round(env.buildableSqft.value),
        setbackBasis: env.buildableSqft.basis,
      },
      stepId: 'capacity.candidates',
    });
  }

  if (candidates.length && !candidates.some((c) => c.gfaUtilisation >= 0.98)) {
    flags.push({
      code: 'ENTITLEMENT_UNREACHABLE',
      severity: 'warn',
      message:
        'No massing option reaches the permitted GFA — the setbacks or the storey limit bind first, ' +
        'so the plot cannot use its full entitlement.',
      evidence: {
        permittedGfaSqft: Math.round(env.permittedGfaSqft.value),
        bestAchievableSqft: Math.round(Math.max(...candidates.map((c) => c.gfaSqft))),
        bestUtilisation: Number(Math.max(...candidates.map((c) => c.gfaUtilisation)).toFixed(4)),
        bindingConstraint: candidates[0]?.bindingConstraint,
      },
      stepId: 'capacity.candidates',
    });
  }

  return flags;
}
