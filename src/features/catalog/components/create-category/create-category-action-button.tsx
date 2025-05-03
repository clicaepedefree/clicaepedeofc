'use client'

import { useState } from 'react'
import { Button } from '@/shared/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/shared/sheet'
import { CreateCategoryForm } from './create-category.form'
import { Category } from '../../types'

type CreateCategoryActionButtonProps = {
  onSuccess?: (newCategory: Category) => void
}
export const CreateCategoryActionButton = ({ onSuccess }: CreateCategoryActionButtonProps) => {
  const [open, setOpen] = useState(false)

  const onNewCategoryCreated = (newCategory: Category) => {
    onSuccess?.(newCategory)
    setOpen(false)
  }
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="default" size="sm">
          Adicionar categoria
        </Button>
      </SheetTrigger>
      <SheetContent
        className="w-11/12 sm:max-w-5xl max-h-dvh h-fit rounded-l-2xl"
        onPointerDownOutside={() => {}}
        onInteractOutside={event => event.preventDefault()}
        onFocusOutside={() => {}}
      >
        <SheetHeader>
          <SheetTitle>Nova categoria</SheetTitle>
          <SheetDescription>Preencha as informações da nova categoria.</SheetDescription>
        </SheetHeader>
        <CreateCategoryForm
          className="px-4 overflow-y-auto relative"
          FooterContainerComponent={SheetFooter}
          onSuccess={onNewCategoryCreated}
        />
      </SheetContent>
    </Sheet>
  )
}
