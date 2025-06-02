import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/shared/alert-dialog'
import { Button } from '@/shared/button'
import { LoadingSpinner } from '@/shared/spinner'

type Resource = 'categoria' | 'item'

type DeleteResourceConfirmationProps = {
  trigger: React.ReactNode
  resource: Resource
  resourceName: string
  onConfirm?(): void
  asChild?: boolean
  isDeleting?: boolean
}

export const DeleteResourceConfirmationModal = ({
  trigger,
  resource,
  resourceName,
  onConfirm,
  asChild = true,
  isDeleting = false,
}: DeleteResourceConfirmationProps) => {
  const resourceGenderArticle = resource.slice(-1) === 'a' ? 'A' : 'O'
  const excludedForResource = resourceGenderArticle === 'A' ? 'excluída' : 'excluído'
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild={asChild}>{trigger}</AlertDialogTrigger>
      <AlertDialogContent onOpenAutoFocus={e => e.preventDefault()}>
        <AlertDialogHeader>
          <AlertDialogTitle>Remover {resource}</AlertDialogTitle>
          <AlertDialogDescription>
            {resourceGenderArticle} {resource} <b className="text-destructive">{resourceName}</b> será permanentemente{' '}
            {excludedForResource}. <br />
            Esta ação não pode ser desfeita.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="outline">Cancelar</Button>
          </AlertDialogCancel>
          <Button variant="destructive" onClick={onConfirm} disabled={isDeleting} className="min-w-24">
            {isDeleting ? <LoadingSpinner className="text-white" size={20} /> : 'Remover'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
