import { Button } from '@/shared/button'
import { cn } from '@/shared/lib/utils'
import { Trash2 } from 'lucide-react'

export const DeleteButton = ({
  isDeleting,
  size = 16,
  onClick,
}: {
  isDeleting?: boolean
  size?: number
  onClick?: () => void
}) => {
  return (
    <Button variant="ghost" size="icon" className="group/delete" disabled={isDeleting} onClick={onClick}>
      <Trash2 size={size} className={cn('group-hover/delete:text-destructive')} />
    </Button>
  )
}
