'use client'

import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/shared/accordion'
import { Button } from '@/shared/button'
import { ImageWithPlaceholder } from '@/shared/image-with-placeholder'
import { cn } from '@/shared/lib/utils'
import { LargeText } from '@/shared/typography/large-text'
import { SmallDescription } from '@/shared/typography/small-description'
import { MoveDown, MoveUp, Plus } from 'lucide-react'
import { useCategory } from '../../hooks/use-category'
import { CategoryWithImage } from '../../types'
import { CreateItemActionButton } from '../create-or-update-item/create-item-action-button'
import { CategoryActions } from './category-actions'
import { ItemOfferingsTable } from './item-offerings-table'

export const CategoryBlock = ({
  category,
  isFirst = false,
  isLast = false,
  onCategoryUpdated,
  onUpdateOpenedState,
}: {
  category: CategoryWithImage
  isFirst?: boolean
  isLast?: boolean
  onCategoryUpdated?(): void
  onUpdateOpenedState?(isOpen: boolean): void
}) => {
  const { deleteCategory, isDeleting, onUpdateCategory } = useCategory()

  const itemOfferings = category.items ?? []

  return (
    <AccordionItem
      value={category.id.toString()}
      className={cn(
        'border rounded-lg bg-white',
        isDeleting &&
          'border-destructive border-2 border-dashed animate-pulse bg-destructive/5'
      )}
    >
      <div className="flex items-center justify-between px-4 ">
        <AccordionTrigger
          disabled={isDeleting}
          className="hover:no-underline py-2 items-center"
          containerClassName="flex-1 grow"
        >
          <>
            <ImageWithPlaceholder
              image={category.image}
              alt={category.name}
              containerClassName="my-3"
            />
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
          {!isDeleting && (
            <>
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
            </>
          )}
          <CategoryActions
            category={category}
            onCategoryUpdated={category => {
              onUpdateCategory(category)
              onCategoryUpdated?.()
            }}
            onDelete={async () => {
              onUpdateOpenedState?.(false)
              await deleteCategory(category)
              onUpdateOpenedState?.(true)
            }}
            isDeleting={isDeleting}
          />
        </div>
      </div>
      <AccordionContent asChild className="px-4 pt-0 pb-2">
        <ItemOfferingsTable
          category={category}
          itemOfferings={itemOfferings}
          firstRowAction={
            <CreateItemActionButton
              category={category}
              onSuccess={onCategoryUpdated}
              trigger={
                <Button
                  variant="outline"
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
