import { withTenant, withAdmin } from '@solum/db';

/**
 * Every read goes through `withTenant`, which sets the organisation context inside a transaction
 * so Postgres row-level security does the filtering. No query here carries a `WHERE
 * organisation_id = …` clause, and that is deliberate: authorisation the application has to
 * remember to apply is authorisation that gets forgotten.
 */

export interface PipelineRow {
  plotId: string;
  name: string;
  dldPlotNumber: string | null;
  community: string | null;
  landAreaSqft: string;
  landCostFils: string | null;
  verdict: 'PASS' | 'MARGINAL' | 'FAIL' | 'NO_VERDICT';
  residualLandValueFils: number | null;
  profitOnCost: number | null;
  engineVersion: string;
  blockerCount: number;
}

export interface AppraisalDetail extends PipelineRow {
  far: string | null;
  gfaSqft: string | null;
  saleableAreaSqft: string | null;
  appraisalId: string;
  verdictReason: string;
  outputs: Record<string, unknown>;
  trace: TraceStep[];
  flags: FlagRow[];
  inputs: Record<string, unknown>;
  comparables: {
    asOf: string;
    method: string;
    lowPsfFils: string;
    medianPsfFils: string;
    highPsfFils: string;
    sampleSize: number;
    source: string;
    segment: string | null;
  };
  unitBands: {
    unitType: string;
    pricePsfFils: string;
    medianArea: string | null;
    sampleN: number;
  }[];
}

export interface TraceStep {
  id: string;
  label: string;
  rule: string;
  inputs: Record<string, unknown>;
  output: unknown;
}

export interface FlagRow {
  code: string;
  severity: 'info' | 'warn' | 'blocker';
  message: string;
  evidence: Record<string, unknown>;
}

/** The demo organisation. Real auth replaces this; the query shape does not change. */
export async function resolveOrganisation(): Promise<{ id: string; name: string } | null> {
  return withAdmin(async (client) => {
    const { rows } = await client.query<{ id: string; name: string }>(
      'SELECT id, name FROM organisations ORDER BY created_at LIMIT 1',
    );
    return rows[0] ?? null;
  });
}

export async function listPipeline(organisationId: string): Promise<PipelineRow[]> {
  return withTenant(organisationId, async (client) => {
    // Latest result per plot. DISTINCT ON is the cheapest correct way to say "most recent".
    const { rows } = await client.query(
      `SELECT DISTINCT ON (p.id)
              p.id                AS plot_id,
              p.name,
              p.dld_plot_number,
              c.name              AS community,
              p.land_area_sqft,
              p.land_cost_fils,
              r.verdict,
              r.engine_version,
              r.outputs,
              r.flags
       FROM plots p
       LEFT JOIN communities c   ON c.id = p.community_id
       JOIN appraisals a         ON a.plot_id = p.id
       JOIN assumption_sets s    ON s.appraisal_id = a.id
       JOIN results r            ON r.assumption_set_id = s.id
       ORDER BY p.id, r.computed_at DESC`,
    );

    return rows.map((r) => {
      const outputs = r.outputs as Record<string, unknown>;
      const flags = (r.flags as FlagRow[]) ?? [];
      return {
        plotId: r.plot_id,
        name: r.name,
        dldPlotNumber: r.dld_plot_number,
        community: r.community,
        landAreaSqft: r.land_area_sqft,
        landCostFils: r.land_cost_fils,
        verdict: r.verdict,
        residualLandValueFils: numeric(outputs['residualLandValue']),
        profitOnCost: typeof outputs['profitOnCost'] === 'number' ? outputs['profitOnCost'] : null,
        engineVersion: r.engine_version,
        blockerCount: flags.filter((f) => f.severity === 'blocker').length,
      } satisfies PipelineRow;
    });
  });
}

export async function getAppraisal(
  organisationId: string,
  plotId: string,
): Promise<AppraisalDetail | null> {
  return withTenant(organisationId, async (client) => {
    const { rows } = await client.query(
      `SELECT p.id AS plot_id, p.name, p.dld_plot_number, p.land_area_sqft, p.far,
              p.gfa_sqft, p.saleable_area_sqft, p.land_cost_fils,
              c.name AS community,
              a.id AS appraisal_id,
              s.inputs,
              r.verdict, r.verdict_reason, r.outputs, r.trace, r.flags, r.engine_version,
              cs.as_of, cs.method, cs.low_psf_fils, cs.median_psf_fils, cs.high_psf_fils,
              cs.sample_size, cs.source, cs.segment
       FROM plots p
       LEFT JOIN communities c        ON c.id = p.community_id
       JOIN appraisals a              ON a.plot_id = p.id
       JOIN comparable_snapshots cs   ON cs.id = a.comparable_snapshot_id
       JOIN assumption_sets s         ON s.appraisal_id = a.id
       JOIN results r                 ON r.assumption_set_id = s.id
       WHERE p.id = $1
       ORDER BY r.computed_at DESC
       LIMIT 1`,
      [plotId],
    );

    const row = rows[0];
    if (!row) return null;

    const bands = await client.query(
      `SELECT b.unit_type, b.price_psf_fils, b.median_area, b.sample_n
       FROM snapshot_unit_bands b
       JOIN appraisals a ON a.comparable_snapshot_id = b.snapshot_id
       WHERE a.id = $1
       ORDER BY b.unit_type`,
      [row.appraisal_id],
    );

    const outputs = row.outputs as Record<string, unknown>;
    const flags = (row.flags as FlagRow[]) ?? [];

    return {
      plotId: row.plot_id,
      name: row.name,
      dldPlotNumber: row.dld_plot_number,
      community: row.community,
      landAreaSqft: row.land_area_sqft,
      landCostFils: row.land_cost_fils,
      far: row.far,
      gfaSqft: row.gfa_sqft,
      saleableAreaSqft: row.saleable_area_sqft,
      appraisalId: row.appraisal_id,
      verdict: row.verdict,
      verdictReason: row.verdict_reason,
      outputs,
      trace: (row.trace as TraceStep[]) ?? [],
      flags,
      inputs: row.inputs as Record<string, unknown>,
      engineVersion: row.engine_version,
      residualLandValueFils: numeric(outputs['residualLandValue']),
      profitOnCost: typeof outputs['profitOnCost'] === 'number' ? outputs['profitOnCost'] : null,
      blockerCount: flags.filter((f) => f.severity === 'blocker').length,
      comparables: {
        asOf: toIsoDate(row.as_of),
        method: row.method,
        lowPsfFils: row.low_psf_fils,
        medianPsfFils: row.median_psf_fils,
        highPsfFils: row.high_psf_fils,
        sampleSize: row.sample_size,
        source: row.source,
        segment: row.segment,
      },
      unitBands: bands.rows.map((b) => ({
        unitType: b.unit_type,
        pricePsfFils: b.price_psf_fils,
        medianArea: b.median_area,
        sampleN: b.sample_n,
      })),
    };
  });
}

/** Engine outputs are serialised with bigints as "1234n". Recover a number for display. */
function numeric(value: unknown): number | null {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value.endsWith('n') ? value.slice(0, -1) : value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toIsoDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}
