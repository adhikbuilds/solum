/**
 * The city screen: the map, and the two panels that keep it honest.
 *
 * The panels are not decoration. Every figure on this map carries where it came from --
 * `authority / derived / assumption / unavailable` for heights, `priced / hypothetical /
 * withheld` for value, and a coverage statement saying which 44.8% of Dubai this even is. A port
 * that kept the colours and dropped those sentences would be a downgrade wearing the same palette.
 */
import { useMemo, useState } from 'react'
import { Loader2, Search } from 'lucide-react'
import { useCityManifest, useCitySearch, useCityStudy, type PlotProps } from '@/api/city'
import { BUILDINGS_MINZOOM, CityMap } from './CityMap'
import { ACCENT, GREY, HEIGHT_STOPS, MODES, MODE_LABEL, PROVENANCE, STATUS, USE, valueStops, type Mode } from './palette'

const n = (v: unknown, d = 0) =>
  v === null || v === undefined || Number.isNaN(Number(v))
    ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: d })

function Section({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2.5 border-b border-white/10 pb-1.5 font-mono text-[9.5px] uppercase tracking-[0.13em] text-white/40">
      {children}
    </div>
  )
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-[5px]">
      <dt className="text-[12px] text-white/45">{k}</dt>
      <dd className="text-right font-mono text-[12.5px] tabular-nums text-white/90">{v}</dd>
    </div>
  )
}

function Swatch({ c }: { c: string }) {
  return <i className="h-[11px] w-[11px] shrink-0 rounded-[2px] border border-white/15" style={{ background: c }} />
}

/** A continuous scale drawn as one, with its stops positioned by value rather than evenly. */
function Ramp({ stops, fmt }: { stops: [number, string][]; fmt: (v: number) => string }) {
  const lo = stops[0][0]
  const hi = stops[stops.length - 1][0]
  const span = hi - lo || 1
  const css = stops.map(([v, c]) => `${c} ${(((v - lo) / span) * 100).toFixed(1)}%`).join(', ')
  return (
    <div className="mb-3">
      <i className="block h-2 rounded-[2px] border border-white/10" style={{ background: `linear-gradient(90deg, ${css})` }} />
      <div className="mt-1.5 flex justify-between font-mono text-[10px] tabular-nums text-white/40">
        <b className="font-medium">{fmt(lo)}</b><b className="font-medium">{fmt(hi)}</b>
      </div>
    </div>
  )
}

function Toggle({ on, set, label, hint }: { on: boolean; set: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex shrink-0 cursor-pointer select-none items-center gap-2 font-mono text-[9.5px]
                      uppercase tracking-[0.09em] text-white/40 hover:text-white/90">
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} className="sr-only" />
      <span className={`relative h-[15px] w-[26px] shrink-0 rounded-full border transition-colors
        ${on ? 'border-[#FF6B19] bg-[#FF6B19]' : 'border-white/15 bg-white/5'}`}>
        <i className={`absolute left-[2px] top-[2px] h-[9px] w-[9px] rounded-full transition-transform
          ${on ? 'translate-x-[11px] bg-black' : 'bg-white/40'}`} />
      </span>
      {label}
      {hint && <em className="not-italic tracking-[0.06em] text-[#FF6B19]">{hint}</em>}
    </label>
  )
}

/**
 * `onOpenStudy` is the handoff the city was missing: you could find a plot on the map and read
 * its entitlement, and then had to retype its number into the study screen to see the scheme,
 * the massing options and the unit schedule. Finding and studying were the same task split
 * across two screens that did not know about each other.
 */
