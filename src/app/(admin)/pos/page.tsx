'use client'

import { CatalogItemPOS } from '@/features/catalog/components/catalog-item/catalog-item-pos'
import { useCatalog } from '@/features/catalog/hooks/use-catalog'
import { LoadingSpinner } from '@/shared/spinner'
import { Headline } from '@/shared/typography/headline'

export default function Page() {
  const { catalogItems: _catalogItems, isFetching } = useCatalog({ catalogName: 'POS' })

  const catalogItems = Array.isArray(_catalogItems) ? [..._catalogItems, ..._catalogItems, ..._catalogItems] : []
  return (
    <div className="col-span-2 flex flex-col items-start gap-2 overflow-y-scroll h-full pb-10">
      <Headline variant={300} className="flex items-center justify-center gap-2">
        Ponto de Venda {isFetching && <LoadingSpinner />}
      </Headline>

      <div className="grid gap-x-4 gap-y-3 lg:gap-x-6 lg:gap-y-5 justify-center w-full grid-cols-[repeat(auto-fill,minmax(19rem,1fr))]">
        {catalogItems?.map((product, index) => (
          <CatalogItemPOS key={index} item={product} onClick={() => console.log('added to cart: ', product)} />
        ))}
      </div>
    </div>
  )
}
