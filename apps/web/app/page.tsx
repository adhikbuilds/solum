import Link from 'next/link';
import { Rail } from '@/components/Rail';
import { listPipeline } from '@/lib/queries';
import { requireUser } from '@/lib/session';
import { aed, pct, sqft, VERDICT_COPY } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function PipelinePage() {
  const user = await requireUser();
  const rows = await listPipeline(user.organisationId);
  const totals = summarise(rows);

  return (
    <>
      <Rail organisation={user.organisationName} workspace="Dubai land pipeline" user={user} />
      <main className="frame frame-wide">
        <p className="eyebrow">Land pipeline</p>
        <h1 className="page-h">
          {rows.length === 1 ? 'One plot' : `${rows.length} plots`} under consideration
        </h1>
        <p className="page-sub">
          Each row is the latest appraisal on that plot. A withheld plot is not a failure of the
          plot — it means the inputs contradict each other and no honest call can be made yet.
        </p>
        {rows.length > 1 ? (
          <p className="page-actions">
            <Link href={`/compare?${rows.slice(0, 4).map((r) => `p=${r.plotId}`).join('&')}`}>
              Compare the first {Math.min(rows.length, 4)} →
            </Link>
          </p>
        ) : null}

        {rows.length === 0 ? (
          <NoPlots />
        ) : (
          <>
            <div className="kpis">
              <div className="kpi">
                <p className="kpi-k">Plots</p>
                <p className="kpi-v">{rows.length}</p>
                <p className="kpi-sub">in the pipeline</p>
              </div>
              <div className="kpi" data-tone={totals.endorsed > 0 ? 'good' : undefined}>
                <p className="kpi-k">Endorsed</p>
                <p className="kpi-v">{totals.endorsed}</p>
                <p className="kpi-sub">clear the hurdle</p>
              </div>
              <div className="kpi" data-tone={totals.attention > 0 ? 'bad' : undefined}>
                <p className="kpi-k">Needs attention</p>
                <p className="kpi-v">{totals.attention}</p>
                <p className="kpi-sub">declined or withheld</p>
              </div>
              <div className="kpi" data-tone={totals.headroomFils > 0 ? 'good' : undefined}>
                <p className="kpi-k">Total headroom</p>
                <p className="kpi-v num">
                  <span className="kpi-cur">AED</span>
                  {aed(totals.headroomFils)}
                </p>
                <p className="kpi-sub">summed across endorsed and held plots</p>
              </div>
            </div>
            <div className="pipeline">
              {rows.map((row) => {
                const copy = VERDICT_COPY[row.verdict] ?? { word: row.verdict, sub: '' };
                return (
                  <Link
                    key={row.plotId}
                    href={`/plots/${row.plotId}`}
                    className="row"
                    data-v={row.verdict}
                  >
                    <div>
                      <p className="row-name">{row.name}</p>
                      <div className="row-meta num">
                        <span>
                          Plot <b>{row.dldPlotNumber ?? '—'}</b>
                        </span>
                        <span>
                          <b>{sqft(row.landAreaSqft)}</b> sqft plot
                        </span>
                        <span>
                          Asking <b>AED {aed(Number(row.landCostFils))}</b>
                        </span>
                        {row.verdict === 'NO_VERDICT' ? (
                          <span style={{ color: 'var(--annot)' }}>
                            {row.blockerCount} blocking{' '}
                            {row.blockerCount === 1 ? 'issue' : 'issues'}
                          </span>
                        ) : (
                          <span>
                            Return <b>{pct(row.profitOnCost)}</b> on cost
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="row-right">
                      <p className="row-verdict">{copy.word}</p>
                      <Headroom
                        askingFils={Number(row.landCostFils)}
                        residualFils={row.residualLandValueFils}
                      />
                    </div>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </main>
    </>
  );
}

/** Portfolio-level counts and totals for the KPI strip above the list. */
function summarise(rows: Awaited<ReturnType<typeof listPipeline>>) {
  let endorsed = 0;
  let attention = 0;
  let headroomFils = 0;

  for (const row of rows) {
    if (row.verdict === 'PASS') endorsed++;
    if (row.verdict === 'FAIL' || row.verdict === 'NO_VERDICT') attention++;

    const asking = Number(row.landCostFils);
    if (row.residualLandValueFils !== null && Number.isFinite(asking) && asking > 0) {
      const gap = row.residualLandValueFils - asking;
      if (gap > 0) headroomFils += gap;
    }
  }

  return { endorsed, attention, headroomFils };
}

/**
 * Asking price against the walk-away number.
 *
 * Showing residual land value alone is misleading in a list: it is a property of the scheme, so
 * plots with the same mix and costs share it, and two identical figures read as a bug. The gap to
 * the asking price is what actually differs and what actually decides anything.
 */
function Headroom({
  askingFils,
  residualFils,
}: {
  askingFils: number;
  residualFils: number | null;
}) {
  if (residualFils === null || !Number.isFinite(askingFils) || askingFils <= 0) {
    return (
      <>
        <p className="row-figure num">AED {aed(residualFils)}</p>
        <p className="row-figure-k">Residual land value</p>
      </>
    );
  }

  const gap = residualFils - askingFils;
  const room = gap >= 0;

  return (
    <>
      <p className="row-figure num" style={{ color: room ? 'var(--endorse)' : 'var(--annot)' }}>
        {room ? '+' : '−'}AED {aed(Math.abs(gap))}
      </p>
      <p className="row-figure-k">
        {room ? 'under the walk-away price' : 'over the walk-away price'}
      </p>
    </>
  );
}

function NoPlots() {
  return (
    <div className="empty">
      <h2>No plots in this workspace</h2>
      <p>
        Add one, or run <code>pnpm db:seed</code> to load four worked examples — one endorsed, one
        held, one declined, and one withheld because its pricing contradicts its own comparables.
      </p>
      <p>
        <Link href="/plots/new" className="rail-cta">
          New plot
        </Link>
      </p>
    </div>
  );
}
