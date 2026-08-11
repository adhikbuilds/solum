import { aed, formatValue, humanise, isRateStep, psf } from '@/lib/format';
import type { TraceStep } from '@/lib/queries';

/**
 * The derivation ledger — the signature element.
 *
 * Al Mizan asked, in four different forms, to be told what a number means and where it came from.
 * This is the answer: every headline figure is a row, named in plain English, and opening a row
 * shows the inputs that went in. The underlying identifier and formula notation (e.g. `gdv.total`,
 * `Σ(area_i × psf_i)`) are real and available — behind the small hint mark, not printed by default.
 * A buyer reading this over someone's shoulder should see a ledger, not a spreadsheet.
 *
 * Collapsed by default. The clutter problem in the prototype was that everything was on screen at
 * once with equal weight; the fix is not less information, it is information that arrives when
 * asked for.
 */
export function Ledger({ steps }: { steps: TraceStep[] }) {
  return (
    <div className="ledger">
      {steps.map((step) => (
        <details key={step.id}>
          <summary>
            <span className="led-caret" aria-hidden="true">
              ▸
            </span>
            <span className="led-name">
              {step.label}
              <span className="led-hint" title={`${step.id}  ·  ${step.rule}`}>
                ?
              </span>
            </span>
            <span className="led-out num">{renderOutput(step)}</span>
          </summary>
          <div className="led-inputs">
            <p className="led-label">{step.label} — inputs</p>
            <StepInputs step={step} />
          </div>
        </details>
      ))}
    </div>
  );
}

function renderOutput(step: TraceStep): string {
  const { output } = step;
  if (typeof output === 'number') {
    return isRateStep(step.id) ? `AED ${psf(output)}` : `AED ${aed(output)}`;
  }
  if (typeof output === 'string') return output;
  if (Array.isArray(output)) return `${output.length} rows`;
  if (output === null || output === undefined) return '—';
  return String(output);
}

function StepInputs({ step }: { step: TraceStep }) {
  const entries = Object.entries(step.inputs);

  return (
    <>
      <table className="led-table">
        <tbody>
          {entries
            .filter(([key]) => key !== 'caveat' && key !== 'units' && key !== 'scenarios')
            .map(([key, value]) => (
              <tr key={key}>
                <td>{humanise(key)}</td>
                <td className="num">{formatValue(key, value)}</td>
              </tr>
            ))}
        </tbody>
      </table>

      {/* Per-unit revenue breakdown, when the step has one. */}
      {Array.isArray(step.inputs['units']) ? (
        <>
          <p className="led-label">By unit type</p>
          <table className="led-table">
            <tbody>
              {(step.inputs['units'] as Record<string, unknown>[]).map((u, i) => (
                <tr key={String(u['code'] ?? i)}>
                  <td>
                    {String(u['code'])} — {formatValue('areaSqft', u['areaSqft'])} sqft at AED{' '}
                    {psf(Number(u['pricePsf']))}/sqft saleable
                  </td>
                  <td className="num">AED {aed(Number(u['revenue']))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}

      {/* Scenario margins, when the step has them. */}
      {Array.isArray(step.inputs['scenarios']) ? (
        <>
          <p className="led-label">Scenarios</p>
          <table className="led-table">
            <tbody>
              {(step.inputs['scenarios'] as Record<string, unknown>[]).map((s, i) => (
                <tr key={String(s['name'] ?? i)}>
                  <td>{String(s['name'])}</td>
                  <td className="num">
                    {s['profitOnCost'] === null || s['profitOnCost'] === undefined
                      ? `price ${formatValue('rate', s['salePriceDelta'])}, cost ${formatValue('rate', s['constructionCostDelta'])}`
                      : `${(Number(s['profitOnCost']) * 100).toFixed(1)}% on cost`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}

      {/* A caveat is the engine admitting a limit. It gets annotation colour, not grey. */}
      {typeof step.inputs['caveat'] === 'string' ? (
        <p className="led-caveat">{step.inputs['caveat']}</p>
      ) : null}
    </>
  );
}
