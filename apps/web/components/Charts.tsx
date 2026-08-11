import { aed, pct, psf } from '@/lib/format';

/*
 * Inline SVG rather than a charting library.
 *
 * Every series here is under a dozen points and none needs interaction beyond a tooltip, so a
 * dependency would cost more than it returns — and the figures always appear as text beside the
 * chart, so nothing depends on reading a picture. That matters for an audit document.
 */

const PALETTE = {
  construction: '#1d6f6a',
  architect: '#3d8c86',
  contingency: '#6aa8a3',
  parking: '#96c4c0',
  marketing: '#c0dbd9',
  fixed: '#dceceb',
  land: '#8a5a11',
  duty: '#c08a2a',
};

export interface CostSlice {
  key: keyof typeof PALETTE;
  label: string;
  value: number;
}

/**
 * Where the money goes, as one bar.
 *
 * A stacked bar rather than a pie: the question a developer asks is "how much of my cost is
 * construction", which is a length comparison, and lengths are read far more accurately than angles.
 */
export function CostBreakdown({
  slices,
  gdv,
  totalCost,
}: {
  slices: CostSlice[];
  gdv: number;
  totalCost: number;
}) {
  const total = slices.reduce((a, s) => a + s.value, 0) || 1;
  const scale = Math.max(total, gdv) || 1;
  let x = 0;

  return (
    <div className="chart">
      <svg viewBox="0 0 1000 110" role="img" aria-label="Cost breakdown against gross development value" preserveAspectRatio="none">
        {/* GDV reference bar, behind. */}
        <rect x="0" y="4" width={(gdv / scale) * 1000} height="34" className="gdv-bar" />

        {slices.map((s) => {
          const w = (s.value / scale) * 1000;
          const el = (
            <rect
              key={s.key}
              x={x}
              y="52"
              width={Math.max(w, 0)}
              height="46"
              fill={PALETTE[s.key]}
              className="cost-seg"
            >
              <title>
                {s.label}: AED {aed(s.value)} · {pct(s.value / total, 1)} of cost
              </title>
            </rect>
          );
          x += w;
          return el;
        })}

        {/* Profit, if any: the gap between cost and GDV. */}
        {gdv > totalCost ? (
          <rect
            x={(totalCost / scale) * 1000}
            y="52"
            width={((gdv - totalCost) / scale) * 1000}
            height="46"
            className="profit-seg"
          >
            <title>Profit: AED {aed(gdv - totalCost)}</title>
          </rect>
        ) : null}
      </svg>

      <ul className="legend">
        {slices.map((s) => (
          <li key={s.key}>
            <i style={{ background: PALETTE[s.key] }} />
            {s.label}
            <b className="num">AED {aed(s.value)}</b>
            <em className="num">{pct(s.value / total, 1)}</em>
          </li>
        ))}
        {gdv > totalCost ? (
          <li>
            <i className="legend-profit" />
            Profit
            <b className="num">AED {aed(gdv - totalCost)}</b>
            <em className="num">{pct((gdv - totalCost) / totalCost, 1)} on cost</em>
          </li>
        ) : null}
      </ul>
    </div>
  );
}

/**
 * Scenarios against the hurdle.
 *
 * The hurdle line is the point of the chart — a bar that clears it is a deal and one that does not
 * is a conversation. Bars below zero are drawn in annotation red because a loss-making scenario is
 * the thing that should stop someone.
 */
