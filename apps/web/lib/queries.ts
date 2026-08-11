import { withTenant } from '@solum/db';

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
    snapshotId: string;
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

/**
 * Every run ever computed for this plot, newest first.
 *
 * This is what the immutable schema buys. The prototype stored a plot as one jsonb blob overwritten
 * in place, so "how did our view of this site change" was unanswerable. Here it is a query.
 */
export interface RunRow {
  appraisalId: string;
  label: string;
  note: string | null;
  verdict: string;
  computedAt: string;
  engineVersion: string;
  residualLandValueFils: number | null;
  landCostFils: number | null;
  profitOnCost: number | null;
}

export async function listRuns(organisationId: string, plotId: string): Promise<RunRow[]> {
  return withTenant(organisationId, async (client) => {
    const { rows } = await client.query(
      `SELECT a.id AS appraisal_id, a.label, a.note, r.verdict, r.computed_at,
              r.engine_version, r.outputs, s.inputs
       FROM appraisals a
       JOIN assumption_sets s ON s.appraisal_id = a.id
       JOIN results r         ON r.assumption_set_id = s.id
       WHERE a.plot_id = $1
       ORDER BY r.computed_at DESC`,
      [plotId],
    );

    return rows.map((r) => {
      const outputs = r.outputs as Record<string, unknown>;
      // Stored inputs encode bigints as "1234n"; Number() on that is NaN, which renders as an
      // em dash and silently hides the land price the run was computed against.
      const inputs = r.inputs as { plot?: { landCost?: unknown } };
      return {
        appraisalId: r.appraisal_id,
        label: r.label,
        note: r.note,
        verdict: r.verdict,
        computedAt: new Date(r.computed_at).toISOString(),
        engineVersion: r.engine_version,
        residualLandValueFils: numeric(outputs['residualLandValue']),
        landCostFils: numeric(inputs.plot?.landCost),
        profitOnCost: typeof outputs['profitOnCost'] === 'number' ? outputs['profitOnCost'] : null,
      } satisfies RunRow;
    });
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
              cs.id AS snapshot_id, cs.as_of, cs.method, cs.low_psf_fils, cs.median_psf_fils,
              cs.high_psf_fils, cs.sample_size, cs.source, cs.segment
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
        snapshotId: row.snapshot_id,
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

/* ── Portal surfaces ─────────────────────────────────────────────────────── */

export interface CommunityOption {
  id: string;
  name: string;
  transactionCount: number;
  latestSnapshotId: string | null;
  latestSnapshotAsOf: string | null;
}

/** Communities we hold market data for. A plot cannot be appraised without one. */
export async function listCommunities(organisationId: string): Promise<CommunityOption[]> {
  return withTenant(organisationId, async (client) => {
    const { rows } = await client.query(
      `SELECT c.id, c.name,
              (SELECT count(*) FROM dld_transactions t WHERE t.community_id = c.id) AS tx,
              s.id AS snapshot_id, s.as_of
       FROM communities c
       LEFT JOIN LATERAL (
         SELECT id, as_of FROM comparable_snapshots
         WHERE community_id = c.id ORDER BY as_of DESC LIMIT 1
       ) s ON true
       ORDER BY c.name`,
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      transactionCount: Number(r.tx),
      latestSnapshotId: r.snapshot_id,
      latestSnapshotAsOf: r.as_of ? new Date(r.as_of).toISOString().slice(0, 10) : null,
    }));
  });
}

export interface ComparePlot {
  plotId: string;
  name: string;
  dldPlotNumber: string | null;
  landAreaSqft: number;
  farValue: number | null;
  gfaSqft: number | null;
  saleableAreaSqft: number | null;
  landCostFils: number | null;
  verdict: string;
  verdictReason: string;
  residualLandValueFils: number | null;
  profitOnCost: number | null;
  gdvFils: number | null;
  totalCostFils: number | null;
  constructionFils: number | null;
  blendedPsfFils: number | null;
  blockerCount: number;
  scenarios: { name: string; profitOnCost: number | null }[];
}

export async function getComparison(
  organisationId: string,
  plotIds: string[],
): Promise<ComparePlot[]> {
  if (plotIds.length === 0) return [];
  return withTenant(organisationId, async (client) => {
    const { rows } = await client.query(
      `SELECT DISTINCT ON (p.id)
              p.id AS plot_id, p.name, p.dld_plot_number, p.land_area_sqft, p.far,
              p.gfa_sqft, p.saleable_area_sqft, p.land_cost_fils,
              r.verdict, r.verdict_reason, r.outputs, r.flags
       FROM plots p
       JOIN appraisals a      ON a.plot_id = p.id
       JOIN assumption_sets s ON s.appraisal_id = a.id
       JOIN results r         ON r.assumption_set_id = s.id
       WHERE p.id = ANY($1::uuid[])
       ORDER BY p.id, r.computed_at DESC`,
      [plotIds],
    );

    const byId = new Map(
      rows.map((r) => {
        const o = r.outputs as Record<string, unknown>;
        const flags = (r.flags as FlagRow[]) ?? [];
        const scen = (o['scenarios'] as { name: string; profitOnCost: number | null }[]) ?? [];
        return [
          r.plot_id as string,
          {
            plotId: r.plot_id,
            name: r.name,
            dldPlotNumber: r.dld_plot_number,
            landAreaSqft: Number(r.land_area_sqft),
            farValue: r.far === null ? null : Number(r.far),
            gfaSqft: r.gfa_sqft === null ? null : Number(r.gfa_sqft),
            saleableAreaSqft: r.saleable_area_sqft === null ? null : Number(r.saleable_area_sqft),
            landCostFils: numeric(r.land_cost_fils),
            verdict: r.verdict,
            verdictReason: r.verdict_reason,
            residualLandValueFils: numeric(o['residualLandValue']),
            profitOnCost: typeof o['profitOnCost'] === 'number' ? o['profitOnCost'] : null,
            gdvFils: numeric(o['grossDevelopmentValue']),
            totalCostFils: numeric(o['totalDevelopmentCost']),
            constructionFils: numeric(o['constructionCost']),
            blendedPsfFils: numeric(o['blendedPricePsf']),
            blockerCount: flags.filter((f) => f.severity === 'blocker').length,
            scenarios: scen.map((s) => ({ name: s.name, profitOnCost: s.profitOnCost })),
          } satisfies ComparePlot,
        ];
      }),
    );

    // Preserve the order the user selected them in, not the database's.
    return plotIds.map((id) => byId.get(id)).filter((p): p is ComparePlot => Boolean(p));
  });
}

export interface MarketMonth {
  month: string;
  medianPsfFils: number;
  volume: number;
  offPlanShare: number;
}

export interface MarketView {
  community: string;
  asOf: string;
  method: string;
  bandLow: number;
  bandMedian: number;
  bandHigh: number;
  sampleSize: number;
  source: string;
  totalTransactions: number;
  months: MarketMonth[];
  unitBands: { unitType: string; pricePsfFils: number; medianArea: number; sampleN: number }[];
  launches: {
    projectName: string;
    pricePsfFils: number;
    pctSold: number | null;
    completion: string | null;
    source: string;
  }[];
}

export async function getMarket(
  organisationId: string,
  communityId?: string,
): Promise<MarketView | null> {
  return withTenant(organisationId, async (client) => {
    const snap = await client.query(
      `SELECT s.id, s.as_of, s.method, s.low_psf_fils, s.median_psf_fils, s.high_psf_fils,
              s.sample_size, s.source, s.community_id, c.name
       FROM comparable_snapshots s JOIN communities c ON c.id = s.community_id
       ${communityId ? 'WHERE s.community_id = $1' : ''}
       ORDER BY s.as_of DESC LIMIT 1`,
      communityId ? [communityId] : [],
    );
    const s = snap.rows[0];
    if (!s) return null;

    // Monthly median rather than mean: a single large penthouse should not move the line.
    const months = await client.query(
      `SELECT to_char(date_trunc('month', transaction_date), 'YYYY-MM') AS month,
              percentile_disc(0.5) WITHIN GROUP (ORDER BY price_psf_fils) AS median_psf,
              count(*) AS volume,
              avg(CASE WHEN is_off_plan THEN 1.0 ELSE 0.0 END) AS off_plan_share
       FROM dld_transactions
       WHERE community_id = $1
       GROUP BY 1 ORDER BY 1`,
      [s.community_id],
    );

    const bands = await client.query(
      `SELECT unit_type, price_psf_fils, median_area, sample_n
       FROM snapshot_unit_bands WHERE snapshot_id = $1 ORDER BY unit_type`,
      [s.id],
    );

    const launches = await client.query(
      `SELECT project_name, price_psf_fils, pct_sold, completion, source
       FROM comparable_launches WHERE community_id = $1 ORDER BY price_psf_fils DESC`,
      [s.community_id],
    );

    const total = await client.query(
      `SELECT count(*) AS n FROM dld_transactions WHERE community_id = $1`,
      [s.community_id],
    );

    return {
      community: s.name,
      asOf: new Date(s.as_of).toISOString().slice(0, 10),
      method: s.method,
      bandLow: Number(s.low_psf_fils),
      bandMedian: Number(s.median_psf_fils),
      bandHigh: Number(s.high_psf_fils),
      sampleSize: s.sample_size,
      source: s.source,
      totalTransactions: Number(total.rows[0].n),
      months: months.rows.map((m) => ({
        month: m.month,
        medianPsfFils: Number(m.median_psf),
        volume: Number(m.volume),
        offPlanShare: Number(m.off_plan_share),
      })),
      unitBands: bands.rows.map((b) => ({
        unitType: b.unit_type,
        pricePsfFils: Number(b.price_psf_fils),
        medianArea: Number(b.median_area),
        sampleN: b.sample_n,
      })),
      launches: launches.rows.map((l) => ({
        projectName: l.project_name,
        pricePsfFils: Number(l.price_psf_fils),
        pctSold: l.pct_sold === null ? null : Number(l.pct_sold),
        completion: l.completion,
        source: l.source,
      })),
    };
  });
}
