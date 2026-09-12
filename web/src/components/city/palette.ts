/**
 * The city's colour rules, in one place because three of them are load-bearing.
 *
 * 1. A category meaning "we do not know" never gets a colour that competes with one that means
 *    something. Unavailable, No Data and an empty land-use all land on the same dead grey.
 * 2. A continuous scale is drawn as a scale. A column of six swatches is the right legend for a
 *    category and the wrong one for a ramp -- it implies six buckets where the colour runs.
 * 3. A ramp's stops come from the data's percentiles, not its extremes. Built on min/max, this
 *    city's value ramp put 92% of plots below its own first stop and rendered flat.
 */
export const ACCENT = '#FF6B19'
export const ACCENT_DIM = '#B84E12'
export const GREY = '#4A443E'

export const STATUS: Record<string, string> = {
  Completed: '#4E9A6B',
  'Under Construction': '#E0A253',
  'Pre-Construction': '#7FA8E0',
  Suspended: '#C4553F',
  Empty: '#3A3531',
  'No Data': GREY,
}

export const PROVENANCE: Record<string, string> = {
  authority: '#5FD08C',
  derived: '#7FA8E0',
  assumption: '#E0A253',
  unavailable: GREY,
}

export const USE: Record<string, string> = {
  RESIDENTIAL: '#E06B4A',
  'COMMERCIAL - RESIDENTIAL': '#D4A24A',
  COMMERCIAL: '#C9843C',
  'COMMERCIAL - HOSPITALITY - RESIDENTIAL': '#B9724F',
  'COMMERCIAL - HOSPITALITY': '#A97C5C',
  HOSPITALITY: '#9D6FA8',
  INDUSTRIAL: '#6E7A8A',
  UTILITIES: '#5A6B78',
  'OPEN SPACE': '#4E8A5E',
  FACILITIES: '#8A7FB0',
  TRANSPORT: '#7A8A99',
  'FUTURE DEVELOPMENT': '#6B6055',
  'COMMERCIAL - INDUSTRIAL': '#8A7A66',
}

/** Metres. Storeys that mean something in Dubai's own vocabulary, not evenly spaced numbers. */
export const HEIGHT_STOPS: [number, string][] = [
  [0, '#3B3733'], [10, '#6B5A45'], [25, '#A8743C'],
  [60, ACCENT], [120, '#FFB067'], [250, '#FFE0B8'],
]

/**
 * The value ramp, fitted to the data rather than assumed.
 *
 * The first version ran 0 -> 3,000 per sqft and was wrong about this city in a way that looked
 * right: the median plot is -623 and 64,884 of 70,183 priced plots are negative, so almost
 * everything sat below the first stop and the map showed one flat colour under a legend
 * promising a scale. Anchoring on p10 / median / p90 makes the ramp describe the distribution it
 * is painting -- including the half of it that is below zero.
 */
export function valueStops(q: { p10: number; median: number; p90: number; max: number }): [number, string][] {
  const mid = q.median
  const stops: [number, string][] = [
    [q.p10, '#8C3B57'],
    [(q.p10 + mid) / 2, '#7A5270'],
    [mid, '#4A5E72'],
    [(mid + q.p90) / 2, '#4E8A6B'],
    [q.p90, '#C9A23C'],
    [Math.max(q.p90 + 1, q.max), ACCENT],
  ]
  // MapLibre rejects an interpolate whose stops are not strictly ascending, and a distribution
  // flat enough to collide here is possible (one area, one land use).
  return stops.filter((s, i) => i === 0 || s[0] > stops[i - 1][0])
}

export const MODES = ['site', 'value', 'height', 'status', 'use', 'provenance'] as const
export type Mode = (typeof MODES)[number]

export const MODE_LABEL: Record<Mode, string> = {
  site: 'Land use',
  value: 'Residual land value',
  height: 'Permitted height',
  status: 'Construction status',
  use: 'Land use',
  provenance: 'Where the height came from',
}
