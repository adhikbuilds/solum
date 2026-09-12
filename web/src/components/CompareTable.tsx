import { useMemo, useState } from 'react'
import {
  createColumnHelper, flexRender, getCoreRowModel, getSortedRowModel, useReactTable,
  type ColumnDef, type SortingState,
} from '@tanstack/react-table'
import { ArrowUpDown, TriangleAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { aed, aedFull, num, pct, sqft } from '@/lib/format'
import type { CompareRow } from '@/api/types'

const col = createColumnHelper<CompareRow>()

const lo = (r: CompareRow) => r.low?.residual_land_value ?? Number.NEGATIVE_INFINITY
const hi = (r: CompareRow) => r.high?.residual_land_value ?? Number.NEGATIVE_INFINITY

/*
 * A shared-scale range bar was tried here and removed. One large plot sets the axis for every
 * row, so a screening set with mixed plot sizes collapses every other range into a few pixels at
 * the left edge -- it read as decoration exactly where the comparison mattered most. The overlap
 * it was meant to show is a relation, not a length, and `contested_by` states it exactly.
 */

/** A plot that could not be priced. The reason is the content -- there are no numbers to show. */
function UnpricedRow({ row, cols }: { row: CompareRow; cols: number }) {
  const offRegister = row.status === 'off_register'
  return (
    <tr className="border-t">
      <td className="px-2 py-2 align-top font-mono text-[13px] font-semibold">{row.plot_number}</td>
      <td colSpan={cols - 1} className="px-2 py-2 align-top">
        <span className="flex items-start gap-2">
          <Badge className="bg-deferred-bg text-deferred shrink-0">
            {offRegister ? 'not on DDA' : row.status.replace('_', ' ')}
          </Badge>
          <span className="text-muted-foreground text-xs leading-relaxed">{row.detail}</span>
        </span>
      </td>
    </tr>
  )
}

/**
 * Screen several plots at once, ranked by what the land is worth.
 *
 * Ranked on the conservative bound, and every row carries its range rather than a point, because
 * ordering plots on a single setback assignment asserts a sequence the register cannot support --
 * a plot's conservative case can sit below another's optimistic one. `contested_by` names exactly
 * where that happens instead of leaving the reader to compare the numbers themselves.
 */
export function CompareTable({
  rows, onOpen,
}: {
  rows: CompareRow[]
  /** Open one plot in the single-plot study, which is where the 3D model and unit schedule live. */
  onOpen: (plot: string) => void
}) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'rlv', desc: true }])

  const priced = useMemo(() => rows.filter((r) => r.status === 'ok'), [rows])
  const unpriced = useMemo(() => rows.filter((r) => r.status !== 'ok'), [rows])

  const columns: ColumnDef<CompareRow, any>[] = [
    col.accessor('plot_number', {
      header: 'Plot',
      cell: (c) => (
        <button
          onClick={() => onOpen(c.getValue())}
          className="hover:text-primary font-mono text-[13px] font-semibold underline-offset-2 hover:underline"
        >
          {c.getValue()}
        </button>
      ),
    }),
    col.accessor((r) => r.landuse ?? '', {
      id: 'landuse',
      header: 'Land use',
      cell: (c) => <span className="text-muted-foreground text-xs">{c.getValue() || '—'}</span>,
    }),
    col.accessor((r) => r.area_sqft ?? 0, {
      id: 'area', header: 'Plot area', cell: (c) => sqft(c.getValue()),
    }),
    col.accessor((r) => r.permitted_gfa_sqft ?? 0, {
      id: 'gfa', header: 'Permitted GFA', cell: (c) => sqft(c.getValue()),
    }),
    col.accessor((r) => r.low?.gfa_utilisation ?? 0, {
      id: 'util',
      header: 'Entitlement',
      cell: (c) => {
        const r = c.row.original
        const l = r.low?.gfa_utilisation ?? 0
        const h = r.high?.gfa_utilisation ?? 0
        // Both bounds reaching the entitlement means the setback ambiguity costs nothing here:
        // the permitted GFA binds first, whichever edge the largest setback turns out to be.
        const capped = l >= 0.98 && h >= 0.98
        return (
          <span className={cn('tnum', capped && 'text-authority font-semibold')}>
            {l === h ? pct(l) : `${pct(l)}–${pct(h)}`}
          </span>
        )
      },
    }),
    col.accessor((r) => r.low?.total_units ?? 0, {
      id: 'units',
      header: 'Units',
      cell: (c) => {
        const r = c.row.original
        const l = r.low?.total_units ?? 0, h = r.high?.total_units ?? 0
        return <span className="tnum">{l === h ? num(l) : `${num(l)}–${num(h)}`}</span>
      },
    }),
    col.accessor(lo, {
      id: 'rlv',
      header: 'Residual land value',
      cell: (c) => {
        const r = c.row.original
        const l = lo(r), h = hi(r)
        return (
          <span className="tnum text-[13px] font-semibold" title={`${aedFull(l)} – ${aedFull(h)}`}>
            {l === h ? aed(l) : `${aed(l)} – ${aed(h)}`}
          </span>
        )
      },
    }),
    col.display({
      id: 'caveats',
      header: 'Reading',
      cell: (c) => {
        const r = c.row.original
        const contested = r.contested_by ?? []
        return (
          <div className="flex flex-wrap items-center gap-1">
            {!r.bounded && (
              <Badge
                className="bg-deferred-bg text-deferred"
                title="DDA deferred a setback to another document. The two figures are readings, not the ends of a range, so nothing brackets the answer."
              >
                unbounded
              </Badge>
            )}
            {/* The plot numbers are the actionable part, so they are printed rather than left in
                a tooltip -- a count alone tells you something is unsettled but not with what. */}
            {contested.length > 0 && (
              <Badge
                className="bg-assumption-bg text-assumption"
                title="Ranked above these plots on the conservative bound, but its range still reaches theirs. The register does not settle the order."
              >
                <TriangleAlert className="size-3" />
                ties {contested.join(' · ')}
              </Badge>
            )}
            {r.parking_deferred && (
              <Badge
                className="bg-deferred-bg text-deferred"
                title="DDA published no bay ratio for this plot, so this value was priced with no parking cost."
              >
                no parking rule
              </Badge>
            )}
            {r.bounded && !contested.length && !r.parking_deferred && (
              <span className="text-muted-foreground text-xs">—</span>
            )}
          </div>
        )
      },
    }),
  ]

  const table = useReactTable({
    data: priced,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <table className="w-full text-sm">
      <thead>
        {table.getHeaderGroups().map((hg) => (
          <tr key={hg.id} className="text-muted-foreground text-left">
            {hg.headers.map((h) => (
              <th key={h.id} className="px-2 pb-2 font-medium">
                <button
                  onClick={h.column.getToggleSortingHandler()}
                  className="hover:text-foreground inline-flex items-center gap-1 font-mono text-[10px] tracking-[0.1em] uppercase"
                >
                  {flexRender(h.column.columnDef.header, h.getContext())}
                  {h.column.getCanSort() && <ArrowUpDown className="size-3 opacity-50" />}
                </button>
              </th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody>
        {table.getRowModel().rows.map((r) => (
          <tr key={r.id} className="hover:bg-secondary/50 border-t">
            {r.getVisibleCells().map((cell) => (
              <td key={cell.id} className="px-2 py-2 align-middle">
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </td>
            ))}
          </tr>
        ))}
        {unpriced.map((r) => (
          <UnpricedRow key={r.plot_number} row={r} cols={columns.length} />
        ))}
      </tbody>
    </table>
  )
}
