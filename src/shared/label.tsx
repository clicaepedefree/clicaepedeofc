'use client'

import * as React from 'react'
import * as LabelPrimitive from '@radix-ui/react-label'

import { cn } from '@/lib/utils'
import { cva, type VariantProps } from 'class-variance-authority'

const labelVariants = cva(
  'flex gap-1 leading-none select-none group-data-[disabled=true]:pointer-events-none group-data-\
  [disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 text-foreground',
  {
    variants: {
      variant: {
        default: 'flex-col items-start',
        inline: 'flex-row items-center',
      },
      size: {
        default: 'text-base',
        sm: 'text-sm',
        lg: 'text-xl',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)
function Label({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root> & VariantProps<typeof labelVariants>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        labelVariants({
          variant,
          size,
          className,
        }),
        className
      )}
      {...props}
    />
  )
}

export { Label }
