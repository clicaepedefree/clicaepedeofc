import { cn } from '@/shared/lib/utils'
import { cva, type VariantProps } from 'class-variance-authority'

const headlineVariants = cva("font-['TT Commons'] tracking-normal", {
  variants: {
    variant: {
      100: 'text-[42px] leading-[56px]',
      200: 'text-4xl leading-[48px]',
      300: 'text-2xl',
      400: 'text-xl',
      500: 'text-lg leading-[24px]',
    },
    fontWeight: {
      semibold: 'font-semibold',
      medium: 'font-medium',
      regular: 'font-normal',
    },
  },
  defaultVariants: {
    variant: 300,
    fontWeight: 'semibold',
  },
})

type HeadlineProps = VariantProps<typeof headlineVariants> & {
  children: React.ReactNode
  className?: string
}

export const Headline = ({ variant, fontWeight, className, children }: HeadlineProps) => {
  return <div className={cn(headlineVariants({ variant, fontWeight }), className)}>{children}</div>
}
