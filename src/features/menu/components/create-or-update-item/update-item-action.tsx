'use client'

import { BaseCategory, Item, ItemOfferingWithImage } from '@/features/menu/types'
import { BaseSideBarActionForm } from '@/shared/form/base-side-bar-action-form'
import { CreateOrUpdateItemForm } from './create-or-update-item-form'

type UpdateItemActionProps = {
  category?: BaseCategory
  item: ItemOfferingWithImage
  trigger: React.ReactNode
  onSuccess?: (updatedItem: Item) => void
}
export const UpdateItemAction = ({ item, category, trigger, onSuccess }: UpdateItemActionProps) => {
  return (
    <BaseSideBarActionForm title="Editar item" description="Altere os dados do item." trigger={trigger}>
      {({ FooterContainer, closeSidebar }) => (
        <CreateOrUpdateItemForm
          className="px-4 overflow-y-auto relative"
          item={item}
          category={category}
          onSuccess={updatedItem => {
            closeSidebar?.()
            onSuccess?.(updatedItem)
          }}
          FooterContainerComponent={FooterContainer}
        />
      )}
    </BaseSideBarActionForm>
  )
}
