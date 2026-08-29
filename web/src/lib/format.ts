const nf = new Intl.NumberFormat('en-US')

export const num = (n: number | null | undefined, d = 0) =>
  n == null ? '—' : n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })

export const sqft = (n: number | null | undefined) => (n == null ? '—' : `${nf.format(Math.round(n))} sqft`)

/** AED, abbreviated. A land valuation is read at a glance; the full digits belong in a tooltip. */
export function aed(n: number | null | undefined): string {
  if (n == null) return '—'
  const a = Math.abs(n)
  if (a >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (a >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (a >= 1e3) return `${Math.round(n / 1e3)}K`
  return String(Math.round(n))
}

export const aedFull = (n: number | null | undefined) => (n == null ? '—' : `AED ${nf.format(Math.round(n))}`)
export const pct = (n: number | null | undefined, d = 0) => (n == null ? '—' : `${(n * 100).toFixed(d)}%`)
