import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { Provenance } from '@/api/types'

const VARIANT = {
  authority: 'authority', derived: 'derived',
  assumption: 'assumption', deferred: 'deferred', unavailable: 'outline',
} as const

/**
 * A figure and where it came from, inseparable.
 *
 * The basis string is not decoration -- it is the sentence that lets a developer decide whether
 * to trust the number. It sits behind a tooltip so the table stays readable, but it is never
 * absent.
 */
export function Fact({
  label, value, provenance, basis,
}: { label: string; value: React.ReactNode; provenance: Provenance; basis?: string }) {
  const badge = (
    <Badge variant={VARIANT[provenance] as never} className="ml-1.5 cursor-help align-[1px]">
      {provenance}
    </Badge>
  )
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="text-muted-foreground text-[13px]">
        {label}
        {basis ? (
          <Tooltip>
            <TooltipTrigger asChild>{badge}</TooltipTrigger>
            <TooltipContent>{basis}</TooltipContent>
          </Tooltip>
        ) : badge}
      </dt>
      <dd className="tnum font-mono text-[13px] font-medium">{value}</dd>
    </div>
  )
}
