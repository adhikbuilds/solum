import { UnitMixChart } from '@/components/Charts';
import { Ledger } from '@/components/Ledger';
import { aed, count, pct, psf, sqft, DENOMINATOR } from '@/lib/format';
import type { AppraisalDetail } from '@/lib/queries';

interface Unit {
  code: string;
  label: string;
  enabled: boolean;
  unitCount: number;
  avgAreaSqft: number;
  pricePsf: unknown;
  bays: number;
}

export function MixTab({ a }: { a: AppraisalDetail }) {
  const units = ((a.inputs['units'] as Unit[]) ?? []).filter((u) => u.enabled);
  const bandLow = Number(a.comparables.lowPsfFils);
  const bandHigh = Number(a.comparables.highPsfFils);

  const rows = units.map((u) => {
    const area = u.unitCount * u.avgAreaSqft;
    const price = big(u.pricePsf);
    return {
      code: u.code,
      label: u.label,
      unitCount: u.unitCount,
      avgAreaSqft: u.avgAreaSqft,
      areaSqft: area,
      pricePsf: price,
      revenue: price * area,
      bays: u.bays,
    };
  });

  const totalArea = rows.reduce((s, r) => s + r.areaSqft, 0);
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalUnits = rows.reduce((s, r) => s + r.unitCount, 0);
  const totalBays = rows.reduce((s, r) => s + r.unitCount * r.bays, 0);

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <h2>Price against the comparables band</h2>
          <span className="panel-note">
            band AED {psf(bandLow)}–{psf(bandHigh)} · {DENOMINATOR.saleable}
          </span>
        </div>
        <div className="panel-body">
          <UnitMixChart units={rows} bandLow={bandLow} bandHigh={bandHigh} />
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Unit schedule</h2>
          <span className="panel-note">
            {count(totalUnits)} units · {sqft(totalArea)} sqft saleable
          </span>
        </div>
        <div className="panel-body panel-flush">
          <div className="tbl-scroll">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Type</th>
                  <th className="r">Units</th>
                  <th className="r">Avg size</th>
                  <th className="r">Saleable area</th>
                  <th className="r">
                    Price
                    <em>per sqft saleable</em>
                  </th>
                  <th className="r">Revenue</th>
                  <th className="r">Share</th>
                  <th className="r">Bays</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const outside = r.pricePsf > bandHigh || r.pricePsf < bandLow;
                  return (
                    <tr key={r.code}>
                      <td>
                        <b>{r.label}</b>
                      </td>
                      <td className="r num">{count(r.unitCount)}</td>
                      <td className="r num">{sqft(r.avgAreaSqft)}</td>
                      <td className="r num">{sqft(r.areaSqft)}</td>
                      <td className="r num" data-outside={outside ? '' : undefined}>
                        {psf(r.pricePsf)}
                      </td>
                      <td className="r num">{aed(r.revenue)}</td>
                      <td className="r num">{pct(r.revenue / (totalRevenue || 1), 1)}</td>
                      <td className="r num">{count(r.unitCount * r.bays)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td className="r num">{count(totalUnits)}</td>
                  <td className="r">—</td>
                  <td className="r num">{sqft(totalArea)}</td>
                  <td className="r num">{psf(totalRevenue / (totalArea || 1))}</td>
                  <td className="r num">{aed(totalRevenue)}</td>
                  <td className="r num">100.0%</td>
                  <td className="r num">{count(totalBays)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </section>
    </>
  );
}

const COST_GROUPS: { title: string; keys: [string, string, (v: number) => string][] }[] = [
  {
    title: 'Construction',
    keys: [
      ['constructionPsf', 'Cost per sqft of BUA', (v) => `AED ${psf(v)}`],
      ['buaFactor', 'BUA factor (GFA ×)', (v) => v.toFixed(2)],
    ],
  },
  {
    title: 'Professional and contingency',
    keys: [
      ['archDesignRate', "Architect — design", (v) => pct(v)],
      ['archSuperRate', 'Architect — supervision', (v) => pct(v)],
      ['contingencyRate', 'Contingency on construction', (v) => pct(v)],
    ],
  },
  {
    title: 'Fixed',
    keys: [
      ['authoritiesFixed', 'Authority fees', (v) => `AED ${aed(v)}`],
      ['landscapeFixed', 'Landscaping', (v) => `AED ${aed(v)}`],
      ['miscFixed', 'Miscellaneous', (v) => `AED ${aed(v)}`],
    ],
  },
  {
    title: 'Sales and parking',
    keys: [
      ['marketingRate', 'Marketing on GDV', (v) => pct(v)],
      ['parkingBayCost', 'Cost per parking bay', (v) => `AED ${aed(v)}`],
      ['visitorBayRate', 'Visitor bays on resident bays', (v) => pct(v, 0)],
    ],
  },
  {
    title: 'Acquisition',
    keys: [['dldTransferRate', 'DLD transfer duty', (v) => pct(v)]],
  },
];

export function AssumptionsTab({ a }: { a: AppraisalDetail }) {
  const costs = (a.inputs['costs'] ?? {}) as Record<string, unknown>;
  const scenarios =
    (a.inputs['scenarios'] as { name: string; salePriceDelta: number; constructionCostDelta: number }[]) ??
    [];

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <h2>Cost assumptions</h2>
          <span className="panel-note">Dubai defaults — edit any of them on Summary</span>
        </div>
        <div className="panel-body">
          <div className="groups">
            {COST_GROUPS.map((g) => (
              <div className="group" key={g.title}>
                <h3>{g.title}</h3>
                <dl>
                  {g.keys.map(([key, label, fmt]) => (
                    <div key={key}>
                      <dt>{label}</dt>
                      <dd className="num">{fmt(big(costs[key]))}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
          <p className="chart-note">
            These come from the prototype&rsquo;s own defaults, not from a quantity surveyor. Confirm
            them against real project costs before putting a number in front of a client.
          </p>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Scenarios</h2>
          <span className="panel-note">applied to the base case</span>
        </div>
        <div className="panel-body panel-flush">
          <div className="tbl-scroll">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Scenario</th>
                  <th className="r">Sale price</th>
                  <th className="r">Construction cost</th>
                </tr>
              </thead>
              <tbody>
                {scenarios.map((s) => (
                  <tr key={s.name}>
                    <td>
                      <b>{s.name}</b>
                    </td>
                    <td className="r num">{signed(s.salePriceDelta)}</td>
                    <td className="r num">{signed(s.constructionCostDelta)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </>
  );
}

export function PlotTab({ a }: { a: AppraisalDetail }) {
  const buaFactor = big(((a.inputs['costs'] ?? {}) as Record<string, unknown>)['buaFactor']) || 1.45;
  const gfa = Number(a.gfaSqft ?? 0);
  const bua = gfa * buaFactor;
  const saleable = Number(a.saleableAreaSqft ?? 0);

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Geometry</h2>
        <span className="panel-note">three denominators, each named</span>
      </div>
      <div className="panel-body">
        <div className="groups">
          <div className="group">
            <h3>Given</h3>
            <dl>
              <div>
                <dt>Plot area</dt>
                <dd className="num">{sqft(a.landAreaSqft)} sqft</dd>
              </div>
              <div>
                <dt>FAR</dt>
                <dd className="num">{a.far ?? '—'}</dd>
              </div>
              <div>
                <dt>DLD plot number</dt>
                <dd className="num">{a.dldPlotNumber ?? '—'}</dd>
              </div>
              <div>
                <dt>Community</dt>
                <dd>{a.community ?? '—'}</dd>
              </div>
            </dl>
          </div>
          <div className="group">
            <h3>Derived</h3>
            <dl>
              <div>
                <dt>Gross floor area</dt>
                <dd className="num">{sqft(gfa)} sqft</dd>
              </div>
              <div>
                <dt>Built-up area</dt>
                <dd className="num">{sqft(bua)} sqft</dd>
              </div>
              <div>
                <dt>Saleable area</dt>
                <dd className="num">{sqft(saleable)} sqft</dd>
              </div>
              <div>
                <dt>Efficiency</dt>
                <dd className="num">{bua > 0 ? pct(saleable / bua) : '—'}</dd>
              </div>
            </dl>
          </div>
          <div className="group">
            <h3>Where each is used</h3>
            <dl>
              <div>
                <dt>Plot area</dt>
                <dd>land price per sqft</dd>
              </div>
              <div>
                <dt>Built-up area</dt>
                <dd>construction cost per sqft</dd>
              </div>
              <div>
                <dt>Saleable area</dt>
                <dd>sale price per sqft</dd>
              </div>
            </dl>
          </div>
        </div>
        <p className="chart-note">
          Conflating these three is the easiest way to be badly wrong, and it was Al Mizan&rsquo;s
          first question. GFA is derived from plot area and FAR rather than taken from an affection
          plan, because agent-entered GFA is the input most likely to be incorrect.
        </p>
      </div>
    </section>
  );
}

export function ReportTab({ a }: { a: AppraisalDetail }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Derivation</h2>
        <span className="panel-note">{a.trace.length} steps · open any row</span>
      </div>
      <div className="panel-body panel-flush">
        <Ledger steps={a.trace} />
      </div>
    </section>
  );
}

function big(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const n = Number(value.endsWith('n') ? value.slice(0, -1) : value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function signed(v: number): string {
  if (v === 0) return 'unchanged';
  return `${v > 0 ? '+' : ''}${(v * 100).toFixed(0)}%`;
}