export default function CityView({ onOpenStudy }: { onOpenStudy?: (plot: string) => void }) {
  const { data: manifest, isLoading, isError, error } = useCityManifest()
  const [mode, setMode] = useState<Mode>('site')
  const [massing, setMassing] = useState(false)
  const [satellite, setSatellite] = useState(false)
  const [zoom, setZoom] = useState(10)
  const [selected, setSelected] = useState<PlotProps | null>(null)
  const [query, setQuery] = useState('')
  const [flyTo, setFlyTo] = useState<{ lon: number; lat: number; plot: string } | null>(null)
  const [studyFor, setStudyFor] = useState<string | null>(null)

  const search = useCitySearch(query)
  const study = useCityStudy(studyFor)
  const stops = useMemo(() => (manifest ? valueStops(manifest.rlv_psf) : []), [manifest])

  if (isLoading) {
    return (
      <div className="grid h-dvh place-content-center bg-[#0E0D0C] text-white/50">
        <Loader2 className="mx-auto mb-3 size-5 animate-spin" />
        <p className="font-mono text-[11px] uppercase tracking-[0.14em]">loading the city</p>
      </div>
    )
  }
  if (isError || !manifest) {
    return (
      <div className="grid h-dvh place-content-center bg-[#0E0D0C] px-6 text-center text-white/70">
        <p className="mb-3 font-serif text-xl">The city is not loaded.</p>
        <code className="font-mono text-[12px] text-[#FF6B19]">docker compose run --rm loader</code>
        <p className="mt-3 text-[11px] text-white/35">{(error as Error)?.message}</p>
      </div>
    )
  }

  const hp = manifest.height_provenance
  const vv = manifest.value_verdict
  const cov = manifest.coverage.shares
  const covTotal = Object.values(cov).reduce((a, b) => a + b, 0)
  const belowBuildings = (massing || satellite) && zoom < BUILDINGS_MINZOOM

  return (
    <div className="relative h-dvh overflow-hidden bg-[#0E0D0C] text-white">
      <CityMap manifest={manifest} mode={mode} massing={massing} satellite={satellite}
               flyTo={flyTo} onSelect={setSelected} onZoom={setZoom} />

      {/* ---- bar ---- */}
      <div className="absolute inset-x-0 top-0 z-20 flex h-14 items-center gap-4 border-b border-white/10
                      bg-[#0E0D0C]/90 px-4 backdrop-blur">
        <div className="flex shrink-0 items-baseline gap-2.5">
          <b className="font-serif text-[19px] font-normal tracking-tight">Solum</b>
          <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-white/40">Dubai · entitlement</span>
        </div>
        <div className="ml-auto flex shrink-0 overflow-hidden rounded border border-white/10">
          {MODES.map((m) => (
            <button key={m} onClick={() => setMode(m)}
              className={`border-l border-white/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.09em] first:border-l-0
                ${mode === m ? 'bg-[#FF6B19] text-black' : 'bg-white/[0.03] text-white/45 hover:text-white'}`}>
              {m === 'provenance' ? 'Source' : m}
            </button>
          ))}
        </div>
        <Toggle on={satellite} set={setSatellite} label="Satellite" />
        <Toggle on={massing} set={setMassing} label="Massing" hint={belowBuildings ? 'zoom in' : undefined} />
        <div className="relative shrink-0">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-white/30" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="plot or area"
                 spellCheck={false} autoComplete="off"
                 className="w-52 rounded border border-white/10 bg-white/[0.03] py-2 pl-8 pr-2.5
                            font-mono text-[12px] text-white placeholder:text-white/30 focus:border-[#FF6B19] focus:outline-none" />
          {search.data && search.data.results.length > 0 && (
            <ul className="absolute right-0 top-11 max-h-80 w-72 overflow-y-auto rounded border border-white/10
                           bg-[#191715] shadow-2xl">
              {search.data.results.map((r) => (
                <li key={r.plot_number}>
                  <button onClick={() => { setFlyTo({ lon: r.lon, lat: r.lat, plot: r.plot_number }); setQuery('') }}
                          className="flex w-full items-baseline gap-2 px-3 py-2 text-left hover:bg-white/5">
                    <span className="font-mono text-[12px]">{r.plot_number}</span>
                    <span className="truncate text-[11px] text-white/40">{r.land_name}</span>
                    <span className="ml-auto font-mono text-[11px] tabular-nums text-white/35">
                      {r.rlv_psf == null ? '—' : n(r.rlv_psf)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ---- left: what this map is ---- */}
      <aside className="absolute left-4 top-[72px] z-10 max-h-[calc(100dvh-150px)] w-[300px] overflow-y-auto
                        rounded border border-white/10 bg-[#191715] p-4 shadow-2xl">
        <Section>The city</Section>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5">
          {[['Plots', n(manifest.plots)], ['Snapshot', manifest.snapshot],
            ['Massed', n(manifest.massing.plots)], ['No height', n(hp.unavailable)]].map(([k, v]) => (
            <div key={k}><dt className="text-[10.5px] text-white/40">{k}</dt>
              <dd className="mt-0.5 truncate font-mono text-[14px] tabular-nums">{v}</dd></div>
          ))}
        </dl>

        <div className="mt-4"><Section>{MODE_LABEL[mode]}</Section></div>
        {mode === 'value' && (
          <>
            <Ramp stops={stops} fmt={(v) => `${n(v)}/sqft`} />
            <div className="flex flex-col gap-1.5 text-[12px]">
              <div className="flex items-center gap-2 opacity-50"><Swatch c={ACCENT} />hypothetical
                <span className="ml-auto font-mono text-[11.5px] tabular-nums text-white/40">{n(vv.hypothetical)}</span></div>
              <div className="flex items-center gap-2"><Swatch c={GREY} />withheld
                <span className="ml-auto font-mono text-[11.5px] tabular-nums text-white/40">{n(vv.withheld)}</span></div>
            </div>
            {/* The finding that the first version of this ramp hid. */}
            <p className="mt-2.5 rounded border border-[#C4553F]/30 bg-[#C4553F]/10 p-2.5 text-[11px] leading-relaxed text-white/70">
              <b className="text-[#E0836B]">{n(manifest.rlv_psf.negative)} of {n(vv.priced + vv.hypothetical)} priced plots are negative</b>, median {n(manifest.rlv_psf.median)}/sqft.
              {' '}{n(manifest.rlv_psf.fixed_dominated)} of them carry a scheme where fixed soft cost is more than
              half of all non-land cost. {manifest.value_basis.calibration_warning}
            </p>
          </>
        )}
        {mode === 'height' && (
          <>
            <Ramp stops={HEIGHT_STOPS} fmt={(v) => (v ? `${v} m` : 'ground')} />
            <div className="flex items-center gap-2 text-[12px]"><Swatch c={GREY} />no published height
              <span className="ml-auto font-mono text-[11.5px] tabular-nums text-white/40">{n(hp.unavailable)}</span></div>
            <p className="mt-2.5 text-[11.5px] leading-relaxed text-white/40">
              Drawn as an outline, never extruded. Guessing a height here would put a building on land that has none.
            </p>
          </>
        )}
        {(mode === 'site' || mode === 'use' || mode === 'status' || mode === 'provenance') && (
          <div className="flex flex-col gap-1.5">
            {Object.entries(mode === 'status' ? STATUS : mode === 'provenance' ? PROVENANCE : USE).map(([k, c]) => (
              <div key={k} className="flex items-center gap-2 text-[12px]">
                <Swatch c={c} /><span className="lowercase">{k}</span>
                {mode === 'provenance' && (
                  <span className="ml-auto font-mono text-[11.5px] tabular-nums text-white/40">
                    {n(hp[k as keyof typeof hp])}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="mt-4"><Section>Coverage</Section></div>
        <div className="mb-2 flex h-[7px] overflow-hidden rounded-[2px] border border-white/10">
          {Object.entries(cov).map(([k, v]) => (
            <i key={k} title={`${k} ${v}%`} style={{
              width: `${(100 * v) / covTotal}%`,
              background: { dda: ACCENT, trakhees: '#6B5A45', dubai_municipality: '#4A443E',
                            dubai_south: '#3A3531', dso: '#2E2A26' }[k] ?? GREY,
            }} />
          ))}
        </div>
        <p className="text-[11.5px] leading-relaxed text-white/40">
          <b className="text-[#FF6B19]">DDA {cov.dda}%</b> — {manifest.coverage.statement}
        </p>
        <p className="mt-3 border-l-2 border-white/15 pl-2.5 text-[11px] leading-relaxed text-white/35">
          {manifest.basis.statement}
        </p>
      </aside>

      {/* ---- right: one plot ---- */}
      {selected && (
        <aside className="absolute right-4 top-[72px] z-10 max-h-[calc(100dvh-132px)] w-[344px] overflow-y-auto
                          rounded border border-white/10 bg-[#191715] p-4 shadow-2xl">
          <button onClick={() => { setSelected(null); setStudyFor(null) }}
                  className="absolute right-3 top-2.5 text-white/40 hover:text-white">✕</button>
          <Section>Plot</Section>
          <div className="font-serif text-[22px] leading-tight">{selected.plot}</div>
          <div className="text-[11.5px] leading-snug text-white/40">
            {[selected.land, selected.use].filter(Boolean).join(' · ') || 'no name published'}
          </div>

          <div className="mt-4"><Section>Entitlement</Section></div>
          <dl>
            <Row k="Plot area" v={`${n(selected.area_sqft)} sqft`} />
            <Row k="Permitted GFA" v={`${n(selected.gfa_sqft)} sqft`} />
            <Row k="Storeys" v={selected.floors ?? '—'} />
            <Row k="Permitted height" v={
              <>{selected.height_m == null ? '—' : `${n(selected.height_m, 1)} m`}
                <span className="ml-1.5 rounded-sm bg-white/10 px-1 py-px font-mono text-[9px] uppercase tracking-[0.07em] text-white/55">
                  {selected.height_src}
                </span></>} />
            <Row k="Status" v={selected.status ?? '—'} />
            <Row k="RLV / sqft land" v={
              selected.rlv_psf == null ? '—' : (
                <>{n(selected.rlv_psf)}
                  {selected.rlv_verdict === 'hypothetical' && (
                    <span className="ml-1.5 rounded-sm bg-[#33230E] px-1 py-px font-mono text-[9px] uppercase text-[#E0A253]">hyp</span>)}
                </>)} />
          </dl>
          {selected.rlv_why && <p className="mt-2 text-[11.5px] text-white/40">Not priced: {selected.rlv_why}.</p>}
          {selected.fixed_cost_share != null && selected.fixed_cost_share > 0.5 && (
            <p className="mt-2 rounded border border-[#C4553F]/30 bg-[#C4553F]/10 p-2 text-[11px] leading-relaxed text-white/70">
              {Math.round(selected.fixed_cost_share * 100)}% of this scheme's non-land cost is fixed soft cost that does
              not scale with it. At this size the residual land value is mostly a statement about the cost model.
            </p>
          )}

          <div className="mt-4 flex gap-2">
            <button onClick={() => setStudyFor(selected.plot)} disabled={study.isFetching}
                    className="flex-1 rounded border border-white/15 py-2.5 font-mono text-[10px]
                               uppercase tracking-[0.11em] text-white/70 hover:border-white/35 hover:text-white
                               disabled:text-white/30">
              {study.isFetching ? 'solving…' : study.data ? 'Re-run here' : 'Value it here'}
            </button>
            {onOpenStudy && (
              <button onClick={() => onOpenStudy(selected.plot)}
                      className="flex-1 rounded border border-[#FF6B19] bg-[#FF6B19] py-2.5 font-mono text-[10px]
                                 uppercase tracking-[0.11em] text-black hover:bg-[#B84E12] hover:text-white">
                Open full study →
              </button>
            )}
          </div>

          {study.isError && <p className="mt-3 border-l-2 border-white/15 pl-2.5 text-[11px] text-white/40">{(study.error as Error).message}</p>}
          {study.data?.money && (
            <>
              <div className="mt-4"><Section>Residual land value</Section></div>
              <div className="font-serif text-[22px] text-[#FF6B19]">AED {n(study.data.money.residual_land_value)}</div>
              <div className="text-[11.5px] text-white/40">
                {n(study.data.money.rlv_psf_land)} per sqft of land · {study.data.setback_bound} setback bound
              </div>
              <dl className="mt-2">
                <Row k="GDV" v={n(study.data.money.gdv)} />
                <Row k="Non-land cost" v={n(study.data.money.non_land_cost)} />
                <Row k="Blended psf" v={n(study.data.money.blended_psf)} />
                <Row k="Breakeven psf" v={n(study.data.money.breakeven_psf)} />
                {study.data.scheme && <>
                  <Row k="Storeys" v={study.data.scheme.floors} />
                  <Row k="Units" v={n(study.data.scheme.total_units)} />
                  <Row k="Binding" v={study.data.scheme.binding_constraint} />
                </>}
              </dl>
              {study.data.district_is_scenery && (
                <p className="mt-3 border-l-2 border-white/15 pl-2.5 text-[11px] leading-relaxed text-white/35">
                  {study.data.district_is_scenery}
                </p>)}
            </>
          )}
          {study.data?.verdict === 'withheld' && (
            <p className="mt-3 border-l-2 border-white/15 pl-2.5 text-[11px] text-white/40">{study.data.why}</p>
          )}
        </aside>
      )}
    </div>
  )
}
