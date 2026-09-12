import { lazy, Suspense, useMemo } from 'react'
import { aed, sqft } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { CompareRow } from '@/api/types'

const MassingThumb = lazy(() =>
  import('@/components/Scene').then((m) => ({ default: m.MassingThumb })),
)

/** The plot's own extent in metres, from the parcel outline the service sent. */
function extentOf(r: CompareRow): number {
  const rings = r.geometry?.parcel_rings ?? []
  let max = 1
  for (const ring of rings) for (const [x, y] of ring) max = Math.max(max, Math.hypot(x, y))
  return max
}

/**
 * The screened plots as buildings, not just rows.
 *
 * Every thumbnail is drawn at one metres-per-pixel, taken from the largest plot in the set, so the
 * grid shows real relative size. Fitting each canvas to its own parcel would be prettier and would
 * lie: a 15,008 sqft plot and a 204,460 sqft plot would fill their frames identically, and the
 * comparison the grid exists for is exactly the one that would be lost.
 *
 * The cost is that a genuinely small plot beside a very large one renders small. That is the
 * finding, so the area is printed under each rather than the scale being fudged to hide it.
 */
export function MassingGrid({
  rows, onOpen,
}: {
  rows: CompareRow[]
  onOpen: (plot: string) => void
}) {
  const drawable = useMemo(
    () => rows.filter((r) => r.status === 'ok' && r.geometry && r.geometry.levels.length > 0),
    [rows],
  )

  // One scale for the whole grid: the widest parcel, and tall enough to clear the tallest scheme.
  const radius = useMemo(() => {
    const widest = drawable.reduce((m, r) => Math.max(m, extentOf(r)), 1)
    const tallest = drawable.reduce((m, r) => Math.max(m, r.geometry?.height_m ?? 0), 0)
    return Math.max(widest * 1.5, tallest * 2.0)
  }, [drawable])

  if (!drawable.length) return null

  return (
    // items-start, so a card with no caveat line stays its natural height instead of stretching to
    // match its neighbours and floating its own labels down away from the model.
    <div className="mb-5 grid grid-cols-[repeat(auto-fill,minmax(232px,1fr))] items-start gap-3">
      {drawable.map((r) => {
        const g = r.geometry!
        return (
          <button
            key={r.plot_number}
            onClick={() => onOpen(r.plot_number)}
            className="group hover:border-primary/50 overflow-hidden rounded-md border text-left transition-colors"
          >
            <div className="bg-secondary/40 relative h-[168px]">
              <Suspense fallback={null}>
                <MassingThumb
                  levels={g.levels}
                  parcelRings={g.parcel_rings}
                  envelopeRings={g.envelope_rings}
                  radius={radius}
                />
              </Suspense>
            </div>

            <div className="space-y-0.5 border-t px-2.5 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="group-hover:text-primary font-mono text-[13px] font-semibold">
                  {r.plot_number}
                </span>
                <span className="tnum text-[13px] font-semibold">
                  {aed(r.low?.residual_land_value)}
                </span>
              </div>
              <div className="text-muted-foreground flex items-baseline justify-between gap-2 font-mono text-[10px]">
                <span>{sqft(r.area_sqft)}</span>
                <span>
                  {g.floors}F · {r.low?.total_units ?? 0}
                  {r.high && r.high.total_units !== r.low?.total_units ? `–${r.high.total_units}` : ''} units
                </span>
              </div>
              {/* Same caveats the table carries. A thumbnail that looks clean while its row is
                  flagged would quietly undo the point of flagging it. */}
              {(!r.bounded || (r.contested_by?.length ?? 0) > 0) && (
                <div className={cn('font-mono text-[10px]', r.bounded ? 'text-assumption' : 'text-deferred')}>
                  {r.bounded ? `ties ${r.contested_by!.join(' · ')}` : 'unbounded'}
                </div>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}
