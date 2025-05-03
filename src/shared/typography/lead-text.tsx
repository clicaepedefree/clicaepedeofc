import { cn } from '@/lib/utils'

export const LeadText = ({ children, className }: { children: React.ReactNode; className?: string }) => {
  return <p className={cn('text-xl text-muted-foreground', className)}>{children}</p>
}
