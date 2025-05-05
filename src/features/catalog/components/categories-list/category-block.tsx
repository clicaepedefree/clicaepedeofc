'use client'

import { DeleteCategoryConfirmation } from '@/features/catalog/components/categories-list/delete-category-confirmation'
import { AccordionItem, AccordionTrigger } from '@/shared/accordion'
import { Button } from '@/shared/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/shared/dropdown-menu'
import { BaseSideBarActionForm } from '@/shared/form/base-side-bar-action-form'
import { cn } from '@/shared/lib/utils'
import { LargeText } from '@/shared/typography/large-text'
import { SmallDescription } from '@/shared/typography/small-description'
import { Edit, Image as ImageIcon, MoreHorizontal, MoveDown, MoveUp, Plus, Trash2 } from 'lucide-react'
import Image from 'next/image'
import { useState } from 'react'
import { useCategory } from '../../hooks/use-category'
import { CategoryWithImage } from '../../types'
import { CreateOrUpdateCategoryForm } from '../create-or-update-category/create-or-update-category.form'

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
    <AccordionItem key={category.id} value={`item-${category.id}`} className="border px-4 rounded-lg bg-white">
      <div className="flex items-center justify-between">
        <AccordionTrigger
          className="hover:no-underline py-0 items-center"
          containerClassName="flex-1 grow"
          collapsibleClassName="hidden"
        >
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
              console.log('moveCategory up', category.id)
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
              console.log('moveCategory down', category.id)
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
                <BaseSideBarActionForm
                  title="Editar categoria"
                  description="Altere os dados da categoria."
                  trigger={
                    <DropdownMenuItem onSelect={e => e.preventDefault()}>
                      <Edit className="mr-2 h-4 w-4" />
                      Editar
                    </DropdownMenuItem>
                  }
                >
                  {({ FooterContainer, closeSidebar }) => (
                    <CreateOrUpdateCategoryForm
                      className="px-4 overflow-y-auto relative"
                      category={category}
                      onSuccess={category => {
                        console.log('updated category', category)
                        closeSidebar?.()
                        setIsActionsMenuOpen(false)
                        onUpdateCategory(category)
                      }}
                      FooterContainerComponent={FooterContainer}
                    />
                  )}
                </BaseSideBarActionForm>
                <DeleteCategoryConfirmation
                  categoryName={category.name}
                  asChild
                  onConfirm={() => {
                    deleteCategory(category)
                    setIsActionsMenuOpen(false)
                  }}
                >
                  <DropdownMenuItem variant="destructive" onSelect={e => e.preventDefault()}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Remover
                  </DropdownMenuItem>
                </DeleteCategoryConfirmation>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </AccordionItem>
  )
}
