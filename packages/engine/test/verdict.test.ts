import { describe, expect, it } from 'vitest';
import { decideVerdict } from '../src/verdict.js';
import { Trace } from '../src/trace.js';
import { aed } from '../src/money.js';
import type { Flag } from '../src/flags.js';
import type { ScenarioResult } from '../src/types.js';

function scenario(name: string, profitOnCost: number | null): ScenarioResult {
  return {
    name,
    grossDevelopmentValue: aed(100_000_000),
    totalCost: aed(80_000_000),
    netProfit: aed(20_000_000),
    profitOnCost,
  };
}

const blocker: Flag = {
  code: 'PRICE_ABOVE_OWN_COMPS',
  severity: 'blocker',
  message: 'priced above own comparables band',
  evidence: {},
};

describe('the beta bug: PASS on a loss-making downside', () => {
  it('never returns PASS when a defined scenario runs at a loss', () => {
    // Exactly the beta's behaviour: a strong base case with a -2.5% downside, reported as PASS.
    const outcome = decideVerdict(
      0.24,
      [scenario('Base', 0.24), scenario('Downside', -0.025)],
      [],
      0.2,
      0.12,
      new Trace(),
    );

    expect(outcome.verdict).toBe('MARGINAL');
    expect(outcome.reason).toContain('downgraded');
    expect(outcome.flags.map((f) => f.code)).toContain('DOWNSIDE_NEGATIVE_MARGIN');
  });

  it('quotes the losing scenario by name and margin', () => {
    const outcome = decideVerdict(
      0.24,
      [scenario('Base', 0.24), scenario('Downside', -0.025)],
      [],
      0.2,
      0.12,
      new Trace(),
    );
    const flag = outcome.flags.find((f) => f.code === 'DOWNSIDE_NEGATIVE_MARGIN')!;

    expect(flag.message).toContain('Downside');
    expect(flag.message).toContain('-2.5%');
  });

  it('does return PASS when every scenario holds up', () => {
    const outcome = decideVerdict(
      0.24,
      [scenario('Base', 0.24), scenario('Downside', 0.04)],
      [],
      0.2,
      0.12,
      new Trace(),
    );
    expect(outcome.verdict).toBe('PASS');
  });
});

describe('refusal', () => {
  it('issues no verdict at all when inputs contradict each other', () => {
    const outcome = decideVerdict(0.24, [scenario('Base', 0.24)], [blocker], 0.2, 0.12, new Trace());

    expect(outcome.verdict).toBe('NO_VERDICT');
    expect(outcome.reason).toContain('contradict');
    expect(outcome.reason).toContain('PRICE_ABOVE_OWN_COMPS');
  });

  it('refuses regardless of how strong the base case looks', () => {
    const outcome = decideVerdict(0.85, [scenario('Base', 0.85)], [blocker], 0.2, 0.12, new Trace());
    expect(outcome.verdict).toBe('NO_VERDICT');
  });

  it('issues no verdict when profit on cost is undefined', () => {
    const outcome = decideVerdict(null, [], [], 0.2, 0.12, new Trace());
    expect(outcome.verdict).toBe('NO_VERDICT');
  });
});

describe('threshold bands', () => {
  it.each([
    [0.25, 'PASS'],
    [0.2, 'PASS'],
    [0.19, 'MARGINAL'],
    [0.12, 'MARGINAL'],
    [0.11, 'FAIL'],
    [-0.05, 'FAIL'],
  ])('classifies %d on cost as %s', (profit, expected) => {
    const outcome = decideVerdict(profit, [], [], 0.2, 0.12, new Trace());
    expect(outcome.verdict).toBe(expected);
  });
});

describe('trace', () => {
  it('records why the verdict landed where it did', () => {
    const trace = new Trace();
    decideVerdict(0.24, [scenario('Downside', -0.025)], [], 0.2, 0.12, trace);

    const step = trace.find('verdict');
    expect(step).toBeDefined();
    expect(step!.output).toBe('MARGINAL');
    expect(step!.inputs['baseProfitOnCost']).toBe(0.24);
  });
});
