'use client'

import { DeleteCategoryConfirmation } from '@/features/catalog/components/categories-list/delete-category-confirmation'
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/shared/accordion'
import { Button } from '@/shared/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/shared/dropdown-menu'
import { cn } from '@/shared/lib/utils'
import { LargeText } from '@/shared/typography/large-text'
import { SmallDescription } from '@/shared/typography/small-description'
import { Edit, Image as ImageIcon, MoreHorizontal, MoveDown, MoveUp, Plus, Trash2 } from 'lucide-react'
import Image from 'next/image'
import { useState } from 'react'
import { useCategory } from '../../hooks/use-category'
import { CategoryWithImage } from '../../types'
import { UpdateCategoryAction } from '../create-or-update-category/update-category-action'
import { CreateProductActionButton } from '../create-or-update-product/create-product-action-button'

export const CategoryBlock = ({
  category,
  isFirst = false,
  isLast = false,
}: {
  category: CategoryWithImage
  isFirst?: boolean
  isLast?: boolean
}) => {
  const { deleteCategory, isDeleting, onUpdateCategory } = useCategory()
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false)

  return (
    <AccordionItem key={category.id} value={category.id.toString()} className="border rounded-lg bg-white">
      <div className="flex items-center justify-between px-4 ">
        <AccordionTrigger className="hover:no-underline py-0 items-center" containerClassName="flex-1 grow">
          <>
            <div className={cn('h-14 w-14 rounded-md overflow-hidden my-3 bg-slate-100 border border-slate-200')}>
              {category.image ? (
                <Image src={category.image.url} alt={category.name} width={56} height={56} className="w-full h-full" />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <ImageIcon className="h-6 w-6 text-slate-400" />
                </div>
              )}
            </div>
            <div className="flex flex-col items-start justify-center grow">
              <LargeText variant="md">{category.name}</LargeText>
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
      <AccordionContent asChild className="px-4 py-0">
        <div className="flex flex-col items-center justify-center pb-2">
          <CreateProductActionButton
            category={category}
            trigger={
              <Button
                variant="outline"
                onClick={() => console.log(category.id)}
                className="text-primary w-full h-20 hover:bg-primary/5 hover:text-primary hover:border-2 hover:border-primary hover:border-dashed"
              >
                <Plus className="mr-1 h-4 w-4" />
                Adicionar Item
              </Button>
            }
          />
        </div>
      </AccordionContent>
    </AccordionItem>
  )
}
