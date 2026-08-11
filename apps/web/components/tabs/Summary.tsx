import { CostBreakdown, ScenarioChart, type CostSlice } from '@/components/Charts';
import { aed, pct, psf, DENOMINATOR } from '@/lib/format';
import type { AppraisalDetail, FlagRow } from '@/lib/queries';
import type { Remedy } from '@solum/engine';

/**
 * The dashboard. What a developer needs in the first ten seconds.
 *
 * Headroom leads, not residual land value — residual is a property of the scheme and identical
 * across plots that share a mix, so on its own it does not tell anyone what to do. The gap to the
 * asking price does.
 */
export function SummaryTab({
  a,
  remedies,
  hurdle,
}: {
  a: AppraisalDetail;
  remedies: Remedy[];
  hurdle: number;
}) {
  const gdv = numOf(a.outputs['grossDevelopmentValue']);
  const totalCost = numOf(a.outputs['totalDevelopmentCost']);
  const construction = numOf(a.outputs['constructionCost']);
  // pg returns bigint columns as strings; coerce once here rather than at each use site.
  const asking = Number(a.landCostFils ?? 0);
  const residual = a.residualLandValueFils ?? 0;
  const headroom = residual - asking;

  const costStep = a.trace.find((s) => s.id === 'cost.non_land');
  const profitStep = a.trace.find((s) => s.id === 'profit.net');
  const ci = (costStep?.inputs ?? {}) as Record<string, number>;

  const slices: CostSlice[] = ([
    { key: 'construction', label: 'Construction', value: construction },
    {
      key: 'architect',
      label: 'Architect',
      value: (ci['architectDesign'] ?? 0) + (ci['architectSupervision'] ?? 0),
    },
    { key: 'contingency', label: 'Contingency', value: ci['contingency'] ?? 0 },
    { key: 'parking', label: 'Parking', value: ci['parking'] ?? 0 },
    { key: 'marketing', label: 'Marketing', value: ci['marketing'] ?? 0 },
    {
      key: 'fixed',
      label: 'Authorities, landscape, misc',
      value: (ci['authorities'] ?? 0) + (ci['landscaping'] ?? 0) + (ci['miscellaneous'] ?? 0),
    },
    { key: 'land', label: 'Land', value: asking },
    { key: 'duty', label: 'DLD duty', value: numOf(profitStep?.inputs?.['dldDuty']) },
  ] satisfies CostSlice[]).filter((s) => s.value > 0);

  const blockers = a.flags.filter((f) => f.severity === 'blocker');
  const warnings = a.flags.filter((f) => f.severity !== 'blocker');

  const scenarios =
    (a.outputs['scenarios'] as { name: string; profitOnCost: number | null }[] | undefined) ?? [];

  return (
    <>
      {/* ── Headline row ─────────────────────────────────────────────────── */}
      <div className="kpis">
        <div className="kpi kpi-lead" data-tone={headroom >= 0 ? 'good' : 'bad'}>
          <p className="kpi-k">Headroom on land</p>
          <p className="kpi-v num">
            {headroom >= 0 ? '+' : '−'}
            <span className="kpi-cur">AED</span>
            {aed(Math.abs(headroom))}
          </p>
          <p className="kpi-sub">
            asking AED {aed(asking)} against a walk-away of AED {aed(residual)}
          </p>
        </div>
        <Kpi
          k="Return on cost"
          v={pct(a.profitOnCost)}
          sub={`against a ${pct(hurdle, 0)} hurdle`}
          tone={a.profitOnCost === null ? undefined : a.profitOnCost >= hurdle ? 'good' : 'bad'}
        />
        <Kpi k="Gross development value" v={`AED ${aed(gdv)}`} sub={`${aed(gdv - totalCost)} profit`} />
        <Kpi
          k="Blended price"
          v={`AED ${psf(numOf(a.outputs['blendedPricePsf']))}`}
          sub={DENOMINATOR.saleable}
        />
        <Kpi
          k="Comparables band"
          v={`${psf(a.comparables.lowPsfFils)} – ${psf(a.comparables.highPsfFils)}`}
          sub={`n = ${a.comparables.sampleSize} · as of ${a.comparables.asOf}`}
        />
      </div>

      {/* ── Why, if there is a why ───────────────────────────────────────── */}
      {blockers.map((f) => (
        <Band key={f.code} flag={f} sev="blocker" heading="Verdict withheld" />
      ))}
      {warnings.map((f) => (
        <Band key={f.code} flag={f} sev="warn" heading="Flagged for review" />
      ))}

      {remedies.length > 0 ? (
        <section className="panel">
          <div className="panel-head">
            <h2>What would make this work</h2>
            <span className="panel-note">one lever at a time</span>
          </div>
          <div className="panel-body remedies">
            {remedies.map((r, i) => (
              <div className="remedy" key={`${r.lever}-${i}`}>
                <p className="remedy-head">
                  <span className="remedy-lever">{r.lever.replace(/_/g, ' ')}</span>
                  <span>{r.headline}</span>
                  <span className="remedy-feas" data-f={r.feasibility}>
                    {r.feasibility.replace(/_/g, ' ')}
                  </span>
                </p>
                <p>{r.detail}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* ── Charts ───────────────────────────────────────────────────────── */}
      <div className="panel-grid">
        <section className="panel">
          <div className="panel-head">
            <h2>Where the money goes</h2>
            <span className="panel-note">against gross development value</span>
          </div>
          <div className="panel-body">
            <CostBreakdown slices={slices} gdv={gdv} totalCost={totalCost} />
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Scenarios</h2>
            <span className="panel-note">return on cost</span>
          </div>
          <div className="panel-body">
            <ScenarioChart scenarios={scenarios} hurdle={hurdle} />
          </div>
        </section>
      </div>
    </>
  );
}

function Kpi({
  k,
  v,
  sub,
  tone,
}: {
  k: string;
  v: string;
  sub?: string;
  tone?: 'good' | 'bad';
}) {
  return (
    <div className="kpi" data-tone={tone}>
      <p className="kpi-k">{k}</p>
      <p className="kpi-v num">{v}</p>
      {sub ? <p className="kpi-sub">{sub}</p> : null}
    </div>
  );
}

function Band({
  flag,
  sev,
  heading,
}: {
  flag: FlagRow;
  sev: 'blocker' | 'warn';
  heading: string;
}) {
  const shown = Object.entries(flag.evidence).filter(
    ([k]) => !k.toLowerCase().includes('id') && k !== 'snapshotId',
  );
  return (
    <div className="annot" data-sev={sev}>
      <p className="annot-head">
        {heading}
        <span className="annot-code">{flag.code}</span>
      </p>
      <p>{flag.message}</p>
      {shown.length > 0 ? (
        <div className="annot-evidence">
          {shown.slice(0, 5).map(([k, v]) => (
            <span key={k}>
              {k.replace(/([A-Z])/g, ' $1').toLowerCase()} <b>{fmtEvidence(k, v)}</b>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function fmtEvidence(key: string, value: unknown): string {
  if (typeof value !== 'number') return String(value);
  if (key.toLowerCase().includes('psf')) return `AED ${psf(value)}`;
  if (key === 'areaShare' || key === 'aboveBandBy') return pct(value, 1);
  return Math.round(value).toLocaleString('en-GB');
}

function numOf(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const n = Number(value.endsWith('n') ? value.slice(0, -1) : value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}
