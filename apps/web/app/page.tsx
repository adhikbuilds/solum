import Link from 'next/link';
import { Rail } from '@/components/Rail';
import { listPipeline, resolveOrganisation } from '@/lib/queries';
import { aed, pct, sqft, VERDICT_COPY } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function PipelinePage() {
  const org = await resolveOrganisation();
  if (!org) return <NoDatabase />;

  const rows = await listPipeline(org.id);

  return (
    <>
      <Rail organisation={org.name} workspace="Dubai land pipeline" />
      <main className="frame">
        <p className="eyebrow">Land pipeline</p>
        <h1 className="page-h">Four plots under consideration</h1>
        <p className="page-sub">
          Each row is the latest appraisal on that plot. A withheld plot is not a failure of the
          plot — it means the inputs contradict each other and no honest call can be made yet.
        </p>

        {rows.length === 0 ? (
          <NoPlots />
        ) : (
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
                        <span style={{ color: '#e0705a' }}>
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
        )}
      </main>
    </>
  );
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
      <p className="row-figure num" style={{ color: room ? '#9fc95c' : '#cf7a63' }}>
        {room ? '+' : '−'}AED {aed(Math.abs(gap))}
      </p>
      <p className="row-figure-k">
        {room ? 'under the walk-away price' : 'over the walk-away price'}
      </p>
    </>
  );
}

function NoDatabase() {
  return (
    <>
      <Rail organisation="No organisation" />
      <main className="frame">
        <p className="eyebrow">Not set up yet</p>
        <h1 className="page-h">The database has no organisation</h1>
        <div className="empty">
          <h2>Start Postgres and seed it</h2>
          <p>Three commands from the repository root:</p>
          <p>
            <code>pnpm db:up</code> <code>pnpm db:migrate</code> <code>pnpm db:seed</code>
          </p>
          <p>
            The seed writes synthetic DLD transactions and derives the comparables band from them,
            so the query path is exercised rather than bypassed.
          </p>
        </div>
      </main>
    </>
  );
}

function NoPlots() {
  return (
    <div className="empty">
      <h2>No plots in this workspace</h2>
      <p>
        Run <code>pnpm db:seed</code> to load four worked examples — one endorsed, one held, one
        declined, and one withheld because its pricing contradicts its own comparables.
      </p>
    </div>
  );
}
