import { cn } from '@/shared/lib/utils'

export const SmallDescription = ({ children, className }: { children: React.ReactNode; className?: string }) => {
  return <small className={cn('m-0 h-[1.25rem] text-xs leading-5 text-muted-foreground', className)}>{children}</small>
}
