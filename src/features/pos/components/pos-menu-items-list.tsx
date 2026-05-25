import { MenuItemPOS } from '@/features/menu/components/menu-item/menu-item-pos'
import { BaseCategory, MenuItem } from '@/features/menu/types'
import { CartItemOption } from '@/features/pos/types'
import { Combobox } from '@/shared/combobox'
import { formatValueToCurrency } from '@/shared/formatters/currency'
import { cn } from '@/shared/lib/utils'
import { Separator } from '@/shared/separator'
import { Body } from '@/shared/typography/body'
import { Search } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import Highlighter from 'react-highlight-words'
import { useCart } from '../hooks/use-cart'
import { OptionGroupSelectorModal } from './option-group-selector/option-group-selector-modal'
import { PosCategoryFilter } from './pos-category-filter'

export const PosMenuItemsList = ({
  menuItems,
  categories,
}: {
  menuItems: MenuItem[]
  categories: BaseCategory[]
}) => {
  const { addItemToCart } = useCart('POS')

  const [selectedCategoryId, setSelectedCategoryId] = useState<
    number | undefined
  >(undefined)

  const [optionModalItem, setOptionModalItem] = useState<MenuItem | null>(null)

  const handleItemClick = useCallback(
    (item: MenuItem) => {
      if (item.inventory === 0) return
      setOptionModalItem(item)
    },
    []
  )

  const handleOptionConfirm = useCallback(
    (item: MenuItem, selectedOptions: CartItemOption[], comment: string) => {
      addItemToCart({
        ...item,
        quantity: 1,
        selectedOptions,
        comment: comment || undefined,
      })
    },
    [addItemToCart]
  )

  const categoriesWithAllOption = [
    { id: undefined, name: 'Todas', imageUrl: undefined },
    ...categories,
  ]

  const menuItemsFilteredByCategory = useMemo(() => {
    if (!selectedCategoryId) return menuItems
    return menuItems.filter(item => item.category.id === selectedCategoryId)
  }, [menuItems, selectedCategoryId])

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-x-hidden">
      <Combobox<MenuItem>
        options={menuItems}
        customOptionLabelComponent={(option, searchText) => (
          <div className="flex items-center justify-between gap-2 w-full">
            <Body
              variant={300}
              className={cn(
                'px-2 py-0.5 bg-amber-500/10 rounded-sm text-muted-foreground whitespace-nowrap h-fit text-center min-w-20',
                {
                  'bg-destructive/10 text-destructive': option.inventory === 0,
                }
              )}
            >
              {option.inventory === 0
                ? 'Esgotado'
                : formatValueToCurrency({
                    value: option.price,
                    includeCurrencySymbol: true,
                  })}
            </Body>
            <Body className="grow">
              <Highlighter
                searchWords={searchText.split(' ')}
                textToHighlight={option.name}
                highlightClassName="text-primary font-semibold bg-primary/5"
                className={cn({
                  'line-through': option.inventory === 0,
                })}
                autoEscape
              />
            </Body>
            <Body
              variant={300}
              fontWeight="regular"
              className="px-2 py-0.5 bg-primary/10 rounded-sm text-muted-foreground whitespace-nowrap h-fit text-center"
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
          const selectedItem = menuItems.find(
            item => item.id === Number(selectedItemId)
          )
          if (selectedItem) {
            handleItemClick(selectedItem)
          }
        }}
        placeholder="Pesquise um item (nome, descrição, código de barras)"
        searchPlaceholder="Buscar itens"
        noResultMessage="Nenhum item encontrado"
        disableUnselectingOption
        customIcon={Search}
        hideOptionsOnEmptyInput
      />
      {!!categories.length && (
        <div className="mt-4 flex w-full items-start gap-4 overflow-x-auto pb-4 sm:gap-6">
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
      <div className="grid min-h-0 w-full grow grid-cols-[repeat(auto-fill,minmax(min(100%,16rem),1fr))] justify-center gap-x-4 gap-y-3 overflow-y-auto lg:gap-x-5 lg:gap-y-4">
        {menuItemsFilteredByCategory?.map((item, index) => (
          <MenuItemPOS
            key={index}
            item={item}
            onClick={() => handleItemClick(item)}
          />
        ))}
      </div>
      <OptionGroupSelectorModal
        open={!!optionModalItem}
        onOpenChange={(open) => {
          if (!open) setOptionModalItem(null)
        }}
        item={optionModalItem}
        onConfirm={handleOptionConfirm}
      />
    </div>
  )
}
