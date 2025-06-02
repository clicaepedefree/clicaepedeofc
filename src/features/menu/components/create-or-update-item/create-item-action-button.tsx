'use client'

import { CreateOrUpdateItemForm } from '@/features/menu/components/create-or-update-item/create-or-update-item-form'
import { BaseCategory, Item } from '@/features/menu/types'
import { Button } from '@/shared/button'
import { BaseSideBarActionForm } from '@/shared/form/base-side-bar-action-form'
import { Plus } from 'lucide-react'

type CreateItemActionButtonProps = {
  category?: BaseCategory
  onSuccess?: (newItem: Item) => void
  trigger?: React.ReactNode
}
export const CreateItemActionButton = ({ category, onSuccess, trigger }: CreateItemActionButtonProps) => {
  return (
    <BaseSideBarActionForm
      title="Novo item"
      description="Preencha as informações do novo item."
      trigger={
        trigger ?? (
          <Button variant="outline" className="font-semibold">
            <Plus size={20} strokeWidth={3} /> Item
          </Button>
        )
      }
    >
      {({ FooterContainer, closeSidebar }) => (
        <CreateOrUpdateItemForm
          className="px-4 overflow-y-auto relative"
          category={category}
          onSuccess={newItem => {
            onSuccess?.(newItem)
            closeSidebar?.()
          }}
          FooterContainerComponent={FooterContainer}
        />
      )}
    </BaseSideBarActionForm>
  )
}
