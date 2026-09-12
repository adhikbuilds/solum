import { lazy, Suspense, useMemo, useState } from 'react'
import { Loader2, Search, TriangleAlert } from 'lucide-react'
import { useComparison, useStudy } from '@/api/client'
import { Fact } from '@/components/Provenance'
// three.js and its react bindings are ~900 kB of the bundle and are useless until a study
// has loaded, so the viewer is split out and fetched alongside the first request.
const Scene = lazy(() => import('@/components/Scene').then((m) => ({ default: m.Scene })))
import { CandidateTable } from '@/components/CandidateTable'
import { CompareTable } from '@/components/CompareTable'
import { MassingGrid } from '@/components/MassingGrid'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { aed, aedFull, num, pct, sqft } from '@/lib/format'

/*
 * The city is a whole screen, not a panel, and it is 100,000 plots of WebGL -- so it is split out
 * and only fetched when someone asks for it. Loading maplibre and the map chrome into the bundle
 * of a study screen that never opens it is a megabyte nobody asked for.
 */
const CityView = lazy(() => import('@/components/city/CityView'))

export default function App() {
  const [mode, setMode] = useState<'study' | 'compare' | 'city'>('study')
  const [plot, setPlot] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  // The screened set is committed on submit rather than tracked from the field, so editing the
  // list does not refire a dozen DDA lookups per keystroke.
  const [screened, setScreened] = useState<string[]>([])
  const [compareDraft, setCompareDraft] = useState('')
  const [optimistic, setOptimistic] = useState(false)
  const [floors, setFloors] = useState<number | null>(null)

  const { data, isLoading, isError, error } = useStudy(plot, optimistic)
  const comparison = useComparison(mode === 'compare' ? screened : [])

  const openPlot = (n: string) => { setMode('study'); setPlot(n); setDraft(n); setFloors(null) }

  const solid = useMemo(() => {
    if (!data?.solids.length) return undefined
    return data.solids.find((s) => s.floors === floors)
      ?? data.solids.find((s) => s.floors === data.best_by_rlv)
      ?? data.solids[0]
  }, [data, floors])

  const p = data?.plot
  const prov = data?.provenance ?? {}
  const f = solid?.feasibility
  const sk = solid?.scheme
  // DDA published no bay ratio for this plot, so `requiredBays`/`parking_required` is 0 by
  // construction, not by finding -- and the RLV below was priced with zero parking cost. 0/0
  // reads as "this scheme needs no parking", which is a claim we have no basis for.
  const parkingDeferred = !p?.parking_rule_sqm_per_bay


  // The city takes the viewport. It has its own bar, its own panels and its own dark ground, so
  // it replaces the study chrome rather than nesting inside it.
  if (mode === 'city') {
    return (
      <Suspense fallback={<div className="grid h-dvh place-content-center bg-[#0E0D0C] text-white/40">
        <Loader2 className="size-5 animate-spin" /></div>}>
        <button onClick={() => setMode('study')}
          className="fixed bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-full border border-white/15
                     bg-black/80 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.11em]
                     text-white/60 backdrop-blur hover:text-white">
          ← Back to the study
        </button>
        <CityView onOpenStudy={openPlot} />
      </Suspense>
    )
  }

  return (
    <div className="flex h-screen flex-col">
      {/* ---- top bar ---- */}
      <header className="bg-card flex shrink-0 items-center gap-4 border-b px-4 py-2.5">
        <div className="flex items-baseline gap-2">
          <span className="text-[15px] font-bold tracking-tight">Solum</span>
          <span className="text-muted-foreground font-mono text-[10px] tracking-[0.14em] uppercase">Massing</span>
        </div>

        <Segmented
          value={mode}
          // Three scales of the same question: one plot, a screened set, or the whole emirate.
          options={[['study', 'One plot'], ['compare', 'Screen'], ['city', 'The city']] as const}
          onChange={setMode}
        />

        {mode === 'study' ? (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => { e.preventDefault(); setPlot(draft.trim() || null); setFloors(null) }}
          >
            <div className="relative">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="DDA plot number"
                inputMode="numeric"
                className="h-8 w-48 pl-8 font-mono text-xs"
              />
            </div>
            <Button size="sm" type="submit">Study</Button>
            {plot && (
              <Button size="sm" variant="ghost" onClick={() => { setPlot(null); setDraft(''); setFloors(null) }}>
                Demo plot
              </Button>
            )}
          </form>
        ) : (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              setScreened([...new Set(compareDraft.split(/[\s,]+/).map((n) => n.trim()).filter(Boolean))])
            }}
          >
            <div className="relative">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
              <Input
                value={compareDraft}
                onChange={(e) => setCompareDraft(e.target.value)}
                placeholder="Plot numbers, comma separated"
                className="h-8 w-[340px] pl-8 font-mono text-xs"
              />
            </div>
            <Button size="sm" type="submit">Screen</Button>
          </form>
        )}

        <div className={`ml-auto flex items-center gap-2 ${mode === 'compare' ? 'invisible' : ''}`}>
          <span className="text-muted-foreground font-mono text-[10px] tracking-[0.1em] uppercase">Setbacks</span>
          <div className="bg-secondary inline-flex rounded-md p-0.5">
            {([false, true] as const).map((o) => (
              <button
                key={String(o)}
                onClick={() => setOptimistic(o)}
                className={`rounded-sm px-2.5 py-1 font-mono text-[10px] font-medium tracking-wide uppercase transition-colors ${
                  optimistic === o ? 'bg-card shadow-sm' : 'text-muted-foreground'
                }`}
              >
                {o ? 'Optimistic' : 'Conservative'}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ---- body ---- */}
      {mode === 'compare' ? (
        <CompareView q={comparison} onOpen={openPlot} />
      ) : (
      <div className="flex min-h-0 flex-1">
        <aside className="bg-card w-[360px] shrink-0 overflow-y-auto border-r">
          {isLoading && (
            <div className="text-muted-foreground flex items-center gap-2 p-5 text-sm">
              <Loader2 className="size-4 animate-spin" /> Reading the register…
            </div>
          )}

          {isError && (
            <div className="m-4 rounded-md border border-destructive/40 bg-destructive/5 p-4">
              <p className="text-destructive flex items-center gap-2 text-sm font-semibold">
                <TriangleAlert className="size-4" /> Could not study this plot
              </p>
              <p className="text-muted-foreground mt-1.5 text-xs leading-relaxed">{(error as Error).message}</p>
            </div>
          )}

          {data && p && (
            <div className="p-4">
              <div className="mb-1 flex items-baseline gap-2">
                <h1 className="text-xl font-bold tracking-tight">Plot {p.number}</h1>
                {!p.setbacks_complete && <Badge variant="deferred">unbounded</Badge>}
              </div>
              <p className="text-muted-foreground mb-4 text-xs leading-snug">{p.landuse ?? 'Landuse not stated'} · DDA</p>

              <SectionLabel>Regulatory envelope</SectionLabel>
              <dl className="mb-1">
                <Fact label="Plot area" value={num(p.area_sqft)} provenance="authority" basis={prov.area_sqft} />
                <Fact label="Permitted GFA" value={num(p.permitted_gfa_sqft)} provenance="authority" basis={prov.permitted_gfa_sqft} />
                <Fact label="Implied FAR" value={p.implied_far?.toFixed(3) ?? '—'} provenance="derived" basis={prov.implied_far} />
                <Fact label="Max height" value={`${p.max_floors ?? '—'} storeys`} provenance="authority" basis={prov.max_floors} />
                <Fact
                  label="Setbacks"
                  value={p.setbacks_m.length ? `${p.setbacks_m.join(' / ')} m` : '—'}
                  provenance={p.setbacks_complete ? 'authority' : 'deferred'}
                  basis={prov.setbacks_m}
                />
                <Fact
                  label="Parking rule"
                  value={p.parking_rule_sqm_per_bay ? `1 / ${p.parking_rule_sqm_per_bay} sqm` : '—'}
                  provenance={p.parking_rule_sqm_per_bay ? 'authority' : 'deferred'}
                  basis={prov.parking}
                />
                <Fact label="Floor-to-floor" value={`${data.floor_height_m} m`} provenance="assumption" basis={prov.floor_height_m} />
              </dl>

              {!data.geometry.bounded && (
                <Callout tone="deferred" title="Envelope is not a bound">
                  {prov.setbacks_m}
                </Callout>
              )}

              {sk && (
                <>
                  <SectionLabel>Scheme <Badge variant="assumption">modelled</Badge></SectionLabel>
                  <dl className="mb-1">
                    <Row k="Basement levels" v={sk.basement_levels ? `${sk.basement_levels} × 3.0 m` : '—'} />
                    <Row k="Podium levels" v={sk.podium_levels ? `${sk.podium_levels} × 4.5 m` : '—'} />
                    <Row k="Tower levels" v={`${sk.tower_levels} × 3.2 m`} />
                    <Row k="Podium plate" v={sk.podium_footprint_sqft ? sqft(sk.podium_footprint_sqft) : '—'} />
                    <Row k="Tower plate" v={sqft(sk.tower_footprint_sqft)} />
                    <Row k="Above / below grade" v={`${solid.height_m} m / ${solid.depth_m} m`} />
                    <Row
                      k="Parking"
                      v={parkingDeferred ? '—' : `${num(sk.parking_provided)} / ${num(sk.parking_required)}`}
                      warn={sk.parking_shortfall > 0}
                    />
                  </dl>
                  {sk.parking_shortfall > 0 && (
                    <Callout tone="destructive" title={`${num(sk.parking_shortfall)} bays short`}>
                      {sk.basement_levels} basement levels at the setback envelope cannot hold the
                      authority's requirement. Podium parking or a deeper basement is needed.
                    </Callout>
                  )}
                  {parkingDeferred && (
                    <Callout tone="deferred" title="Parking not priced">
                      DDA published no parking rule for this plot, so no bay count is derived and
                      none is invented. The residual land value below excludes parking cost
                      entirely — treat it as an upper bound, not a final number.
                    </Callout>
                  )}
                </>
              )}

              {f && (
                <>
                  <SectionLabel>Feasibility <span className="text-muted-foreground font-normal normal-case">AED</span></SectionLabel>
                  <dl className="mb-1">
                    <Row k="Gross development value" v={aed(f.gdv)} title={aedFull(f.gdv)} />
                    <Row
                      k={f.construction_premium_pct > 0
                        ? <span className="inline-flex items-center gap-1.5">Construction <Badge variant="assumption">+{pct(f.construction_premium_pct)} podium</Badge></span>
                        : 'Construction'}
                      v={aed(f.construction)}
                      title={f.construction_premium_pct > 0
                        ? `${aedFull(f.construction)} — includes a +${pct(f.construction_premium_pct)} assumption for the podium's transfer structure and second core, unpriced elsewhere in this model`
                        : aedFull(f.construction)}
                    />
                    <Row k="Soft costs" v={aed(f.soft_costs)} title={aedFull(f.soft_costs)} />
                    <Row k="Parking" v={aed(f.parking_cost)} title={aedFull(f.parking_cost)} />
                    <Row k="Marketing" v={aed(f.marketing)} title={aedFull(f.marketing)} />
                    <Separator className="my-1.5" />
                    <Row k="Total non-land cost" v={aed(f.non_land_cost)} strong title={aedFull(f.non_land_cost)} />
                    <Row k="Residual land value" v={aed(f.residual_land_value)} accent title={aedFull(f.residual_land_value)} />
                    <Row k="RLV per sqft of land" v={`AED ${num(f.rlv_psf_land)}`} />
                    <Row k="Blended price" v={`AED ${num(f.blended_psf)} psf`} />
                    <Row k="Breakeven" v={`AED ${num(f.breakeven_psf)} psf`} />
                  </dl>
                </>
              )}
            </div>
          )}
        </aside>

        <main className="relative min-w-0 flex-1">
          {data && (
            <Suspense fallback={<div className="text-muted-foreground absolute inset-0 grid place-items-center text-sm">Preparing the model…</div>}>
              <Scene study={data} solid={solid} />
            </Suspense>
          )}

          {solid && f && (
            <div className="bg-card/90 pointer-events-none absolute top-4 right-4 rounded-lg border px-4 py-3 text-right backdrop-blur">
              <div className="tnum text-2xl font-bold tracking-tight">{aed(f.residual_land_value)}</div>
              <div className="text-muted-foreground mt-1 font-mono text-[9px] tracking-[0.12em] uppercase">
                Residual land value · AED
              </div>
            </div>
          )}

          <Legend />
        </main>
      </div>

      )}

      {/* ---- candidates ---- */}
      {mode === 'study' && data && (
        <div className="bg-card h-[268px] shrink-0 overflow-y-auto border-t">
          <Tabs defaultValue="options" className="p-3">
            <TabsList>
              <TabsTrigger value="options">Massing options</TabsTrigger>
              <TabsTrigger value="schedule">Unit schedule</TabsTrigger>
            </TabsList>

            <TabsContent value="options" className="mt-3">
              <CandidateTable
                solids={data.solids}
                activeFloors={solid?.floors}
                bestFloors={data.best_by_rlv}
                onSelect={setFloors}
                parkingDeferred={parkingDeferred}
              />
            </TabsContent>

            <TabsContent value="schedule" className="mt-3">
              {f && (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-[13px]">
                    <thead>
                      <tr className="text-muted-foreground border-b font-mono text-[10px] tracking-[0.12em] uppercase">
                        <th className="px-3 py-2 text-left">Type</th>
                        <th className="px-3 py-2 text-left">Units</th>
                        <th className="px-3 py-2 text-left">Size</th>
                        <th className="px-3 py-2 text-left">Price</th>
                        <th className="px-3 py-2 text-left">Area</th>
                        <th className="px-3 py-2 text-left">Revenue</th>
                      </tr>
                    </thead>
                    <tbody className="tnum">
                      {f.units.map((u) => (
                        <tr key={u.code} className="border-b">
                          <td className="px-3 py-2 font-medium">{u.label}</td>
                          <td className="px-3 py-2">{num(u.count)}</td>
                          <td className="px-3 py-2">{num(u.size_sqft)} sqft</td>
                          <td className="px-3 py-2">{num(u.price_psf)} psf</td>
                          <td className="px-3 py-2">{num(u.area_sqft)}</td>
                          <td className="px-3 py-2 font-medium">{aed(u.revenue)}</td>
                        </tr>
                      ))}
                      <tr className="font-semibold">
                        <td className="px-3 py-2">Total</td>
                        <td className="px-3 py-2">{num(f.total_units)}</td>
                        <td className="text-muted-foreground px-3 py-2 text-[11px]" colSpan={2}>
                          {pct(f.efficiency)} efficiency
                        </td>
                        <td className="px-3 py-2">{num(f.saleable_sqft)}</td>
                        <td className="text-primary px-3 py-2">{aed(f.gdv)}</td>
                      </tr>
                    </tbody>
                  </table>
                  <p className="text-muted-foreground mt-2 px-3 text-[11px] leading-relaxed">
                    Mix from the RERA project register — 348 projects, 118,221 units. Units are whole
                    apartments: each type is floored, then leftover area goes to the largest remainders
                    while it still fits.
                  </p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  )
}

/** The header's two-state control, used for both the mode switch and the setback bound. */
function Segmented<T extends string>({
  value, options, onChange,
}: { value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void }) {
  return (
    <div className="bg-secondary inline-flex rounded-md p-0.5">
      {options.map(([v, label]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`rounded-sm px-2.5 py-1 font-mono text-[10px] font-medium tracking-wide uppercase transition-colors ${
            value === v ? 'bg-card shadow-sm' : 'text-muted-foreground'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function CompareView({
  q, onOpen,
}: { q: ReturnType<typeof useComparison>; onOpen: (plot: string) => void }) {
  if (q.isLoading) {
    return (
      <div className="text-muted-foreground flex flex-1 items-center justify-center gap-2 text-sm">
        <Loader2 className="size-4 animate-spin" /> Reading the register…
      </div>
    )
  }
  if (q.isError) {
    return (
      <div className="flex flex-1 items-start justify-center p-8">
        <div className="border-destructive/40 bg-destructive/5 max-w-lg rounded-md border p-4">
          <p className="text-destructive flex items-center gap-2 text-sm font-semibold">
            <TriangleAlert className="size-4" /> Could not screen these plots
          </p>
          <p className="text-muted-foreground mt-1 text-[13px]">{(q.error as Error).message}</p>
        </div>
      </div>
    )
  }
  if (!q.data) {
    return (
      <div className="flex flex-1 items-start justify-center p-10">
        <div className="max-w-xl">
          <h2 className="text-[15px] font-semibold">Screen several plots at once</h2>
          <p className="text-muted-foreground mt-2 text-[13px] leading-relaxed">
            Enter DDA plot numbers separated by commas. Each is read from the register, massed
            against its own published limits, and priced — then ranked by what the land is worth.
          </p>
          <p className="text-muted-foreground mt-3 text-[13px] leading-relaxed">
            Every plot is reported as a <span className="text-foreground font-medium">range</span>.
            DDA names four setbacks but never which edge each belongs to, so a single figure would
            assert an ordering the register cannot support. Where two ranges overlap, the table
            says so rather than implying the order is settled.
          </p>
          <p className="text-muted-foreground mt-3 font-mono text-[11px]">
            Try 3156286, 3156269, 3156315, 3347596
          </p>
        </div>
      </div>
    )
  }

  const { rows, priced, requested } = q.data
  return (
    <div className="min-h-0 flex-1 overflow-auto p-4">
      <div className="mb-3 flex items-baseline gap-3">
        <h2 className="text-[13px] font-semibold">
          {priced} of {requested} plots priced
        </h2>
        <span className="text-muted-foreground font-mono text-[10px] tracking-[0.1em] uppercase">
          Ranked on residual land value · conservative bound
        </span>
      </div>
      <MassingGrid rows={rows} onOpen={onOpen} />
      <CompareTable rows={rows} onOpen={onOpen} />
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-muted-foreground mt-5 mb-1.5 flex items-center gap-2 border-b pb-1.5 font-mono text-[10px] font-semibold tracking-[0.13em] uppercase">
      {children}
    </div>
  )
}

function Row({
  k, v, strong, accent, warn, title,
}: { k: React.ReactNode; v: React.ReactNode; strong?: boolean; accent?: boolean; warn?: boolean; title?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5" title={title}>
      <dt className={`text-[13px] ${strong || accent ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}>{k}</dt>
      <dd className={`tnum font-mono text-[13px] ${
        accent ? 'text-primary text-[15px] font-semibold' : warn ? 'text-destructive font-semibold' : 'font-medium'
      }`}>{v}</dd>
    </div>
  )
}

function Callout({ tone, title, children }: { tone: 'deferred' | 'destructive'; title: string; children: React.ReactNode }) {
  const cls = tone === 'destructive'
    ? 'border-l-destructive bg-destructive/5'
    : 'border-l-deferred bg-deferred-bg/50'
  return (
    <div className={`mt-2 border-l-2 px-3 py-2.5 ${cls}`}>
      <p className="text-[12px] font-semibold">{title}</p>
      <p className="text-muted-foreground mt-1 text-[11.5px] leading-relaxed">{children}</p>
    </div>
  )
}

function Legend() {
  const items = [
    ['Tower', '#FF6B19'], ['Podium', '#C4763A'], ['Basement', '#9C9186'],
    ['Envelope', '#5C7CA6'], ['Parcel', '#8E7B66'],
  ] as const
  return (
    <div className="bg-card/90 absolute bottom-4 left-4 flex flex-wrap gap-3 rounded-md border px-3 py-2 backdrop-blur">
      {items.map(([label, colour]) => (
        <span key={label} className="text-muted-foreground flex items-center gap-1.5 text-[11px]">
          <span className="h-[3px] w-3.5 rounded-full" style={{ background: colour }} />
          {label}
        </span>
      ))}
    </div>
  )
}
