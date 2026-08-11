/**
 * Formatting, with locales pinned.
 *
 * `toLocaleString()` without an explicit locale reads the host machine's settings — on an
 * Indian-locale machine 158,370 renders as 1,58,370. Two people must never read the same appraisal
 * and see different documents.
 */

const GROUPED = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
const GROUPED_2 = new Intl.NumberFormat('en-GB', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Fils to a grouped AED figure, no currency prefix. */
export function aed(fils: number | null | undefined): string {
  if (fils === null || fils === undefined || !Number.isFinite(fils)) return '—';
  return GROUPED.format(Math.round(fils / 100));
}

/** Fils-per-sqft to two decimals, because a psf figure is compared at that precision. */
export function psf(fils: number | string | null | undefined): string {
  const n = typeof fils === 'string' ? Number(fils) : fils;
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return GROUPED_2.format(n / 100);
}

export function sqft(value: number | string | null | undefined): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return GROUPED.format(n);
}

export function pct(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(digits)}%`;
}

export function count(value: number | string | null | undefined): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return GROUPED.format(n);
}

/** What a stamp says, and the endorsement line under it. */
export const VERDICT_COPY: Record<string, { word: string; sub: string }> = {
  PASS: { word: 'Endorsed', sub: 'clears the hurdle' },
  MARGINAL: { word: 'Held', sub: 'conditions attached' },
  FAIL: { word: 'Declined', sub: 'below the hurdle' },
  NO_VERDICT: { word: 'Withheld', sub: 'inputs disagree' },
};

/**
 * Where a figure's denominator is stated in words.
 *
 * Al Mizan's first question was whether the per-square-foot numbers are per square foot of
 * developed area. Three different denominators appear in one appraisal and conflating them is the
 * easiest way to be badly wrong, so every one is named at the point of display.
 */
export const DENOMINATOR = {
  saleable: 'per sqft of saleable area',
  bua: 'per sqft of built-up area (BUA = GFA × 1.45)',
  gfa: 'per sqft of gross floor area',
  plot: 'per sqft of plot area',
} as const;

/** Trace step ids whose output is a per-sqft rate rather than an amount. */
export function isRateStep(id: string): boolean {
  return id.includes('psf');
}

const LABELS: Record<string, string> = {
  gfaSqft: 'Gross floor area',
  buaFactor: 'BUA factor',
  constructionAreaSqft: 'Construction area (BUA)',
  basis: 'Priced on',
  denominator: 'Denominator',
  costPsf: 'Cost per sqft',
  construction: 'Construction',
  architectDesign: 'Architect — design',
  architectSupervision: 'Architect — supervision',
  contingency: 'Contingency',
  authorities: 'Authority fees',
  landscaping: 'Landscaping',
  miscellaneous: 'Miscellaneous',
  marketing: 'Marketing and sales',
  parkingBays: 'Parking bays',
  parking: 'Parking',
  totalRevenue: 'Total revenue',
  totalAreaSqft: 'Saleable area',
  compsSampleSize: 'Comparables sample',
  compsAsOf: 'Comparables as of',
  gdv: 'Gross development value',
  nonLandCost: 'Cost excluding land',
  landCost: 'Land',
  dldDuty: 'DLD transfer duty',
  totalCost: 'Total cost',
  targetProfitOnCost: 'Target profit on cost',
  dldTransferRate: 'DLD rate',
  baseProfitOnCost: 'Base profit on cost',
  passThreshold: 'Pass threshold',
  marginalThreshold: 'Marginal threshold',
  blockingFlags: 'Blocking flags',
};

export function humanise(key: string): string {
  return LABELS[key] ?? key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}

/** Keys whose values are money in fils. Everything else renders as-is. */
const MONEY_KEYS = new Set([
  'construction', 'architectDesign', 'architectSupervision', 'contingency', 'authorities',
  'landscaping', 'miscellaneous', 'marketing', 'parking', 'totalRevenue', 'gdv', 'nonLandCost',
  'landCost', 'dldDuty', 'totalCost', 'revenue',
]);

const RATE_KEYS = new Set([
  'targetProfitOnCost', 'dldTransferRate', 'baseProfitOnCost', 'passThreshold',
  'marginalThreshold', 'profitOnCost', 'aboveBandBy', 'areaShare',
]);

const PSF_KEYS = new Set(['costPsf', 'pricePsf', 'compsHighPsf', 'compsLowPsf']);

export function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (Array.isArray(value)) return value.length === 0 ? 'none' : String(value.length);
  if (typeof value === 'number') {
    if (MONEY_KEYS.has(key)) return `AED ${aed(value)}`;
    if (RATE_KEYS.has(key)) return pct(value);
    if (PSF_KEYS.has(key)) return `AED ${psf(value)}`;
    if (key.endsWith('Sqft') || key === 'parkingBays') return count(value);
    return count(value);
  }
  return String(value);
}
