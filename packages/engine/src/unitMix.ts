import { mulByArea, divByArea, sum, type Fils, type FilsPerSqft } from './money.js';
import type { Flag } from './flags.js';
import type { Trace } from './trace.js';
import type { ComparablesBand, UnitType } from './types.js';

/**
 * Area share above which a single mispriced unit type blocks the verdict rather than warning.
 *
 * The reasoning: a type carrying a quarter of saleable area drags the blend far enough that the
 * headline number is wrong, not merely optimistic. In the beta, 1BR at 2,000/sqft sat above the
 * top of its own comparables band while carrying 50.1% of saleable area — one field determining
 * half the answer.
 */
const MATERIAL_AREA_SHARE = 0.25;

/** Below this many underlying transactions, a band cannot support a price conclusion. */
const MIN_COMPS_SAMPLE = 10;

export interface UnitMixResult {
  saleableAreaSqft: number;
  grossDevelopmentValue: Fils;
  blendedPricePsf: FilsPerSqft | null;
  flags: Flag[];
}

function areaOf(unit: UnitType): number {
  return unit.unitCount * unit.avgAreaSqft;
}

export function computeUnitMix(
  units: readonly UnitType[],
  comps: ComparablesBand,
  trace: Trace,
): UnitMixResult {
  const active = units.filter((u) => u.enabled);
  const totalArea = active.reduce((total, u) => total + areaOf(u), 0);
  const revenues = active.map((u) => mulByArea(u.pricePsf, areaOf(u)));
  const gdv = sum(revenues);
  const blended = divByArea(gdv, totalArea);

  trace.record({
    id: 'gdv.total',
    label: 'Gross development value',
    rule: 'Σ(area_i × psf_i)',
    inputs: {
      units: active.map((u, i) => ({
        code: u.code,
        areaSqft: areaOf(u),
        pricePsf: Number(u.pricePsf),
        revenue: Number(revenues[i] ?? 0n),
      })),
    },
    output: Number(gdv),
  });

  const priceFlags = checkPricesAgainstComps(active, totalArea, comps);

  trace.record({
    id: 'gdv.blended_psf',
    label: 'Blended average price per sqft',
    rule: 'Σ(area_i × psf_i) / Σ(area_i)',
    inputs: {
      totalRevenue: Number(gdv),
      totalAreaSqft: totalArea,
      compsBand: { low: Number(comps.lowPsf), high: Number(comps.highPsf) },
      compsAsOf: comps.asOf,
      compsSampleSize: comps.sampleSize,
    },
    output: blended === null ? null : Number(blended),
    flags: priceFlags,
  });

  return {
    saleableAreaSqft: totalArea,
    grossDevelopmentValue: gdv,
    blendedPricePsf: blended,
    flags: priceFlags,
  };
}

/**
 * The check the beta did not do.
 *
 * Nothing on the Unit Matrix screen referenced comparables, and nothing on the Market Insights
 * screen referenced what was actually priced. The contradiction was real but no code looked for it.
 */
function checkPricesAgainstComps(
  active: readonly UnitType[],
  totalArea: number,
  comps: ComparablesBand,
): Flag[] {
  const flags: Flag[] = [];

  if (comps.sampleSize < MIN_COMPS_SAMPLE) {
    flags.push({
      code: 'COMPS_SAMPLE_TOO_SMALL',
      severity: 'warn',
      message:
        `The comparables band for ${comps.community} rests on ${comps.sampleSize} transactions. ` +
        `That is too few to support a price conclusion — treat the band as indicative only.`,
      evidence: { sampleSize: comps.sampleSize, minimum: MIN_COMPS_SAMPLE, community: comps.community },
      stepId: 'gdv.blended_psf',
    });
  }

  for (const unit of active) {
    if (unit.pricePsf <= comps.highPsf) continue;

    const area = areaOf(unit);
    const areaShare = totalArea > 0 ? area / totalArea : 0;
    const material = areaShare >= MATERIAL_AREA_SHARE;
    const overBy = Number(unit.pricePsf - comps.highPsf) / Number(comps.highPsf);

    flags.push({
      code: 'PRICE_ABOVE_OWN_COMPS',
      severity: material ? 'blocker' : 'warn',
      message:
        `${unit.label} is priced at ${fmtPsf(unit.pricePsf)}/sqft, above the top of the ` +
        `comparables band for ${comps.community} (${fmtPsf(comps.lowPsf)}–${fmtPsf(comps.highPsf)}/sqft, ` +
        `as of ${comps.asOf}). It carries ${(areaShare * 100).toFixed(1)}% of saleable area` +
        (material
          ? `, so it determines the headline number. Reprice it or justify the premium before relying on this appraisal.`
          : `.`),
      evidence: {
        unitCode: unit.code,
        pricePsf: Number(unit.pricePsf),
        compsHighPsf: Number(comps.highPsf),
        compsLowPsf: Number(comps.lowPsf),
        aboveBandBy: overBy,
        areaSqft: area,
        totalAreaSqft: totalArea,
        areaShare,
        snapshotId: comps.snapshotId,
      },
      stepId: 'gdv.blended_psf',
    });
  }

  return flags;
}

function fmtPsf(psf: FilsPerSqft): string {
  return (Number(psf) / 100).toLocaleString('en-AE', { maximumFractionDigits: 0 });
}
