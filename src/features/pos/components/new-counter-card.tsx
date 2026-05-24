import { CreateCounterForm } from '@/features/pos/components/create-counter-form'
import { Button } from '@/shared/button'
import { cn } from '@/shared/lib/utils'
import { useClickAway } from '@uidotdev/usehooks'
import { Monitor, Plus } from 'lucide-react'
import { useState } from 'react'

export const NewCounterCard = ({
  initialIsCreating = false,
}: {
  initialIsCreating?: boolean
}) => {
  const [isCreating, setIsCreating] = useState(initialIsCreating)
  const ref = useClickAway<HTMLDivElement>(
    () => !initialIsCreating && setIsCreating(false)
  )

  if (!isCreating)
    return (
      <Button
        variant="outline"
        className="text-primary h-10 hover:bg-primary/5 hover:text-primary border-2 hover:border-primary border-dashed min-h-32 min-w-68"
        onClick={() => setIsCreating(true)}
      >
        <Plus className="mr-1 h-4 w-4" />
        Adicionar Caixa
      </Button>
    )

  return (
    <div
      ref={ref}
      className={cn(
        'flex flex-col gap-2 justify-center items-center min-h-32 p-2 border-2 rounded-lg bg-card text-card-foreground cursor-pointer min-w-68 border-l-8'
      )}
    >
      <Monitor size={20} />
      <CreateCounterForm onSuccess={() => setIsCreating(false)} />
    </div>
  )
}
