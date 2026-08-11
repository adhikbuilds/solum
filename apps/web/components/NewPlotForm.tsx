'use client';

import { useActionState, useState } from 'react';
import { createPlot, type NewPlotState } from '@/app/plots/new/actions';
import type { CommunityOption } from '@/lib/queries';

const BUA_FACTOR = 1.45;
const BASE_EFFICIENCY = 0.82;

/**
 * Derived figures update as you type.
 *
 * GFA, BUA and saleable area are not asked for — they follow from plot area and FAR. Showing them
 * live is the difference between a form and a tool: the analyst sees the consequence of the FAR
 * they just typed before committing to it.
 */
export function NewPlotForm({ communities }: { communities: CommunityOption[] }) {
  const [state, action, pending] = useActionState<NewPlotState, FormData>(createPlot, {});
  const [plotArea, setPlotArea] = useState('');
  const [far, setFar] = useState('');

  const area = Number(plotArea.replace(/,/g, ''));
  const farNum = Number(far.replace(/,/g, ''));
  const derivable = Number.isFinite(area) && area > 0 && Number.isFinite(farNum) && farNum > 0;
  const gfa = derivable ? area * farNum : null;
  const bua = gfa === null ? null : gfa * BUA_FACTOR;
  const saleable = bua === null ? null : bua * BASE_EFFICIENCY;

  const usable = communities.filter((c) => c.latestSnapshotId);

  return (
    <form className="sheet sheet-form" action={action}>
      <div className="sheet-body">
        <label className="field">
          <span>Plot name</span>
          <input name="name" required placeholder="e.g. Wadi Al Safa 3 — Plot 4471" autoFocus />
        </label>

        <div className="rerun-grid">
          <label className="field">
            <span>Community</span>
            <select name="communityId" required defaultValue={usable[0]?.id ?? ''}>
              {usable.length === 0 ? <option value="">No community has comparables yet</option> : null}
              {usable.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.transactionCount.toLocaleString('en-GB')} transactions
                </option>
              ))}
            </select>
            <span className="field-hint">Comparables are held per community.</span>
          </label>

          <label className="field">
            <span>DLD plot number</span>
            <input name="plotNumber" inputMode="numeric" placeholder="optional" />
          </label>

          <label className="field">
            <span>Plot area</span>
            <span className="field-wrap">
              <input
                name="plotAreaSqft"
                required
                inputMode="decimal"
                value={plotArea}
                onChange={(e) => setPlotArea(e.target.value)}
                placeholder="62,000"
              />
              <span className="field-suffix">sqft</span>
            </span>
          </label>

          <label className="field">
            <span>FAR</span>
            <span className="field-wrap">
              <input
                name="far"
                required
                inputMode="decimal"
                value={far}
                onChange={(e) => setFar(e.target.value)}
                placeholder="3.194"
              />
              <span className="field-suffix">× plot area</span>
            </span>
          </label>

          <label className="field">
            <span>Asking price</span>
            <span className="field-wrap">
              <input name="landCostAed" required inputMode="decimal" placeholder="83,000,000" />
              <span className="field-suffix">AED</span>
            </span>
          </label>

          <label className="field">
            <span>Total units</span>
            <span className="field-wrap">
              <input name="unitCount" required inputMode="numeric" placeholder="147" />
              <span className="field-suffix">across the mix</span>
            </span>
            <span className="field-hint">Split across studio to 3BR using the default bands.</span>
          </label>
        </div>

        {/* Derived, not asked for. */}
        <div className="derived">
          <p className="derived-h">Derived from what you entered</p>
          <div className="derived-row">
            <span>
              <b>{fmt(gfa)}</b> sqft GFA
              <em>plot area × FAR</em>
            </span>
            <span>
              <b>{fmt(bua)}</b> sqft BUA
              <em>GFA × {BUA_FACTOR} — construction is priced on this</em>
            </span>
            <span>
              <b>{fmt(saleable)}</b> sqft saleable
              <em>BUA × {(BASE_EFFICIENCY * 100).toFixed(0)}% efficiency — revenue is priced on this</em>
            </span>
          </div>
        </div>

        {state.error ? (
          <p className="rerun-msg rerun-err" role="alert">
            {state.error}
          </p>
        ) : null}

        <div className="rerun-actions">
          <button type="submit" disabled={pending || usable.length === 0}>
            {pending ? 'Appraising…' : 'Create and appraise'}
          </button>
          <span className="rerun-note">
            Runs the engine immediately against the community&rsquo;s latest comparables snapshot.
          </span>
        </div>
      </div>
    </form>
  );
}

function fmt(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return Math.round(value).toLocaleString('en-GB');
}
