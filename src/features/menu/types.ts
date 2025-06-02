import { InsertCategory, SelectCategory } from '@/services/db/schema/categories'
import { InsertItemOffering, SelectItemOffering } from '@/services/db/schema/item-offerings'
import { InsertItem, SelectItem } from '@/services/db/schema/items'
import { SelectStoreFile } from '@/services/db/schema/store-files'

export type BaseStoreFile = Pick<SelectStoreFile, 'id' | 'url'>

export type NewCategory = Omit<PartialBy<InsertCategory, 'index'>, 'id'>

export type BaseCategory = Pick<SelectCategory, 'id' | 'name'>

export type Category = SelectCategory

export type CategoryWithImage = Omit<SelectCategory, 'imageId'> & {
  image: BaseStoreFile | null
  itemOfferings?: ItemOfferingWithImage[]
}

export type NewItemOffering = Omit<PartialBy<InsertItemOffering, 'index'>, 'id'>

export type NewItem = Omit<InsertItem, 'id'> & {
  offerings: Omit<NewItemOffering, 'itemId'>[]
}

export type Item = SelectItem
export type ItemWithImage = Omit<SelectItem, 'imageId'> & {
  image: BaseStoreFile | null
}
export type ItemOfferingWithImage = ItemWithImage &
  Omit<SelectItemOffering, 'id' | 'categoryId' | 'itemId' | 'createdAt' | 'updatedAt'>

export type MenuItem = Omit<SelectItemOffering, 'categoryId' | 'createdAt' | 'updatedAt'> &
  Omit<ItemWithImage, 'id' | 'createdAt' | 'updatedAt'> & {
    category: BaseCategory
  }
