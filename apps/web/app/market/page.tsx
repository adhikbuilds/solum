import { Rail } from '@/components/Rail';
import { requireUser } from '@/lib/session';
import { getMarket, listCommunities } from '@/lib/queries';
import { count, psf, pct } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function MarketPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const user = await requireUser();
  const { c } = await searchParams;
  const communities = await listCommunities(user.organisationId);
  const market = await getMarket(user.organisationId, c);

  if (!market) {
    return (
      <>
        <Rail organisation={user.organisationName} user={user} />
        <main className="frame">
          <p className="eyebrow">Market</p>
          <h1 className="page-h">No comparables yet</h1>
          <div className="empty">
            <h2>Nothing to show</h2>
            <p>
              Run <code>pnpm db:seed</code> to load transactions and build a snapshot from them.
            </p>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Rail organisation={user.organisationName} user={user} />
      <main className="frame">
        <p className="eyebrow">Market</p>
        <h1 className="page-h">{market.community}</h1>
        <p className="page-sub">
          {count(market.totalTransactions)} transactions on file. The band below is what every
          appraisal in this community is judged against — an appraisal pins one dated snapshot and
          never re-prices itself when this moves.
        </p>

        {communities.length > 1 ? (
          <form className="picker" method="get">
            {communities.map((k) => (
              <label className="pick" key={k.id}>
                <input type="radio" name="c" value={k.id} defaultChecked={k.id === c} />
                <span>{k.name}</span>
                <span className="pick-v">{count(k.transactionCount)}</span>
              </label>
            ))}
            <button type="submit">Show</button>
          </form>
        ) : null}

        <article className="sheet">
          <div className="sheet-body">
            <div className="sect">
              <h2>Comparables band</h2>
              <span className="sect-rule" />
              <span className="sect-note">
                as of {market.asOf} · n = {market.sampleSize}
              </span>
            </div>
            <div className="metrics">
              <M k="Low" v={`AED ${psf(market.bandLow)}`} per="per sqft of saleable area" />
              <M k="Median" v={`AED ${psf(market.bandMedian)}`} />
              <M k="High" v={`AED ${psf(market.bandHigh)}`} />
              <M k="Sample" v={count(market.sampleSize)} per="off-plan, trailing 6 months" />
            </div>
            <p className="method">
              <span className="chip" data-p={market.source === 'seed' ? 'seed' : 'derived'}>
                {market.source === 'seed' ? 'Seeded' : 'Derived'}
              </span>{' '}
              {market.method}
            </p>

            <div className="sect">
              <h2>Median price by month</h2>
              <span className="sect-rule" />
              <span className="sect-note">median, not mean — one penthouse should not move it</span>
            </div>
            <Trend months={market.months} />

            <div className="sect">
              <h2>By unit type</h2>
              <span className="sect-rule" />
              <span className="sect-note">P5–P95 trimmed, one-year half-life recency weight</span>
            </div>
            <div className="ledger">
              <table className="led-table plain">
                <tbody>
                  {market.unitBands.map((b) => (
                    <tr key={b.unitType}>
                      <td>
                        <b>{b.unitType}</b> · median {count(b.medianArea)} sqft · n = {b.sampleN}
                      </td>
                      <td className="num">AED {psf(b.pricePsfFils)} per sqft of saleable</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {market.launches.length > 0 ? (
              <>
                <div className="sect">
                  <h2>Nearby launches</h2>
                  <span className="sect-rule" />
                  <span className="sect-note">competing supply, not transactions</span>
                </div>
                <div className="ledger">
                  <table className="led-table plain">
                    <tbody>
                      {market.launches.map((l) => (
                        <tr key={l.projectName}>
                          <td>
                            <b>{l.projectName}</b>
                            {l.completion ? ` · ${l.completion}` : ''}
                            {l.pctSold !== null ? ` · ${l.pctSold.toFixed(0)}% sold` : ''}{' '}
                            <span className="chip" data-p={l.source === 'seed' ? 'seed' : 'derived'}>
                              {l.source}
                            </span>
                          </td>
                          <td className="num">AED {psf(l.pricePsfFils)} per sqft</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="method">
                  These are marketing figures for schemes still selling, not registered
                  transactions. They indicate where competitors are asking, not where units cleared.
                  Segmentation — luxury against mid-market — is not applied yet, so this band is
                  area-wide and is the wrong basis for a scheme positioned above or below the mean.
                </p>
              </>
            ) : null}
          </div>
        </article>
      </main>
    </>
  );
}

function M({ k, v, per }: { k: string; v: string; per?: string }) {
  return (
    <div className="metric">
      <p className="metric-k">{k}</p>
      <p className="metric-v num">{v}</p>
      {per ? <p className="metric-per">{per}</p> : null}
    </div>
  );
}

/**
 * An inline SVG column chart rather than a charting library.
 *
 * The series is at most 24 points and needs no interaction, so a dependency would cost more than it
 * returns. Bars are labelled by value on hover and the underlying figures are in the table below,
 * so nothing depends on reading the picture.
 */
function Trend({ months }: { months: { month: string; medianPsfFils: number; volume: number; offPlanShare: number }[] }) {
  if (months.length < 2) return <p className="method">Not enough history to draw a trend.</p>;

  const values = months.map((m) => m.medianPsfFils);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const W = 900;
  const H = 190;
  const pad = { l: 8, r: 8, t: 14, b: 26 };
  const bw = (W - pad.l - pad.r) / months.length;

  return (
    <div className="trend">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Median price per sqft by month" preserveAspectRatio="none">
        {months.map((m, i) => {
          const h = ((m.medianPsfFils - min) / span) * (H - pad.t - pad.b) * 0.9 + 6;
          const x = pad.l + i * bw;
          const y = H - pad.b - h;
          return (
            <g key={m.month}>
              <rect x={x + bw * 0.15} y={y} width={bw * 0.7} height={h} className="trend-bar">
                <title>
                  {m.month}: AED {(m.medianPsfFils / 100).toFixed(0)}/sqft · {m.volume} transactions ·{' '}
                  {(m.offPlanShare * 100).toFixed(0)}% off-plan
                </title>
              </rect>
              {i % 3 === 0 ? (
                <text x={x + bw / 2} y={H - 8} className="trend-label" textAnchor="middle">
                  {m.month.slice(2)}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <div className="trend-scale num">
        <span>low AED {psf(min)}</span>
        <span>
          {months.length} months · off-plan share{' '}
          {pct(months.reduce((a, m) => a + m.offPlanShare, 0) / months.length, 0)}
        </span>
        <span>high AED {psf(max)}</span>
      </div>
    </div>
  );
}
