'use client'

import { cn } from '@/shared/lib/utils'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'

const switchVariants = cva(
  'peer data-[state=checked]:bg-primary data-[state=unchecked]:bg-input focus-visible:border-ring focus-visible:ring-ring/50 dark:data-[state=unchecked]:bg-input/80 inline-flex shrink-0 items-center rounded-full border border-transparent shadow-xs transition-all outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      size: {
        default: 'h-[1.15rem] w-8',
        sm: 'h-[0.88rem] w-6',
        lg: 'h-6 w-11',
      },
    },
    defaultVariants: {
      size: 'default',
    },
  }
)

const thumbVariants = cva(
  'bg-background dark:data-[state=unchecked]:bg-foreground dark:data-[state=checked]:bg-primary-foreground pointer-events-none block rounded-full ring-0 transition-transform data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0',
  {
    variants: {
      size: {
        default: 'size-4',
        sm: 'size-3',
        lg: 'size-[22px]',
      },
    },
    defaultVariants: {
      size: 'default',
    },
  }
)

type SwitchProps = React.ComponentProps<typeof SwitchPrimitive.Root> & VariantProps<typeof switchVariants>

function Switch({ className, size = 'default', ...props }: SwitchProps) {
  return (
    <SwitchPrimitive.Root data-slot="switch" className={cn(switchVariants({ size, className }))} {...props}>
      <SwitchPrimitive.Thumb data-slot="switch-thumb" className={cn(thumbVariants({ size }))} />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
