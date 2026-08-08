/**
 * Money is integer fils. 1 AED = 100 fils.
 *
 * Never floats. A land valuation carrying floating-point drift is indefensible in front of a
 * credit committee, and the error compounds through every downstream metric.
 *
 * Rates (price per square foot) are also fils — fils per sqft. Areas are plain numbers, because
 * square footage is a genuine measurement and fractional sqft is meaningful.
 */

/** An amount of money, in fils. */
export type Fils = bigint;

/** A price per square foot, in fils per sqft. */
export type FilsPerSqft = bigint;

/** A decimal rate. 0.04 is 4%. */
export type Rate = number;

export const FILS_PER_AED = 100n;

export function aed(amount: number): Fils {
  if (!Number.isFinite(amount)) {
    throw new RangeError(`aed() requires a finite number, received ${amount}`);
  }
  return BigInt(Math.round(amount * 100));
}

export function toAed(fils: Fils): number {
  return Number(fils) / 100;
}

/**
 * Multiply a per-sqft rate by an area, rounding to the nearest fil.
 *
 * Areas are floats, so this is the one place a float touches money. It is deliberately isolated
 * here and rounded immediately, rather than allowed to propagate.
 */
export function mulByArea(rate: FilsPerSqft, areaSqft: number): Fils {
  if (!Number.isFinite(areaSqft)) {
    throw new RangeError(`mulByArea() requires a finite area, received ${areaSqft}`);
  }
  return BigInt(Math.round(Number(rate) * areaSqft));
}

/** Apply a decimal rate to an amount, rounding to the nearest fil. */
export function mulByRate(amount: Fils, rate: Rate): Fils {
  if (!Number.isFinite(rate)) {
    throw new RangeError(`mulByRate() requires a finite rate, received ${rate}`);
  }
  return BigInt(Math.round(Number(amount) * rate));
}

/**
 * Divide money by an area to recover a per-sqft rate, rounding to the nearest fil.
 * Returns null for zero area rather than producing Infinity.
 */
export function divByArea(amount: Fils, areaSqft: number): FilsPerSqft | null {
  if (areaSqft <= 0 || !Number.isFinite(areaSqft)) return null;
  return BigInt(Math.round(Number(amount) / areaSqft));
}

export function sum(amounts: readonly Fils[]): Fils {
  return amounts.reduce((total, a) => total + a, 0n);
}

/** Ratio of two amounts as a decimal. Returns null when the denominator is zero. */
export function ratio(numerator: Fils, denominator: Fils): Rate | null {
  if (denominator === 0n) return null;
  return Number(numerator) / Number(denominator);
}

export function formatAed(fils: Fils): string {
  const negative = fils < 0n;
  const abs = negative ? -fils : fils;
  const whole = abs / FILS_PER_AED;
  const frac = abs % FILS_PER_AED;
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}AED ${grouped}.${frac.toString().padStart(2, '0')}`;
}
