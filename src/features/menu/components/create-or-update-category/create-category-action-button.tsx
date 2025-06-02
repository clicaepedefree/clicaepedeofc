'use client'

import { CreateOrUpdateCategoryForm } from '@/features/menu/components/create-or-update-category/create-or-update-category-form'
import { Category } from '@/features/menu/types'
import { Button } from '@/shared/button'
import { BaseSideBarActionForm } from '@/shared/form/base-side-bar-action-form'
import { Plus } from 'lucide-react'

type CreateCategoryActionButtonProps = {
  onSuccess?: (newCategory: Category) => void
}
export const CreateCategoryActionButton = ({ onSuccess }: CreateCategoryActionButtonProps) => {
  return (
    <BaseSideBarActionForm
      title="Nova categoria"
      description="Preencha as informações da nova categoria."
      trigger={
        <Button variant="default" className="font-semibold">
          <Plus size={20} strokeWidth={3} /> Categoria
        </Button>
      }
    >
      {({ FooterContainer, closeSidebar }) => (
        <CreateOrUpdateCategoryForm
          className="px-4 overflow-y-auto relative"
          onSuccess={category => {
            onSuccess?.(category)
            closeSidebar?.()
          }}
          FooterContainerComponent={FooterContainer}
        />
      )}
    </BaseSideBarActionForm>
  )
}
