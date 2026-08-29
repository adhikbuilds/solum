import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * Provenance is a first-class variant, not an ad-hoc colour. Every figure in the product is
 * rendered with the badge that matches where it came from, so the vocabulary cannot drift.
 */
const badgeVariants = cva(
  'inline-flex items-center rounded-sm border px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.09em] whitespace-nowrap',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-secondary text-secondary-foreground',
        outline: 'text-muted-foreground',
        authority: 'border-transparent bg-authority-bg text-authority',
        derived: 'border-transparent bg-derived-bg text-derived',
        assumption: 'border-transparent bg-assumption-bg text-assumption',
        deferred: 'border-transparent bg-deferred-bg text-deferred',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

function Badge({
  className, variant, asChild = false, ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'span'
  return <Comp className={cn(badgeVariants({ variant }), className)} {...props} />
}
export { Badge, badgeVariants }
