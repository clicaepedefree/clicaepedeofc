import { MenuItem } from '@/features/menu/types'
import { useCart } from '@/features/pos/hooks/use-cart'
import { CartItem, CartItemOption } from '@/features/pos/types'
import { Button } from '@/shared/button'
import { formatValueToCurrency } from '@/shared/formatters/currency'
import { Separator } from '@/shared/separator'
import { Body } from '@/shared/typography/body'
import { LargeText } from '@/shared/typography/large-text'
import { AlertTriangle, CircleDollarSign, ShoppingBag, Trash2 } from 'lucide-react'
import { Fragment, useCallback, useMemo, useState, useTransition } from 'react'
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
    validateStock,
    stockValidationErrors,
    hasStockErrors,
  } = useCart('POS')

  const { activeCounterId, activeCounterName } = useCounters()

  const [editingItem, setEditingItem] = useState<EditingCartItem | null>(null)
  const [isValidatingStock, startValidation] = useTransition()

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

  const handlePaymentsClick = useCallback(() => {
    startValidation(async () => {
      const isStockValid = await validateStock()
      if (isStockValid) {
        setIsUsingPaymentScreen(true)
      }
    })
  }, [validateStock, setIsUsingPaymentScreen])

  const handleRemoveUnavailableItems = useCallback(() => {
    if (!cartSessionItems?.length || !stockValidationErrors.length) return

    // Get indices of out-of-stock items (in reverse order to avoid index shifting issues)
    const outOfStockItemIds = new Set(stockValidationErrors.map(err => err.itemId))
    const indicesToRemove = cartSessionItems
      .map((item, index) => outOfStockItemIds.has(item.itemId) ? index : -1)
      .filter(index => index !== -1)
      .reverse()

    // Remove each item
    indicesToRemove.forEach(index => removeItemFromCart(index))
  }, [cartSessionItems, stockValidationErrors, removeItemFromCart])

  return (
    <div className="relative flex h-full min-h-[28rem] w-full flex-col overflow-y-auto rounded-lg border bg-card text-card-foreground shadow-sm">
      <div className="sticky left-0 top-0 z-20 flex items-center justify-center gap-2 border-b bg-card/95 p-4 text-center font-medium backdrop-blur">
        <ShoppingBag />
        Pedido
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
        {cartSessionItems?.map((item, index) => {
          const stockError = stockValidationErrors.find(err => err.itemId === item.itemId)
          return (
            <Fragment key={index}>
              <PosCartItem
                item={item}
                onUpdateQuantity={quantity => updateItemQuantity({ index, quantity })}
                onDelete={() => removeItemFromCart(index)}
                onEditOptions={() => setEditingItem({ index, item })}
                isOutOfStock={!!stockError}
                availableQuantity={stockError?.availableQty}
              />
              {index < cartSessionItems.length - 1 && <Separator orientation="horizontal" className="mx-3 my-1.5" />}
            </Fragment>
          )
        })}
      </div>
      <div className="sticky bottom-0 left-0 z-20 w-full space-y-2 border-t bg-card/95 p-3 shadow-[0_-8px_24px_rgba(15,23,42,0.06)] backdrop-blur">
        <div className="flex items-center justify-between w-full px-1 ">
          <LargeText variant="lg">Total:</LargeText>
          <LargeText variant="lg">
            {formatValueToCurrency({ value: cartSessionTotal, includeCurrencySymbol: true })}
          </LargeText>
        </div>
        {hasStockErrors && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3">
            <div className="flex items-center gap-2 text-destructive mb-2">
              <AlertTriangle size={18} />
              <Body variant={200} className="font-semibold text-inherit">
                Itens indisponíveis
              </Body>
            </div>
            <ul className="text-sm text-destructive/90 space-y-1">
              {stockValidationErrors.map(error => (
                <li key={error.itemId}>
                  <strong>{error.name}</strong>: solicitado {error.requestedQty}, disponível{' '}
                  {error.availableQty ?? 0}
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between mt-3">
              <Body variant={200} className="text-destructive/80">
                Ajuste as quantidades ou remova os itens para continuar.
              </Body>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleRemoveUnavailableItems}
                className="flex items-center gap-1.5 shrink-0"
              >
                <Trash2 size={14} />
                Remover indisponíveis
              </Button>
            </div>
          </div>
        )}
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
            onClick={handlePaymentsClick}
            disabled={!hasCartItems || !hasSelectedCounter || isUsingPaymentScreen || isValidatingStock || hasStockErrors}
          >
            {isValidatingStock ? 'Verificando...' : 'Pagamentos'}
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
