'use client'

import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'

import { cn } from '@/shared/lib/utils'

function TooltipProvider({
  delayDuration = 0,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  )
}

function Tooltip({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return (
    <TooltipProvider>
      <TooltipPrimitive.Root data-slot="tooltip" {...props} />
    </TooltipProvider>
  )
}

function TooltipTrigger({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

const tooltipContentVariants = cva(
  'animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 w-fit origin-(--radix-tooltip-content-transform-origin) rounded-md px-3 py-1.5 text-xs text-balance',
  {
    variants: {
      variant: {
        info: 'bg-primary text-primary-foreground',
        error: 'bg-destructive border-destructive text-white',
      },
    },
    defaultVariants: {
      variant: 'info',
    },
  }
)

const tooltipArrowVariants = cva(
  'z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px]',
  {
    variants: {
      variant: {
        info: 'bg-primary fill-primary',
        error: 'bg-destructive/10 fill-red-600',
      },
    },
    defaultVariants: {
      variant: 'info',
    },
  }
)

function TooltipContent({
  className,
  sideOffset = 0,
  children,
  hideArrow = false,
  variant,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content> & {
  hideArrow?: boolean
} & VariantProps<typeof tooltipContentVariants>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(tooltipContentVariants({ variant }), className)}
        {...props}
      >
        {children}
        {!hideArrow && (
          <TooltipPrimitive.Arrow
            className={tooltipArrowVariants({ variant })}
          />
        )}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger }
