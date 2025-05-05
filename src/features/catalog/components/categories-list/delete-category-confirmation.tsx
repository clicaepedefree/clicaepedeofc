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

type DeleteCategoryConfirmationProps = {
  trigger: React.ReactNode
  categoryName: string
  onConfirm?(): void
  asChild?: boolean
}

export const DeleteCategoryConfirmation = ({
  trigger,
  categoryName,
  onConfirm,
  asChild,
}: DeleteCategoryConfirmationProps) => {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild={asChild}>{trigger}</AlertDialogTrigger>
      <AlertDialogContent onOpenAutoFocus={e => e.preventDefault()}>
        <AlertDialogHeader>
          <AlertDialogTitle>Remover categoria</AlertDialogTitle>
          <AlertDialogDescription>
            A categoria <b className="text-destructive">{categoryName}</b> será permanentemente excluída. <br />
            Esta ação não pode ser desfeita.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="outline">Cancelar</Button>
          </AlertDialogCancel>
          <Button variant="destructive" onClick={onConfirm}>
            Remover
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
