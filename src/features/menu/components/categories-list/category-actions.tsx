'use client'

import { Button } from '@/shared/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/shared/dropdown-menu'
import { DeleteResourceConfirmationModal } from '@/shared/modals/delete-resource-confirmation-modal'
import { Edit, MoreHorizontal, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Category, CategoryWithImage } from '../../types'
import { UpdateCategoryAction } from '../create-or-update-category/update-category-action'

type CategoryActionsProps = {
  category: CategoryWithImage
  onCategoryUpdated?(category: Category): void
  onDelete?(): void
  isDeleting?: boolean
}

export const CategoryActions = ({ category, onCategoryUpdated, onDelete, isDeleting }: CategoryActionsProps) => {
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false)

  if (isDeleting) return <Trash2 className="h-4 w-4 text-destructive animate-bounce" />

  return (
    <DropdownMenu open={isActionsMenuOpen} onOpenChange={setIsActionsMenuOpen}>
      <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <UpdateCategoryAction
          category={category}
          trigger={
            <DropdownMenuItem onSelect={e => e.preventDefault()}>
              <Edit className="mr-2 h-4 w-4" />
              Editar
            </DropdownMenuItem>
          }
          onSuccess={category => {
            setIsActionsMenuOpen(false)
            onCategoryUpdated?.(category)
          }}
        />
        <DeleteResourceConfirmationModal
          trigger={
            <DropdownMenuItem variant="destructive" onSelect={e => e.preventDefault()}>
              <Trash2 className="mr-2 h-4 w-4" />
              Remover
            </DropdownMenuItem>
          }
          resource="categoria"
          resourceName={category.name}
          onConfirm={() => {
            onDelete?.()
            setIsActionsMenuOpen(false)
          }}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
