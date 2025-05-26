'use client'

import { CatalogItemPOS } from '@/features/catalog/components/catalog-item/catalog-item-pos'
import { useCatalog } from '@/features/catalog/hooks/use-catalog'
import { Button } from '@/shared/button'
import { LoadingSpinner } from '@/shared/spinner'
import { Headline } from '@/shared/typography/headline'
import { ShoppingBag } from 'lucide-react'

export default function Page() {
  const { catalogItems, isFetching } = useCatalog({ catalogName: 'POS' })

  const hasCatalogItems = !!catalogItems?.length
  return (
    <div className="col-span-2 flex flex-col items-start gap-2 overflow-y-scroll h-full">
      <Headline variant={300} className="flex items-center justify-center gap-2">
        Ponto de Venda {isFetching && <LoadingSpinner />}
      </Headline>

      <div className="grid grid-cols-[2fr_1fr] w-full gap-6 h-[inherit] items-start">
        <div className="grid gap-x-4 gap-y-3 lg:gap-x-5 lg:gap-y-4 justify-center w-full grid-cols-[repeat(auto-fill,minmax(19rem,1fr))] pb-10">
          {catalogItems?.map((product, index) => (
            <CatalogItemPOS key={index} item={product} onClick={() => console.log('added to cart: ', product)} />
          ))}
        </div>
        {hasCatalogItems && (
          <div className="relative bg-white w-full border rounded-md overflow-hidden h-full">
            <div className="p-4 bg-accent text-center flex justify-center items-center gap-2">
              <ShoppingBag />
              CHECKOUT
            </div>
            <div className="h-full"></div>
            <div className="sticky bottom-0 left-0 w-full flex items-center justify-between gap-3 p-2">
              <Button variant="outline" size="xl" className=" grow">
                Limpar
              </Button>
              <Button variant="default" size="xl" className="grow">
                Pagamentos
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
