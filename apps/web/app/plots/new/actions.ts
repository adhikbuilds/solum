'use server';

import { createHash } from 'node:crypto';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { withTenant, canWrite } from '@solum/db';
import {
  appraise,
  DUBAI_DEFAULT_COSTS,
  DUBAI_DEFAULT_UNIT_TYPES,
  BASE_EFFICIENCY,
  BUA_FACTOR,
  type AppraisalInput,
  type UnitType,
} from '@solum/engine';
import { requireUser } from '@/lib/session';

export interface NewPlotState {
  error?: string;
}

/**
 * Create a plot and appraise it in one step.
 *
 * A plot with no appraisal is a row nobody can act on, so the two are created together. The
 * assumptions come from the Dubai defaults rather than an empty form — Al Mizan's point was that
 * developers do not always know the answers up front and the tool should lead. Every default is
 * visible and editable on the sheet afterwards.
 */
export async function createPlot(
  _prev: NewPlotState,
  formData: FormData,
): Promise<NewPlotState> {
  const user = await requireUser();
  if (!canWrite(user.role)) {
    return { error: `Your role (${user.role}) can read plots but not create them.` };
  }

  const name = String(formData.get('name') ?? '').trim();
  const communityId = String(formData.get('communityId') ?? '');
  const plotNumber = String(formData.get('plotNumber') ?? '').trim() || null;

  const plotArea = num(formData, 'plotAreaSqft');
  const far = num(formData, 'far');
  const landAed = num(formData, 'landCostAed');
  const unitCount = num(formData, 'unitCount');

  if (!name) return { error: 'Give the plot a name you will recognise in the pipeline.' };
  if (!communityId) return { error: 'Choose a community — comparables are held per community.' };
  if (plotArea === null || plotArea <= 0) return { error: 'Plot area must be greater than zero.' };
  if (far === null || far <= 0) return { error: 'FAR must be greater than zero.' };
  if (landAed === null || landAed <= 0) return { error: 'Land price must be greater than zero.' };
  if (unitCount === null || unitCount < 4) {
    return { error: 'Enter a total unit count of at least 4 so the mix can be split.' };
  }

  // GFA follows from plot area and FAR; BUA and saleable follow from GFA. Deriving them rather than
  // asking is the point — Al Mizan flagged that agent-supplied GFA is often wrong, so a figure the
  // tool computed from two inputs it was given is more defensible than one it was handed.
  const gfa = plotArea * far;
  const saleable = gfa * BUA_FACTOR * BASE_EFFICIENCY;

  // Split the unit count across the default mix using the midpoint of each type's band.
  const weights = DUBAI_DEFAULT_UNIT_TYPES.map((t) => (t.minShare + t.maxShare) / 2);
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const counts = weights.map((w) => Math.max(1, Math.round((unitCount * w) / weightSum)));

  const units: UnitType[] = DUBAI_DEFAULT_UNIT_TYPES.map((t, i) => ({
    code: t.code,
    label: t.label,
    enabled: true,
    unitCount: counts[i] ?? 1,
    avgAreaSqft: t.avgAreaSqft,
    pricePsf: t.pricePsf,
    bays: t.bays,
  }));

  // Scale average areas so the mix reconciles to derived saleable area, rather than shipping an
  // appraisal that immediately flags AREA_RECONCILIATION_FAILED against its own plot.
  const mixArea = units.reduce((total, u) => total + u.unitCount * u.avgAreaSqft, 0);
  if (mixArea > 0) {
    const scale = saleable / mixArea;
    for (const u of units) u.avgAreaSqft = Math.round(u.avgAreaSqft * scale);
  }

  let plotId = '';

  try {
    await withTenant(user.organisationId, async (client) => {
      const workspace = await client.query<{ id: string }>(
        `SELECT id FROM workspaces ORDER BY created_at LIMIT 1`,
      );
      const workspaceId = workspace.rows[0]?.id;
      if (!workspaceId) throw new Error('This organisation has no workspace yet.');

      const snapshot = await client.query<{ id: string }>(
        `SELECT id FROM comparable_snapshots WHERE community_id = $1
         ORDER BY as_of DESC LIMIT 1`,
        [communityId],
      );
      const snapshotId = snapshot.rows[0]?.id;
      if (!snapshotId) {
        throw new Error('That community has no comparables snapshot, so nothing can be appraised.');
      }

      const plot = await client.query<{ id: string }>(
        `INSERT INTO plots
           (organisation_id, workspace_id, community_id, name, dld_plot_number,
            land_area_sqft, far, gfa_sqft, saleable_area_sqft, land_cost_fils, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [
          user.organisationId, workspaceId, communityId, name, plotNumber,
          plotArea, far, gfa, saleable, BigInt(Math.round(landAed * 100)).toString(), user.userId,
        ],
      );
      plotId = plot.rows[0]!.id;

      const band = await client.query(
        `SELECT s.as_of, s.low_psf_fils, s.median_psf_fils, s.high_psf_fils, s.sample_size,
                c.name AS community
         FROM comparable_snapshots s JOIN communities c ON c.id = s.community_id
         WHERE s.id = $1`,
        [snapshotId],
      );
      const b = band.rows[0]!;

      const input: AppraisalInput = {
        plot: {
          plotId,
          community: b.community,
          landAreaSqft: plotArea,
          gfaSqft: gfa,
          saleableAreaSqft: saleable,
          landCost: BigInt(Math.round(landAed * 100)),
        },
        units,
        costs: { ...DUBAI_DEFAULT_COSTS },
        comparables: {
          snapshotId,
          asOf: new Date(b.as_of).toISOString().slice(0, 10),
          community: b.community,
          lowPsf: BigInt(b.low_psf_fils),
          medianPsf: BigInt(b.median_psf_fils),
          highPsf: BigInt(b.high_psf_fils),
          sampleSize: b.sample_size,
        },
        scenarios: [
          { name: 'Base', salePriceDelta: 0, constructionCostDelta: 0 },
          { name: 'Downside', salePriceDelta: -0.1, constructionCostDelta: 0.1 },
          { name: 'Upside', salePriceDelta: 0.08, constructionCostDelta: -0.03 },
        ],
        targetProfitOnCost: 0.2,
        passThreshold: 0.2,
        marginalThreshold: 0.12,
      };

      const result = appraise(input);
      const serialised = stableStringify(input);

      const appraisal = await client.query<{ id: string }>(
        `INSERT INTO appraisals
           (organisation_id, plot_id, comparable_snapshot_id, label, status, created_by, note)
         VALUES ($1,$2,$3,'First underwrite','computed',$4,$5) RETURNING id`,
        [user.organisationId, plotId, snapshotId, user.userId, 'Created from Dubai defaults'],
      );
      const set = await client.query<{ id: string }>(
        `INSERT INTO assumption_sets
           (organisation_id, appraisal_id, inputs, input_hash, created_by)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [
          user.organisationId, appraisal.rows[0]!.id, serialised,
          createHash('sha256').update(serialised).digest('hex').slice(0, 32), user.userId,
        ],
      );
      await client.query(
        `INSERT INTO results
           (organisation_id, assumption_set_id, engine_version, verdict, verdict_reason,
            outputs, trace, flags)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          user.organisationId, set.rows[0]!.id, result.engineVersion, result.verdict,
          result.verdictReason, stableStringify(result.outputs),
          JSON.stringify(result.trace), JSON.stringify(result.flags),
        ],
      );
    });
  } catch (error) {
    return { error: (error as Error).message };
  }

  revalidatePath('/');
  redirect(`/plots/${plotId}`);
}

function num(form: FormData, name: string): number | null {
  const raw = form.get(name);
  if (raw === null) return null;
  const text = String(raw).trim().replace(/,/g, '');
  if (text === '') return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    typeof v === 'bigint'
      ? `${v}n`
      : v instanceof Object && !Array.isArray(v)
        ? Object.fromEntries(Object.entries(v as object).sort(([a], [b]) => a.localeCompare(b)))
        : v,
  );
}
