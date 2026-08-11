import Link from 'next/link';
import { Rail } from '@/components/Rail';
import { requireUser } from '@/lib/session';
import { getComparison, listPipeline } from '@/lib/queries';
import { aed, pct, psf, sqft, VERDICT_COPY } from '@/lib/format';

export const dynamic = 'force-dynamic';

/**
 * Side by side, ranked by headroom.
 *
 * Al Mizan's closing insight was that the right question is not which plot has the cheaper land but
 * which creates the highest risk-adjusted return on capital. This cannot answer that fully until
 * there is a cashflow — timeline and capital rotation are missing — so the page says so rather than
 * implying a ranking it cannot yet justify.
 */
export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string | string[] }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const raw = params.p;
  const selected = (Array.isArray(raw) ? raw : raw ? [raw] : []).slice(0, 4);

  const all = await listPipeline(user.organisationId);
  const plots = await getComparison(user.organisationId, selected);

  return (
    <>
      <Rail organisation={user.organisationName} workspace="Dubai land pipeline" user={user} />
      <main className="frame">
        <p className="eyebrow">Compare</p>
        <h1 className="page-h">Two to four plots, side by side</h1>
        <p className="page-sub">
          Ranked by headroom against the walk-away price. Timeline and capital rotation are not
          modelled yet, so this compares profitability, not risk-adjusted return on capital — a
          lower-FAR plot that completes sooner can beat a larger one this table would rank above it.
        </p>

        <form className="picker" method="get">
          {all.map((p) => (
            <label className="pick" key={p.plotId}>
              <input
                type="checkbox"
                name="p"
                value={p.plotId}
                defaultChecked={selected.includes(p.plotId)}
              />
              <span>{p.name}</span>
              <span className="pick-v" data-v={p.verdict}>
                {VERDICT_COPY[p.verdict]?.word ?? p.verdict}
              </span>
            </label>
          ))}
          <button type="submit">Compare selected</button>
        </form>

        {plots.length === 0 ? (
          <div className="empty">
            <h2>Nothing selected</h2>
            <p>Tick two or more plots above, then compare. Four is the practical maximum.</p>
          </div>
        ) : (
          <div className="cmp-scroll">
            <table className="cmp">
              <thead>
                <tr>
                  <th scope="row">Plot</th>
                  {plots.map((p) => (
                    <th key={p.plotId}>
                      <Link href={`/plots/${p.plotId}`}>{p.name}</Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="cmp-verdict">
                  <th scope="row">Verdict</th>
                  {plots.map((p) => (
                    <td key={p.plotId} data-v={p.verdict}>
                      {VERDICT_COPY[p.verdict]?.word ?? p.verdict}
                    </td>
                  ))}
                </tr>
                <Row
                  label="Headroom"
                  note="asking vs walk-away"
                  plots={plots}
                  value={(p) =>
                    p.residualLandValueFils === null || p.landCostFils === null
                      ? '—'
                      : `${p.residualLandValueFils - p.landCostFils >= 0 ? '+' : '−'}AED ${aed(
                          Math.abs(p.residualLandValueFils - p.landCostFils),
                        )}`
                  }
                  tone={(p) =>
                    p.residualLandValueFils === null || p.landCostFils === null
                      ? undefined
                      : p.residualLandValueFils - p.landCostFils >= 0
                        ? 'good'
                        : 'bad'
                  }
                />
                <Row label="Asking price" plots={plots} value={(p) => `AED ${aed(p.landCostFils)}`} />
                <Row
                  label="Residual land value"
                  note="per sqft of plot"
                  plots={plots}
                  value={(p) =>
                    `AED ${aed(p.residualLandValueFils)}` +
                    (p.residualLandValueFils && p.landAreaSqft
                      ? ` · ${psf(p.residualLandValueFils / p.landAreaSqft)}/sqft`
                      : '')
                  }
                />
                <Row label="Return on cost" plots={plots} value={(p) => pct(p.profitOnCost)} />
                <Row
                  label="Downside"
                  note="worst defined scenario"
                  plots={plots}
                  value={(p) => {
                    const worst = p.scenarios
                      .filter((s) => s.profitOnCost !== null)
                      .sort((a, b) => (a.profitOnCost ?? 0) - (b.profitOnCost ?? 0))[0];
                    return worst ? `${worst.name} ${pct(worst.profitOnCost)}` : '—';
                  }}
                  tone={(p) => {
                    const worst = Math.min(
                      ...p.scenarios.map((s) => s.profitOnCost ?? 0),
                    );
                    return worst < 0 ? 'bad' : undefined;
                  }}
                />
                <Row label="Plot area" plots={plots} value={(p) => `${sqft(p.landAreaSqft)} sqft`} />
                <Row label="FAR" plots={plots} value={(p) => String(p.farValue ?? '—')} />
                <Row label="Saleable area" plots={plots} value={(p) => `${sqft(p.saleableAreaSqft)} sqft`} />
                <Row
                  label="Blended price"
                  note="per sqft of saleable"
                  plots={plots}
                  value={(p) => `AED ${psf(p.blendedPsfFils)}`}
                />
                <Row
                  label="Construction"
                  note="per sqft of BUA"
                  plots={plots}
                  value={(p) => `AED ${aed(p.constructionFils)}`}
                />
                <Row label="Gross development value" plots={plots} value={(p) => `AED ${aed(p.gdvFils)}`} />
                <Row label="Total cost" plots={plots} value={(p) => `AED ${aed(p.totalCostFils)}`} />
              </tbody>
            </table>
          </div>
        )}
      </main>
    </>
  );
}

function Row({
  label,
  note,
  plots,
  value,
  tone,
}: {
  label: string;
  note?: string;
  plots: Awaited<ReturnType<typeof getComparison>>;
  value: (p: Awaited<ReturnType<typeof getComparison>>[number]) => string;
  tone?: (p: Awaited<ReturnType<typeof getComparison>>[number]) => 'good' | 'bad' | undefined;
}) {
  return (
    <tr>
      <th scope="row">
        {label}
        {note ? <em>{note}</em> : null}
      </th>
      {plots.map((p) => (
        <td key={p.plotId} className="num" data-tone={tone?.(p)}>
          {value(p)}
        </td>
      ))}
    </tr>
  );
}
