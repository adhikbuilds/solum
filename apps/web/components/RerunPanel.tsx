'use client';

import { useActionState } from 'react';
import { rerun, type RerunState } from '@/app/plots/[id]/actions';

export interface Lever {
  name: string;
  label: string;
  current: string;
  suffix: string;
  hint?: string;
}

/**
 * Change an assumption, recompute, keep the old numbers.
 *
 * Fields are pre-filled with the current value and every one is optional — leaving a field alone
 * means "do not touch this". Values are placeholders rather than defaults so the form never
 * silently resubmits a figure the analyst did not intend to confirm.
 */
export function RerunPanel({
  plotId,
  levers,
  canWrite,
  role,
}: {
  plotId: string;
  levers: Lever[];
  canWrite: boolean;
  role: string;
}) {
  const [state, action, pending] = useActionState<RerunState, FormData>(rerun, {});

  if (!canWrite) {
    return (
      <div className="rerun rerun-locked">
        <p>
          Your role is <b>{role}</b>. You can read this appraisal and its derivation, but not change
          assumptions or re-run it.
        </p>
      </div>
    );
  }

  return (
    <form className="rerun" action={action}>
      <input type="hidden" name="plotId" value={plotId} />

      <div className="rerun-grid">
        {levers.map((l) => (
          <label className="field field-inline" key={l.name}>
            <span>{l.label}</span>
            <span className="field-wrap">
              <input
                name={l.name}
                type="text"
                inputMode="decimal"
                placeholder={l.current}
                aria-describedby={l.hint ? `${l.name}-hint` : undefined}
              />
              <span className="field-suffix">{l.suffix}</span>
            </span>
            {l.hint ? (
              <span className="field-hint" id={`${l.name}-hint`}>
                {l.hint}
              </span>
            ) : null}
          </label>
        ))}
      </div>

      <label className="field">
        <span>Note (optional)</span>
        <input name="note" type="text" placeholder="Why this run — e.g. vendor came back at 105m" />
      </label>

      {state.error ? (
        <p className="rerun-msg rerun-err" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="rerun-msg rerun-ok" role="status">
          {state.ok}
        </p>
      ) : null}

      <div className="rerun-actions">
        <button type="submit" disabled={pending}>
          {pending ? 'Recomputing…' : 'Recompute'}
        </button>
        <span className="rerun-note">
          Writes a new appraisal against the same comparables snapshot. Nothing is overwritten.
        </span>
      </div>
    </form>
  );
}
