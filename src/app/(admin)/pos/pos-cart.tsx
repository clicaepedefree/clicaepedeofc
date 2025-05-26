import { cartSessionItemsAtom } from '@/features/catalog/state'
import { Button } from '@/shared/button'
import { Separator } from '@/shared/separator'
import { useAtom } from 'jotai'
import { ShoppingBag } from 'lucide-react'
import { Fragment } from 'react'
import { PosCartItem } from './post-cart-item'

export const PosCart = () => {
  const [cartSessionItems] = useAtom(cartSessionItemsAtom)

  return (
    <div className="relative bg-white w-full border rounded-md h-full overflow-y-scroll flex flex-col">
      <div className="sticky top-0 left-0 p-4 bg-accent text-center flex justify-center items-center gap-2">
        <ShoppingBag />
        CHECKOUT
      </div>
      <div className="self-stretch grow">
        {cartSessionItems?.map((item, index) => (
          <Fragment key={index}>
            <PosCartItem item={item} />
            <Separator orientation="horizontal" className="mx-3" />
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
