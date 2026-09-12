/**
 * The city surface, typed.
 *
 * Every one of these used to be a `fetch` written inline in a hand-maintained `city.js` against a
 * second backend on `:8081`. They are now the same origin as the study, behind the same nginx
 * proxy, so the map and the appraisal cannot drift onto different hosts or different CORS rules.
 */
import { useQuery } from '@tanstack/react-query'

/** What the map needs to describe itself. Every figure is a query, not a number baked into a file. */
export interface CityManifest {
  aoi: string
  snapshot: string
  plots: number
  height_provenance: Record<'authority' | 'derived' | 'assumption' | 'unavailable', number>
  value_verdict: Record<'priced' | 'hypothetical' | 'withheld', number>
  massing: { plots: number; volumes: number }
  /** Percentiles, not just extremes -- see `calibration_warning`. */
  rlv_psf: { min: number; p10: number; median: number; p90: number; max: number; negative: number; fixed_dominated: number }
  bounds: [number, number, number, number]
  basis: { value: string; statement: string }
  value_basis: { statement: string; calibration_warning: string }
  coverage: { measured: string; shares: Record<string, number>; statement: string }
  attribution: string[]
}

/** A plot as the tile carries it. Absent keys are absent on purpose, never zero. */
export interface PlotProps {
  id: string
  plot: string
  land?: string
  area_sqft?: number
  gfa_sqft?: number
  floors?: string
  height_m?: number
  height_src: 'authority' | 'derived' | 'assumption' | 'unavailable'
  status?: string
  use?: string
  use_detail?: string
  rlv?: number
  rlv_psf?: number
  rlv_verdict: 'priced' | 'hypothetical' | 'withheld'
  rlv_why?: string
  /** Share of non-land cost that does not scale. Above ~0.5 the figure is about the model. */
  fixed_cost_share?: number
}

export interface SearchHit {
  plot_number: string
  land_name?: string
  use?: string
  rlv_psf: number | null
  rlv_verdict: string
  lon: number
  lat: number
}

async function get<T>(url: string): Promise<T> {
  const r = await fetch(url)
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail ?? `HTTP ${r.status}`)
  return r.json() as Promise<T>
}

export const useCityManifest = () =>
  useQuery({
    queryKey: ['city', 'manifest'],
    queryFn: () => get<CityManifest>('/api/city/manifest'),
    // A snapshot is immutable; the manifest describing it cannot change while the page is open.
    staleTime: Infinity,
    // No retry. The failure this call actually has is "nothing is loaded yet", which is a state
    // with an instruction attached, not a blip -- and react-query's default three retries kept
    // the screen on "loading the city" long enough to look hung instead of showing the fix.
    retry: false,
  })

export const useCitySearch = (q: string) =>
  useQuery({
    queryKey: ['city', 'search', q],
    queryFn: () => get<{ results: SearchHit[] }>(`/api/city/search?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length >= 2,
    staleTime: 60_000,
  })

/**
 * The full study for one plot, solved live from DDA.
 *
 * Deliberately not served from the snapshot. The map's RLV is a fast derivation over a dated
 * acquisition; this re-fetches the plot and insets the setbacks from the real edges, in EPSG:3997.
 * Serving both from the same rows would make them agree by construction and hide the one
 * disagreement a user needs to see.
 */
export const useCityStudy = (plot: string | null, optimistic = false) =>
  useQuery({
    queryKey: ['city', 'study', plot, optimistic],
    queryFn: () => get<CityStudy>(`/api/city/appraise/${encodeURIComponent(plot!)}?optimistic=${optimistic}`),
    enabled: !!plot,
    retry: false,
  })

export interface CityStudy {
  plot_number: string
  verdict?: 'withheld'
  why?: string
  setback_bound?: string
  scheme?: {
    floors: number; gfa_sqft: number; gfa_utilisation: number
    binding_constraint: string; total_units: number; parking_bays: number | null
  }
  money?: {
    residual_land_value: number; rlv_psf_land: number; gdv: number
    non_land_cost: number; blended_psf: number; breakeven_psf: number
  }
  regulation?: { unavailable: string[] }
  district_is_scenery?: string
}

export const TILE_URL = '/api/city/tiles/{layer}/{z}/{x}/{y}.mvt'
