import { isBlocking, type Flag } from './flags.js';
import type { Trace } from './trace.js';
import type { ScenarioResult, Verdict } from './types.js';

export interface VerdictOutcome {
  verdict: Verdict;
  reason: string;
  flags: Flag[];
}

/**
 * Two rules, and the second one is the bug fix.
 *
 * 1. Any blocking flag means no verdict at all. The inputs contradict each other, so no call on
 *    the deal is honest.
 * 2. A deal whose own downside runs at a loss cannot read PASS. The beta printed PASS on a
 *    scenario at -2.5%, which is the single behaviour most likely to lose an account permanently:
 *    an analyst finds it once and the tool is finished in that organisation.
 */
export function decideVerdict(
  baseProfitOnCost: number | null,
  scenarios: readonly ScenarioResult[],
  existingFlags: readonly Flag[],
  passThreshold: number,
  marginalThreshold: number,
  trace: Trace,
): VerdictOutcome {
  const flags: Flag[] = [];

  const losing = scenarios.filter((s) => s.profitOnCost !== null && s.profitOnCost < 0);
  if (losing.length > 0) {
    flags.push({
      code: 'DOWNSIDE_NEGATIVE_MARGIN',
      severity: 'warn',
      message:
        `${losing.length === 1 ? 'A scenario' : `${losing.length} scenarios`} defined on this ` +
        `appraisal run at a loss: ` +
        losing.map((s) => `${s.name} at ${(s.profitOnCost! * 100).toFixed(1)}%`).join(', ') +
        `. This deal cannot pass on its base case alone.`,
      evidence: {
        scenarios: losing.map((s) => ({ name: s.name, profitOnCost: s.profitOnCost })),
      },
      stepId: 'verdict',
    });
  }

  const allFlags = [...existingFlags, ...flags];
  let verdict: Verdict;
  let reason: string;

  if (isBlocking(allFlags)) {
    verdict = 'NO_VERDICT';
    const codes = allFlags.filter((f) => f.severity === 'blocker').map((f) => f.code);
    reason =
      `No verdict issued. The inputs contradict each other (${codes.join(', ')}), so any call on ` +
      `this deal would be misleading. Resolve the flagged items and re-run.`;
  } else if (baseProfitOnCost === null) {
    verdict = 'NO_VERDICT';
    reason = 'No verdict issued. Profit on cost could not be computed — total cost is zero.';
  } else {
    const base = classify(baseProfitOnCost, passThreshold, marginalThreshold);
    if (base === 'PASS' && losing.length > 0) {
      verdict = 'MARGINAL';
      reason =
        `Base case returns ${(baseProfitOnCost * 100).toFixed(1)}% on cost, above the ` +
        `${(passThreshold * 100).toFixed(0)}% pass threshold — but downgraded to marginal because ` +
        `a defined downside runs at a loss.`;
    } else {
      verdict = base;
      reason =
        `Base case returns ${(baseProfitOnCost * 100).toFixed(1)}% on cost against a ` +
        `${(passThreshold * 100).toFixed(0)}% pass threshold and a ` +
        `${(marginalThreshold * 100).toFixed(0)}% marginal threshold.`;
    }
  }

  trace.record({
    id: 'verdict',
    label: 'Verdict',
    rule: 'blocking flag → NO_VERDICT; loss-making downside → never PASS; otherwise threshold band',
    inputs: {
      baseProfitOnCost,
      passThreshold,
      marginalThreshold,
      scenarios: scenarios.map((s) => ({ name: s.name, profitOnCost: s.profitOnCost })),
      blockingFlags: allFlags.filter((f) => f.severity === 'blocker').map((f) => f.code),
    },
    output: verdict,
    flags,
  });

  return { verdict, reason, flags };
}

function classify(profitOnCost: number, pass: number, marginal: number): Verdict {
  if (profitOnCost >= pass) return 'PASS';
  if (profitOnCost >= marginal) return 'MARGINAL';
  return 'FAIL';
}
