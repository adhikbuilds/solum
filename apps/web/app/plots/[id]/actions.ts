'use server';

import { createHash } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { withTenant, canWrite } from '@solum/db';
import { appraise, type AppraisalInput } from '@solum/engine';
import { requireUser } from '@/lib/session';
import { getAppraisal } from '@/lib/queries';

export interface RerunState {
  error?: string;
  ok?: string;
}

/**
 * Change assumptions and recompute.
 *
 * The immutable schema is what makes this safe: editing never overwrites. A re-run writes a new
 * appraisal (linked to the one it supersedes), a new assumption set, and a new result. The previous
 * numbers stay exactly as they were, so a figure someone already acted on can always be
 * reconstructed — which is the whole reason the tables are shaped this way.
 */
export async function rerun(_prev: RerunState, formData: FormData): Promise<RerunState> {
  const user = await requireUser();
  if (!canWrite(user.role)) {
    return { error: `Your role (${user.role}) can read appraisals but not re-run them.` };
  }

  const plotId = String(formData.get('plotId') ?? '');
  if (!plotId) return { error: 'No plot specified.' };

  const current = await getAppraisal(user.organisationId, plotId);
  if (!current) return { error: 'That plot is not in your organisation.' };

  const input = revive(current.inputs) as AppraisalInput;

  // Each lever is optional: an empty field means "leave this alone", not "set it to zero".
  const landAed = numberField(formData, 'landCostAed');
  const constructionPsf = numberField(formData, 'constructionPsf');
  const hurdle = numberField(formData, 'hurdlePct');
  const downsidePrice = numberField(formData, 'downsidePricePct');

  const next: AppraisalInput = {
    ...input,
    plot: { ...input.plot },
    units: input.units.map((u) => ({ ...u })),
    costs: { ...input.costs },
    scenarios: input.scenarios.map((s) => ({ ...s })),
  };

  if (landAed !== null) {
    if (landAed <= 0) return { error: 'Land price must be greater than zero.' };
    next.plot.landCost = BigInt(Math.round(landAed * 100));
  }

  if (constructionPsf !== null) {
    if (constructionPsf <= 0) return { error: 'Construction cost must be greater than zero.' };
    next.costs.constructionPsf = BigInt(Math.round(constructionPsf * 100));
  }

  if (hurdle !== null) {
    if (hurdle < 0 || hurdle > 100) return { error: 'Hurdle must be between 0 and 100 percent.' };
    // Target return and pass threshold are the same decision expressed twice; keep them in step or
    // residual land value stops meaning "the price at which we clear the hurdle".
    next.targetProfitOnCost = hurdle / 100;
    next.passThreshold = hurdle / 100;
  }

  if (downsidePrice !== null) {
    if (downsidePrice < 0 || downsidePrice > 90) {
      return { error: 'Downside price fall must be between 0 and 90 percent.' };
    }
    next.scenarios = next.scenarios.map((s) =>
      s.name === 'Downside' ? { ...s, salePriceDelta: -(downsidePrice / 100) } : s,
    );
  }

  // Per-unit-type prices, named `price_<CODE>` in the form.
  for (const unit of next.units) {
    const psf = numberField(formData, `price_${unit.code}`);
    if (psf === null) continue;
    if (psf <= 0) return { error: `${unit.label} price must be greater than zero.` };
    unit.pricePsf = BigInt(Math.round(psf * 100));
  }

  const result = appraise(next);
  const serialised = stableStringify(next);
  const note = String(formData.get('note') ?? '').trim() || null;

  await withTenant(user.organisationId, async (client) => {
    // Same pinned comparables snapshot: this is a re-run of the same view of the market, not a
    // refresh of it. Changing both at once would make it impossible to say which moved the answer.
    const appraisalRows = await client.query<{ id: string }>(
      `INSERT INTO appraisals
         (organisation_id, plot_id, comparable_snapshot_id, label, status, created_by,
          supersedes, note)
       VALUES ($1, $2, $3, $4, 'computed', $5, $6, $7)
       RETURNING id`,
      [
        user.organisationId,
        plotId,
        current.comparables.snapshotId,
        'Re-run',
        user.userId,
        current.appraisalId,
        note,
      ],
    );
    const appraisalId = appraisalRows.rows[0]!.id;

    const setRows = await client.query<{ id: string }>(
      `INSERT INTO assumption_sets
         (organisation_id, appraisal_id, inputs, input_hash, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [
        user.organisationId,
        appraisalId,
        serialised,
        createHash('sha256').update(serialised).digest('hex').slice(0, 32),
        user.userId,
      ],
    );

    await client.query(
      `INSERT INTO results
         (organisation_id, assumption_set_id, engine_version, verdict, verdict_reason,
          outputs, trace, flags)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        user.organisationId,
        setRows.rows[0]!.id,
        result.engineVersion,
        result.verdict,
        result.verdictReason,
        stableStringify(result.outputs),
        JSON.stringify(result.trace),
        JSON.stringify(result.flags),
      ],
    );
  });

  revalidatePath(`/plots/${plotId}`);
  revalidatePath('/');

  return { ok: `Recomputed — ${VERDICT_WORD[result.verdict] ?? result.verdict}.` };
}

const VERDICT_WORD: Record<string, string> = {
  PASS: 'endorsed',
  MARGINAL: 'held, with conditions',
  FAIL: 'declined',
  NO_VERDICT: 'withheld, inputs still disagree',
};

/** Empty string means untouched. Only a parseable number counts as a change. */
function numberField(form: FormData, name: string): number | null {
  const raw = form.get(name);
  if (raw === null) return null;
  const text = String(raw).trim().replace(/,/g, '');
  if (text === '') return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

function revive(value: unknown): unknown {
  if (typeof value === 'string' && /^-?\d+n$/.test(value)) return BigInt(value.slice(0, -1));
  if (Array.isArray(value)) return value.map(revive);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, revive(v)]));
  }
  return value;
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
