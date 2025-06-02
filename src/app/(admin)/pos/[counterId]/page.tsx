'use client'

import { MenuItemPOS } from '@/features/menu/components/menu-item/menu-item-pos'
import { useMenu } from '@/features/menu/hooks/use-menu'
import { PosCart } from '@/features/pos/components/pos-cart'
import { useCart } from '@/features/pos/hooks/use-cart'
import { selectedStoreIdAtom } from '@/features/store/state'
import { LoadingSpinner } from '@/shared/spinner'
import { Headline } from '@/shared/typography/headline'
import { useAtom } from 'jotai'

export default function CounterPage({}) {
  const { menuItems, isFetching } = useMenu({ menuName: 'POS' })
  const [selectedStoreId] = useAtom(selectedStoreIdAtom)
  const { addItemToCart } = useCart()

  const hasMenuItems = !!menuItems?.length

  return (
    <div className="col-span-2 flex flex-col items-start gap-4 overflow-y-scroll h-full p-4">
      <Headline variant={300} className="flex items-center justify-center gap-2">
        Ponto de Venda {isFetching && <LoadingSpinner />}
      </Headline>

      <div className="grid grid-cols-[1fr_1fr] lg:grid-cols-[2fr_1fr] w-full gap-10 h-[inherit] items-start overflow-y-hidden">
        <div className="grid gap-x-4 gap-y-3 lg:gap-x-5 lg:gap-y-4 justify-center w-full grid-cols-[repeat(auto-fill,minmax(19rem,1fr))] overflow-y-[inherit]">
          {menuItems?.map((item, index) => (
            <MenuItemPOS
              key={index}
              item={item}
              onClick={() => {
                addItemToCart({ ...item, quantity: 1 })
              }}
            />
          ))}
        </div>
        {hasMenuItems && <PosCart key={selectedStoreId} />}
      </div>
    </div>
  )
}
