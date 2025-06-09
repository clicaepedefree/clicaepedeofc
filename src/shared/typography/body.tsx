import { cn } from '@/shared/lib/utils'
import { cva, type VariantProps } from 'class-variance-authority'

const bodyVariants = cva('tracking-normal', {
  variants: {
    variant: {
      50: 'text-lg',
      100: 'text-base',
      200: 'text-sm tracking-[0.28px]',
      300: 'text-xs',
      400: 'text-xxs leading-[14px]',
    },
    fontWeight: {
      semibold: 'font-semibold',
      medium: 'font-medium',
      regular: 'font-normal',
      light: 'font-light',
      inherit: 'font-[inherit]',
    },
    highlight: {
      default: 'text-foreground',
      secondary: 'text-muted-foreground',
      inherit: 'text-[inherit]',
    },
  },
  defaultVariants: {
    variant: 300,
    fontWeight: 'medium',
    highlight: 'default',
  },
})

type BodyProps = VariantProps<typeof bodyVariants> & {
  children: React.ReactNode
  className?: string
}

export const Body = ({ variant, fontWeight, highlight, className, children }: BodyProps) => {
  return <div className={cn(bodyVariants({ variant, fontWeight, highlight }), className)}>{children}</div>
}
