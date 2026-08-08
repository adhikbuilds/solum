/**
 * Every number carries its derivation.
 *
 * This is not a debugging convenience. It is what separates a screening toy from something a
 * lender will read, and it is precisely what the incumbent consultancies sell — a methodology you
 * can follow. A figure with no derivation has no standing in an investment committee.
 */

import type { Flag } from './flags.js';

export interface CalculationStep {
  /** Stable identifier, e.g. 'gdv.blended_psf'. Referenced by flags and by the UI. */
  id: string;
  /** Human label, shown in the report. */
  label: string;
  /** The rule applied, in notation a surveyor would recognise. */
  rule: string;
  /** The inputs this step consumed, named. */
  inputs: Record<string, unknown>;
  /** The result, as a plain number or string for display. */
  output: unknown;
  flags?: Flag[];
}

export class Trace {
  private readonly steps: CalculationStep[] = [];
  private readonly collected: Flag[] = [];

  record(step: CalculationStep): void {
    this.steps.push(step);
    if (step.flags) this.collected.push(...step.flags);
  }

  get allSteps(): readonly CalculationStep[] {
    return this.steps;
  }

  get allFlags(): readonly Flag[] {
    return this.collected;
  }

  find(id: string): CalculationStep | undefined {
    return this.steps.find((s) => s.id === id);
  }
}
