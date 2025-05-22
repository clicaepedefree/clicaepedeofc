'use client'

import { DeleteCategoryConfirmation } from '@/features/catalog/components/categories-list/delete-category-confirmation'
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/shared/accordion'
import { Button } from '@/shared/button'
import { CurrencyInput } from '@/shared/currency-input'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/shared/dropdown-menu'
import { formatNumberToCurrency } from '@/shared/formatters/currency'
import { ImageWithPlaceholder } from '@/shared/image-with-placeholder'
import { Label } from '@/shared/label'
import { cn } from '@/shared/lib/utils'
import { Switch } from '@/shared/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/table'
import { LargeText } from '@/shared/typography/large-text'
import { SmallDescription } from '@/shared/typography/small-description'
import { SmallText } from '@/shared/typography/small-text'
import { Edit, MoreHorizontal, MoveDown, MoveUp, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useCategory } from '../../hooks/use-category'
import { useProduct } from '../../hooks/use-product'
import { CategoryWithImage, ProductWithImageAndCategory } from '../../types'
import { UpdateCategoryAction } from '../create-or-update-category/update-category-action'
import { CreateProductActionButton } from '../create-or-update-product/create-product-action-button'

export const CategoryBlock = ({
  category,
  isFirst = false,
  isLast = false,
  onCategoryUpdated,
}: {
  category: CategoryWithImage
  isFirst?: boolean
  isLast?: boolean
  onCategoryUpdated?(): void
}) => {
  const { deleteCategory, isDeleting, onUpdateCategory } = useCategory()
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false)

  const categoryProducts = category.products ?? []
  return (
    <AccordionItem key={category.id} value={category.id.toString()} className="border rounded-lg bg-white">
      <div className="flex items-center justify-between px-4 ">
        <AccordionTrigger className="hover:no-underline py-0 items-center" containerClassName="flex-1 grow">
          <>
            <ImageWithPlaceholder image={category.image} alt={category.name} className="my-3" />
            <div className="flex flex-col items-start justify-center grow">
              <LargeText variant="lg">{category.name}</LargeText>
              {category.description && (
                <SmallDescription className="line-clamp-1 text-muted-foreground">
                  {category.description}
                </SmallDescription>
              )}
            </div>
          </>
        </AccordionTrigger>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={e => {
              e.stopPropagation()
            }}
            disabled={isFirst}
          >
            <MoveUp className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={e => {
              e.stopPropagation()
            }}
            disabled={isLast}
          >
            <MoveDown className="h-4 w-4" />
          </Button>
          {isDeleting && <Trash2 className="h-4 w-4 text-destructive animate-bounce" />}
          {!isDeleting && (
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
                    onUpdateCategory(category)
                  }}
                />
                <DeleteCategoryConfirmation
                  trigger={
                    <DropdownMenuItem variant="destructive" onSelect={e => e.preventDefault()}>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Remover
                    </DropdownMenuItem>
                  }
                  categoryName={category.name}
                  onConfirm={() => {
                    deleteCategory(category)
                    setIsActionsMenuOpen(false)
                  }}
                  asChild
                />
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
      <AccordionContent asChild className="px-4 pt-0 pb-2">
        <CategoryProductsTable
          categoryProducts={categoryProducts}
          firstRowAction={
            <CreateProductActionButton
              category={category}
              onSuccess={onCategoryUpdated}
              trigger={
                <Button
                  variant="outline"
                  onClick={() => console.log(category.id)}
                  className="text-primary w-full h-10 hover:bg-primary/5 hover:text-primary hover:border-2 hover:border-primary hover:border-dashed"
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Adicionar Item
                </Button>
              }
            />
          }
        />
      </AccordionContent>
    </AccordionItem>
  )
}

const CategoryProductsTable = ({
  categoryProducts,
  firstRowAction,
}: {
  categoryProducts: ProductWithImageAndCategory[]
  firstRowAction?: React.ReactNode
}) => {
  return (
    <Table className="table-auto overflow-x-scroll">
      <TableHeader>
        <TableRow>
          <TableHead className="text-center">Item</TableHead>
          <TableHead className="text-center">Preço</TableHead>
          <TableHead className="text-center">Status de venda</TableHead>
          <TableHead className="text-center">Ações</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {firstRowAction && (
          <TableRow className="hover:bg-unset">
            <TableCell className="px-0 m-0" colSpan={50}>
              {firstRowAction}
            </TableCell>
          </TableRow>
        )}
        {categoryProducts.map(product => (
          <CategoryProductRow key={product.id} product={product} />
        ))}
      </TableBody>
    </Table>
  )
}

const CategoryProductRow = ({ product }: { product: ProductWithImageAndCategory }) => {
  const { deleteProduct, isDeleting } = useProduct()

  return (
    <TableRow>
      <TableCell className="w-fit flex items-center  justify-center gap-1 sm:gap-4 flex-wrap sm:flex-nowrap">
        <ImageWithPlaceholder image={product.image} alt={product.name} />
        <LargeText variant="sm">{product.name}</LargeText>
      </TableCell>
      <TableCell className="max-w-24 w-fit place-items-center space-y-2">
        {product.originalPrice && (
          <SmallText className="line-through text-xs">{formatNumberToCurrency(product.originalPrice)}</SmallText>
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
        <div className="flex items-center justify-center">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => deleteProduct(product)}
            className="group/delete"
            disabled={isDeleting}
          >
            <Trash2 size={16} className={cn('group-hover/delete:text-destructive', isDeleting && 'animate-bounce')} />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}
