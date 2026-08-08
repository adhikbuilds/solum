import { describe, expect, it } from 'vitest';
import { appraise, ENGINE_VERSION } from '../src/appraise.js';
import { aed, toAed } from '../src/money.js';
import { betaAppraisal, betaUnits } from './fixtures.js';

describe('appraise — the beta case end to end', () => {
  it('refuses a verdict on the beta inputs', () => {
    // The whole point of the rebuild in one assertion: given the numbers the prototype displayed,
    // the engine declines to call the deal instead of printing PASS.
    const result = appraise(betaAppraisal());

    expect(result.verdict).toBe('NO_VERDICT');
    expect(result.flags.map((f) => f.code)).toContain('PRICE_ABOVE_OWN_COMPS');
    expect(result.verdictReason).toContain('Resolve the flagged items');
  });

  it('issues a verdict once the 1BR price is brought inside the band', () => {
    const result = appraise(betaAppraisal({ units: betaUnits(185_000n) }));

    expect(result.verdict).not.toBe('NO_VERDICT');
    expect(result.flags.filter((f) => f.severity === 'blocker')).toHaveLength(0);
  });

  it('stamps the engine version and the comparables snapshot on every result', () => {
    // Without these two fields the appraisal is not reproducible, and a saved PDF cannot be
    // regenerated or defended later.
    const result = appraise(betaAppraisal());

    expect(result.engineVersion).toBe(ENGINE_VERSION);
    expect(result.comparablesSnapshotId).toBe('snap-test-0001');
  });

  it('is deterministic', () => {
    const a = appraise(betaAppraisal());
    const b = appraise(betaAppraisal());
    expect(JSON.stringify(a, replacer)).toBe(JSON.stringify(b, replacer));
  });
});

describe('costs and profit', () => {
  it('computes non-land cost from the stated rates', () => {
    const result = appraise(betaAppraisal({ units: betaUnits(185_000n) }));

    // Construction: 198,000 GFA × AED 650 = AED 128,700,000
    expect(toAed(result.outputs.constructionCost)).toBe(128_700_000);

    const step = result.trace.find((s) => s.id === 'cost.non_land')!;
    // Fees 7% and contingency 5% of construction; marketing 3% of GDV; plus AED 12m fixed.
    expect(step.inputs['professionalFees']).toBe(Number(aed(9_009_000)));
    expect(step.inputs['contingency']).toBe(Number(aed(6_435_000)));
  });

  it('nets profit against land cost plus DLD duty', () => {
    const result = appraise(betaAppraisal({ units: betaUnits(185_000n) }));
    const step = result.trace.find((s) => s.id === 'profit.net')!;

    // 4% duty on AED 83,000,000 = AED 3,320,000
    expect(step.inputs['dldDuty']).toBe(Number(aed(3_320_000)));
    expect(result.outputs.netProfit).toBe(
      result.outputs.grossDevelopmentValue - result.outputs.totalDevelopmentCost,
    );
  });

  it('omits profit when no land cost is supplied, but still solves residual land value', () => {
    const input = betaAppraisal({ units: betaUnits(185_000n) });
    const { landCost: _omitted, ...plotWithoutLand } = input.plot;
    const result = appraise({ ...input, plot: plotWithoutLand });

    expect(result.outputs.netProfit).toBeNull();
    expect(result.outputs.profitOnCost).toBeNull();
    expect(result.outputs.residualLandValue).toBeGreaterThan(0n);
  });
});

describe('residual land value', () => {
  it('is the land price at which the target profit is exactly met', () => {
    // Round-trip check: feed the residual back in as the land cost, and profit on cost should
    // land on the target. This is the property that makes the figure defensible.
    const input = betaAppraisal({ units: betaUnits(185_000n) });
    const first = appraise(input);

    const roundTrip = appraise({
      ...input,
      plot: { ...input.plot, landCost: first.outputs.residualLandValue },
    });

    expect(roundTrip.outputs.profitOnCost).toBeCloseTo(input.targetProfitOnCost, 6);
  });
});

describe('scenarios', () => {
  it('runs every scenario and reports each margin', () => {
    const result = appraise(betaAppraisal({ units: betaUnits(185_000n) }));

    expect(result.outputs.scenarios.map((s) => s.name)).toEqual(['Base', 'Downside', 'Upside']);
    const base = result.outputs.scenarios.find((s) => s.name === 'Base')!;
    expect(base.profitOnCost).toBeCloseTo(result.outputs.profitOnCost!, 9);
  });

  it('shows the downside below the base case', () => {
    const result = appraise(betaAppraisal({ units: betaUnits(185_000n) }));
    const base = result.outputs.scenarios.find((s) => s.name === 'Base')!;
    const down = result.outputs.scenarios.find((s) => s.name === 'Downside')!;

    expect(down.profitOnCost!).toBeLessThan(base.profitOnCost!);
  });
});

describe('area reconciliation', () => {
  it('flags a unit mix that does not add up to the stated saleable area', () => {
    const input = betaAppraisal({ units: betaUnits(185_000n) });
    const result = appraise({
      ...input,
      plot: { ...input.plot, saleableAreaSqft: 120_000 },
    });

    const flag = result.flags.find((f) => f.code === 'AREA_RECONCILIATION_FAILED');
    expect(flag).toBeDefined();
    expect(flag!.message).toContain('158,370');
  });

  it('stays quiet within a 1% tolerance', () => {
    const result = appraise(betaAppraisal({ units: betaUnits(185_000n) }));
    expect(result.flags.filter((f) => f.code === 'AREA_RECONCILIATION_FAILED')).toHaveLength(0);
  });
});

describe('trace completeness', () => {
  it('derives every headline output', () => {
    const result = appraise(betaAppraisal({ units: betaUnits(185_000n) }));
    const ids = result.trace.map((s) => s.id);

    expect(ids).toEqual(
      expect.arrayContaining([
        'gdv.total',
        'gdv.blended_psf',
        'cost.non_land',
        'land.residual',
        'profit.net',
        'scenarios',
        'verdict',
      ]),
    );
  });

  it('states the residual land value caveat rather than hiding it', () => {
    const result = appraise(betaAppraisal({ units: betaUnits(185_000n) }));
    const step = result.trace.find((s) => s.id === 'land.residual')!;

    expect(String(step.inputs['caveat'])).toContain('collection-curve');
  });
});

function replacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}
