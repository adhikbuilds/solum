import { lazy, Suspense, useMemo, useState } from 'react'
import { Loader2, Search, TriangleAlert } from 'lucide-react'
import { useStudy } from '@/api/client'
import { Fact } from '@/components/Provenance'
// three.js and its react bindings are ~900 kB of the bundle and are useless until a study
// has loaded, so the viewer is split out and fetched alongside the first request.
const Scene = lazy(() => import('@/components/Scene').then((m) => ({ default: m.Scene })))
import { CandidateTable } from '@/components/CandidateTable'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { aed, aedFull, num, pct, sqft } from '@/lib/format'

export default function App() {
  const [plot, setPlot] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [optimistic, setOptimistic] = useState(false)
  const [floors, setFloors] = useState<number | null>(null)

  const { data, isLoading, isError, error } = useStudy(plot, optimistic)

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

  return (
    <div className="flex h-screen flex-col">
      {/* ---- top bar ---- */}
      <header className="bg-card flex shrink-0 items-center gap-4 border-b px-4 py-2.5">
        <div className="flex items-baseline gap-2">
          <span className="text-[15px] font-bold tracking-tight">Solum</span>
          <span className="text-muted-foreground font-mono text-[10px] tracking-[0.14em] uppercase">Massing</span>
        </div>

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

        <div className="ml-auto flex items-center gap-2">
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
                      v={`${num(sk.parking_provided)} / ${num(sk.parking_required)}`}
                      warn={sk.parking_shortfall > 0}
                    />
                  </dl>
                  {sk.parking_shortfall > 0 && (
                    <Callout tone="destructive" title={`${num(sk.parking_shortfall)} bays short`}>
                      {sk.basement_levels} basement levels at the setback envelope cannot hold the
                      authority's requirement. Podium parking or a deeper basement is needed.
                    </Callout>
                  )}
                </>
              )}

              {f && (
                <>
                  <SectionLabel>Feasibility <span className="text-muted-foreground font-normal normal-case">AED</span></SectionLabel>
                  <dl className="mb-1">
                    <Row k="Gross development value" v={aed(f.gdv)} title={aedFull(f.gdv)} />
                    <Row k="Construction" v={aed(f.construction)} title={aedFull(f.construction)} />
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

      {/* ---- candidates ---- */}
      {data && (
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-muted-foreground mt-5 mb-1.5 flex items-center gap-2 border-b pb-1.5 font-mono text-[10px] font-semibold tracking-[0.13em] uppercase">
      {children}
    </div>
  )
}

function Row({
  k, v, strong, accent, warn, title,
}: { k: string; v: React.ReactNode; strong?: boolean; accent?: boolean; warn?: boolean; title?: string }) {
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
