/**
 * Internal rate of return, with an explicit failure mode.
 *
 * IRR is undefined for a cashflow with no sign change, and ambiguous for one with several. The
 * dangerous behaviour is returning a plausible-looking number for a degenerate series — that is
 * the same class of bug as printing PASS on a loss-making downside, and it is why this returns a
 * discriminated union rather than a bare number. Callers cannot accidentally consume a
 * non-existent IRR.
 *
 * Method: bisection to bracket a sign change in NPV, then Newton–Raphson for convergence, falling
 * back to bisection when Newton leaves the bracket or the derivative vanishes. Bisection alone is
 * slow but cannot diverge; Newton alone is fast but can. The combination is the standard choice
 * and it is deterministic, which matters because the engine must be reproducible.
 */

export type IrrResult =
  | { ok: true; rate: number; iterations: number }
  | { ok: false; reason: IrrFailure };

export type IrrFailure =
  | 'EMPTY_CASHFLOW'
  | 'NO_SIGN_CHANGE'
  | 'MULTIPLE_SIGN_CHANGES'
  | 'NO_CONVERGENCE';

const LOWER_BOUND = -0.9999;
const UPPER_BOUND = 100;
const TOLERANCE = 1e-9;
const MAX_ITERATIONS = 200;

/**
 * @param cashflows Amounts per period, period 0 first. Negative is outflow.
 *                  Passed as plain numbers in AED — IRR is a rate, so precision at the fil level
 *                  is irrelevant to the result and bigint arithmetic would only obscure it.
 */
export function irr(cashflows: readonly number[]): IrrResult {
  if (cashflows.length === 0) return { ok: false, reason: 'EMPTY_CASHFLOW' };

  const signChanges = countSignChanges(cashflows);
  if (signChanges === 0) return { ok: false, reason: 'NO_SIGN_CHANGE' };
  if (signChanges > 1) {
    // Descartes' rule allows up to `signChanges` real roots. Rather than return an arbitrary one,
    // decline. A multi-root cashflow needs MIRR or a stated reinvestment assumption.
    return { ok: false, reason: 'MULTIPLE_SIGN_CHANGES' };
  }

  let low = LOWER_BOUND;
  let high = UPPER_BOUND;
  let npvLow = npv(cashflows, low);
  const npvHigh = npv(cashflows, high);

  if (!Number.isFinite(npvLow) || !Number.isFinite(npvHigh)) {
    return { ok: false, reason: 'NO_CONVERGENCE' };
  }
  if (Math.sign(npvLow) === Math.sign(npvHigh)) {
    return { ok: false, reason: 'NO_SIGN_CHANGE' };
  }

  let rate = 0.1;
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const value = npv(cashflows, rate);
    if (Math.abs(value) < TOLERANCE) return { ok: true, rate, iterations: i };

    // Maintain the bracket regardless of which method moves us.
    if (Math.sign(value) === Math.sign(npvLow)) {
      low = rate;
      npvLow = value;
    } else {
      high = rate;
    }

    const slope = dNpv(cashflows, rate);
    const newton = slope === 0 || !Number.isFinite(slope) ? NaN : rate - value / slope;

    rate =
      Number.isFinite(newton) && newton > low && newton < high ? newton : (low + high) / 2;

    if (high - low < TOLERANCE) return { ok: true, rate, iterations: i };
  }

  return { ok: false, reason: 'NO_CONVERGENCE' };
}

export function npv(cashflows: readonly number[], rate: number): number {
  let total = 0;
  for (let t = 0; t < cashflows.length; t++) {
    total += (cashflows[t] ?? 0) / Math.pow(1 + rate, t);
  }
  return total;
}

function dNpv(cashflows: readonly number[], rate: number): number {
  let total = 0;
  for (let t = 1; t < cashflows.length; t++) {
    total -= (t * (cashflows[t] ?? 0)) / Math.pow(1 + rate, t + 1);
  }
  return total;
}

function countSignChanges(cashflows: readonly number[]): number {
  let changes = 0;
  let previous = 0;
  for (const amount of cashflows) {
    if (amount === 0) continue;
    const sign = Math.sign(amount);
    if (previous !== 0 && sign !== previous) changes++;
    previous = sign;
  }
  return changes;
}
