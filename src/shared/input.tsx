import * as React from 'react'

import { cn } from '@/shared/lib/utils'

type InputProps = React.ComponentProps<'input'> & {
  error?: string
  containerClassName?: string
}

export const Input = ({
  className,
  type,
  error,
  containerClassName,
  ...props
}: InputProps) => {
  return (
    <div className={cn('w-full', containerClassName)}>
      <input
        type={type}
        data-slot="input"
        className={cn(
          'file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex h-9 w-full min-w-0 rounded border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
          'focus-visible:border-ring focus-visible:ring-primary/20 focus-visible:ring-[3px]',
          'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive',
          className
        )}
        {...props}
        aria-invalid={!!error}
        aria-errormessage={error}
      />
      {error && <span className="text-red-500 text-xs">{error}</span>}
    </div>
  )
}
