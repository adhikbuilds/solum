/**
 * What would make this deal work.
 *
 * Al Mizan, 2026-08-07, item 4: *"Do not just stop at 'this does not work'. Explain what would need
 * to change."* A bare verdict makes the tool an obstacle; a verdict with a route makes it an
 * adviser, and the ingredients are already computed.
 *
 * Every remedy is a **single lever** with an exact figure, because a developer negotiating a land
 * price needs one number to take into the room, not a list of directions. Combinations are
 * deliberately not offered — they multiply and none of them is actionable.
 */
import { divByArea, mulByArea, ratio, type Fils, type FilsPerSqft } from './money.js';
import type { AppraisalInput, AppraisalResult, UnitType } from './types.js';

export type RemedyLever = 'land_price' | 'unit_price' | 'construction_cost' | 'target_return';

export interface Remedy {
  lever: RemedyLever;
  /** One sentence a developer could say out loud in a negotiation. */
  headline: string;
  /** What the figure has to move to, and from where. */
  detail: string;
  /** Present when the lever is a single value that can be typed back into the model. */
  target?: { field: string; value: number; unit: string };
  /** How plausible this is in practice, given what else the appraisal knows. */
  feasibility: 'available' | 'needs_negotiation' | 'unlikely';
}

/**
 * Reads the result rather than recomputing it, so remedies can never disagree with the verdict
 * shown beside them.
 */
export function suggestRemedies(input: AppraisalInput, result: AppraisalResult): Remedy[] {
  const remedies: Remedy[] = [];

  // ── Withheld because a unit type is priced above the comparables band ─────
  for (const flag of result.flags) {
    if (flag.code !== 'PRICE_ABOVE_OWN_COMPS') continue;

    const code = String(flag.evidence['unitCode']);
    const current = Number(flag.evidence['pricePsf']);
    const bandTop = Number(flag.evidence['compsHighPsf']);
    const share = Number(flag.evidence['areaShare']);
    const unit = input.units.find((u) => u.code === code);
    if (!unit) continue;

    const reblended = blendedWith(input.units, code, BigInt(bandTop));

    remedies.push({
      lever: 'unit_price',
      headline:
        `Reprice ${unit.label} to AED ${fmt(bandTop)}/sqft to bring it inside the comparables band.`,
      detail:
        `It is at AED ${fmt(current)}/sqft, which is ${pct(current / bandTop - 1)} above the top of ` +
        `the band. It carries ${pct(share, 1)} of saleable area, so the blend moves from ` +
        `AED ${fmt(Number(result.outputs.blendedPricePsf ?? 0n))} to ` +
        `AED ${reblended === null ? '—' : fmt(Number(reblended))}/sqft. ` +
        `Alternatively, evidence the premium — better amenities, position or aspect — and the band ` +
        `stops being the right comparison.`,
      target: { field: `units.${code}.pricePsf`, value: bandTop / 100, unit: 'AED/sqft saleable' },
      feasibility: 'available',
    });
  }

  // ── Below the hurdle on a known land price ───────────────────────────────
  const { profitOnCost, residualLandValue } = result.outputs;
  const landCost = input.plot.landCost;

  if (profitOnCost !== null && landCost !== undefined && profitOnCost < input.passThreshold) {
    const gap = landCost - residualLandValue;

    if (gap > 0n) {
      const reduction = ratio(gap, landCost) ?? 0;
      remedies.push({
        lever: 'land_price',
        headline:
          `Negotiate the land to AED ${money(residualLandValue)} — ` +
          `${pct(reduction, 1)} below the asking price.`,
        detail:
          `At AED ${money(landCost)} the scheme returns ${pct(profitOnCost, 1)} on cost against a ` +
          `${pct(input.passThreshold, 0)} hurdle. AED ${money(residualLandValue)} is the price at ` +
          `which it returns exactly the hurdle, so it is the walk-away number: ` +
          `AED ${money(gap)} of headroom to find.`,
        target: {
          field: 'plot.landCost',
          value: Number(residualLandValue) / 100,
          unit: 'AED',
        },
        feasibility: reduction > 0.2 ? 'unlikely' : 'needs_negotiation',
      });
    }

    // Construction is the largest single cost line, so a percentage off it moves the most.
    const construction = result.outputs.constructionCost;
    const shortfall = mulByRateSafe(result.outputs.totalDevelopmentCost, input.passThreshold - profitOnCost);
    if (construction > 0n && shortfall > 0n) {
      const cut = ratio(shortfall, construction) ?? 0;
      if (cut < 0.35) {
        remedies.push({
          lever: 'construction_cost',
          headline: `Or take ${pct(cut, 1)} out of construction — about AED ${money(shortfall)}.`,
          detail:
            `Construction is AED ${money(construction)}, the largest line in the appraisal. ` +
            `A ${pct(cut, 1)} reduction closes the gap to the hurdle on its own. Worth testing ` +
            `against specification and against the BUA factor before assuming it is available.`,
          feasibility: cut > 0.1 ? 'unlikely' : 'needs_negotiation',
        });
      }
    }
  }

  // ── Base case clears but a scenario runs at a loss ───────────────────────
  const losing = result.outputs.scenarios.filter(
    (s) => s.profitOnCost !== null && s.profitOnCost < 0,
  );
  if (losing.length > 0 && profitOnCost !== null && profitOnCost >= input.marginalThreshold) {
    remedies.push({
      lever: 'target_return',
      headline:
        `The base case holds, but ${losing.map((s) => s.name).join(' and ')} ` +
        `${losing.length === 1 ? 'runs' : 'run'} at a loss. Buy cheaper or stress less.`,
      detail:
        `Losing scenarios: ` +
        losing.map((s) => `${s.name} at ${pct(s.profitOnCost!, 1)}`).join(', ') +
        `. This is a risk-appetite decision rather than an arithmetic one — either acquire with ` +
        `enough margin that the downside still clears, or agree the stress test is harsher than ` +
        `the market warrants. The model cannot make that call.`,
      feasibility: 'needs_negotiation',
    });
  }

  return remedies;
}

/** Re-blend the mix with one unit type at a different price. */
function blendedWith(
  units: readonly UnitType[],
  code: string,
  newPsf: FilsPerSqft,
): FilsPerSqft | null {
  const active = units.filter((u) => u.enabled);
  let revenue = 0n;
  let area = 0;
  for (const u of active) {
    const a = u.unitCount * u.avgAreaSqft;
    revenue += mulByArea(u.code === code ? newPsf : u.pricePsf, a);
    area += a;
  }
  return divByArea(revenue, area);
}

function mulByRateSafe(amount: Fils, rate: number): Fils {
  if (!Number.isFinite(rate) || rate <= 0) return 0n;
  return BigInt(Math.round(Number(amount) * rate));
}

function fmt(fils: number): string {
  return (fils / 100).toLocaleString('en-GB', { maximumFractionDigits: 0 });
}

function money(fils: Fils): string {
  return (Number(fils) / 100).toLocaleString('en-GB', { maximumFractionDigits: 0 });
}

function pct(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)}%`;
}
