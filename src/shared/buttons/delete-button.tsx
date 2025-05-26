import { Trash2 } from 'lucide-react'
import { Button } from '../button'
import { cn } from '../lib/utils'

export const DeleteButton = ({ isDeleting, size = 16 }: { isDeleting?: boolean; size?: number }) => {
  return (
    <Button variant="ghost" size="icon" className="group/delete" disabled={isDeleting}>
      <Trash2 size={size} className={cn('group-hover/delete:text-destructive')} />
    </Button>
  )
}
