import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Rail } from '@/components/Rail';
import { Ledger } from '@/components/Ledger';
import { getAppraisal, listRuns, type FlagRow } from '@/lib/queries';
import { requireUser } from '@/lib/session';
import { canWrite } from '@solum/db';
import { RerunPanel, type Lever } from '@/components/RerunPanel';
import {
  aed,
  count,
  DENOMINATOR,
  pct,
  psf,
  sqft,
  VERDICT_COPY,
  formatValue,
  humanise,
} from '@/lib/format';
import { suggestRemedies, type Remedy } from '@solum/engine';

export const dynamic = 'force-dynamic';

export default async function PlotPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const a = await getAppraisal(user.organisationId, id);
  if (!a) notFound();
  const runs = await listRuns(user.organisationId, id);

  const copy = VERDICT_COPY[a.verdict] ?? { word: a.verdict, sub: '' };
  const landPsf =
    a.landCostFils && Number(a.landAreaSqft) > 0
      ? Number(a.landCostFils) / Number(a.landAreaSqft)
      : null;
  const residualPsf =
    a.residualLandValueFils && Number(a.landAreaSqft) > 0
      ? a.residualLandValueFils / Number(a.landAreaSqft)
      : null;

  // Remedies are computed from the stored inputs and the stored result, so they can never
  // disagree with the verdict shown above them.
  const remedies = safeRemedies(a.inputs, a.outputs, a.flags, a.verdict);

  const blockers = a.flags.filter((f) => f.severity === 'blocker');
  const warnings = a.flags.filter((f) => f.severity !== 'blocker');

  return (
    <>
      <Rail organisation={user.organisationName} workspace="Dubai land pipeline" user={user} />
      <main className="frame">
        <Link href="/" className="back">
          ← All plots
        </Link>

        <article className="sheet">
          <header className="sheet-head">
            <div className="sheet-head-main">
              <p className="sheet-kicker">
                {a.community ?? 'Community unknown'} · Plot {a.dldPlotNumber ?? '—'}
              </p>
              <h1 className="sheet-title">{a.name}</h1>
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
            {/* ── The headline figure, with its denominator and its definition ── */}
            <section className="headline">
              <p className="headline-label">Residual land value</p>
              <p className="headline-value num">
                <span className="cur">AED</span>
                {aed(a.residualLandValueFils)}
              </p>
              <p className="denominator num">
                AED {psf(residualPsf)} {DENOMINATOR.plot}
                {landPsf !== null ? <> · asking AED {psf(landPsf)} on the same basis</> : null}
              </p>
              <p className="headline-defn">
                The most that can be paid for this land and still return{' '}
                {pct(rate(a.inputs, 'targetProfitOnCost'), 0)} on total cost. Above it the scheme
                returns less than the hurdle; below it, more. It is the walk-away number in a
                negotiation, and it is derived — not quoted.
              </p>
            </section>

            {/* ── Why the verdict is what it is ───────────────────────────────── */}
            {blockers.map((f) => (
              <FlagBand key={f.code} flag={f} sev="blocker" heading="Verdict withheld" />
            ))}
            {warnings.map((f) => (
              <FlagBand key={f.code} flag={f} sev="warn" heading="Flagged for review" />
            ))}

            {blockers.length === 0 && warnings.length === 0 ? null : null}

            {/* ── What would make this work ───────────────────────────────────── */}
            {remedies.length > 0 ? (
              <>
                <div className="sect">
                  <h2>What would make this work</h2>
                  <span className="sect-rule" />
                  <span className="sect-note">one lever at a time</span>
                </div>
                <div className="remedies">
                  {remedies.map((r, i) => (
                    <div className="remedy" key={`${r.lever}-${i}`}>
                      <p className="remedy-head">
                        <span className="remedy-lever">{r.lever.replace(/_/g, ' ')}</span>
                        {r.headline}
                      </p>
                      <p>{r.detail}</p>
                      <p className="remedy-feas" data-f={r.feasibility}>
                        {r.feasibility.replace(/_/g, ' ')}
                      </p>
                    </div>
                  ))}
                </div>
              </>
            ) : null}

            {/* ── Metrics, each with its denominator ──────────────────────────── */}
            <div className="sect">
              <h2>Appraisal</h2>
              <span className="sect-rule" />
              <span className="sect-note">{a.verdictReason.split('.')[0]}.</span>
            </div>
            <div className="metrics">
              <Metric
                k="Gross development value"
                v={`AED ${aed(num(a.outputs['grossDevelopmentValue']))}`}
              />
              <Metric
                k="Blended sale price"
                v={`AED ${psf(num(a.outputs['blendedPricePsf']))}`}
                per={DENOMINATOR.saleable}
              />
              <Metric
                k="Construction"
                v={`AED ${aed(num(a.outputs['constructionCost']))}`}
                per={DENOMINATOR.bua}
              />
              <Metric
                k="Total cost"
                v={`AED ${aed(num(a.outputs['totalDevelopmentCost']))}`}
              />
              <Metric k="Return on cost" v={pct(a.profitOnCost)} />
            </div>

            {/* ── Comparables, stated where the price is judged ───────────────── */}
            <div className="sect">
              <h2>Comparables</h2>
              <span className="sect-rule" />
              <span className="sect-note">
                as of {a.comparables.asOf} · n = {a.comparables.sampleSize}
              </span>
            </div>
            <div className="metrics">
              <Metric
                k="Band low"
                v={`AED ${psf(a.comparables.lowPsfFils)}`}
                per={DENOMINATOR.saleable}
              />
              <Metric k="Median" v={`AED ${psf(a.comparables.medianPsfFils)}`} />
              <Metric k="Band high" v={`AED ${psf(a.comparables.highPsfFils)}`} />
              <Metric
                k="Segment"
                v={a.comparables.segment ?? 'Area-wide'}
                per={
                  a.comparables.segment
                    ? undefined
                    : 'not segmented — wrong basis for a luxury scheme'
                }
              />
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--ink-soft)', margin: '0.85rem 0 0' }}>
              <span className="chip" data-p={a.comparables.source === 'seed' ? 'seed' : 'derived'}>
                {a.comparables.source === 'seed' ? 'Seeded' : 'Derived'}
              </span>{' '}
              {a.comparables.method}.
            </p>

            {a.unitBands.length > 0 ? (
              <>
                <div className="sect">
                  <h2>By unit type</h2>
                  <span className="sect-rule" />
                  <span className="sect-note">
                    P5–P95 trimmed, one-year half-life recency weight
                  </span>
                </div>
                <div className="ledger">
                  <table className="led-table" style={{ padding: '0.5rem' }}>
                    <tbody>
                      {a.unitBands.map((b) => (
                        <tr key={b.unitType}>
                          <td style={{ paddingLeft: '1rem' }}>
                            {b.unitType} · median {count(b.medianArea)} sqft · n = {b.sampleN}
                          </td>
                          <td className="num" style={{ paddingRight: '1rem' }}>
                            AED {psf(b.pricePsfFils)} {DENOMINATOR.saleable}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}

            {/* ── Change an assumption and recompute ──────────────────────────── */}
            <div className="sect">
              <h2>Test an assumption</h2>
              <span className="sect-rule" />
              <span className="sect-note">leave a field blank to keep it</span>
            </div>
            <RerunPanel
              plotId={a.plotId}
              canWrite={canWrite(user.role)}
              role={user.role}
              levers={buildLevers(a)}
            />

            {/* ── Run history ─────────────────────────────────────────────────── */}
            {runs.length > 1 ? (
              <>
                <div className="sect">
                  <h2>Runs</h2>
                  <span className="sect-rule" />
                  <span className="sect-note">
                    {runs.length} on this plot · nothing overwritten
                  </span>
                </div>
                <div className="ledger">
                  <table className="led-table" style={{ padding: '0.4rem 0' }}>
                    <tbody>
                      {runs.map((r, i) => (
                        <tr key={r.appraisalId}>
                          <td style={{ paddingLeft: '1rem', width: 'auto' }}>
                            <b>{VERDICT_COPY[r.verdict]?.word ?? r.verdict}</b>
                            {i === 0 ? ' · current' : ''}
                            {r.note ? ` — ${r.note}` : ''}
                            <br />
                            <span style={{ color: 'var(--ink-faint)', fontSize: '0.72rem' }}>
                              {r.computedAt.slice(0, 16).replace('T', ' ')} · engine{' '}
                              {r.engineVersion} · land AED {aed(r.landCostFils)}
                            </span>
                          </td>
                          <td className="num" style={{ paddingRight: '1rem' }}>
                            {pct(r.profitOnCost)} on cost
                            <br />
                            <span style={{ color: 'var(--ink-faint)', fontSize: '0.72rem' }}>
                              RLV AED {aed(r.residualLandValueFils)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}

            {/* ── The ledger ──────────────────────────────────────────────────── */}
            <div className="sect">
              <h2>Derivation</h2>
              <span className="sect-rule" />
              <span className="sect-note">{a.trace.length} steps · open any row</span>
            </div>
            <Ledger steps={a.trace} />
          </div>

          <footer className="sheet-foot">
            <span>Engine {a.engineVersion}</span>
            <span>Comparables {a.comparables.asOf}</span>
            <span>Appraisal {a.appraisalId.slice(0, 8)}</span>
            <span>Not yet modelled: finance · cashflow · collection curve · absorption</span>
          </footer>
        </article>
      </main>
    </>
  );
}

/**
 * The levers worth exposing.
 *
 * Not every input — a form with forty fields is the clutter problem again. These four plus the
 * per-unit prices are the ones that actually move a verdict, and each is pre-filled with its
 * current value as a placeholder rather than a default, so nothing is resubmitted by accident.
 */
function buildLevers(a: Awaited<ReturnType<typeof getAppraisal>> & object): Lever[] {
  const inputs = a.inputs as {
    costs?: { constructionPsf?: unknown };
    targetProfitOnCost?: number;
    scenarios?: { name: string; salePriceDelta: number }[];
    units?: { code: string; label: string; pricePsf: unknown; enabled: boolean }[];
  };

  const bigintish = (v: unknown): number | null => {
    if (typeof v === 'string' && v.endsWith('n')) return Number(v.slice(0, -1));
    if (typeof v === 'number') return v;
    return null;
  };

  const downside = inputs.scenarios?.find((s) => s.name === 'Downside');
  const levers: Lever[] = [
    {
      name: 'landCostAed',
      label: 'Land price',
      current: aed(Number(a.landCostFils)),
      suffix: 'AED',
      hint: `walk-away is ${aed(a.residualLandValueFils)}`,
    },
    {
      name: 'constructionPsf',
      label: 'Construction',
      current: psf(bigintish(inputs.costs?.constructionPsf)),
      suffix: 'AED / sqft BUA',
      hint: 'BUA, not GFA',
    },
    {
      name: 'hurdlePct',
      label: 'Hurdle',
      current: ((inputs.targetProfitOnCost ?? 0.2) * 100).toFixed(0),
      suffix: '% on cost',
    },
    {
      name: 'downsidePricePct',
      label: 'Downside price fall',
      current: Math.abs((downside?.salePriceDelta ?? -0.1) * 100).toFixed(0),
      suffix: '%',
    },
  ];

  for (const u of inputs.units ?? []) {
    if (!u.enabled) continue;
    levers.push({
      name: `price_${u.code}`,
      label: `${u.label} price`,
      current: psf(bigintish(u.pricePsf)),
      suffix: 'AED / sqft saleable',
    });
  }

  return levers;
}

function Metric({ k, v, per }: { k: string; v: string; per?: string }) {
  return (
    <div className="metric">
      <p className="metric-k">{k}</p>
      <p className="metric-v num">{v}</p>
      {per ? <p className="metric-per">{per}</p> : null}
    </div>
  );
}

function FlagBand({
  flag,
  sev,
  heading,
}: {
  flag: FlagRow;
  sev: 'blocker' | 'warn';
  heading: string;
}) {
  // Only the evidence a reader can act on. Ids and hashes are noise on the page.
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
          {shown.slice(0, 6).map(([k, v]) => (
            <span key={k}>
              {humanise(k)} <b>{formatValue(k, v)}</b>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function num(value: unknown): number | null {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const n = Number(value.endsWith('n') ? value.slice(0, -1) : value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function rate(inputs: Record<string, unknown>, key: string): number {
  const v = inputs[key];
  return typeof v === 'number' ? v : 0.2;
}

/**
 * Rehydrate the stored inputs and outputs enough for the remedy engine.
 *
 * The stored JSON encodes bigints as "1234n" strings, so they have to be converted back before the
 * engine sees them. If anything about the shape is unexpected, return no remedies rather than a
 * wrong one — a bad recommendation in a negotiation is worse than none.
 */
function safeRemedies(
  inputs: Record<string, unknown>,
  outputs: Record<string, unknown>,
  flags: FlagRow[],
  verdict: string,
): Remedy[] {
  try {
    const revive = (v: unknown): unknown => {
      if (typeof v === 'string' && /^-?\d+n$/.test(v)) return BigInt(v.slice(0, -1));
      if (Array.isArray(v)) return v.map(revive);
      if (v && typeof v === 'object') {
        return Object.fromEntries(Object.entries(v).map(([k, val]) => [k, revive(val)]));
      }
      return v;
    };

    const input = revive(inputs) as Parameters<typeof suggestRemedies>[0];
    const result = {
      engineVersion: '',
      comparablesSnapshotId: '',
      verdict: verdict as never,
      verdictReason: '',
      outputs: revive(outputs) as never,
      flags: flags as never,
      trace: [],
    };
    return suggestRemedies(input, result);
  } catch {
    return [];
  }
}
