'use client'

import { CreateOrUpdateCategoryForm } from '@/features/menu/components/create-or-update-category/create-or-update-category-form'
import { Category, CategoryWithImage } from '@/features/menu/types'
import { BaseSideBarActionForm } from '@/shared/form/base-side-bar-action-form'

type UpdateCategoryActionProps = {
  category: CategoryWithImage
  trigger: React.ReactNode
  onSuccess?: (updatedCategory: Category) => void
}
export const UpdateCategoryAction = ({ category, trigger, onSuccess }: UpdateCategoryActionProps) => {
  return (
    <BaseSideBarActionForm title="Editar categoria" description="Altere os dados da categoria." trigger={trigger}>
      {({ FooterContainer, closeSidebar }) => (
        <CreateOrUpdateCategoryForm
          className="px-4 overflow-y-auto relative"
          category={category}
          onSuccess={updatedCategory => {
            closeSidebar?.()
            onSuccess?.(updatedCategory)
          }}
          FooterContainerComponent={FooterContainer}
        />
      )}
    </BaseSideBarActionForm>
  )
}
