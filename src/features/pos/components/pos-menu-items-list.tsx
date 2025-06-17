import { MenuItemPOS } from '@/features/menu/components/menu-item/menu-item-pos'
import { BaseCategory, MenuItem } from '@/features/menu/types'
import { useMemo, useState } from 'react'
import { useCart } from '../hooks/use-cart'
import { PosCategoryFilter } from './pos-category-filter'

export const PosMenuItemsList = ({ menuItems, categories }: { menuItems: MenuItem[]; categories: BaseCategory[] }) => {
  const { addItemToCart } = useCart('POS')

  const [selectedCategoryId, setSelectedCategoryId] = useState<number | undefined>(undefined)

  const categoriesWithAllOption = [{ id: undefined, name: 'Todas', imageUrl: undefined }, ...categories]

  const filteredMenuItems = useMemo(() => {
    if (!selectedCategoryId) return menuItems
    return menuItems.filter(item => item.category.id === selectedCategoryId)
  }, [menuItems, selectedCategoryId])

  return (
    <div className="w-full overflow-x-hidden">
      {!!categories.length && (
        <div className="w-full flex items-start gap-10 overflow-x-scroll mb-4">
          {categoriesWithAllOption.map(category => (
            <PosCategoryFilter
              key={category.id?.toString() ?? ''}
              category={category}
              isSelected={selectedCategoryId === category.id}
              onClick={() => setSelectedCategoryId(category.id)}
            />
          ))}
        </div>
      )}

      <div className="grid gap-x-4 gap-y-3 lg:gap-x-5 lg:gap-y-4 justify-center w-full grid-cols-[repeat(auto-fill,minmax(19rem,1fr))] overflow-y-[inherit]">
        {filteredMenuItems?.map((item, index) => (
          <MenuItemPOS
            key={index}
            item={item}
            onClick={() => {
              addItemToCart({ ...item, quantity: 1 })
            }}
          />
        ))}
      </div>
    </div>
  )
}
