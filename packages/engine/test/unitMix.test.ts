import { describe, expect, it } from 'vitest';
import { computeUnitMix } from '../src/unitMix.js';
import { Trace } from '../src/trace.js';
import { BETA_COMPS, betaUnits } from './fixtures.js';

describe('blended price per sqft', () => {
  it('reproduces the beta figure of AED 1,890/sqft', () => {
    // Hand-computed:
    //   1BR 79,392 × 2,000 = 158,784,000
    //   2BR 46,470 × 1,800 =  83,646,000
    //   3BR 32,508 × 1,750 =  56,889,000
    //   total revenue       = 299,319,000 over 158,370 sqft = 1,889.998/sqft → 1,890 to the fil
    const result = computeUnitMix(betaUnits(), BETA_COMPS, new Trace());

    expect(result.saleableAreaSqft).toBe(158_370);
    expect(result.grossDevelopmentValue).toBe(29_931_900_000n); // AED 299,319,000 in fils
    expect(result.blendedPricePsf).toBe(189_000n); // AED 1,890.00
  });

  it('excludes disabled unit types from the blend', () => {
    const withStudio = betaUnits().map((u) =>
      u.code === 'STUDIO' ? { ...u, enabled: true } : u,
    );
    const result = computeUnitMix(withStudio, BETA_COMPS, new Trace());

    // Studio adds 40 × 480 = 19,200 sqft at AED 1,675, pulling the blend down.
    expect(result.saleableAreaSqft).toBe(177_570);
    expect(result.blendedPricePsf!).toBeLessThan(189_000n);
  });

  it('confirms repricing 1BR to AED 1,850 brings the blend to AED 1,814.80', () => {
    // The claim carried over from the earlier analysis was "approximately 1,815". This is where
    // that gets confirmed rather than assumed.
    const result = computeUnitMix(betaUnits(185_000n), BETA_COMPS, new Trace());
    expect(result.blendedPricePsf).toBe(181_480n); // AED 1,814.80
  });
});

describe('PRICE_ABOVE_OWN_COMPS', () => {
  it('blocks when a unit type above the comps band carries material area', () => {
    const result = computeUnitMix(betaUnits(), BETA_COMPS, new Trace());
    const flag = result.flags.find((f) => f.code === 'PRICE_ABOVE_OWN_COMPS');

    expect(flag).toBeDefined();
    expect(flag!.severity).toBe('blocker');
    expect(flag!.evidence['unitCode']).toBe('1BR');
    expect(flag!.evidence['pricePsf']).toBe(200_000);
    expect(flag!.evidence['compsHighPsf']).toBe(191_000);
    // 79,392 / 158,370 = 50.1% of saleable area riding on one field.
    expect(flag!.evidence['areaShare']).toBeCloseTo(0.5013, 4);
  });

  it('warns rather than blocks when the offending type is immaterial', () => {
    // Same overpricing, but on 3BR, which carries 20.5% of area — below the 25% threshold.
    const units = betaUnits(180_000n).map((u) =>
      u.code === '3BR' ? { ...u, pricePsf: 200_000n } : u,
    );
    const result = computeUnitMix(units, BETA_COMPS, new Trace());
    const flag = result.flags.find((f) => f.code === 'PRICE_ABOVE_OWN_COMPS');

    expect(flag).toBeDefined();
    expect(flag!.severity).toBe('warn');
    expect(flag!.evidence['unitCode']).toBe('3BR');
  });

  it('stays silent when every type sits inside the band', () => {
    const result = computeUnitMix(betaUnits(185_000n), BETA_COMPS, new Trace());
    expect(result.flags.filter((f) => f.code === 'PRICE_ABOVE_OWN_COMPS')).toHaveLength(0);
  });

  it('names the offending price, the band and the date in the message', () => {
    const result = computeUnitMix(betaUnits(), BETA_COMPS, new Trace());
    const flag = result.flags.find((f) => f.code === 'PRICE_ABOVE_OWN_COMPS')!;

    expect(flag.message).toContain('2,000');
    expect(flag.message).toContain('1,910');
    expect(flag.message).toContain('2026-07-12');
    expect(flag.message).toContain('50.1%');
  });
});

describe('comparables quality', () => {
  it('warns when the sample is too thin to support a conclusion', () => {
    // Three marketing brochures is what the beta displayed. It is not a band.
    const thin = { ...BETA_COMPS, sampleSize: 3 };
    const result = computeUnitMix(betaUnits(185_000n), thin, new Trace());

    const flag = result.flags.find((f) => f.code === 'COMPS_SAMPLE_TOO_SMALL');
    expect(flag).toBeDefined();
    expect(flag!.severity).toBe('warn');
    expect(flag!.evidence['sampleSize']).toBe(3);
  });
});

describe('trace', () => {
  it('records the derivation of the blended price', () => {
    const trace = new Trace();
    computeUnitMix(betaUnits(), BETA_COMPS, trace);

    const step = trace.find('gdv.blended_psf');
    expect(step).toBeDefined();
    expect(step!.rule).toBe('Σ(area_i × psf_i) / Σ(area_i)');
    expect(step!.inputs['totalAreaSqft']).toBe(158_370);
    expect(step!.inputs['compsSampleSize']).toBe(41);
    expect(step!.output).toBe(189_000);
  });
});
