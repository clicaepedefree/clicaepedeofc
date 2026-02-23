import { MenuItem } from '@/features/menu/types'
import { useCart } from '@/features/pos/hooks/use-cart'
import { CartItem, CartItemOption } from '@/features/pos/types'
import { Button } from '@/shared/button'
import { formatValueToCurrency } from '@/shared/formatters/currency'
import { Separator } from '@/shared/separator'
import { LargeText } from '@/shared/typography/large-text'
import { CircleDollarSign, ShoppingBag } from 'lucide-react'
import { Fragment, useCallback, useMemo, useState } from 'react'
import { useCounters } from '../hooks/use-counters'
import { OptionGroupSelectorModal } from './option-group-selector/option-group-selector-modal'
import { PosCartItem } from './pos-cart-item'

type EditingCartItem = {
  index: number
  item: CartItem
}

export const PosCart = ({ menuItems }: { menuItems: MenuItem[] }) => {
  const {
    cartSessionItems,
    cartSessionTotal,
    removeItemFromCart,
    updateItemQuantity,
    updateCartItem,
    clearCart,
    isUsingPaymentScreen,
    setIsUsingPaymentScreen,
  } = useCart('POS')

  const { activeCounterId, activeCounterName } = useCounters()

  const [editingItem, setEditingItem] = useState<EditingCartItem | null>(null)

  const editingMenuItem = useMemo(() => {
    if (!editingItem) return null
    return menuItems.find(mi => mi.id === editingItem.item.id) ?? null
  }, [editingItem, menuItems])

  const handleEditConfirm = useCallback(
    (_item: MenuItem, selectedOptions: CartItemOption[], comment: string) => {
      if (editingItem === null) return
      updateCartItem({
        index: editingItem.index,
        selectedOptions,
        comment: comment || undefined,
      })
    },
    [editingItem, updateCartItem]
  )

  const hasCartItems = !!cartSessionItems?.length
  const hasSelectedCounter = !!activeCounterId && !!activeCounterName

  return (
    <div className="relative bg-white w-full border rounded-md h-full overflow-y-scroll flex flex-col">
      <div className="sticky top-0 left-0 p-4 bg-accent text-center flex justify-center items-center gap-2 border-b z-20">
        <ShoppingBag />
        CHECKOUT
      </div>
      {isUsingPaymentScreen && (
        <div className="absolute h-full w-full flex items-center justify-center">
          <div className="absolute h-full w-full bg-black opacity-70 z-20"></div>
          <LargeText variant="md" className="z-20 text-white flex flex-col items-center justify-center mb-24">
            <CircleDollarSign size={28} />
            Pagamento em andamento
          </LargeText>
        </div>
      )}
      <div className="self-stretch grow">
        {cartSessionItems?.map((item, index) => (
          <Fragment key={index}>
            <PosCartItem
              item={item}
              onUpdateQuantity={quantity => updateItemQuantity({ index, quantity })}
              onDelete={() => removeItemFromCart(index)}
              onEditOptions={() => setEditingItem({ index, item })}
            />
            {index < cartSessionItems.length - 1 && <Separator orientation="horizontal" className="mx-3 my-1.5" />}
          </Fragment>
        ))}
      </div>
      <div className="sticky float-end bottom-0 left-0 w-full p-2 space-y-2 bg-accent border-t z-20">
        <div className="flex items-center justify-between w-full px-1 ">
          <LargeText variant="lg">Total:</LargeText>
          <LargeText variant="lg">
            {formatValueToCurrency({ value: cartSessionTotal, includeCurrencySymbol: true })}
          </LargeText>
        </div>
        <div className="flex items-center justify-between w-full gap-3">
          <Button
            variant="outline"
            className="hover:text-white hover:bg-destructive grow"
            size="xl"
            onClick={() => clearCart()}
            disabled={!hasCartItems || isUsingPaymentScreen}
          >
            Limpar
          </Button>
          <Button
            variant="default"
            size="xl"
            className="grow"
            onClick={() => setIsUsingPaymentScreen(true)}
            disabled={!hasCartItems || !hasSelectedCounter || isUsingPaymentScreen}
          >
            Pagamentos
          </Button>
        </div>
      </div>
      <OptionGroupSelectorModal
        open={!!editingItem}
        onOpenChange={(open) => {
          if (!open) setEditingItem(null)
        }}
        item={editingMenuItem ?? editingItem?.item ?? null}
        initialSelections={editingItem?.item.selectedOptions}
        initialComment={editingItem?.item.comment}
        onConfirm={handleEditConfirm}
      />
    </div>
  )
}
