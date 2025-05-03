'use client'

import { H2 } from '@/shared/typography/h2'
import { CreateCategoryActionButton } from '@/features/catalog/components/create-category/create-category-action-button'
import { useCategories } from '@/features/catalog/hooks/use-categories'
import { Accordion, AccordionItem, AccordionTrigger } from '@/shared/accordion'
import { FolderTree, MoveDown, MoveUp } from 'lucide-react'
import { Button } from '@/shared/button'
import Image from 'next/image'

export default function Page() {
  const { categories, refetch: refetchCategories } = useCategories()
  console.log('categories', categories)
  return (
    <div className="col-span-2 flex flex-col justify-center items-start">
      <H2>Cardápio / produtos</H2>
      <CreateCategoryActionButton onSuccess={() => refetchCategories()} />
      <Accordion type="single" collapsible className="w-full">
        {categories?.map((category, index) => (
          <AccordionItem
            key={category.id}
            value={`item-${category.id}`}
            className="border px-4 rounded-lg mb-4 bg-slate-50"
          >
            <div className="flex items-center justify-between">
              <AccordionTrigger
                className="hover:no-underline py-0 items-center"
                containerClassName="flex-1 grow"
                collapsibleClassName="hidden"
              >
                <>
                  <div className="h-14 w-14 rounded-md overflow-hidden my-3 bg-slate-100">
                    {category.image ? (
                      <Image
                        src={category.image.url}
                        alt={category.name}
                        width={56}
                        height={56}
                        className="w-full h-full"
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <FolderTree className="h-6 w-6 text-slate-300" />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-start justify-center grow">
                    <h3 className="text-lg font-medium">{category.name}</h3>
                    <p className="text-sm text-muted-foreground line-clamp-1">{category.description}</p>
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
                  disabled={index === 0}
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
                  disabled={index === categories.length - 1}
                >
                  <MoveDown className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  )
}
