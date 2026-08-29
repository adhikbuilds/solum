import { useState } from 'react'
import {
  createColumnHelper, flexRender, getCoreRowModel, getSortedRowModel, useReactTable,
  type ColumnDef, type SortingState,
} from '@tanstack/react-table'
import { ArrowUpDown, TriangleAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { aed, num, pct } from '@/lib/format'
import type { Solid } from '@/api/types'

const col = createColumnHelper<Solid>()

/**
 * Every massing option, sortable.
 *
 * Sorted by residual land value by default rather than by height, because the question at this
 * stage is "what can I pay for the land", not "how tall can I go".
 */
export function CandidateTable({
  solids, activeFloors, bestFloors, onSelect,
}: {
  solids: Solid[]; activeFloors: number | undefined
  bestFloors: number | null; onSelect: (floors: number) => void
}) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'rlv', desc: true }])

  // v9 produces a distinct ColumnDef TValue per accessor, so a heterogeneous array has no
  // common inferred type. Widening TValue once here is the documented escape hatch; the row
  // type (Solid) stays checked, which is the part that matters.
  const columns: ColumnDef<Solid, any>[] = [
    col.accessor('floors', {
      header: 'Storeys',
      cell: (c) => (
        <span className="flex items-center gap-1.5">
          <span className="font-mono text-[13px] font-semibold">{c.getValue()}</span>
          {c.getValue() === bestFloors && <Badge className="bg-primary text-primary-foreground">best</Badge>}
        </span>
      ),
    }),
    col.accessor((r) => r.feasibility.total_units, {
      id: 'units', header: 'Units', cell: (c) => num(c.getValue()),
    }),
    col.accessor('gfa_sqft', { header: 'GFA', cell: (c) => num(c.getValue()) }),
    col.accessor('gfa_utilisation', {
      id: 'util', header: 'Entitlement',
      cell: (c) => <span className={cn(c.getValue() >= 0.98 && 'text-authority font-semibold')}>{pct(c.getValue())}</span>,
    }),
    col.accessor('height_m', { header: 'Height', cell: (c) => `${c.getValue()} m` }),
    col.accessor((r) => r.scheme.parking_shortfall, {
      id: 'parking', header: 'Parking',
      cell: (c) => {
        const short = c.getValue()
        return short > 0 ? (
          <span className="text-destructive inline-flex items-center gap-1 font-medium">
            <TriangleAlert className="size-3" />{num(short)} short
          </span>
        ) : (
          <span className="text-muted-foreground">{num(c.row.original.scheme.parking_provided)}</span>
        )
      },
    }),
    col.accessor((r) => r.feasibility.residual_land_value, {
      id: 'rlv', header: 'RLV',
      cell: (c) => <span className="text-primary font-semibold">{aed(c.getValue())}</span>,
    }),
    col.accessor('binding_constraint', {
      header: 'Binding',
      cell: (c) => <span className="text-muted-foreground text-[11px]">{c.getValue()}</span>,
    }),
  ]

  const table = useReactTable({
    columns,
    data: solids,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-[13px]">
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} className="border-b">
              {hg.headers.map((h) => (
                <th key={h.id} className="px-3 py-2 text-left">
                  <button
                    onClick={h.column.getToggleSortingHandler()}
                    className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 font-mono text-[10px] font-semibold tracking-[0.12em] uppercase"
                  >
                    {flexRender(h.column.columnDef.header, h.getContext())}
                    <ArrowUpDown className="size-2.5 opacity-50" />
                  </button>
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
              onClick={() => onSelect(row.original.floors)}
              className={cn(
                'hover:bg-accent cursor-pointer border-b transition-colors',
                row.original.floors === activeFloors && 'bg-accent',
              )}
            >
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="tnum px-3 py-2">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
