/**
 * Dubai, every plot DDA publishes, as vector tiles cut from Postgres.
 *
 * This replaces a hand-written `city.js` that talked to a second backend on `:8081` and read a
 * 33 MB PMTiles file plus a 3.2 MB search index held in process memory. The tiles now come from
 * `/api/city/tiles/...` on the same origin as everything else, and the search is a query.
 *
 * What did not change is the rule about numbers. Nothing here computes anything: heights and
 * residual land values were resolved offline in EPSG:3997 and travel as tile attributes carrying
 * the rung they came from. A plot with no published height has no `height_m` key at all and is
 * drawn as an outline, never extruded -- 13,973 plots depend on that being an absence rather than
 * a zero.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import maplibregl, { type ExpressionSpecification, type Map as MLMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { TILE_URL, type CityManifest, type PlotProps } from '@/api/city'
import { ACCENT, ACCENT_DIM, GREY, HEIGHT_STOPS, MODE_LABEL, PROVENANCE, STATUS, USE, valueStops, type Mode } from './palette'

const BASEMAP = 'https://tiles.openfreemap.org/styles/dark'
const SATELLITE =
  'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'

/** Neither source has building geometry below this, so the toggles say so instead of doing nothing. */
export const BUILDINGS_MINZOOM = 13.5

interface Props {
  manifest: CityManifest
  mode: Mode
  massing: boolean
  satellite: boolean
  flyTo: { lon: number; lat: number; plot: string } | null
  onSelect: (p: PlotProps | null) => void
  onZoom: (z: number) => void
}

function match(field: string, table: Record<string, string>, fallback: string): ExpressionSpecification {
  const out: unknown[] = ['match', ['coalesce', ['get', field], '']]
  for (const [k, v] of Object.entries(table)) out.push(k, v)
  out.push(fallback)
  return out as ExpressionSpecification
}

function ramp(stops: [number, string][], field: string, fallback = 0): ExpressionSpecification {
  const e: unknown[] = ['interpolate', ['linear'], ['coalesce', ['get', field], fallback]]
  for (const [v, c] of stops) e.push(v, c)
  return e as ExpressionSpecification
}

