'use client'

import { CreateOrUpdateProductForm } from '@/features/catalog/components/create-or-update-product/create-or-update-product-form'
import { BaseCategory, Product } from '@/features/catalog/types'
import { Button } from '@/shared/button'
import { BaseSideBarActionForm } from '@/shared/form/base-side-bar-action-form'
import { Plus } from 'lucide-react'

type CreateProductActionButtonProps = {
  category?: BaseCategory
  onSuccess?: (newProduct: Product) => void
  trigger?: React.ReactNode
}
export const CreateProductActionButton = ({ category, onSuccess, trigger }: CreateProductActionButtonProps) => {
  return (
    <BaseSideBarActionForm
      title="Novo produto"
      description="Preencha as informações do novo produto."
      trigger={
        trigger ?? (
          <Button variant="outline" className="font-semibold">
            <Plus size={20} strokeWidth={3} /> Produto
          </Button>
        )
      }
    >
      {({ FooterContainer, closeSidebar }) => (
        <CreateOrUpdateProductForm
          className="px-4 overflow-y-auto relative"
          category={category}
          onSuccess={product => {
            onSuccess?.(product)
            closeSidebar?.()
          }}
          FooterContainerComponent={FooterContainer}
        />
      )}
    </BaseSideBarActionForm>
  )
}
