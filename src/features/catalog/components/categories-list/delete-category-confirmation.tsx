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
  children: React.ReactNode
  onConfirm?(): void
  asChild?: boolean
}

export const DeleteCategoryConfirmation = ({ children, onConfirm, asChild }: DeleteCategoryConfirmationProps) => {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild={asChild}>{children}</AlertDialogTrigger>
      <AlertDialogContent onOpenAutoFocus={e => e.preventDefault()}>
        <AlertDialogHeader>
          <AlertDialogTitle>Deletar categoria</AlertDialogTitle>
          <AlertDialogDescription>
            Esta categoria será permanentemente excluída. <br />
            Esta ação não pode ser desfeita.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="outline">Cancelar</Button>
          </AlertDialogCancel>
          <Button variant="destructive" onClick={onConfirm}>
            Deletar
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
