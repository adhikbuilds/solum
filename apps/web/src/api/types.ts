/** Mirrors the massing service response. Kept hand-written so a shape change fails at compile time. */

export type Provenance = 'authority' | 'derived' | 'assumption' | 'deferred' | 'unavailable'

export interface PlotFacts {
  number: string
  landuse: string | null
  area_sqft: number | null
  permitted_gfa_sqft: number | null
  max_floors: number | null
  implied_far: number | null
  setbacks_m: number[]
  setbacks_complete: boolean
  parking_rule_sqm_per_bay: number | null
}

export interface UnitLine {
  code: string; label: string; count: number
  size_sqft: number; price_psf: number; area_sqft: number; revenue: number
}

export interface Feasibility {
  saleable_sqft: number; efficiency: number
  units: UnitLine[]; total_units: number; bays: number
  gdv: number; construction: number; soft_costs: number
  parking_cost: number; marketing: number; non_land_cost: number
  residual_land_value: number; rlv_psf_land: number
  blended_psf: number; breakeven_psf: number
  construction_premium_pct: number
}

export interface SchemeInfo {
  basement_levels: number; podium_levels: number; tower_levels: number
  podium_footprint_sqft: number; tower_footprint_sqft: number
  parking_provided: number; parking_required: number; parking_shortfall: number
  basis: string
}

export type LevelKind = 'basement' | 'podium' | 'tower'

export interface Level {
  kind: LevelKind; index: number; use: string
  footprint_sqft: number; base_m: number; height_m: number
  rings: number[][][]
}

export interface Solid {
  floors: number; gfa_sqft: number; footprint_sqft: number
  height_m: number; depth_m: number
  binding_constraint: string
  parking_bays: number | null
  gfa_utilisation: number
  scheme: SchemeInfo
  levels: Level[]
  feasibility: Feasibility
}

export interface BasemapTile {
  url: string
  /** NW, NE, SE, SW in scene-local metres, already in the viewer's frame. */
  corners: number[][]
}

export interface Basemap {
  zoom: number
  attribution: string
  tiles: BasemapTile[]
}

export interface Study {
  plot: PlotFacts
  provenance: Record<string, string>
  geometry: {
    parcel_rings: number[][][]
    envelope_conservative_rings: number[][][]
    envelope_optimistic_rings: number[][][]
    bounded: boolean
  }
  floor_height_m: number
  context?: {
    plot_number: string
    landuse: string | null
    floors: number
    height_m: number
    rings: number[][][]
  }[]
  basemap?: Basemap | null
  solids: Solid[]
  best_by_rlv: number | null
  setback_mode: 'conservative' | 'optimistic'
}

/** ---- multi-plot screening (`/api/compare`) ---- */

/** One end of a plot's range: the best candidate under one setback assignment. */
export interface CompareBound {
  floors: number
  gfa_sqft: number
  gfa_utilisation: number
  binding_constraint: string
  total_units: number
  residual_land_value: number
  rlv_psf_land: number
}

export type CompareStatus = 'ok' | 'off_register' | 'invalid' | 'error' | 'no_candidates'

/** The winning scheme's slabs and outlines, present only when `geometry=true` was requested. */
export interface CompareGeometry {
  parcel_rings: number[][][]
  envelope_rings: number[][][]
  levels: Level[]
  height_m: number
  floors: number
}

export interface CompareRow {
  plot_number: string
  status: CompareStatus
  geometry?: CompareGeometry | null
  /** Present on every status except `ok`: why this plot could not be priced. */
  detail?: string
  landuse?: string | null
  land_name?: string | null
  area_sqft?: number | null
  permitted_gfa_sqft?: number | null
  max_floors?: number | null
  implied_far?: number | null
  low?: CompareBound
  high?: CompareBound
  /** False when a side was deferred: low and high are two readings, not two ends of a range. */
  bounded?: boolean
  setbacks_complete?: boolean
  parking_deferred?: boolean
  /**
   * Plots ranked below this one whose range still reaches it, so the ordering between them is
   * not supported by the data. `null` when this row is unbounded and no interval test applies.
   */
  contested_by?: string[] | null
  provenance?: Record<string, string>
}

export interface Comparison {
  rows: CompareRow[]
  ranked_on: string
  requested: number
  priced: number
}
