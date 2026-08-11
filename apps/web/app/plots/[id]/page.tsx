import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Rail } from '@/components/Rail';
import { PlotTabs, isTab, type TabKey } from '@/components/PlotTabs';
import { SummaryTab } from '@/components/tabs/Summary';
import { MixTab, AssumptionsTab, PlotTab, ReportTab } from '@/components/tabs/Detail';
import { RerunPanel, type Lever } from '@/components/RerunPanel';
import { getAppraisal, listRuns, type AppraisalDetail } from '@/lib/queries';
import { requireUser } from '@/lib/session';
import { canWrite } from '@solum/db';
import { aed, pct, psf, sqft, VERDICT_COPY } from '@/lib/format';
import { suggestRemedies, type Remedy } from '@solum/engine';

export const dynamic = 'force-dynamic';

export default async function PlotPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  const active: TabKey = isTab(tab) ? tab : 'summary';

  const user = await requireUser();
  const a = await getAppraisal(user.organisationId, id);
  if (!a) notFound();
  const runs = await listRuns(user.organisationId, id);

  const copy = VERDICT_COPY[a.verdict] ?? { word: a.verdict, sub: '' };
  const hurdle =
    typeof a.inputs['targetProfitOnCost'] === 'number' ? a.inputs['targetProfitOnCost'] : 0.2;
  const remedies = safeRemedies(a);

  return (
    <>
      <Rail organisation={user.organisationName} workspace="Dubai land pipeline" user={user} />

      {/* Identity and verdict stay visible across every tab. */}
      <header className="plot-head">
        <div className="frame frame-wide plot-head-in">
          <div className="plot-head-main">
            <Link href="/" className="back">
              ← All plots
            </Link>
            <h1 className="plot-title">{a.name}</h1>
            <div className="plot-facts num">
              <span>{a.community ?? 'Community unknown'}</span>
              <span>Plot {a.dldPlotNumber ?? '—'}</span>
              <span>{sqft(a.landAreaSqft)} sqft</span>
              <span>FAR {a.far ?? '—'}</span>
              <span>{sqft(a.saleableAreaSqft)} sqft saleable</span>
            </div>
          </div>
          <div className="plot-verdict" data-v={a.verdict}>
            <span className="plot-verdict-w">{copy.word}</span>
            <span className="plot-verdict-s">{copy.sub}</span>
          </div>
        </div>
        <div className="frame frame-wide">
          <PlotTabs plotId={a.plotId} active={active} />
        </div>
      </header>

      <main className="frame frame-wide">
        {active === 'summary' ? <SummaryTab a={a} remedies={remedies} hurdle={hurdle} /> : null}
        {active === 'mix' ? <MixTab a={a} /> : null}
        {active === 'assumptions' ? <AssumptionsTab a={a} /> : null}
        {active === 'plot' ? <PlotTab a={a} /> : null}
        {active === 'report' ? (
          <Report a={a} runs={runs} hurdle={hurdle} remedies={remedies} />
        ) : null}

        {/* Testing an assumption belongs beside the numbers it changes, not in a settings page. */}
        {active === 'summary' || active === 'mix' || active === 'assumptions' ? (
          <section className="panel">
            <div className="panel-head">
              <h2>Test an assumption</h2>
              <span className="panel-note">leave a field blank to keep it</span>
            </div>
            <div className="panel-body">
              <RerunPanel
                plotId={a.plotId}
                canWrite={canWrite(user.role)}
                role={user.role}
                levers={buildLevers(a)}
              />
            </div>
          </section>
        ) : null}

        {runs.length > 1 && active !== 'report' ? (
          <section className="panel">
            <div className="panel-head">
              <h2>Runs</h2>
              <span className="panel-note">{runs.length} on this plot · nothing overwritten</span>
            </div>
            <div className="panel-body panel-flush">
              <div className="tbl-scroll">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Verdict</th>
                      <th>When</th>
                      <th>Note</th>
                      <th className="r">Land</th>
                      <th className="r">Return</th>
                      <th className="r">Walk-away</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((r, i) => (
                      <tr key={r.appraisalId}>
                        <td>
                          <b>{VERDICT_COPY[r.verdict]?.word ?? r.verdict}</b>
                          {i === 0 ? <em> current</em> : null}
                        </td>
                        <td className="num">{r.computedAt.slice(0, 16).replace('T', ' ')}</td>
                        <td>{r.note ?? '—'}</td>
                        <td className="r num">{aed(r.landCostFils)}</td>
                        <td className="r num">{pct(r.profitOnCost)}</td>
                        <td className="r num">{aed(r.residualLandValueFils)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        ) : null}

        <p className="foot-note">
          Engine {a.engineVersion} · comparables {a.comparables.asOf} · appraisal{' '}
          {a.appraisalId.slice(0, 8)} · not yet modelled: finance, cashflow, collection curve,
          absorption
        </p>
      </main>
    </>
  );
}

/**
 * The report keeps the instrument-sheet treatment.
 *
 * It is the artifact a developer hands to a partner or a credit committee, so it is built to be
 * read and printed rather than operated — which is exactly why it should not also be the working
 * interface. It renders from the same stored result as every tab, so the two can never disagree.
 */
function Report({
  a,
  runs,
  hurdle,
  remedies,
}: {
  a: AppraisalDetail;
  runs: Awaited<ReturnType<typeof listRuns>>;
  hurdle: number;
  remedies: Remedy[];
}) {
  const copy = VERDICT_COPY[a.verdict] ?? { word: a.verdict, sub: '' };
  const residualPsf =
    a.residualLandValueFils && Number(a.landAreaSqft) > 0
      ? a.residualLandValueFils / Number(a.landAreaSqft)
      : null;
  const landPsf =
    a.landCostFils && Number(a.landAreaSqft) > 0
      ? Number(a.landCostFils) / Number(a.landAreaSqft)
      : null;

  return (
    <>
      <p className="report-actions">
        A document to hand over. Print, or save as PDF, from your browser.
      </p>
      <article className="sheet">
        <header className="sheet-head">
          <div className="sheet-head-main">
            <p className="sheet-kicker">
              {a.community ?? 'Community unknown'} · Plot {a.dldPlotNumber ?? '—'} ·{' '}
              {runs.length > 1 ? `run ${runs.length}` : 'first underwrite'}
            </p>
            <h2 className="sheet-title">{a.name}</h2>
            <div className="sheet-facts num">
              <span>
                <b>{sqft(a.landAreaSqft)}</b> sqft plot
              </span>
              <span>
                FAR <b>{a.far ?? '—'}</b>
              </span>
              <span>
                <b>{sqft(a.gfaSqft)}</b> sqft GFA
              </span>
              <span>
                <b>{sqft(a.saleableAreaSqft)}</b> sqft saleable
              </span>
            </div>
          </div>
          <div className="stamp" data-v={a.verdict} role="img" aria-label={`Verdict: ${copy.word}`}>
            <span className="stamp-word">{copy.word}</span>
            <span className="stamp-sub">{copy.sub}</span>
          </div>
        </header>

        <div className="sheet-body">
          <section className="headline">
            <p className="headline-label">Residual land value</p>
            <p className="headline-value num">
              <span className="cur">AED</span>
              {aed(a.residualLandValueFils)}
            </p>
            <p className="denominator num">
              AED {psf(residualPsf)} per sqft of plot area
              {landPsf !== null ? <> · asking AED {psf(landPsf)} on the same basis</> : null}
            </p>
            <p className="headline-defn">
              The most that can be paid for this land and still return {pct(hurdle, 0)} on total
              cost. It is the walk-away number in a negotiation, and it is derived — not quoted.
            </p>
          </section>

          <p className="report-verdict">{a.verdictReason}</p>

          {remedies.length > 0 ? (
            <div className="remedies">
              {remedies.map((r, i) => (
                <div className="remedy" key={`${r.lever}-${i}`}>
                  <p className="remedy-head">
                    <span className="remedy-lever">{r.lever.replace(/_/g, ' ')}</span>
                    <span>{r.headline}</span>
                  </p>
                  <p>{r.detail}</p>
                </div>
              ))}
            </div>
          ) : null}

          <ReportTab a={a} />
        </div>

        <footer className="sheet-foot">
          <span>Engine {a.engineVersion}</span>
          <span>Comparables {a.comparables.asOf}</span>
          <span>
            {a.comparables.source === 'seed' ? 'Seeded market data — not observed' : 'DLD data'}
          </span>
        </footer>
      </article>
    </>
  );
}

function buildLevers(a: AppraisalDetail): Lever[] {
  const inputs = a.inputs as {
    costs?: { constructionPsf?: unknown };
    targetProfitOnCost?: number;
    scenarios?: { name: string; salePriceDelta: number }[];
    units?: { code: string; label: string; pricePsf: unknown; enabled: boolean }[];
  };
  const big = (v: unknown): number | null =>
    typeof v === 'string' && v.endsWith('n')
      ? Number(v.slice(0, -1))
      : typeof v === 'number'
        ? v
        : null;

  const downside = inputs.scenarios?.find((s) => s.name === 'Downside');
  const levers: Lever[] = [
    {
      name: 'landCostAed',
      label: 'Land price',
      current: aed(Number(a.landCostFils)),
      suffix: 'AED',
      hint: `walk-away ${aed(a.residualLandValueFils)}`,
    },
    {
      name: 'constructionPsf',
      label: 'Construction',
      current: psf(big(inputs.costs?.constructionPsf)),
      suffix: '/sqft BUA',
      hint: 'BUA, not GFA',
    },
    {
      name: 'hurdlePct',
      label: 'Hurdle',
      current: ((inputs.targetProfitOnCost ?? 0.2) * 100).toFixed(0),
      suffix: '%',
    },
    {
      name: 'downsidePricePct',
      label: 'Downside fall',
      current: Math.abs((downside?.salePriceDelta ?? -0.1) * 100).toFixed(0),
      suffix: '%',
    },
  ];

  for (const u of inputs.units ?? []) {
    if (!u.enabled) continue;
    levers.push({
      name: `price_${u.code}`,
      label: u.label,
      current: psf(big(u.pricePsf)),
      suffix: '/sqft',
    });
  }
  return levers;
}

function safeRemedies(a: AppraisalDetail): Remedy[] {
  try {
    const revive = (v: unknown): unknown =>
      typeof v === 'string' && /^-?\d+n$/.test(v)
        ? BigInt(v.slice(0, -1))
        : Array.isArray(v)
          ? v.map(revive)
          : v && typeof v === 'object'
            ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, revive(x)]))
            : v;

    return suggestRemedies(revive(a.inputs) as Parameters<typeof suggestRemedies>[0], {
      engineVersion: '',
      comparablesSnapshotId: '',
      verdict: a.verdict as never,
      verdictReason: '',
      outputs: revive(a.outputs) as never,
      flags: a.flags as never,
      trace: [],
    });
  } catch {
    return [];
  }
}
