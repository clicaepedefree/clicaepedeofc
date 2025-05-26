'use client'

import { CatalogItemPOS } from '@/features/catalog/components/catalog-item/catalog-item-pos'
import { useCatalog } from '@/features/catalog/hooks/use-catalog'
import { useCart } from '@/features/pos/hooks/use-cart'
import { selectedStoreIdAtom } from '@/features/store/state'
import { LoadingSpinner } from '@/shared/spinner'
import { Headline } from '@/shared/typography/headline'
import { useAtom } from 'jotai'
import { PosCart } from './pos-cart'

export default function Page() {
  const { catalogItems, isFetching } = useCatalog({ catalogName: 'POS' })
  const [selectedStoreId] = useAtom(selectedStoreIdAtom)

  const { addItemToCart } = useCart()

  const hasCatalogItems = !!catalogItems?.length

  return (
    <div className="col-span-2 flex flex-col items-start gap-2 overflow-y-scroll h-full">
      <Headline variant={300} className="flex items-center justify-center gap-2">
        Ponto de Venda {isFetching && <LoadingSpinner />}
      </Headline>

      <div className="grid grid-cols-[1fr_1fr] lg:grid-cols-[2fr_1fr] w-full gap-10 h-[inherit] items-start overflow-y-hidden">
        <div className="grid gap-x-4 gap-y-3 lg:gap-x-5 lg:gap-y-4 justify-center w-full grid-cols-[repeat(auto-fill,minmax(19rem,1fr))] overflow-y-[inherit]">
          {catalogItems?.map((item, index) => (
            <CatalogItemPOS
              key={index}
              item={item}
              onClick={() => {
                addItemToCart({ ...item, quantity: 1 })
              }}
            />
          ))}
        </div>
        {hasCatalogItems && <PosCart key={selectedStoreId} />}
      </div>
    </div>
  )
}
