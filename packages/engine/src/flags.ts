/**
 * Flags are how the engine declines to be confident.
 *
 * A `blocker` suppresses the verdict entirely. The product must be able to say "I will not give
 * you a verdict on this" — that capability is worth more than any single computed number, because
 * it is what makes the verdicts it does give meaningful.
 *
 * The beta printed PASS on a downside scenario running at a loss. That is the class of behaviour
 * these exist to make structurally impossible.
 */

export type FlagCode =
  /** Launch price sits above the top of the tool's own comparables band. */
  | 'PRICE_ABOVE_OWN_COMPS'
  /** A scenario the appraisal itself defines runs at a negative margin. */
  | 'DOWNSIDE_NEGATIVE_MARGIN'
  /** IRR could not be computed for this cashflow — no sign change, or multiple roots. */
  | 'IRR_UNDEFINED'
  /** Unit mix areas do not reconcile to the stated saleable area. */
  | 'AREA_RECONCILIATION_FAILED'
  /** Comparables sample is too small to support a price conclusion. */
  | 'COMPS_SAMPLE_TOO_SMALL'
  /** Comparables snapshot predates the staleness threshold. */
  | 'COMPS_STALE'
  /** The authority deferred a setback elsewhere, so the buildable envelope is not a bound. */
  | 'SETBACK_DEFERRED'
  /** No massing option reaches the permitted GFA — setbacks or height bind first. */
  | 'ENTITLEMENT_UNREACHABLE';

export type Severity = 'info' | 'warn' | 'blocker';

export interface Flag {
  code: FlagCode;
  severity: Severity;
  /** Plain-English statement of what is wrong. Shown to the user verbatim. */
  message: string;
  /** The numbers behind the flag, so the user can check it rather than trust it. */
  evidence: Record<string, unknown>;
  /** Which calculation step raised it, so the UI can surface it where the number is typed. */
  stepId?: string;
}

export function isBlocking(flags: readonly Flag[]): boolean {
  return flags.some((f) => f.severity === 'blocker');
}

export function blockers(flags: readonly Flag[]): Flag[] {
  return flags.filter((f) => f.severity === 'blocker');
}
