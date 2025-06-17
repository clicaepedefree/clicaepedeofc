import { MenuItemPOS } from '@/features/menu/components/menu-item/menu-item-pos'
import { BaseCategory, MenuItem } from '@/features/menu/types'
import { Combobox } from '@/shared/combobox'
import { formatValueToCurrency } from '@/shared/formatters/currency'
import { Separator } from '@/shared/separator'
import { Body } from '@/shared/typography/body'
import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import Highlighter from 'react-highlight-words'
import { useCart } from '../hooks/use-cart'
import { PosCategoryFilter } from './pos-category-filter'

export const PosMenuItemsList = ({ menuItems, categories }: { menuItems: MenuItem[]; categories: BaseCategory[] }) => {
  const { addItemToCart } = useCart('POS')

  const [selectedCategoryId, setSelectedCategoryId] = useState<number | undefined>(undefined)

  const categoriesWithAllOption = [{ id: undefined, name: 'Todas', imageUrl: undefined }, ...categories]

  const menuItemsFilteredByCategory = useMemo(() => {
    if (!selectedCategoryId) return menuItems
    return menuItems.filter(item => item.category.id === selectedCategoryId)
  }, [menuItems, selectedCategoryId])

  return (
    <div className="w-full overflow-x-hidden h-full">
      <Combobox<MenuItem>
        options={menuItems}
        customOptionLabelComponent={(option, searchText) => (
          <div className="flex items-center justify-between gap-2 w-full">
            <Body
              variant={300}
              className="px-2 py-0.5 bg-amber-500/10 rounded-sm text-slate-500 whitespace-nowrap h-fit text-center min-w-20"
            >
              {formatValueToCurrency({ value: option.price, includeCurrencySymbol: true })}
            </Body>
            <Body className="grow">
              <Highlighter
                searchWords={searchText.split(' ')}
                textToHighlight={option.name}
                highlightClassName="text-primary font-semibold bg-primary/5"
              />
            </Body>
            <Body
              variant={300}
              fontWeight="regular"
              className="px-2 py-0.5 bg-primary/10 rounded-sm text-slate-500 whitespace-nowrap h-fit text-center"
            >
              {option.category.name}
            </Body>
          </div>
        )}
        customKeyValueParserForOption={option => {
          const keywords = []
          if (option.ean) keywords.push(option.ean)
          if (option.description) keywords.push(option.description)

          return { value: option.id.toString(), label: option.name, keywords }
        }}
        onChange={selectedItemId => {
          const selectedItem = menuItems.find(item => item.id === Number(selectedItemId))
          if (selectedItem) {
            addItemToCart({ ...selectedItem, quantity: 1 })
          }
        }}
        placeholder="Pesquise um item (nome, descrição, código de barras)"
        searchPlaceholder="Buscar items"
        noResultMessage="Nenhum item encontrado"
        disableUnselectingOption
        customIcon={Search}
        hideOptionsOnEmptyInput
      />
      {!!categories.length && (
        <div className="w-full flex items-start gap-10 overflow-x-scroll pb-6 mt-4">
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
      <Separator className="mb-4" />
      <div className="grid gap-x-4 gap-y-3 lg:gap-x-5 lg:gap-y-4 justify-center w-full grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] overflow-y-scroll">
        {menuItemsFilteredByCategory?.map((item, index) => (
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
