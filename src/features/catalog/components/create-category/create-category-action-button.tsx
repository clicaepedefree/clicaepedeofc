'use client'

import { Button } from '@/shared/button'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/shared/sheet'
import { CreateCategoryForm } from './create-category.form'

export const CreateCategoryActionButton = () => {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="default" size="sm">
          Adicionar categoria
        </Button>
      </SheetTrigger>
      <SheetContent className="w-11/12 sm:max-w-full">
        <SheetHeader>
          <SheetTitle>Criar categoria</SheetTitle>
          <SheetDescription>Crie uma nova categoria para o seu cardápio.</SheetDescription>
        </SheetHeader>
        <CreateCategoryForm />
        <SheetFooter className="sm:justify-start">
          <SheetClose asChild>
            <Button type="button" variant="secondary">
              Close
            </Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
