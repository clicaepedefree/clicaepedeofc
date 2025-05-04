'use client'

import { cn } from '@/lib/utils'
import { AccordionItem, AccordionTrigger } from '@/shared/accordion'
import { Button } from '@/shared/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/shared/dropdown-menu'
import { LargeText } from '@/shared/typography/large-text'
import { SmallDescription } from '@/shared/typography/small-description'
import { Edit, Image as ImageIcon, MoreHorizontal, MoveDown, MoveUp, Trash2 } from 'lucide-react'
import Image from 'next/image'
import { useCategory } from '../../hooks/use-category'
import { CategoryWithImage } from '../../types'

export const CategoryBlock = ({
  category,
  isFirst = false,
  isLast = false,
}: {
  category: CategoryWithImage
  isFirst?: boolean
  isLast?: boolean
}) => {
  const { deleteCategory, isDeleting } = useCategory()
  return (
    <AccordionItem key={category.id} value={`item-${category.id}`} className="border px-4 rounded-lg bg-white">
      <div className="flex items-center justify-between">
        <AccordionTrigger
          className="hover:no-underline py-0 items-center"
          containerClassName="flex-1 grow"
          collapsibleClassName="hidden"
        >
          <>
            <div
              className={cn('h-14 w-14 rounded-md overflow-hidden my-3 bg-slate-100', {
                'border border-slate-200': !category.image,
              })}
            >
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem disabled>
                  <Edit className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onClick={() => deleteCategory(category.id)}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </AccordionItem>
  )
}
