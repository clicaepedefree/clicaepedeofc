import { MenuItemPOS } from '@/features/menu/components/menu-item/menu-item-pos'
import { MenuItem } from '@/features/menu/types'
import { useCart } from '../hooks/use-cart'

export const PosMenuItemsList = ({ menuItems }: { menuItems: MenuItem[] }) => {
  const { addItemToCart } = useCart('POS')
  return (
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
  )
}