export function ScenarioChart({
  scenarios,
  hurdle,
}: {
  scenarios: { name: string; profitOnCost: number | null }[];
  hurdle: number;
}) {
  const values = scenarios.map((s) => s.profitOnCost ?? 0);
  const max = Math.max(hurdle * 1.35, ...values, 0.05);
  const min = Math.min(0, ...values);
  const span = max - min || 1;

  // A wide viewBox with the aspect preserved. Stretching a tall, narrow one to the container
  // width blows the bars far past the panel, which is what happened the first time.
  const W = 420;
  const H = 190;
  const padT = 14;
  const padB = 16;
  const plot = H - padT - padB;
  const y = (v: number) => padT + ((max - v) / span) * plot;
  const zero = y(0);
  const bw = W / scenarios.length;

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Return on cost by scenario against the hurdle">
        {/* Hurdle */}
        <line x1="0" x2={W} y1={y(hurdle)} y2={y(hurdle)} className="hurdle-line" />
        <line x1="0" x2={W} y1={zero} y2={zero} className="zero-line" />

        {scenarios.map((s, i) => {
          const v = s.profitOnCost ?? 0;
          const top = v >= 0 ? y(v) : zero;
          const h = Math.abs(y(v) - zero);
          const clears = v >= hurdle;
          return (
            <rect
              key={s.name}
              x={i * bw + bw * 0.24}
              y={top}
              width={bw * 0.52}
              height={Math.max(h, 1)}
              className={v < 0 ? 'bar-loss' : clears ? 'bar-clear' : 'bar-short'}
            >
              <title>
                {s.name}: {pct(v, 1)} on cost
              </title>
            </rect>
          );
        })}
      </svg>

      <div className="chart-axis">
        {scenarios.map((s) => (
          <span key={s.name}>
            <b>{s.name}</b>
            <em className="num" data-neg={(s.profitOnCost ?? 0) < 0 ? '' : undefined}>
              {pct(s.profitOnCost, 1)}
            </em>
          </span>
        ))}
      </div>
      <p className="chart-note">
        Dashed line is the {pct(hurdle, 0)} hurdle. A bar below zero is a scenario that loses money.
      </p>
    </div>
  );
}

/**
 * Unit mix by revenue contribution, with each type's price against the comparables band.
 *
 * This is the panel the prototype did not have and the one Al Mizan's pricing question needed: the
 * band and the price sit on the same row, so a type priced outside it is visible where it is typed
 * rather than three screens away.
 */
export function UnitMixChart({
  units,
  bandLow,
  bandHigh,
}: {
  units: { code: string; label: string; areaSqft: number; pricePsf: number; revenue: number }[];
  bandLow: number;
  bandHigh: number;
}) {
  const totalRevenue = units.reduce((a, u) => a + u.revenue, 0) || 1;
  const lo = Math.min(bandLow, ...units.map((u) => u.pricePsf)) * 0.96;
  const hi = Math.max(bandHigh, ...units.map((u) => u.pricePsf)) * 1.04;
  const span = hi - lo || 1;
  const pos = (v: number) => ((v - lo) / span) * 100;

  return (
    <div className="mix">
      {units.map((u) => {
        const outside = u.pricePsf > bandHigh || u.pricePsf < bandLow;
        return (
          <div className="mix-row" key={u.code}>
            <div className="mix-head">
              <b>{u.label}</b>
              <span className="num">{Math.round(u.areaSqft).toLocaleString('en-GB')} sqft</span>
              <span className="num mix-share">{pct(u.revenue / totalRevenue, 1)} of revenue</span>
            </div>
            <div className="mix-track">
              {/* The comparables band, as a region rather than a number. */}
              <div
                className="mix-band"
                style={{ left: `${pos(bandLow)}%`, width: `${pos(bandHigh) - pos(bandLow)}%` }}
                title={`Comparables band AED ${psf(bandLow)}–${psf(bandHigh)}/sqft`}
              />
              <div
                className="mix-marker"
                data-outside={outside ? '' : undefined}
                style={{ left: `${pos(u.pricePsf)}%` }}
                title={`${u.label} priced at AED ${psf(u.pricePsf)}/sqft`}
              />
            </div>
            <div className="mix-foot num">
              <span data-outside={outside ? '' : undefined}>AED {psf(u.pricePsf)}/sqft</span>
              <span>AED {aed(u.revenue)}</span>
            </div>
          </div>
        );
      })}
      <p className="chart-note">
        Shaded region is the comparables band for this community. A marker outside it is a price the
        market data does not support.
      </p>
    </div>
  );
}
