import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const largeTextVariants = cva('text-lg font-semibold', {
  variants: {
    variant: {
      default: 'leading-6 text-lg',
      sm: 'text-sm',
      md: 'text-base font-medium',
      lg: 'text-xl',
    },
    hoverBehavior: {
      default: '',
      clickable:
        'cursor-pointer focus-within:outline-none focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2 hover:text-primary group-hover:text-primary',
    },
  },
  defaultVariants: {
    variant: 'default',
    hoverBehavior: 'default',
  },
})

export const LargeText = ({
  children,
  variant,
  hoverBehavior,
  className,
}: {
  children: React.ReactNode
  className?: string
} & VariantProps<typeof largeTextVariants>) => {
  return <div className={cn(largeTextVariants({ variant, hoverBehavior }), className)}>{children}</div>
}
