import { useCart } from '@/features/pos/hooks/use-cart'
import { Button } from '@/shared/button'
import { formatValueToCurrency } from '@/shared/formatters/currency'
import { Separator } from '@/shared/separator'
import { LargeText } from '@/shared/typography/large-text'
import { ShoppingBag } from 'lucide-react'
import { Fragment } from 'react'
import { PosCartItem } from './post-cart-item'

export const PosCart = () => {
  const { cartSessionItems, cartSessionTotal, removeItemFromCart, updateItemQuantity, clearCart } = useCart()

  return (
    <div className="relative bg-white w-full border rounded-md h-full overflow-y-scroll flex flex-col">
      <div className="sticky top-0 left-0 p-4 bg-accent text-center flex justify-center items-center gap-2 border-b">
        <ShoppingBag />
        CHECKOUT
      </div>
      <div className="self-stretch grow">
        {cartSessionItems?.map((item, index) => (
          <Fragment key={index}>
            <PosCartItem
              item={item}
              onUpdateQuantity={quantity => updateItemQuantity({ index, quantity })}
              onDelete={() => removeItemFromCart(index)}
            />
            {index < cartSessionItems.length - 1 && <Separator orientation="horizontal" className="mx-3 my-1.5" />}
          </Fragment>
        ))}
      </div>
      <div className="sticky float-end bottom-0 left-0 w-full p-2 space-y-2 bg-accent border-t">
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
          >
            Limpar
          </Button>
          <Button variant="default" size="xl" className="grow">
            Pagamentos
          </Button>
        </div>
      </div>
    </div>
  )
}
