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
  solids: Solid[]
  best_by_rlv: number | null
  setback_mode: 'conservative' | 'optimistic'
}
