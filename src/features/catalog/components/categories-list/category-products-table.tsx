'use client'

import { Button } from '@/shared/button'
import { CurrencyInput } from '@/shared/currency-input'
import { formatValueToCurrency } from '@/shared/formatters/currency'
import { ImageWithPlaceholder } from '@/shared/image-with-placeholder'
import { Label } from '@/shared/label'
import { cn } from '@/shared/lib/utils'
import { DeleteResourceConfirmationModal } from '@/shared/modals/delete-resource-confirmation-modal'
import { Switch } from '@/shared/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/table'
import { LargeText } from '@/shared/typography/large-text'
import { SmallText } from '@/shared/typography/small-text'
import { Edit, Trash2 } from 'lucide-react'
import { useProduct } from '../../hooks/use-product'
import { BaseCategory, CategoryProductWithImage } from '../../types'
import { UpdateProductAction } from '../create-or-update-product/update-product-action'

export const CategoryProductsTable = ({
  category,
  categoryProducts,
  firstRowAction,
  onProductUpdated,
}: {
  category: BaseCategory
  categoryProducts: CategoryProductWithImage[]
  firstRowAction?: React.ReactNode
  onProductUpdated?(): void
}) => {
  const hasProducts = categoryProducts.length > 0

  return (
    <Table className="table-auto overflow-x-scroll">
      <TableHeader>
        {firstRowAction && (
          <TableRow className="hover:bg-unset">
            <TableCell className="px-0 m-0" colSpan={50}>
              {firstRowAction}
            </TableCell>
          </TableRow>
        )}
        {hasProducts && (
          <TableRow>
            <TableHead className="text-center">Item</TableHead>
            <TableHead className="text-center">Preço</TableHead>
            <TableHead className="text-center">Status de venda</TableHead>
            <TableHead className="text-center">Ações</TableHead>
          </TableRow>
        )}
      </TableHeader>
      <TableBody>
        {categoryProducts.map(product => (
          <CategoryProductRow
            key={product.id}
            product={product}
            category={category}
            onProductUpdated={onProductUpdated}
          />
        ))}
      </TableBody>
    </Table>
  )
}

const CategoryProductRow = ({
  product,
  category,
  onProductUpdated,
}: {
  product: CategoryProductWithImage
  category: BaseCategory
  onProductUpdated?(): void
}) => {
  const { deleteProduct, isDeleting, onUpdateProduct } = useProduct()

  return (
    <TableRow>
      <TableCell className="w-fit flex items-center  justify-center gap-1 sm:gap-4 flex-wrap sm:flex-nowrap">
        <ImageWithPlaceholder image={product.image} alt={product.name} />
        <LargeText variant="sm">{product.name}</LargeText>
      </TableCell>
      <TableCell className="max-w-24 w-fit place-items-center space-y-2">
        {product.originalPrice && (
          <SmallText className="line-through text-xs">
            {formatValueToCurrency({ value: product.originalPrice, includeCurrencySymbol: true })}
          </SmallText>
        )}
        <CurrencyInput
          className="w-fit"
          inputClassName="min-w-[58px] sm:min-w-[80px] sm:max-w-[100px] text-xs sm:text-normal disabled:opacity-100"
          value={product.price}
          disabled
        />
      </TableCell>
      <TableCell className="place-items-center">
        <Label size="sm" className="gap-1 items-center">
          <LargeText variant="sm" className="font-medium">
            {product.isAvailable ? 'Ativo' : 'Inativo'}
          </LargeText>
          <Switch size="lg" checked={product.isAvailable} className="disabled:opacity-90" disabled />
        </Label>
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-center gap-2">
          <UpdateProductAction
            category={category}
            product={product}
            trigger={
              <Button variant="ghost" size="icon" className="group/edit" disabled={isDeleting}>
                <Edit size={16} className={cn('group-hover/edit:text-primary')} />
              </Button>
            }
            onSuccess={product => {
              onUpdateProduct(product)
              onProductUpdated?.()
            }}
          />
          <DeleteResourceConfirmationModal
            trigger={
              <Button variant="ghost" size="icon" className="group/delete" disabled={isDeleting}>
                <Trash2 size={16} className={cn('group-hover/delete:text-destructive')} />
              </Button>
            }
            resource="produto"
            resourceName={product.name}
            isDeleting={isDeleting}
            onConfirm={async () => {
              await deleteProduct(product)
              onProductUpdated?.()
            }}
          />
        </div>
      </TableCell>
    </TableRow>
  )
}
