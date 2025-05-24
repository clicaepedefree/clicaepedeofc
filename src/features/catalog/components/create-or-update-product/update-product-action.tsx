'use client'

import { BaseCategory, CategoryProductWithImage, Product } from '@/features/catalog/types'
import { BaseSideBarActionForm } from '@/shared/form/base-side-bar-action-form'
import { CreateOrUpdateProductForm } from './create-or-update-product-form'

type UpdateProductActionProps = {
  category?: BaseCategory
  product: CategoryProductWithImage
  trigger: React.ReactNode
  onSuccess?: (updatedProduct: Product) => void
}
export const UpdateProductAction = ({ product, category, trigger, onSuccess }: UpdateProductActionProps) => {
  return (
    <BaseSideBarActionForm title="Editar produto" description="Altere os dados do produto." trigger={trigger}>
      {({ FooterContainer, closeSidebar }) => (
        <CreateOrUpdateProductForm
          className="px-4 overflow-y-auto relative"
          product={product}
          category={category}
          onSuccess={updatedProduct => {
            closeSidebar?.()
            onSuccess?.(updatedProduct)
          }}
          FooterContainerComponent={FooterContainer}
        />
      )}
    </BaseSideBarActionForm>
  )
}
