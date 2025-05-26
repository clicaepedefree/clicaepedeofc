import { useCart } from '@/features/catalog/hooks/use-cart'
import { Button } from '@/shared/button'
import { Separator } from '@/shared/separator'
import { ShoppingBag } from 'lucide-react'
import { Fragment } from 'react'
import { PosCartItem } from './post-cart-item'

export const PosCart = () => {
  const { cartSessionItems, removeItemFromCart } = useCart()

  return (
    <div className="relative bg-white w-full border rounded-md h-full overflow-y-scroll flex flex-col">
      <div className="sticky top-0 left-0 p-4 bg-accent text-center flex justify-center items-center gap-2">
        <ShoppingBag />
        CHECKOUT
      </div>
      <div className="self-stretch grow">
        {cartSessionItems?.map((item, index) => (
          <Fragment key={index}>
            <PosCartItem item={item} onDelete={() => removeItemFromCart(index)} />
            {index < cartSessionItems.length - 1 && <Separator orientation="horizontal" className="mx-3 my-1.5" />}
          </Fragment>
        ))}
      </div>
      <div className="sticky float-end bottom-0 left-0 w-full flex items-center justify-around gap-3 p-2 bg-inherit">
        <Button variant="outline" size="xl" className=" grow">
          Limpar
        </Button>
        <Button variant="default" size="xl" className="grow">
          Pagamentos
        </Button>
      </div>
    </div>
  )
}