export function CityMap({ manifest, mode, massing, satellite, flyTo, onSelect, onZoom }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<MLMap | null>(null)
  const [ready, setReady] = useState(false)
  const [hover, setHover] = useState<PlotProps | null>(null)
  const [cam, setCam] = useState({ bearing: 0, pitch: 0 })

  const stops = useMemo(() => valueStops(manifest.rlv_psf), [manifest.rlv_psf])

  const fill = useMemo((): ExpressionSpecification => {
    if (mode === 'value') {
      // Withheld is not the bottom of the ramp -- it is off it. A plot where no scheme survives
      // the published envelope has no number, and giving it the colour of a worthless plot
      // invents a finding.
      return ['case', ['==', ['get', 'rlv_verdict'], 'withheld'], GREY, ramp(stops, 'rlv_psf', stops[0][0])] as ExpressionSpecification
    }
    if (mode === 'status') return match('status', STATUS, GREY)
    if (mode === 'provenance') return match('height_src', PROVENANCE, GREY)
    if (mode === 'height') {
      return ['case', ['==', ['get', 'height_src'], 'unavailable'], GREY, ramp(HEIGHT_STOPS, 'height_m')] as ExpressionSpecification
    }
    return match('use', USE, GREY)
  }, [mode, stops])

  const opacity = useMemo((): ExpressionSpecification => {
    if (mode === 'value') {
      // Hypothetical keeps its value and loses its saturation: a figure you may not line up
      // against the one beside it, because the premise behind it is different.
      return ['match', ['coalesce', ['get', 'rlv_verdict'], 'withheld'], 'hypothetical', 0.42, 0.82] as ExpressionSpecification
    }
    if (mode === 'site') {
      // Site steps back as the real city comes up. Below z13.5 the wash IS the map -- there are
      // no buildings yet. Above it the wash becomes ground colour under real buildings.
      return ['interpolate', ['linear'], ['zoom'], 9, 0.5, 13, 0.6, 14.5, 0.34, 17, 0.28] as ExpressionSpecification
    }
    return ['interpolate', ['linear'], ['zoom'], 9, 0.62, 13, 0.78, 16, 0.82] as ExpressionSpecification
  }, [mode])

  const massFill = useMemo((): ExpressionSpecification => {
    const base = mode === 'site' ? ACCENT : fill
    return ['case', ['==', ['get', 'kind'], 'podium'], mode === 'site' ? ACCENT_DIM : base, base] as ExpressionSpecification
  }, [mode, fill])

  // ---- one-time construction ----------------------------------------------------------------
  useEffect(() => {
    if (!container.current || map.current) return
    // Constructed on a plain centre and zoom, NOT on `bounds` + padding.
    //
    // MapLibre applies constructor bounds during construction, against a container that React has
    // only just attached and CSS has not necessarily sized yet. Fitting a 60 km envelope into a
    // container whose height is still settling produces a transform the map never recovers from:
    // it loads its style, reports no error, and then requests not one tile -- basemap or ours.
    // The fix is to let it start somewhere valid and frame the data once the size is real.
    const m = new maplibregl.Map({
      container: container.current,
      style: BASEMAP,
      center: [55.2708, 25.15], zoom: 9.6,
      // 85 is MapLibre's ceiling and the one worth having: at 70 the camera still looks down at
      // the city, and the view that shows a tower against its neighbours is the near-horizontal
      // one. Rotation was always enabled -- right-drag and ctrl-drag both bear -- but 70 made it
      // feel as though the angle was locked when it was only shallow.
      maxPitch: 85, attributionControl: false, hash: true,
    })
    map.current = m

    m.on('load', () => {
      try {
      m.addSource('satellite', {
        type: 'raster', tileSize: 256, maxzoom: 19, tiles: [SATELLITE],
      })
      const firstSymbol = m.getStyle().layers?.find((l) => l.type === 'symbol')
      m.addLayer({ id: 'ground-sat', type: 'raster', source: 'satellite',
        layout: { visibility: 'none' }, paint: { 'raster-opacity': 0.85 } }, firstSymbol?.id)

      // Built by concatenation, NOT `new URL(...)`. The URL constructor percent-encodes the
      // braces, so MapLibre received a literal `%7Bz%7D` it never substituted and requested
      // exactly zero tiles -- a black map under a working legend, which is the worst kind of
      // broken because every other part of the page looks correct.
      const tileUrl = (layer: string) => `${location.origin}${TILE_URL.replace('{layer}', layer)}`
      m.addSource('city', { type: 'vector', tiles: [tileUrl('plots')], minzoom: 8, maxzoom: 16 })
      m.addSource('scheme', { type: 'vector', tiles: [tileUrl('massing')], minzoom: 13, maxzoom: 16 })

      // The as-built city, from the basemap's own OSM buildings. No second source and no key:
      // `render_height` was always inside these tiles, unextruded. Grey on purpose -- the moment
      // it takes a colour it competes with the layer carrying the answer.
      m.addLayer({
        id: 'city-3d', type: 'fill-extrusion', source: 'openmaptiles', 'source-layer': 'building',
        minzoom: BUILDINGS_MINZOOM,
        paint: {
          'fill-extrusion-color': ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 0],
            0, '#33302D', 40, '#4A4642', 120, '#6E6862', 300, '#8E877F'],
          'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 4],
          'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
          'fill-extrusion-opacity': ['interpolate', ['linear'], ['zoom'], BUILDINGS_MINZOOM, 0, 15, 0.9],
          'fill-extrusion-vertical-gradient': true,
        },
      })

      // Beneath the buildings, deliberately: a `fill` added after a `fill-extrusion` paints over
      // it, and the plot wash was covering the buildings standing on the plot.
      m.addLayer({ id: 'plots-fill', type: 'fill', source: 'city', 'source-layer': 'plots',
        paint: { 'fill-color': fill, 'fill-opacity': opacity } }, 'city-3d')

      m.addLayer({ id: 'plots-line', type: 'line', source: 'city', 'source-layer': 'plots',
        paint: {
          'line-color': 'rgba(255,255,255,0.30)',
          'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.2, 15, 0.5, 18, 0.9],
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 11.5, 0, 13, 1],
        } })

      // The scheme, not the plot. Rectilinear blocks fitted to the site axis, tower capped for
      // daylight, podium left full -- the same massing the district viewer draws.
      m.addLayer({ id: 'scheme-3d', type: 'fill-extrusion', source: 'scheme', 'source-layer': 'massing',
        minzoom: BUILDINGS_MINZOOM, layout: { visibility: 'none' },
        paint: {
          'fill-extrusion-color': massFill,
          'fill-extrusion-height': ['get', 'top_m'],
          'fill-extrusion-base': ['get', 'base_m'],
          'fill-extrusion-opacity': 0.94,
          'fill-extrusion-vertical-gradient': true,
        } })

      m.addLayer({ id: 'plots-hover', type: 'line', source: 'city', 'source-layer': 'plots',
        filter: ['==', ['get', 'id'], ''], paint: { 'line-color': '#FFFFFF', 'line-width': 1.6 } })
      m.addLayer({ id: 'plots-selected', type: 'line', source: 'city', 'source-layer': 'plots',
        filter: ['==', ['get', 'id'], ''], paint: { 'line-color': ACCENT, 'line-width': 2.4 } })

      setReady(true)
      // The container is sized by CSS that lands after the map is constructed, so the first
      // canvas can come out short. One resize once the style is up costs nothing and is the
      // difference between a 300 px strip and a map.
      m.resize()
      // Now that the canvas has its real size, frame the plots. `hash` wins when there is one,
      // because a shared link is a deliberate view.
      if (!location.hash) {
        m.fitBounds([[manifest.bounds[0], manifest.bounds[1]], [manifest.bounds[2], manifest.bounds[3]]],
          { padding: { top: 84, bottom: 40, left: 340, right: 40 }, duration: 0 })
      }
      } catch (err) {
        // MapLibre swallows a throw inside its own event handler, so a single bad layer spec
        // silently aborts the rest of this function -- no sources, no tiles, and a black map
        // under a legend that looks perfectly healthy. Surfacing it is the difference between
        // ten minutes and an afternoon.
        console.error('[city] failed while building layers:', err)
      }
    })

    // And again whenever the container itself changes -- opening the plot panel does not, but a
    // window resize and the study/city switch both do.
    const ro = new ResizeObserver(() => m.resize())
    ro.observe(container.current)

    m.on('error', (e) => console.error('[city] maplibre:', e.error?.message ?? e))

    m.on('mousemove', 'plots-fill', (e) => {
      const p = e.features?.[0]?.properties as PlotProps | undefined
      if (!p) return
      m.getCanvas().style.cursor = 'pointer'
      m.setFilter('plots-hover', ['==', ['get', 'id'], p.id])
      setHover(p)
    })
    m.on('mouseleave', 'plots-fill', () => {
      m.getCanvas().style.cursor = ''
      m.setFilter('plots-hover', ['==', ['get', 'id'], ''])
      setHover(null)
    })
    m.on('click', 'plots-fill', (e) => {
      const p = e.features?.[0]?.properties as PlotProps | undefined
      if (!p) return
      m.setFilter('plots-selected', ['==', ['get', 'id'], p.id])
      onSelect(p)
    })
    m.on('zoomend', () => onZoom(m.getZoom()))
    m.on('move', () => setCam({ bearing: m.getBearing(), pitch: m.getPitch() }))
    return () => { ro.disconnect(); m.remove(); map.current = null }
    // Built once. Every later change is a paint/layout property, never a rebuild -- re-creating
    // the map on a mode change would refetch every tile in view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const m = map.current
    if (!m || !ready) return
    m.setPaintProperty('plots-fill', 'fill-color', fill)
    m.setPaintProperty('plots-fill', 'fill-opacity', opacity)
    m.setPaintProperty('scheme-3d', 'fill-extrusion-color', massFill)
  }, [ready, fill, opacity, massFill])

  useEffect(() => {
    const m = map.current
    if (!m || !ready) return
    m.setLayoutProperty('scheme-3d', 'visibility', massing ? 'visible' : 'none')
    // The as-built city is what the permitted envelope would replace, so it steps back rather
    // than staying put and intersecting it.
    m.setPaintProperty('city-3d', 'fill-extrusion-opacity',
      ['interpolate', ['linear'], ['zoom'], BUILDINGS_MINZOOM, 0, 15, massing ? 0.25 : 0.9])
  }, [ready, massing])

  useEffect(() => {
    const m = map.current
    if (!m || !ready) return
    m.setLayoutProperty('ground-sat', 'visibility', satellite ? 'visible' : 'none')
    // Boundaries have to fight a photograph instead of a flat dark ground, so they brighten.
    m.setPaintProperty('plots-line', 'line-color',
      satellite ? 'rgba(255,255,255,0.66)' : 'rgba(255,255,255,0.30)')
  }, [ready, satellite])

  useEffect(() => {
    const m = map.current
    if (!m || !ready || !flyTo) return
    m.once('idle', () => {
      const hit = m.querySourceFeatures('city', {
        sourceLayer: 'plots', filter: ['==', ['get', 'plot'], flyTo.plot],
      })[0]
      if (hit) {
        m.setFilter('plots-selected', ['==', ['get', 'id'], hit.properties.id])
        onSelect(hit.properties as PlotProps)
      }
    })
    m.flyTo({ center: [flyTo.lon, flyTo.lat], zoom: 16.5, pitch: 45, duration: 1400 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, flyTo])

  /*
   * Explicit camera buttons, and the reason is a trackpad.
   *
   * MapLibre rotates on right-button drag or ctrl+left drag. On a Mac both are the same gesture
   * and macOS claims it first: ctrl-drag opens the context menu, and a trackpad has no separate
   * right button to drag with. So on the machine this is demoed from, rotation was reachable only
   * through a control -- and the built-in one was an unstyled white box tucked under the plot
   * panel, which is the same as not having one.
   *
   * These call the map directly, are on the left where nothing overlaps them, and the compass
   * shows the bearing it will reset.
   */
  const nudge = (d: Partial<{ bearing: number; pitch: number; zoom: number }>) => {
    const m = map.current
    if (!m) return
    m.easeTo({
      bearing: m.getBearing() + (d.bearing ?? 0),
      pitch: Math.max(0, Math.min(85, m.getPitch() + (d.pitch ?? 0))),
      zoom: m.getZoom() + (d.zoom ?? 0),
      duration: 300,
    })
  }
  const Btn = ({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) => (
    <button onClick={onClick} title={title} aria-label={title}
      className="flex h-8 w-8 items-center justify-center border-r border-white/10 text-white/55
                 hover:bg-white/10 hover:text-white">
      {children}
    </button>
  )

  return (
    <>
      {/*
        * Positioned inline, not by class, and that is not a style preference.
        *
        * MapLibre puts its own `maplibregl-map` class on whatever container it is given, and its
        * stylesheet declares `.maplibregl-map { position: relative }`. That rule loads after
        * Tailwind's utilities and has the same specificity, so it wins -- the container stops
        * being absolutely positioned, `inset-0` no longer gives it a height, and it collapses to
        * 0 px. The map then reports no error and draws nothing. An inline style outranks both.
        */}
      <div ref={container} style={{ position: 'absolute', inset: 0 }} />
      {hover && (
        <div className="pointer-events-none absolute left-1/2 top-[70px] z-10 -translate-x-1/2 rounded-full
                        border border-white/10 bg-black/70 px-3 py-1.5 font-mono text-[11px] tabular-nums text-white/80 backdrop-blur">
          {hover.plot}
          {hover.area_sqft != null && ` · ${Math.round(hover.area_sqft).toLocaleString()} sqft`}
          {mode === 'value'
            ? hover.rlv_psf != null
              ? ` · ${Math.round(hover.rlv_psf).toLocaleString()}/sqft${hover.rlv_verdict === 'hypothetical' ? ' (hyp.)' : ''}`
              : ' · no value'
            : hover.height_m != null ? ` · ${hover.height_m} m` : ' · no height'}
        </div>
      )}
      <div className="pointer-events-none absolute bottom-3 right-3 z-10 max-w-[44ch] rounded bg-black/60 px-2 py-1
                      text-right text-[10px] leading-relaxed text-white/45">
        {manifest.attribution.join(' · ')}
      </div>
      {/* Camera. A horizontal strip just right of the city panel and just under the bar -- the one
          rectangle of this screen that no panel ever covers, at any viewport height. Vertically at
          the left edge it sat underneath the city panel, which is how the built-in control was
          lost in the first place. */}
      <div className="absolute left-[332px] top-[84px] z-10 flex flex-row overflow-hidden rounded
                      border border-white/10 bg-[#191715]/95 shadow-2xl backdrop-blur">
        <Btn onClick={() => nudge({ zoom: 1 })} title="Zoom in">+</Btn>
        <Btn onClick={() => nudge({ zoom: -1 })} title="Zoom out">−</Btn>
        <Btn onClick={() => nudge({ pitch: 15 })} title="Tilt down toward the horizon">▲</Btn>
        <Btn onClick={() => nudge({ pitch: -15 })} title="Tilt back to overhead">▼</Btn>
        <Btn onClick={() => nudge({ bearing: -30 })} title="Rotate anticlockwise">↺</Btn>
        <Btn onClick={() => nudge({ bearing: 30 })} title="Rotate clockwise">↻</Btn>
        <button onClick={() => map.current?.easeTo({ bearing: 0, pitch: 0, duration: 400 })}
          title={`Bearing ${Math.round(cam.bearing)}° · pitch ${Math.round(cam.pitch)}° — click to reset north`}
          aria-label="Reset north"
          className="flex h-8 w-9 items-center justify-center hover:bg-white/10">
          <span className="text-[13px] leading-none text-[#FF6B19]"
                style={{ display: 'inline-block', transform: `rotate(${-cam.bearing}deg)` }}>▲</span>
        </button>
      </div>

      <div className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-full border border-white/10
                      bg-black/60 px-3 py-2 text-[11px] text-white/45">
        {MODE_LABEL[mode]} · drag to pan · rotate and tilt with the controls · click a plot
      </div>
    </>
  )
}
